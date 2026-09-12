// ─────────────────────────────────────────────
// Shared TypeScript types for the Hisaab frontend
// Mirrors backend types where relevant
// ─────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  upiId?: string;
}

export interface Room {
  id: string;
  name: string;
  status: 'ACTIVE' | 'ARCHIVED';
  inviteCode?: string;
  myRole?: 'ADMIN' | 'MEMBER';
  memberCount?: number;
}

export interface RoomMember {
  userId: string;
  name: string;
  role: 'ADMIN' | 'MEMBER';
  status: 'ACTIVE' | 'INACTIVE';
  joinedAt: string;
  upiId?: string | null;
}

export interface RoomDetails extends Room {
  members: RoomMember[];
}

export interface BalanceEntry {
  userId: string;
  name: string;
  outstandingPaise: number;
}

export interface SettlementSuggestion {
  fromUserId: string;
  toUserId: string;
  amountPaise: number;
}

export interface BalancesResponse {
  balances: BalanceEntry[];
  suggestedSettlements: SettlementSuggestion[];
}

export interface ExpensePayment {
  id: string;
  payerId: string;
  payer?: { id: string; name: string };
  amountPaise: number;
  paymentMethod: string;
}

export interface ExpenseParticipant {
  id: string;
  userId: string;
  user?: { id: string; name: string };
  shareAmountPaise: number;
  percentage?: number | null;
  shareUnits?: number | null;
}

export interface Expense {
  id: string;
  roomId: string;
  description: string;
  amountPaise: number;
  splitType: 'EQUAL' | 'CUSTOM_AMOUNT' | 'PERCENTAGE' | 'SHARE_BASED';
  status: 'ACTIVE' | 'VOIDED';
  note?: string;
  category?: { id: string; name: string } | null;
  createdBy?: { id: string; name: string };
  payments: ExpensePayment[];
  participants: ExpenseParticipant[];
  expenseDate: string;
  createdAt: string;
}

export interface Settlement {
  id: string;
  fromUserId: string;
  toUserId: string;
  fromUser?: { id: string; name: string };
  toUser?: { id: string; name: string };
  amountPaise: number;
  paymentMethod: string;
  proofUrl?: string | null;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  note?: string;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  isPreset: boolean;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  userId: string;
  userName: string;
  reason?: string;
  oldData?: Record<string, any>;
  newData?: Record<string, any>;
  createdAt: string;
}

export interface MonthlySummary {
  month: string;
  totalExpensesPaise: number;
  memberCount: number;
  categoryBreakdown: { category: string; totalPaise: number }[];
  balancesAtMonthEnd: BalanceEntry[];
}
