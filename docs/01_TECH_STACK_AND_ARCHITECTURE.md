# Tech Stack & Architecture — Shared Hostel Expense Manager

> **Document purpose:** Yeh document exact technology choices aur project architecture define karta hai taaki Antigravity (ya koi bhi dev/AI agent) consistent, predictable code generate kare. In choices ko development ke beech mein change nahi karna.

---

## 1. Chosen Stack

| Layer | Technology | Reason |
|---|---|---|
| Frontend | **React** (with TypeScript) | Component reusability, strong ecosystem, type safety for financial data |
| Backend | **Node.js + Express** (with TypeScript) | JS/TS across stack reduces context switching, good for REST APIs |
| Database | **PostgreSQL** | ACID transactions are mandatory for financial correctness (balance invariant must never break mid-write); relational model fits normalized ledger data |
| ORM | **Prisma** | Type-safe DB access, migrations, works well with Postgres + TypeScript |
| Auth | **JWT-based session auth** (email/phone + password, or magic link) | Simple, stateless, works across web sessions |
| API Style | **REST (JSON)** | Simpler than GraphQL for this scope; matches endpoint list in `04_API_SPECIFICATION.md` |
| Hosting (suggested) | Frontend: Vercel/Netlify · Backend: Render/Railway · DB: Managed Postgres (Neon/Supabase/Railway) | Low-ops, good free tiers for MVP |

> **Why not local-only/offline:** Roommates need shared, multi-device, always-current data — one person adds an expense, everyone else must see updated balances. This requires a central server + database, not local storage.

---

## 2. Non-Negotiable Architecture Decision

> **Source of truth = financial events only.**

The database must **never** store a "who owes whom" table directly. It only stores:
- Expenses + their per-participant shares
- Actual payments made (supports multiple payers per expense)
- Settlements (direct person-to-person repayments)

**"Who owes whom" is always a calculated/derived result**, computed server-side from these events. This must be enforced in code — no shortcuts, no caching of derived debt as a mutable table field that can drift out of sync.

All balance calculations happen **server-side** (never trust client-computed balances). See `03_BUSINESS_LOGIC_AND_CALCULATION_ENGINE.md` for the exact formulas.

---

## 3. High-Level System Architecture

```text
┌─────────────────┐         HTTPS/JSON        ┌──────────────────────┐
│   React Frontend │ ─────────────────────────▶│  Express API Server   │
│  (Web, mobile-   │◀───────────────────────── │  (Node.js + TS)       │
│   responsive)    │                            │                       │
└─────────────────┘                            │  - Auth middleware    │
                                                 │  - Route handlers     │
                                                 │  - Calculation engine │
                                                 │  - Validation layer   │
                                                 └───────────┬───────────┘
                                                             │ Prisma ORM
                                                             ▼
                                                 ┌──────────────────────┐
                                                 │   PostgreSQL DB       │
                                                 │  (transactional)      │
                                                 └──────────────────────┘
```

---

## 4. Backend Project Structure

```text
/server
  /src
    /config          → env config, db connection setup
    /routes           → Express route definitions (one file per resource)
      auth.routes.ts
      room.routes.ts
      expense.routes.ts
      settlement.routes.ts
      member.routes.ts
    /controllers      → request handling, calls services, returns responses
      auth.controller.ts
      room.controller.ts
      expense.controller.ts
      settlement.controller.ts
      member.controller.ts
    /services         → business logic layer (NO Express req/res here)
      calculation.service.ts   ← core balance/settlement engine (see doc 03)
      expense.service.ts
      settlement.service.ts
      room.service.ts
      audit.service.ts
    /middleware
      auth.middleware.ts
      validate.middleware.ts
      error.middleware.ts
    /validators        → request payload validation schemas (e.g. zod)
      expense.validator.ts
      settlement.validator.ts
    /utils
      money.util.ts     ← paise conversion, rounding helpers (CRITICAL — see doc 03 §Rounding)
    /types              → shared TypeScript types/interfaces
    app.ts
    server.ts
  /prisma
    schema.prisma       ← see doc 02 for full schema
    /migrations
  package.json
  tsconfig.json
  .env.example
```

**Rule:** Calculation logic (`calculation.service.ts`) must be pure functions wherever possible — no direct DB calls inside the math itself. Fetch data → pass to pure calculation functions → persist result. This makes the engine independently testable (see testing notes in doc 03).

---

## 5. Frontend Project Structure

```text
/client
  /src
    /pages
      LoginPage.tsx
      RoomListPage.tsx
      RoomDashboardPage.tsx      ← main "who owes what" screen
      AddExpensePage.tsx
      ExpenseDetailPage.tsx
      ExpenseHistoryPage.tsx
      SettlementPage.tsx
      RoomSettingsPage.tsx
      MonthlySummaryPage.tsx
    /components
      /expense
        ExpenseCard.tsx
        ExpenseForm.tsx
        SplitTypeSelector.tsx
        ParticipantPicker.tsx
        MultiPayerInput.tsx
      /settlement
        SettlementSuggestionCard.tsx
        SettlementForm.tsx
      /dashboard
        BalanceSummaryCard.tsx
        MemberBalanceRow.tsx
      /shared
        Button.tsx, Modal.tsx, Avatar.tsx, CurrencyInput.tsx, etc.
    /api               ← API client functions (fetch wrappers per resource)
      auth.api.ts
      room.api.ts
      expense.api.ts
      settlement.api.ts
    /hooks
      useRoomBalances.ts
      useExpenses.ts
    /context
      AuthContext.tsx
    /types             ← mirrors backend types where relevant
    /utils
      currency.util.ts  ← display formatting only (paise → ₹X.XX), never does math
    App.tsx
    main.tsx
  package.json
  tsconfig.json
```

---

## 6. Critical Implementation Rules for the Coding Agent

These are architecture-level constraints that must hold regardless of which screen or feature is being built:

1. **All money stored as integers (paise), never floats.** See doc 03 §Rounding. Frontend sends/receives paise or rupees consistently per the API contract (doc 04) — never mix.
2. **Every balance-affecting write (expense create/edit/void, settlement create/edit/cancel) happens inside a DB transaction.** Partial writes must never leave the ledger inconsistent.
3. **Balances are never stored as a mutable cached field that's updated ad-hoc.** If a cached/materialized balance table is used for performance later, it must be recomputed from source events, not incrementally patched — until that's proven necessary, compute balances on read.
4. **After every calculation, assert `sum(all balances in room) === 0`.** If not, log an error (do not silently show wrong numbers to the user) — see doc 03 §Balance Validation.
5. **Soft-delete/void pattern for expenses and settlements** — never hard-delete financial records. Use a `status` field (`active` / `voided`) plus audit log entry.
6. **Every create/edit/delete/void of Expense, Settlement, or Member status changes writes an AuditLog row.**
7. **New room members are never retroactively attached to old expenses.** Enforced at the query/service level, not just UI.

---

## 7. Environment & Config

`.env` variables the backend needs (document in `.env.example`):

```text
DATABASE_URL=postgresql://user:password@host:5432/hostel_expense_db
JWT_SECRET=<random-secret>
PORT=4000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
```

---

## 8. Related Documents

| File | Purpose |
|---|---|
| `00_PRODUCT_SPEC.md` | Problem, objective, MVP scope |
| `02_DATABASE_SCHEMA.md` | Full Postgres/Prisma schema |
| `03_BUSINESS_LOGIC_AND_CALCULATION_ENGINE.md` | Calculation engine detail |
| `04_API_SPECIFICATION.md` | REST endpoints |
| `05_UI_UX_REQUIREMENTS.md` | Screens and flows |
