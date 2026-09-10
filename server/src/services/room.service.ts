import prisma from '../config/db';
import crypto from 'crypto';
import {
  calculateBalances,
  validateBalanceInvariant,
  suggestSettlements,
} from './calculation.service';
import type { BalanceEntry, SettlementSuggestion } from '../types';

/**
 * Generate a short invite code for a room.
 */
function generateInviteCode(roomName: string): string {
  const prefix = roomName.replace(/[^A-Za-z0-9]/g, '').substring(0, 4).toUpperCase();
  const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${prefix}-${suffix}`;
}

/**
 * Create a new room. Creator becomes ADMIN.
 */
export async function createRoom(creatorId: string, name: string) {
  const inviteCode = generateInviteCode(name);

  return prisma.$transaction(async (tx) => {
    const room = await tx.room.create({
      data: {
        name,
        createdById: creatorId,
        inviteCode,
      },
    });

    // Creator becomes ADMIN member
    await tx.roomMember.create({
      data: {
        roomId: room.id,
        userId: creatorId,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    });

    // Create default categories
    const defaultCategories = ['Grocery', 'Milk', 'Gas', 'Vegetables', 'Meat', 'Cleaning', 'Other'];
    await tx.roomCategory.createMany({
      data: defaultCategories.map(name => ({
        roomId: room.id,
        name,
        isPreset: true,
      })),
    });

    return room;
  });
}

/**
 * Join a room via invite code.
 */
export async function joinRoom(userId: string, inviteCode: string) {
  const room = await prisma.room.findUnique({
    where: { inviteCode },
  });

  if (!room) {
    throw Object.assign(new Error('Invalid invite code'), { statusCode: 404, code: 'ROOM_NOT_FOUND' });
  }

  if (room.status !== 'ACTIVE') {
    throw Object.assign(new Error('This room is archived'), { statusCode: 400, code: 'ROOM_ARCHIVED' });
  }

  // Check if already a member
  const existing = await prisma.roomMember.findUnique({
    where: { roomId_userId: { roomId: room.id, userId } },
  });

  if (existing) {
    if (existing.status === 'ACTIVE') {
      throw Object.assign(new Error('Already a member of this room'), { statusCode: 400, code: 'ALREADY_MEMBER' });
    }
    // Reactivate inactive member
    await prisma.roomMember.update({
      where: { id: existing.id },
      data: { status: 'ACTIVE', leftAt: null },
    });
    return { roomId: room.id, role: existing.role };
  }

  const member = await prisma.roomMember.create({
    data: {
      roomId: room.id,
      userId,
      role: 'MEMBER',
      status: 'ACTIVE',
    },
  });

  return { roomId: room.id, role: member.role };
}

/**
 * Get rooms for a user.
 */
export async function getUserRooms(userId: string) {
  const memberships = await prisma.roomMember.findMany({
    where: { userId, status: 'ACTIVE' },
    include: {
      room: {
        include: {
          _count: { select: { members: { where: { status: 'ACTIVE' } } } },
        },
      },
    },
  });

  return memberships.map(m => ({
    id: m.room.id,
    name: m.room.name,
    status: m.room.status,
    myRole: m.role,
    memberCount: m.room._count.members,
  }));
}

/**
 * Get room details with members.
 */
export async function getRoomDetails(roomId: string) {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { joinedAt: 'asc' },
      },
    },
  });

  if (!room) {
    throw Object.assign(new Error('Room not found'), { statusCode: 404, code: 'ROOM_NOT_FOUND' });
  }

  return {
    id: room.id,
    name: room.name,
    status: room.status,
    inviteCode: room.inviteCode,
    members: room.members.map(m => ({
      userId: m.user.id,
      name: m.user.name,
      role: m.role,
      status: m.status,
      joinedAt: m.joinedAt.toISOString(),
    })),
  };
}

/**
 * Calculate balances for a room — the core "who owes what" function.
 * Always computed live from events, never cached.
 */
export async function getRoomBalances(roomId: string): Promise<{
  balances: (BalanceEntry & { name: string })[];
  suggestedSettlements: SettlementSuggestion[];
}> {
  // Fetch all active members
  const members = await prisma.roomMember.findMany({
    where: { roomId },
    include: { user: { select: { id: true, name: true } } },
  });

  const memberUserIds = members.map(m => m.user.id);
  const memberNames = new Map(members.map(m => [m.user.id, m.user.name]));

  // Fetch all payments from ACTIVE expenses
  const payments = await prisma.expensePayment.findMany({
    where: {
      expense: { roomId, status: 'ACTIVE' },
    },
    select: { payerId: true, amountPaise: true },
  });

  // Fetch all participant shares from ACTIVE expenses
  const participantShares = await prisma.expenseParticipant.findMany({
    where: {
      expense: { roomId, status: 'ACTIVE' },
    },
    select: { userId: true, shareAmountPaise: true },
  });

  // Fetch all CONFIRMED settlements
  const settlements = await prisma.settlement.findMany({
    where: { roomId, status: 'CONFIRMED' },
    select: { fromUserId: true, toUserId: true, amountPaise: true },
  });

  // Calculate balances using pure function
  const balances = calculateBalances(memberUserIds, payments, participantShares, settlements);

  // Validate invariant
  if (!validateBalanceInvariant(balances)) {
    console.error(`[BALANCE INVARIANT VIOLATION] roomId=${roomId}`, JSON.stringify(balances, (_, v) => typeof v === 'bigint' ? v.toString() : v));
    throw Object.assign(
      new Error('Unable to load balances. Please try again.'),
      { statusCode: 500, code: 'BALANCE_INTEGRITY_ERROR' }
    );
  }

  // Generate settlement suggestions
  const suggestions = suggestSettlements(balances);

  return {
    balances: balances.map(b => ({
      ...b,
      name: memberNames.get(b.userId) || 'Unknown',
    })),
    suggestedSettlements: suggestions,
  };
}

/**
 * Get monthly summary — read-only filtered view.
 * Balances are always all-time/room-wide; this just filters expenses by month.
 */
export async function getMonthlySummary(roomId: string, month: string) {
  // Parse month (format: "2026-09")
  const [year, monthNum] = month.split('-').map(Number);
  const startDate = new Date(year, monthNum - 1, 1);
  const endDate = new Date(year, monthNum, 1);

  // Get expenses in this month
  const expenses = await prisma.expense.findMany({
    where: {
      roomId,
      status: 'ACTIVE',
      expenseDate: { gte: startDate, lt: endDate },
    },
    include: {
      category: { select: { name: true } },
    },
  });

  // Calculate totals
  const totalExpensesPaise = expenses.reduce((sum, e) => sum + e.amountPaise, 0n);

  // Category breakdown
  const categoryMap = new Map<string, bigint>();
  for (const e of expenses) {
    const catName = e.category?.name || 'Other';
    categoryMap.set(catName, (categoryMap.get(catName) || 0n) + e.amountPaise);
  }

  const categoryBreakdown = Array.from(categoryMap.entries()).map(([category, totalPaise]) => ({
    category,
    totalPaise,
  }));

  // Get member count
  const memberCount = await prisma.roomMember.count({
    where: { roomId, status: 'ACTIVE' },
  });

  // Get current all-time balances (not month-filtered — balances are always room-wide)
  const { balances } = await getRoomBalances(roomId);

  return {
    month,
    totalExpensesPaise,
    memberCount,
    categoryBreakdown,
    balancesAtMonthEnd: balances.map(b => ({
      userId: b.userId,
      name: b.name,
      outstandingPaise: b.outstandingPaise,
    })),
  };
}

/**
 * Update room (admin only).
 */
export async function updateRoom(roomId: string, data: { name?: string; status?: 'ACTIVE' | 'ARCHIVED' }) {
  return prisma.room.update({
    where: { id: roomId },
    data,
  });
}

/**
 * Check if user is admin of a room.
 */
export async function isRoomAdmin(roomId: string, userId: string): Promise<boolean> {
  const member = await prisma.roomMember.findUnique({
    where: { roomId_userId: { roomId, userId } },
  });
  return member?.role === 'ADMIN';
}

/**
 * Check if user is a member of a room (active).
 */
export async function isRoomMember(roomId: string, userId: string): Promise<boolean> {
  const member = await prisma.roomMember.findUnique({
    where: { roomId_userId: { roomId, userId } },
  });
  return member?.status === 'ACTIVE';
}
