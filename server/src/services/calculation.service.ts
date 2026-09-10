// ─────────────────────────────────────────────
// Calculation Engine — Pure Functions
// CRITICAL: This is the most important file in the entire backend.
// All functions are PURE (no DB calls). Data is fetched elsewhere and passed in.
// All money math uses BigInt (paise). Never floats.
// ─────────────────────────────────────────────

import { distributeRemainder } from '../utils/money.util';
import type {
  ShareResult,
  BalanceEntry,
  SettlementSuggestion,
  ParticipantInput,
  ExpensePaymentData,
  ExpenseParticipantData,
  SettlementData,
} from '../types';

// ─────────────────────────────────────────────
// §2.1 Equal Split
// ─────────────────────────────────────────────

/**
 * Split an amount equally among participants.
 * Uses floor division + deterministic remainder distribution (by userId ascending).
 * 
 * @returns Array of { userId, shareAmountPaise } — guaranteed to sum to amountPaise exactly.
 */
export function calculateEqualSplit(
  amountPaise: bigint,
  participantUserIds: string[]
): ShareResult[] {
  if (participantUserIds.length === 0) {
    throw new Error('At least one participant is required');
  }
  if (amountPaise <= 0n) {
    throw new Error('Amount must be positive');
  }

  const n = BigInt(participantUserIds.length);
  const baseShare = amountPaise / n;

  // Build raw shares map
  const rawShares = new Map<string, bigint>();
  for (const userId of participantUserIds) {
    rawShares.set(userId, baseShare);
  }

  // Distribute remainder (uses userId ascending order)
  const finalShares = distributeRemainder(rawShares, amountPaise);

  // Sort by userId for deterministic output
  const sortedIds = [...participantUserIds].sort((a, b) => a.localeCompare(b));
  return sortedIds.map(userId => ({
    userId,
    shareAmountPaise: finalShares.get(userId)!,
  }));
}

// ─────────────────────────────────────────────
// §2.2 Custom Amount Split
// ─────────────────────────────────────────────

/**
 * Validate and return custom split amounts.
 * Sum of custom amounts MUST equal amountPaise exactly — otherwise rejected.
 */
export function calculateCustomSplit(
  amountPaise: bigint,
  participants: ParticipantInput[]
): ShareResult[] {
  if (participants.length === 0) {
    throw new Error('At least one participant is required');
  }

  let sum = 0n;
  for (const p of participants) {
    if (p.customAmountPaise === undefined || p.customAmountPaise === null) {
      throw new Error(`Custom amount missing for participant ${p.userId}`);
    }
    if (p.customAmountPaise < 0n) {
      throw new Error(`Custom amount cannot be negative for participant ${p.userId}`);
    }
    sum += p.customAmountPaise;
  }

  if (sum !== amountPaise) {
    throw new Error(
      `Sum of custom split amounts (${sum}) does not match expense amount (${amountPaise})`
    );
  }

  return participants.map(p => ({
    userId: p.userId,
    shareAmountPaise: p.customAmountPaise!,
  }));
}

// ─────────────────────────────────────────────
// §2.3 Percentage Split
// ─────────────────────────────────────────────

/**
 * Split by percentage. Percentages must sum to exactly 100.00.
 * Uses largest-fractional-remainder method for distributing rounding paise.
 */
export function calculatePercentageSplit(
  amountPaise: bigint,
  participants: ParticipantInput[]
): ShareResult[] {
  if (participants.length === 0) {
    throw new Error('At least one participant is required');
  }

  // Validate percentages sum to 100
  let percentageSum = 0;
  for (const p of participants) {
    if (p.percentage === undefined || p.percentage === null) {
      throw new Error(`Percentage missing for participant ${p.userId}`);
    }
    if (p.percentage < 0) {
      throw new Error(`Percentage cannot be negative for participant ${p.userId}`);
    }
    percentageSum += p.percentage;
  }

  // Allow tiny epsilon for float input (±0.01)
  if (Math.abs(percentageSum - 100) > 0.01) {
    throw new Error(
      `Sum of percentages (${percentageSum}) does not equal 100`
    );
  }

  // Calculate raw shares using floor
  const rawShares = new Map<string, bigint>();
  const fractionalRemainders = new Map<string, number>();
  const amountNumber = Number(amountPaise);

  for (const p of participants) {
    const exactShare = amountNumber * p.percentage! / 100;
    const flooredShare = BigInt(Math.floor(exactShare));
    rawShares.set(p.userId, flooredShare);
    fractionalRemainders.set(p.userId, exactShare - Math.floor(exactShare));
  }

  // Distribute remainder using largest-fractional-remainder method
  const finalShares = distributeRemainder(rawShares, amountPaise, fractionalRemainders);

  return participants.map(p => ({
    userId: p.userId,
    shareAmountPaise: finalShares.get(p.userId)!,
  }));
}

// ─────────────────────────────────────────────
// §2.4 Share-Based Split
// ─────────────────────────────────────────────

/**
 * Split proportionally by share units (e.g. 2:1:1).
 * Uses largest-fractional-remainder method for distributing rounding paise.
 */
export function calculateShareBasedSplit(
  amountPaise: bigint,
  participants: ParticipantInput[]
): ShareResult[] {
  if (participants.length === 0) {
    throw new Error('At least one participant is required');
  }

  let totalUnits = 0;
  for (const p of participants) {
    if (p.shareUnits === undefined || p.shareUnits === null) {
      throw new Error(`Share units missing for participant ${p.userId}`);
    }
    if (p.shareUnits < 0) {
      throw new Error(`Share units cannot be negative for participant ${p.userId}`);
    }
    totalUnits += p.shareUnits;
  }

  if (totalUnits <= 0) {
    throw new Error('Total share units must be greater than 0');
  }

  // Calculate raw shares
  const rawShares = new Map<string, bigint>();
  const fractionalRemainders = new Map<string, number>();
  const amountNumber = Number(amountPaise);

  for (const p of participants) {
    const exactShare = amountNumber * p.shareUnits! / totalUnits;
    const flooredShare = BigInt(Math.floor(exactShare));
    rawShares.set(p.userId, flooredShare);
    fractionalRemainders.set(p.userId, exactShare - Math.floor(exactShare));
  }

  // Distribute remainder
  const finalShares = distributeRemainder(rawShares, amountPaise, fractionalRemainders);

  return participants.map(p => ({
    userId: p.userId,
    shareAmountPaise: finalShares.get(p.userId)!,
  }));
}

// ─────────────────────────────────────────────
// §1 Master Balance Formula
// ─────────────────────────────────────────────

/**
 * Calculate outstanding balances for all members in a room.
 * 
 * Outstanding_i = (P_i − S_i) + SettlementsPaid_i − SettlementsReceived_i
 * 
 * Where:
 * - P_i = sum of payments made by person i (across ACTIVE expenses only)
 * - S_i = sum of shares assigned to person i (across ACTIVE expenses only)
 * - SettlementsPaid_i = sum of CONFIRMED settlements where person i is fromUser
 * - SettlementsReceived_i = sum of CONFIRMED settlements where person i is toUser
 * 
 * @param memberUserIds - All member userIds in the room (for complete output)
 * @param payments - All ExpensePayment rows from ACTIVE expenses
 * @param participantShares - All ExpenseParticipant rows from ACTIVE expenses
 * @param settlements - All CONFIRMED Settlement rows
 * @returns Array of BalanceEntry for each member
 */
export function calculateBalances(
  memberUserIds: string[],
  payments: ExpensePaymentData[],
  participantShares: ExpenseParticipantData[],
  settlements: SettlementData[]
): BalanceEntry[] {
  // Initialize accumulators for each member
  const totalPaid = new Map<string, bigint>();
  const totalShare = new Map<string, bigint>();
  const settlementsPaid = new Map<string, bigint>();
  const settlementsReceived = new Map<string, bigint>();

  for (const userId of memberUserIds) {
    totalPaid.set(userId, 0n);
    totalShare.set(userId, 0n);
    settlementsPaid.set(userId, 0n);
    settlementsReceived.set(userId, 0n);
  }

  // Sum up payments (P_i)
  for (const payment of payments) {
    const current = totalPaid.get(payment.payerId) || 0n;
    totalPaid.set(payment.payerId, current + payment.amountPaise);
  }

  // Sum up shares (S_i)
  for (const share of participantShares) {
    const current = totalShare.get(share.userId) || 0n;
    totalShare.set(share.userId, current + share.shareAmountPaise);
  }

  // Sum up settlements
  for (const settlement of settlements) {
    const paidCurrent = settlementsPaid.get(settlement.fromUserId) || 0n;
    settlementsPaid.set(settlement.fromUserId, paidCurrent + settlement.amountPaise);

    const receivedCurrent = settlementsReceived.get(settlement.toUserId) || 0n;
    settlementsReceived.set(settlement.toUserId, receivedCurrent + settlement.amountPaise);
  }

  // Calculate outstanding for each member
  const balances: BalanceEntry[] = memberUserIds.map(userId => {
    const p = totalPaid.get(userId) || 0n;
    const s = totalShare.get(userId) || 0n;
    const sp = settlementsPaid.get(userId) || 0n;
    const sr = settlementsReceived.get(userId) || 0n;

    const outstanding = (p - s) + sp - sr;

    return {
      userId,
      totalPaidPaise: p,
      totalSharePaise: s,
      settlementsPaidPaise: sp,
      settlementsReceivedPaise: sr,
      outstandingPaise: outstanding,
    };
  });

  return balances;
}

// ─────────────────────────────────────────────
// §10 Balance Validation (System Integrity Check)
// ─────────────────────────────────────────────

/**
 * Validate that sum of all outstanding balances in a room equals zero.
 * If it doesn't, this is a system-level bug.
 * 
 * @returns true if valid, false if invariant is violated
 */
export function validateBalanceInvariant(balances: BalanceEntry[]): boolean {
  let sum = 0n;
  for (const b of balances) {
    sum += b.outstandingPaise;
  }
  return sum === 0n;
}

// ─────────────────────────────────────────────
// §6 Settlement Suggestion Algorithm
// ─────────────────────────────────────────────

/**
 * Suggest minimum transactions to settle all debts in a room.
 * Uses greedy largest-debtor-to-largest-creditor matching.
 * 
 * @param balances - Current balance entries (must pass invariant check first)
 * @returns Array of suggested settlement transactions
 */
export function suggestSettlements(balances: BalanceEntry[]): SettlementSuggestion[] {
  // Separate into creditors (positive) and debtors (negative)
  const creditors: { userId: string; amount: bigint }[] = [];
  const debtors: { userId: string; amount: bigint }[] = [];

  for (const b of balances) {
    if (b.outstandingPaise > 0n) {
      creditors.push({ userId: b.userId, amount: b.outstandingPaise });
    } else if (b.outstandingPaise < 0n) {
      debtors.push({ userId: b.userId, amount: b.outstandingPaise });
    }
    // Skip zero balances
  }

  // Sort creditors DESC by amount, debtors DESC by abs(amount)
  creditors.sort((a, b) => {
    if (b.amount > a.amount) return 1;
    if (b.amount < a.amount) return -1;
    return a.userId.localeCompare(b.userId); // tie-break by userId
  });

  debtors.sort((a, b) => {
    const absA = -a.amount;
    const absB = -b.amount;
    if (absB > absA) return 1;
    if (absB < absA) return -1;
    return a.userId.localeCompare(b.userId); // tie-break by userId
  });

  const transactions: SettlementSuggestion[] = [];
  let i = 0; // creditor index
  let j = 0; // debtor index

  while (i < creditors.length && j < debtors.length) {
    const creditor = creditors[i];
    const debtor = debtors[j];
    const absDebt = -debtor.amount;

    // Settle the minimum of what creditor is owed and what debtor owes
    const settleAmount = creditor.amount < absDebt ? creditor.amount : absDebt;

    transactions.push({
      fromUserId: debtor.userId,
      toUserId: creditor.userId,
      amountPaise: settleAmount,
    });

    creditor.amount -= settleAmount;
    debtor.amount += settleAmount; // debtor.amount is negative, moving toward 0

    if (creditor.amount === 0n) i++;
    if (debtor.amount === 0n) j++;
  }

  return transactions;
}
