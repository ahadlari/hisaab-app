import prisma from '../config/db';
import { createAuditLog } from './audit.service';
import { getRoomBalances } from './room.service';
import type { CreateSettlementInput, EditSettlementInput, VerifySettlementInput } from '../validators/settlement.validator';

/**
 * Create a settlement (person-to-person repayment).
 * Runs inside a DB transaction, writes AuditLog.
 * Returns a warning if the amount seems inconsistent with current balances.
 */
export async function createSettlement(
  roomId: string,
  userId: string,
  input: CreateSettlementInput
) {
  // Check for unusual amount (soft validation — warning, not rejection)
  let warning: string | null = null;
  try {
    const { balances } = await getRoomBalances(roomId);
    const fromBalance = balances.find(b => b.userId === input.fromUserId);
    const toBalance = balances.find(b => b.userId === input.toUserId);

    if (fromBalance && fromBalance.outstandingPaise >= 0n) {
      warning = `${fromBalance.name} does not currently owe money (balance: ₹${Number(fromBalance.outstandingPaise) / 100}).`;
    } else if (fromBalance && -fromBalance.outstandingPaise < BigInt(input.amountPaise)) {
      warning = `${fromBalance.name} currently only owes ₹${Number(-fromBalance.outstandingPaise) / 100}, but you're recording ₹${input.amountPaise / 100}.`;
    }
  } catch {
    // If balance check fails, proceed without warning
  }

  const settlement = await prisma.$transaction(async (tx) => {
    const s = await tx.settlement.create({
      data: {
        roomId,
        fromUserId: input.fromUserId,
        toUserId: input.toUserId,
        amountPaise: BigInt(input.amountPaise),
        paymentMethod: input.paymentMethod || 'OTHER',
        status: 'PENDING',
        proofUrl: input.proofUrl || null,
        note: input.note || null,
      },
    });

    await createAuditLog({
      roomId,
      userId,
      action: 'SETTLEMENT_CREATED',
      entityType: 'Settlement',
      entityId: s.id,
      newData: {
        fromUserId: input.fromUserId,
        toUserId: input.toUserId,
        amountPaise: input.amountPaise,
        paymentMethod: input.paymentMethod,
        status: 'PENDING',
      },
    }, tx);

    return s;
  });

  return { settlement, warning };
}

/**
 * Get settlements for a room.
 */
export async function getSettlements(
  roomId: string,
  options: { status?: string }
) {
  const where: any = { roomId };
  if (options.status) where.status = options.status;

  return prisma.settlement.findMany({
    where,
    include: {
      fromUser: { select: { id: true, name: true } },
      toUser: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Edit a settlement — inside a transaction, writes audit log.
 */
export async function editSettlement(
  roomId: string,
  settlementId: string,
  userId: string,
  input: EditSettlementInput
) {
  return prisma.$transaction(async (tx) => {
    const oldSettlement = await tx.settlement.findFirst({
      where: { id: settlementId, roomId, status: { not: 'CANCELLED' } },
    });

    if (!oldSettlement) {
      throw Object.assign(new Error('Settlement not found or cancelled'), { statusCode: 404, code: 'SETTLEMENT_NOT_FOUND' });
    }

    const oldSnapshot = {
      amountPaise: Number(oldSettlement.amountPaise),
      paymentMethod: oldSettlement.paymentMethod,
      note: oldSettlement.note,
    };

    const updated = await tx.settlement.update({
      where: { id: settlementId },
      data: {
        amountPaise: input.amountPaise ? BigInt(input.amountPaise) : undefined,
        paymentMethod: input.paymentMethod || undefined,
        note: input.note !== undefined ? input.note : undefined,
      },
    });

    await createAuditLog({
      roomId,
      userId,
      action: 'SETTLEMENT_EDITED',
      entityType: 'Settlement',
      entityId: settlementId,
      oldData: oldSnapshot,
      newData: {
        amountPaise: Number(updated.amountPaise),
        paymentMethod: updated.paymentMethod,
        note: updated.note,
      },
      reason: input.reason || null,
    }, tx);

    return updated;
  });
}

/**
 * Cancel a settlement (soft-delete) — inside a transaction, writes audit log.
 */
export async function cancelSettlement(
  roomId: string,
  settlementId: string,
  userId: string,
  reason?: string
) {
  return prisma.$transaction(async (tx) => {
    const settlement = await tx.settlement.findFirst({
      where: { id: settlementId, roomId, status: { not: 'CANCELLED' } },
    });

    if (!settlement) {
      throw Object.assign(new Error('Settlement not found or already cancelled'), { statusCode: 404, code: 'SETTLEMENT_NOT_FOUND' });
    }

    await tx.settlement.update({
      where: { id: settlementId },
      data: { status: 'CANCELLED' },
    });

    await createAuditLog({
      roomId,
      userId,
      action: 'SETTLEMENT_CANCELLED',
      entityType: 'Settlement',
      entityId: settlementId,
      oldData: {
        amountPaise: Number(settlement.amountPaise),
        fromUserId: settlement.fromUserId,
        toUserId: settlement.toUserId,
      },
      reason: reason || null,
    }, tx);

    return { id: settlementId, status: 'CANCELLED' as const };
  });
}

/**
 * Verify a settlement (receiver only) — inside a transaction, writes audit log.
 */
export async function verifySettlement(
  roomId: string,
  settlementId: string,
  userId: string, // should be the receiver (toUserId)
  input: VerifySettlementInput
) {
  return prisma.$transaction(async (tx) => {
    const settlement = await tx.settlement.findFirst({
      where: { id: settlementId, roomId, status: 'PENDING' },
    });

    if (!settlement) {
      throw Object.assign(new Error('Settlement not found or not pending'), { statusCode: 404, code: 'SETTLEMENT_NOT_FOUND' });
    }

    if (settlement.toUserId !== userId) {
      throw Object.assign(new Error('Only the receiver can verify the settlement'), { statusCode: 403, code: 'FORBIDDEN' });
    }

    const updated = await tx.settlement.update({
      where: { id: settlementId },
      data: { status: input.status },
    });

    await createAuditLog({
      roomId,
      userId,
      action: input.status === 'CONFIRMED' ? 'SETTLEMENT_EDITED' : 'SETTLEMENT_CANCELLED',
      entityType: 'Settlement',
      entityId: settlementId,
      oldData: { status: 'PENDING' },
      newData: { status: input.status },
      reason: input.reason || null,
    }, tx);

    return updated;
  });
}
