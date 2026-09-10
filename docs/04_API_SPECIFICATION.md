# API Specification — Shared Hostel Expense Manager

> **Document purpose:** REST API contract between frontend and backend. All endpoints return JSON. All money values in request/response bodies are in **paise (integers)** unless explicitly noted as a display-formatted string. Auth via `Authorization: Bearer <JWT>` header unless noted public.

Base URL (dev): `http://localhost:4000/api/v1`

---

## 1. Conventions

- All timestamps: ISO 8601 UTC strings.
- All money fields: suffixed `Paise` in the JSON body, integer values.
- Standard error response shape:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Sum of custom split amounts (95000) does not match expense amount (100000).",
    "details": {}
  }
}
```
- Standard success list response shape:
```json
{ "data": [ /* items */ ], "meta": { "total": 42, "page": 1, "pageSize": 20 } }
```

---

## 2. Auth

### `POST /auth/register` (public)
```json
// Request
{ "name": "Ahad", "email": "ahad@example.com", "phone": "9990001111", "password": "••••" }
// Response 201
{ "data": { "user": { "id": "uuid", "name": "Ahad", "email": "..." }, "token": "jwt..." } }
```

### `POST /auth/login` (public)
```json
// Request
{ "email": "ahad@example.com", "password": "••••" }
// Response 200
{ "data": { "user": { "id": "uuid", "name": "Ahad" }, "token": "jwt..." } }
```

### `GET /auth/me`
```json
// Response 200
{ "data": { "id": "uuid", "name": "Ahad", "email": "...", "phone": "..." } }
```

---

## 3. Rooms

### `POST /rooms`
Create a new room. Creator becomes ADMIN automatically.
```json
// Request
{ "name": "Room 304" }
// Response 201
{ "data": { "id": "uuid", "name": "Room 304", "inviteCode": "R304-XJ2K", "createdById": "uuid", "status": "ACTIVE" } }
```

### `POST /rooms/join`
```json
// Request
{ "inviteCode": "R304-XJ2K" }
// Response 200
{ "data": { "roomId": "uuid", "role": "MEMBER" } }
```

### `GET /rooms`
List rooms the current user belongs to.
```json
{ "data": [ { "id": "uuid", "name": "Room 304", "status": "ACTIVE", "myRole": "ADMIN" } ] }
```

### `GET /rooms/:roomId`
Room details + member list.
```json
{
  "data": {
    "id": "uuid", "name": "Room 304", "status": "ACTIVE",
    "members": [
      { "userId": "uuid", "name": "Ahad", "role": "ADMIN", "status": "ACTIVE", "joinedAt": "..." }
    ]
  }
}
```

### `PATCH /rooms/:roomId` (admin only)
Update room name/status (e.g. archive).

### `POST /rooms/:roomId/members/:userId/remove` (admin only)
Marks member `INACTIVE`. **Must reject** if member has non-zero outstanding balance, unless `force=true` is passed with an explicit acknowledgement flag — return current outstanding balance in the error so the UI can prompt settlement first.
```json
// Response 409 (if balance non-zero and not forced)
{ "error": { "code": "MEMBER_HAS_OUTSTANDING_BALANCE", "message": "B still has an outstanding balance of ₹450.", "details": { "outstandingPaise": 45000 } } }
```

### `GET /rooms/:roomId/balances`
The core "who owes what" endpoint — always server-computed, never cached blindly.
```json
{
  "data": {
    "balances": [
      { "userId": "uuid", "name": "Ahad", "outstandingPaise": 65000 },
      { "userId": "uuid", "name": "B", "outstandingPaise": 5000 },
      { "userId": "uuid", "name": "C", "outstandingPaise": -35000 },
      { "userId": "uuid", "name": "D", "outstandingPaise": -35000 }
    ],
    "suggestedSettlements": [
      { "fromUserId": "uuid-C", "toUserId": "uuid-Ahad", "amountPaise": 35000 },
      { "fromUserId": "uuid-D", "toUserId": "uuid-Ahad", "amountPaise": 30000 },
      { "fromUserId": "uuid-D", "toUserId": "uuid-B", "amountPaise": 5000 }
    ]
  }
}
```

### `GET /rooms/:roomId/summary?month=2026-09`
Monthly summary.
```json
{
  "data": {
    "month": "2026-09",
    "totalExpensesPaise": 1845000,
    "memberCount": 4,
    "categoryBreakdown": [ { "category": "Grocery", "totalPaise": 900000 } ],
    "balancesAtMonthEnd": [ { "userId": "uuid", "outstandingPaise": 65000 } ]
  }
}
```

---

## 4. Categories & Default Rules

### `GET /rooms/:roomId/categories`
### `POST /rooms/:roomId/categories` (admin) — `{ "name": "Birthday Party" }`
### `GET /rooms/:roomId/default-rules`
### `PUT /rooms/:roomId/default-rules` (admin)
```json
// Request
{ "rules": [ { "categoryName": "Grocery", "defaultParticipantScope": "EVERYONE" } ] }
```

---

## 5. Expenses

### `POST /rooms/:roomId/expenses`
```json
// Request
{
  "description": "Grocery run",
  "amountPaise": 140000,
  "categoryId": "uuid-or-null",
  "expenseDate": "2026-09-10T20:30:00Z",
  "splitType": "EQUAL",
  "payments": [
    { "payerId": "uuid-ahad", "amountPaise": 100000, "paymentMethod": "CASH" },
    { "payerId": "uuid-b",    "amountPaise": 40000,  "paymentMethod": "UPI" }
  ],
  "participants": [
    { "userId": "uuid-ahad" },
    { "userId": "uuid-b" },
    { "userId": "uuid-c" },
    { "userId": "uuid-d" }
  ]
  // for CUSTOM_AMOUNT: participants include { "userId": ..., "customAmountPaise": ... }
  // for PERCENTAGE:    participants include { "userId": ..., "percentage": 40.00 }
  // for SHARE_BASED:   participants include { "userId": ..., "shareUnits": 2 }
}
// Response 201
{
  "data": {
    "id": "uuid",
    "description": "Grocery run",
    "amountPaise": 140000,
    "splitType": "EQUAL",
    "status": "ACTIVE",
    "payments": [ /* ... */ ],
    "participants": [ { "userId": "uuid-ahad", "shareAmountPaise": 35000 }, /* ... */ ]
  }
}
```
**Validation errors** (400): amount ≤ 0, payments don't sum to amount, custom/percentage/share splits don't validate — see doc 03 §9. Response uses the standard error shape with `code: "VALIDATION_ERROR"`.

### `GET /rooms/:roomId/expenses?page=1&pageSize=20&category=&status=ACTIVE`
Paginated expense history.

### `GET /rooms/:roomId/expenses/:expenseId`
Full breakdown (payments + participant shares).

### `PATCH /rooms/:roomId/expenses/:expenseId`
Edit an expense. Requires `reason` field (optional but recommended in UI).
```json
// Request
{ "amountPaise": 150000, "reason": "Bill correction", "payments": [...], "participants": [...] }
```
Writes an `EXPENSE_EDITED` audit log with old/new snapshots (doc 03 §8).

### `POST /rooms/:roomId/expenses/:expenseId/void`
```json
// Request
{ "reason": "Duplicate entry" }
// Response 200 (or 409 with warning payload if already reflected in later settlements — see doc 03 §8)
{ "data": { "id": "uuid", "status": "VOIDED" } }
```

---

## 6. Settlements

### `GET /rooms/:roomId/settlements?status=CONFIRMED`
### `POST /rooms/:roomId/settlements`
```json
// Request
{ "fromUserId": "uuid-c", "toUserId": "uuid-ahad", "amountPaise": 35000, "paymentMethod": "UPI", "note": "" }
// Response 201 (or 200 with a `warning` field if amount looks inconsistent with current balance — see doc 03 §7)
{
  "data": { "id": "uuid", "fromUserId": "uuid-c", "toUserId": "uuid-ahad", "amountPaise": 35000, "status": "CONFIRMED" },
  "warning": null
}
```

### `PATCH /rooms/:roomId/settlements/:settlementId`
Edit a settlement (rare; e.g. correcting amount). Writes `SETTLEMENT_EDITED` audit log.

### `POST /rooms/:roomId/settlements/:settlementId/cancel`
Soft-cancel (never hard delete). Writes `SETTLEMENT_CANCELLED` audit log.

---

## 7. Audit Log

### `GET /rooms/:roomId/audit-log?entityType=Expense&entityId=uuid`
```json
{
  "data": [
    {
      "id": "uuid", "action": "EXPENSE_EDITED", "entityType": "Expense", "entityId": "uuid",
      "userId": "uuid-b", "userName": "B", "reason": "Bill correction",
      "oldData": { "amountPaise": 50000 }, "newData": { "amountPaise": 70000 },
      "createdAt": "2026-09-10T21:00:00Z"
    }
  ]
}
```

---

## 8. HTTP Status Code Conventions

| Code | Meaning |
|---|---|
| 200 | Success (GET, or successful action that doesn't create a resource) |
| 201 | Resource created |
| 400 | Validation error (client-fixable, e.g. splits don't sum correctly) |
| 401 | Not authenticated |
| 403 | Authenticated but not authorized (e.g. non-admin trying admin action) |
| 404 | Resource not found |
| 409 | Conflict (e.g. removing member with outstanding balance, voiding an expense already reflected in settlements) |
| 500 | Server error (should also trigger the balance-integrity logging in doc 03 §10 if balance-related) |

---

## 9. Related Documents

| File | Purpose |
|---|---|
| `02_DATABASE_SCHEMA.md` | Underlying tables |
| `03_BUSINESS_LOGIC_AND_CALCULATION_ENGINE.md` | Logic these endpoints invoke |
| `05_UI_UX_REQUIREMENTS.md` | Screens that consume these endpoints |
