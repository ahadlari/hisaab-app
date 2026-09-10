import prisma from '../config/db';
import {
  calculateEqualSplit,
  calculateCustomSplit,
  calculatePercentageSplit,
  calculateShareBasedSplit,
} from './calculation.service';
import { createAuditLog } from './audit.service';
import type { CreateExpenseInput, EditExpenseInput } from '../validators/expense.validator';
import type { SplitType, ShareResult } from '../types';

/**
 * Create a new expense inside a DB transaction.
 * Computes shares, validates constraints, writes AuditLog.
 */
export async function createExpense(
  roomId: string,
  createdById: string,
  input: CreateExpenseInput
) {
  return prisma.$transaction(async (tx) => {
    const amountPaise = BigInt(input.amountPaise);

    // Validate payments sum
    const paymentSum = input.payments.reduce((sum, p) => sum + BigInt(p.amountPaise), 0n);
    if (paymentSum !== amountPaise) {
      throw Object.assign(
        new Error(`Sum of payments (${paymentSum}) does not match expense amount (${amountPaise})`),
        { statusCode: 400, code: 'VALIDATION_ERROR' }
      );
    }

    // Calculate shares based on split type
    const shares = computeShares(input.splitType as SplitType, amountPaise, input.participants);

    // Validate shares sum
    const sharesSum = shares.reduce((sum, s) => sum + s.shareAmountPaise, 0n);
    if (sharesSum !== amountPaise) {
      throw Object.assign(
        new Error(`Internal error: computed shares sum (${sharesSum}) does not match expense amount (${amountPaise})`),
        { statusCode: 500, code: 'SHARE_COMPUTATION_ERROR' }
      );
    }

    // Create expense
    const expense = await tx.expense.create({
      data: {
        roomId,
        description: input.description,
        amountPaise,
        categoryId: input.categoryId || null,
        splitType: input.splitType,
        status: 'ACTIVE',
        note: input.note || null,
        createdById,
        expenseDate: input.expenseDate ? new Date(input.expenseDate) : new Date(),
      },
    });

    // Create payments
    await tx.expensePayment.createMany({
      data: input.payments.map(p => ({
        expenseId: expense.id,
        payerId: p.payerId,
        amountPaise: BigInt(p.amountPaise),
        paymentMethod: p.paymentMethod || 'OTHER',
      })),
    });

    // Create participant shares
    await tx.expenseParticipant.createMany({
      data: shares.map(s => {
        const participantInput = input.participants.find(p => p.userId === s.userId);
        return {
          expenseId: expense.id,
          userId: s.userId,
          shareAmountPaise: s.shareAmountPaise,
          percentage: input.splitType === 'PERCENTAGE' && participantInput
            ? (participantInput as any).percentage : null,
          shareUnits: input.splitType === 'SHARE_BASED' && participantInput
            ? (participantInput as any).shareUnits : null,
        };
      }),
    });

    // Write audit log
    await createAuditLog({
      roomId,
      userId: createdById,
      action: 'EXPENSE_CREATED',
      entityType: 'Expense',
      entityId: expense.id,
      newData: {
        description: input.description,
        amountPaise: input.amountPaise,
        splitType: input.splitType,
        payments: input.payments,
        participants: shares.map(s => ({ userId: s.userId, shareAmountPaise: Number(s.shareAmountPaise) })),
      },
    }, tx);

    // Return full expense with payments and participants
    return tx.expense.findUnique({
      where: { id: expense.id },
      include: {
        payments: { select: { id: true, payerId: true, amountPaise: true, paymentMethod: true } },
        participants: { select: { id: true, userId: true, shareAmountPaise: true, percentage: true, shareUnits: true } },
      },
    });
  });
}

/**
 * Get paginated expense list for a room.
 */
export async function getExpenses(
  roomId: string,
  options: { page?: number; pageSize?: number; category?: string; status?: string }
) {
  const page = options.page || 1;
  const pageSize = options.pageSize || 20;
  const skip = (page - 1) * pageSize;

  const where: any = { roomId };
  if (options.status) where.status = options.status;
  else where.status = 'ACTIVE';
  if (options.category) where.categoryId = options.category;

  const [expenses, total] = await Promise.all([
    prisma.expense.findMany({
      where,
      include: {
        payments: {
          include: { payer: { select: { id: true, name: true } } },
        },
        participants: {
          include: { user: { select: { id: true, name: true } } },
        },
        category: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { expenseDate: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.expense.count({ where }),
  ]);

  return {
    data: expenses,
    meta: { total, page, pageSize },
  };
}

/**
 * Get single expense detail.
 */
export async function getExpenseById(roomId: string, expenseId: string) {
  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, roomId },
    include: {
      payments: {
        include: { payer: { select: { id: true, name: true } } },
      },
      participants: {
        include: { user: { select: { id: true, name: true } } },
      },
      category: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });

  if (!expense) {
    throw Object.assign(new Error('Expense not found'), { statusCode: 404, code: 'EXPENSE_NOT_FOUND' });
  }

  return expense;
}

/**
 * Edit an expense — within a transaction, writes audit log with old/new snapshots.
 */
export async function editExpense(
  roomId: string,
  expenseId: string,
  userId: string,
  input: EditExpenseInput
) {
  return prisma.$transaction(async (tx) => {
    // Fetch old expense
    const oldExpense = await tx.expense.findFirst({
      where: { id: expenseId, roomId, status: 'ACTIVE' },
      include: {
        payments: true,
        participants: true,
      },
    });

    if (!oldExpense) {
      throw Object.assign(new Error('Expense not found or already voided'), { statusCode: 404, code: 'EXPENSE_NOT_FOUND' });
    }

    const oldSnapshot = {
      description: oldExpense.description,
      amountPaise: Number(oldExpense.amountPaise),
      splitType: oldExpense.splitType,
      payments: oldExpense.payments.map(p => ({ payerId: p.payerId, amountPaise: Number(p.amountPaise) })),
      participants: oldExpense.participants.map(p => ({ userId: p.userId, shareAmountPaise: Number(p.shareAmountPaise) })),
    };

    // Update fields
    const newAmountPaise = input.amountPaise ? BigInt(input.amountPaise) : oldExpense.amountPaise;
    const newSplitType = input.splitType || oldExpense.splitType;

    await tx.expense.update({
      where: { id: expenseId },
      data: {
        description: input.description || oldExpense.description,
        amountPaise: newAmountPaise,
        categoryId: input.categoryId !== undefined ? input.categoryId : oldExpense.categoryId,
        splitType: newSplitType,
        note: input.note !== undefined ? input.note : oldExpense.note,
        expenseDate: input.expenseDate ? new Date(input.expenseDate) : oldExpense.expenseDate,
      },
    });

    // Update payments if provided
    if (input.payments) {
      const paymentSum = input.payments.reduce((sum, p) => sum + BigInt(p.amountPaise), 0n);
      if (paymentSum !== newAmountPaise) {
        throw Object.assign(
          new Error(`Sum of payments (${paymentSum}) does not match expense amount (${newAmountPaise})`),
          { statusCode: 400, code: 'VALIDATION_ERROR' }
        );
      }

      await tx.expensePayment.deleteMany({ where: { expenseId } });
      await tx.expensePayment.createMany({
        data: input.payments.map(p => ({
          expenseId,
          payerId: p.payerId,
          amountPaise: BigInt(p.amountPaise),
          paymentMethod: p.paymentMethod || 'OTHER',
        })),
      });
    }

    // Update participants if provided
    if (input.participants) {
      const shares = computeShares(newSplitType as SplitType, newAmountPaise, input.participants);

      await tx.expenseParticipant.deleteMany({ where: { expenseId } });
      await tx.expenseParticipant.createMany({
        data: shares.map(s => {
          const pInput = input.participants!.find(p => p.userId === s.userId);
          return {
            expenseId,
            userId: s.userId,
            shareAmountPaise: s.shareAmountPaise,
            percentage: newSplitType === 'PERCENTAGE' && pInput ? (pInput as any).percentage : null,
            shareUnits: newSplitType === 'SHARE_BASED' && pInput ? (pInput as any).shareUnits : null,
          };
        }),
      });
    }

    // Write audit log
    const newExpense = await tx.expense.findUnique({
      where: { id: expenseId },
      include: { payments: true, participants: true },
    });

    const newSnapshot = {
      description: newExpense!.description,
      amountPaise: Number(newExpense!.amountPaise),
      splitType: newExpense!.splitType,
      payments: newExpense!.payments.map(p => ({ payerId: p.payerId, amountPaise: Number(p.amountPaise) })),
      participants: newExpense!.participants.map(p => ({ userId: p.userId, shareAmountPaise: Number(p.shareAmountPaise) })),
    };

    await createAuditLog({
      roomId,
      userId,
      action: 'EXPENSE_EDITED',
      entityType: 'Expense',
      entityId: expenseId,
      oldData: oldSnapshot,
      newData: newSnapshot,
      reason: input.reason || null,
    }, tx);

    return newExpense;
  });
}

/**
 * Void an expense (soft-delete).
 * If settlements exist after this expense's creation, returns a 409 warning
 * unless force=true is passed.
 */
export async function voidExpense(
  roomId: string,
  expenseId: string,
  userId: string,
  options: { reason?: string; force?: boolean }
) {
  return prisma.$transaction(async (tx) => {
    const expense = await tx.expense.findFirst({
      where: { id: expenseId, roomId, status: 'ACTIVE' },
      include: { payments: true, participants: true },
    });

    if (!expense) {
      throw Object.assign(new Error('Expense not found or already voided'), { statusCode: 404, code: 'EXPENSE_NOT_FOUND' });
    }

    // Check for settlements created after this expense (doc 03 §8 warning)
    if (!options.force) {
      const laterSettlements = await tx.settlement.count({
        where: {
          roomId,
          status: 'CONFIRMED',
          createdAt: { gt: expense.createdAt },
        },
      });

      if (laterSettlements > 0) {
        throw Object.assign(
          new Error('This expense may already be reflected in a settlement. Voiding it will change current balances. Re-submit with force=true to proceed.'),
          {
            statusCode: 409,
            code: 'EXPENSE_HAS_LATER_SETTLEMENTS',
            details: { laterSettlementCount: laterSettlements },
          }
        );
      }
    }

    // Void the expense
    await tx.expense.update({
      where: { id: expenseId },
      data: { status: 'VOIDED' },
    });

    // Write audit log
    await createAuditLog({
      roomId,
      userId,
      action: 'EXPENSE_VOIDED',
      entityType: 'Expense',
      entityId: expenseId,
      oldData: {
        description: expense.description,
        amountPaise: Number(expense.amountPaise),
        splitType: expense.splitType,
      },
      reason: options.reason || null,
    }, tx);

    return { id: expenseId, status: 'VOIDED' as const };
  });
}

// ─────────────────────────────────────────────
// Internal: compute shares based on split type
// ─────────────────────────────────────────────

function computeShares(
  splitType: SplitType,
  amountPaise: bigint,
  participants: Array<{ userId: string; customAmountPaise?: number; percentage?: number; shareUnits?: number }>
): ShareResult[] {
  switch (splitType) {
    case 'EQUAL':
      return calculateEqualSplit(amountPaise, participants.map(p => p.userId));

    case 'CUSTOM_AMOUNT':
      return calculateCustomSplit(amountPaise, participants.map(p => ({
        userId: p.userId,
        customAmountPaise: BigInt(p.customAmountPaise || 0),
      })));

    case 'PERCENTAGE':
      return calculatePercentageSplit(amountPaise, participants.map(p => ({
        userId: p.userId,
        percentage: p.percentage,
      })));

    case 'SHARE_BASED':
      return calculateShareBasedSplit(amountPaise, participants.map(p => ({
        userId: p.userId,
        shareUnits: p.shareUnits,
      })));

    default:
      throw Object.assign(
        new Error(`Unknown split type: ${splitType}`),
        { statusCode: 400, code: 'VALIDATION_ERROR' }
      );
  }
}
