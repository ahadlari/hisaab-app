# Database Schema — Shared Hostel Expense Manager

> **Document purpose:** Complete PostgreSQL schema (expressed as Prisma schema + notes) for Antigravity to implement directly. All money fields are integers representing **paise** (1 rupee = 100 paise) — see `03_BUSINESS_LOGIC_AND_CALCULATION_ENGINE.md` §Rounding for why.

---

## 1. Entity Relationship Overview

```text
User ──┬──< RoomMember >──┬── Room
       │                   │
       │                   ├──< Expense >──< ExpensePayment  (who actually paid, supports multiple payers)
       │                   │        └──< ExpenseParticipant   (each participant's share)
       │                   │
       │                   ├──< Settlement (from_user → to_user)
       │                   │
       │                   └──< AuditLog
       │
       └── (User can belong to many Rooms via RoomMember)
```

---

## 2. Prisma Schema

```prisma
// schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─────────────────────────────────────────────
// USER
// ─────────────────────────────────────────────
model User {
  id           String   @id @default(uuid())
  name         String
  email        String?  @unique
  phone        String?  @unique
  passwordHash String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  roomMemberships     RoomMember[]
  expensesCreated     Expense[]           @relation("ExpenseCreatedBy")
  expensePayments     ExpensePayment[]
  expenseShares       ExpenseParticipant[]
  settlementsFrom     Settlement[]        @relation("SettlementFromUser")
  settlementsTo       Settlement[]        @relation("SettlementToUser")
  auditLogs           AuditLog[]

  @@map("users")
}

// ─────────────────────────────────────────────
// ROOM
// ─────────────────────────────────────────────
model Room {
  id          String     @id @default(uuid())
  name        String
  createdById String
  createdBy   User       @relation(fields: [createdById], references: [id], "RoomCreatedBy")
  inviteCode  String     @unique   // short code/link for joining
  status      RoomStatus @default(ACTIVE)
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  members       RoomMember[]
  expenses      Expense[]
  settlements   Settlement[]
  auditLogs     AuditLog[]
  categories    RoomCategory[]
  defaultRules  RoomDefaultRule[]

  @@map("rooms")
}

enum RoomStatus {
  ACTIVE
  ARCHIVED
}

// ─────────────────────────────────────────────
// ROOM MEMBER (join table: User <-> Room)
// ─────────────────────────────────────────────
model RoomMember {
  id       String           @id @default(uuid())
  roomId   String
  room     Room             @relation(fields: [roomId], references: [id])
  userId   String
  user     User             @relation(fields: [userId], references: [id])
  role     RoomMemberRole   @default(MEMBER)
  status   RoomMemberStatus @default(ACTIVE)
  joinedAt DateTime         @default(now())
  leftAt   DateTime?

  @@unique([roomId, userId])
  @@map("room_members")
}

enum RoomMemberRole {
  ADMIN
  MEMBER
}

enum RoomMemberStatus {
  ACTIVE
  INACTIVE   // left the room, history preserved
}

// ─────────────────────────────────────────────
// EXPENSE
// ─────────────────────────────────────────────
model Expense {
  id           String        @id @default(uuid())
  roomId       String
  room         Room          @relation(fields: [roomId], references: [id])
  description  String
  amountPaise  BigInt        // total expense amount, in paise. Must equal sum(ExpensePayment.amountPaise)
  categoryId   String?
  category     RoomCategory? @relation(fields: [categoryId], references: [id])
  splitType    SplitType
  status       ExpenseStatus @default(ACTIVE)
  note         String?
  createdById  String
  createdBy    User          @relation("ExpenseCreatedBy", fields: [createdById], references: [id])
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
  expenseDate  DateTime      @default(now())  // when the purchase happened (may differ from createdAt)

  payments     ExpensePayment[]
  participants ExpenseParticipant[]

  @@map("expenses")
}

enum SplitType {
  EQUAL
  CUSTOM_AMOUNT
  PERCENTAGE
  SHARE_BASED
}

enum ExpenseStatus {
  ACTIVE
  VOIDED     // soft-deleted; never hard-delete
}

// ─────────────────────────────────────────────
// EXPENSE PAYMENT (supports multiple payers per expense)
// ─────────────────────────────────────────────
model ExpensePayment {
  id            String        @id @default(uuid())
  expenseId     String
  expense       Expense       @relation(fields: [expenseId], references: [id])
  payerId       String
  payer         User          @relation(fields: [payerId], references: [id])
  amountPaise   BigInt        // must be > 0
  paymentMethod PaymentMethod @default(OTHER)
  createdAt     DateTime      @default(now())

  // CONSTRAINT (enforced in service layer + DB check):
  // sum(ExpensePayment.amountPaise) for a given expenseId MUST equal Expense.amountPaise

  @@map("expense_payments")
}

enum PaymentMethod {
  CASH
  UPI
  CARD
  OTHER
}

// ─────────────────────────────────────────────
// EXPENSE PARTICIPANT (each participant's share of one expense)
// ─────────────────────────────────────────────
model ExpenseParticipant {
  id              String   @id @default(uuid())
  expenseId       String
  expense         Expense  @relation(fields: [expenseId], references: [id])
  userId          String
  user            User     @relation(fields: [userId], references: [id])
  shareAmountPaise BigInt  // final computed share, in paise — always stored, regardless of splitType
  percentage      Decimal? @db.Decimal(5, 2)  // only populated if splitType = PERCENTAGE (for display/audit)
  shareUnits      Int?     // only populated if splitType = SHARE_BASED (e.g. 2 shares) (for display/audit)

  // CONSTRAINT (enforced in service layer):
  // sum(ExpenseParticipant.shareAmountPaise) for a given expenseId MUST equal Expense.amountPaise
  // (rounding remainder distributed per rules in doc 03 §Rounding)

  @@unique([expenseId, userId])
  @@map("expense_participants")
}

// ─────────────────────────────────────────────
// SETTLEMENT (direct person-to-person repayment)
// ─────────────────────────────────────────────
model Settlement {
  id            String            @id @default(uuid())
  roomId        String
  room          Room              @relation(fields: [roomId], references: [id])
  fromUserId    String            // person who paid (debtor)
  fromUser      User              @relation("SettlementFromUser", fields: [fromUserId], references: [id])
  toUserId      String            // person who received (creditor)
  toUser        User              @relation("SettlementToUser", fields: [toUserId], references: [id])
  amountPaise   BigInt            // must be > 0
  paymentMethod PaymentMethod     @default(OTHER)
  status        SettlementStatus  @default(CONFIRMED)
  note          String?
  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt

  @@map("settlements")
}

enum SettlementStatus {
  PENDING     // e.g. UPI intent opened, not yet confirmed
  CONFIRMED   // marked as paid / verified
  CANCELLED   // voided, never hard-deleted
}

// ─────────────────────────────────────────────
// ROOM CATEGORY (preset + custom categories per room)
// ─────────────────────────────────────────────
model RoomCategory {
  id       String    @id @default(uuid())
  roomId   String
  room     Room      @relation(fields: [roomId], references: [id])
  name     String    // e.g. "Grocery", "Milk", "Gas", "Custom: Birthday Party"
  isPreset Boolean   @default(false)

  expenses Expense[]

  @@unique([roomId, name])
  @@map("room_categories")
}

// ─────────────────────────────────────────────
// ROOM DEFAULT RULE (default participant sets per category, overridable per expense)
// ─────────────────────────────────────────────
model RoomDefaultRule {
  id): String  @id @default(uuid())
  roomId     String
  room       Room     @relation(fields: [roomId], references: [id])
  categoryName String  // matches RoomCategory.name loosely; simple string key for MVP
  defaultParticipantScope DefaultParticipantScope @default(EVERYONE)

  @@unique([roomId, categoryName])
  @@map("room_default_rules")
}

enum DefaultParticipantScope {
  EVERYONE
  SELECTED_MEMBERS   // UI will require explicit selection when this is chosen
  INDIVIDUAL
}

// ─────────────────────────────────────────────
// AUDIT LOG (immutable action trail)
// ─────────────────────────────────────────────
model AuditLog {
  id         String   @id @default(uuid())
  roomId     String
  room       Room     @relation(fields: [roomId], references: [id])
  userId     String   // who performed the action
  user       User     @relation(fields: [userId], references: [id])
  action     AuditAction
  entityType String   // "Expense" | "Settlement" | "RoomMember" | etc.
  entityId   String
  oldData    Json?
  newData    Json?
  reason     String?  // e.g. "Bill correction"
  createdAt  DateTime @default(now())

  @@map("audit_logs")
}

enum AuditAction {
  EXPENSE_CREATED
  EXPENSE_EDITED
  EXPENSE_VOIDED
  SETTLEMENT_CREATED
  SETTLEMENT_EDITED
  SETTLEMENT_CANCELLED
  MEMBER_JOINED
  MEMBER_LEFT
  MEMBER_ROLE_CHANGED
}
```

> **Typo note for implementer:** `id): String` in `RoomDefaultRule` above is a typo artifact — should read `id String`. Fix during actual Prisma file creation.

---

## 3. Key Constraints Summary (must be enforced at service layer, and via DB checks where possible)

| Rule | Enforced By |
|---|---|
| `sum(ExpensePayment.amountPaise)` = `Expense.amountPaise` | Service-layer validation before commit (transaction) |
| `sum(ExpenseParticipant.shareAmountPaise)` = `Expense.amountPaise` | Service-layer validation, with rounding remainder logic (doc 03) |
| `Expense.amountPaise > 0` | DB check constraint + service validation |
| `ExpensePayment.amountPaise > 0` | DB check constraint |
| `Settlement.amountPaise > 0` | DB check constraint |
| At least 1 `ExpenseParticipant` per `Expense` | Service-layer validation |
| At least 1 `ExpensePayment` per `Expense` | Service-layer validation |
| `RoomMember` unique per `(roomId, userId)` | DB unique constraint (already in schema) |
| New members not retroactively added to past `ExpenseParticipant` rows | Service-layer — simply never write historical rows for new members |
| No hard deletes on `Expense`, `Settlement` | Service layer only exposes void/cancel operations, never a raw delete endpoint |

---

## 4. Indexing Notes

For MVP scale (rooms with 3–10 members, hundreds of expenses), add indexes on:
- `expenses(roomId, status, expenseDate)` — for history/list queries
- `expense_participants(userId)` — for computing a user's total share across rooms
- `expense_payments(payerId)` — for computing a user's total paid
- `settlements(roomId, status)` 
- `audit_logs(roomId, createdAt)`

---

## 5. Money Storage Rule (Critical)

All amount fields are `BigInt`, representing **paise** (smallest currency unit), never `Float`/`Decimal` for the core ledger amounts. This avoids floating-point rounding bugs in financial math. Display formatting (paise → ₹X.XX) happens only in the frontend presentation layer. Full rationale and rounding algorithm: see `03_BUSINESS_LOGIC_AND_CALCULATION_ENGINE.md` §Rounding Problem.

---

## 6. Related Documents

| File | Purpose |
|---|---|
| `00_PRODUCT_SPEC.md` | Problem, objective, MVP scope |
| `01_TECH_STACK_AND_ARCHITECTURE.md` | Stack and project structure |
| `03_BUSINESS_LOGIC_AND_CALCULATION_ENGINE.md` | How these tables are used to compute balances |
| `04_API_SPECIFICATION.md` | Endpoints operating on this schema |
