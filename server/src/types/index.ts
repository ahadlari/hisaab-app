// ─────────────────────────────────────────────
// Shared TypeScript types for the Hisaab backend
// ─────────────────────────────────────────────

// Split type enum (mirrors Prisma SplitType)
export type SplitType = 'EQUAL' | 'CUSTOM_AMOUNT' | 'PERCENTAGE' | 'SHARE_BASED';

// Payment method enum
export type PaymentMethod = 'CASH' | 'UPI' | 'CARD' | 'OTHER';

// Expense status
export type ExpenseStatus = 'ACTIVE' | 'VOIDED';

// Settlement status
export type SettlementStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED';

// Room status
export type RoomStatus = 'ACTIVE' | 'ARCHIVED';

// Room member role
export type RoomMemberRole = 'ADMIN' | 'MEMBER';

// Room member status
export type RoomMemberStatus = 'ACTIVE' | 'INACTIVE';

// Audit actions
export type AuditAction =
  | 'EXPENSE_CREATED'
  | 'EXPENSE_EDITED'
  | 'EXPENSE_VOIDED'
  | 'SETTLEMENT_CREATED'
  | 'SETTLEMENT_EDITED'
  | 'SETTLEMENT_CANCELLED'
  | 'MEMBER_JOINED'
  | 'MEMBER_LEFT'
  | 'MEMBER_ROLE_CHANGED';

// Default participant scope
export type DefaultParticipantScope = 'EVERYONE' | 'SELECTED_MEMBERS' | 'INDIVIDUAL';

// ─────────────────────────────────────────────
// Calculation engine types (pure, no Prisma dependency)
// ─────────────────────────────────────────────

export interface ShareResult {
  userId: string;
  shareAmountPaise: bigint;
}

export interface BalanceEntry {
  userId: string;
  totalPaidPaise: bigint;
  totalSharePaise: bigint;
  settlementsPaidPaise: bigint;
  settlementsReceivedPaise: bigint;
  outstandingPaise: bigint;
}

export interface SettlementSuggestion {
  fromUserId: string;
  toUserId: string;
  amountPaise: bigint;
}

// Participant input for split calculations
export interface ParticipantInput {
  userId: string;
  customAmountPaise?: bigint;
  percentage?: number;
  shareUnits?: number;
}

// Payment input
export interface PaymentInput {
  payerId: string;
  amountPaise: bigint;
  paymentMethod?: PaymentMethod;
}

// Data structures for balance calculation (fetched from DB, passed to pure functions)
export interface ExpensePaymentData {
  payerId: string;
  amountPaise: bigint;
}

export interface ExpenseParticipantData {
  userId: string;
  shareAmountPaise: bigint;
}

export interface SettlementData {
  fromUserId: string;
  toUserId: string;
  amountPaise: bigint;
}

// API response types
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiResponse<T> {
  data: T;
  warning?: string | null;
}

export interface ApiListResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
  };
}

// JWT payload
export interface JwtPayload {
  userId: string;
  iat?: number;
  exp?: number;
}
