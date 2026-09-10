# Business Logic & Calculation Engine — Shared Hostel Expense Manager

> **Document purpose:** Yeh app ka sabse critical document hai. Yahan exact formulas, algorithms, aur edge cases hain jo `calculation.service.ts` mein implement honge. Koi bhi ambiguity yahan bugs create karegi — is document ko Antigravity ko **line by line** follow karna chahiye.
>
> **Golden rule:** "Who owes whom" is NEVER stored. It is ALWAYS derived from Expenses + Payments + Shares + Settlements.

---

## 1. Master Formula

```text
Net Balance (B_i) = Total Paid (P_i) − Total Share (S_i) + Settlements Received Adjustment
```

Precisely, for person `i` in a room:

```text
P_i = sum of ExpensePayment.amountPaise where payerId = i, across ACTIVE expenses
S_i = sum of ExpenseParticipant.shareAmountPaise where userId = i, across ACTIVE expenses
SettlementsPaidByMe_i   = sum of Settlement.amountPaise where fromUserId = i, status = CONFIRMED
SettlementsReceivedByMe_i = sum of Settlement.amountPaise where toUserId = i, status = CONFIRMED

Outstanding_i = (P_i − S_i) + SettlementsPaidByMe_i − SettlementsReceivedByMe_i
```

### Sign convention (must be implemented exactly like this)

| Event | Effect on person's Outstanding balance |
|---|---|
| Expense payment (they paid) | **+** |
| Expense share (they owe) | **−** |
| Settlement they paid (money sent) | **+** |
| Settlement they received (money received) | **−** |

### Interpretation

```text
Outstanding_i > 0  → person should RECEIVE money (creditor)
Outstanding_i < 0  → person should PAY money (debtor)
Outstanding_i = 0  → person is settled
```

### System-wide invariant (must always hold)

```text
sum(P_i for all i) = sum(S_i for all i)     [because every expense's payments = every expense's shares]
sum(Outstanding_i for all i in a room) = 0   [ALWAYS, after every operation]
```

**Validation requirement:** After every balance calculation, the calculation service must assert this sum equals zero. If not, this is a system-level bug — see §10 Balance Validation.

---

## 2. Split Type Algorithms

All computations work in **paise (integers)**, never floating point.

### 2.1 Equal Split

```text
input: amountPaise (integer), participantUserIds (array of N user ids)

baseShare = floor(amountPaise / N)
remainder = amountPaise - (baseShare * N)

// distribute the remainder paise, 1 extra paise each, to the first `remainder`
// participants (sorted by a stable order — e.g. userId ascending, or join order)
// so that sum of shares === amountPaise exactly.

for i in 0..N-1:
  share[i] = baseShare + (1 if i < remainder else 0)
```

**Example:** ₹100 (10000 paise) ÷ 3 people → base = 3333, remainder = 1 → shares = [3334, 3333, 3333]. Sum = 10000. ✓

> Use a **deterministic, stable** ordering for who gets the extra paise (e.g. always by `userId` ascending) so recalculations are reproducible and don't shuffle on every request.

### 2.2 Custom Amount Split

```text
input: amountPaise, list of (userId, customAmountPaise)

validate: sum(customAmountPaise for all participants) === amountPaise
if not equal → REJECT the expense creation/edit with a clear validation error.

share[userId] = customAmountPaise   // no further computation needed
```

No rounding logic needed here — the user-provided amounts must sum exactly, or the request is rejected outright (see §9 Validation Rules).

### 2.3 Percentage Split

```text
input: amountPaise, list of (userId, percentage)  // percentage as e.g. 40.00

validate: sum(percentage for all participants) === 100.00 (allow tiny epsilon for float input, e.g. ±0.01, but the STORED percentage values themselves must sum to exactly 100.00)

rawShare[userId] = floor(amountPaise * percentage / 100)
remainder = amountPaise - sum(rawShare for all participants)

// distribute remainder paise (1 each) deterministically (e.g. largest fractional
// remainder first, tie-broken by userId ascending) until remainder is 0
```

**Example:** ₹1000 (100000 paise), Ahad 40%, B 30%, C 20%, D 10% → 40000, 30000, 20000, 10000. Sum = 100000, no remainder in this case. If percentages produce fractional paise, apply the "largest remainder" distribution method above.

### 2.4 Share-Based Split

```text
input: amountPaise, list of (userId, shareUnits)   // e.g. Ahad=2, B=1, C=1

totalUnits = sum(shareUnits)
validate: totalUnits > 0

rawShare[userId] = floor(amountPaise * shareUnits[userId] / totalUnits)
remainder = amountPaise - sum(rawShare for all participants)

// distribute remainder paise deterministically (same method as §2.3)
```

**Example:** ₹1000, Ahad=2 shares, B=1, C=1 (total=4) → 500, 250, 250. Sum = 1000. ✓

---

## 3. Multiple Payers Per Expense

An expense can have N payers (`ExpensePayment` rows) and M participants (`ExpenseParticipant` rows) — these are independent lists.

```text
validate: sum(ExpensePayment.amountPaise for this expense) === Expense.amountPaise
```

Each payer's `P_i` contribution is simply their individual `ExpensePayment.amountPaise` — no splitting logic needed on the payment side, only on the participant/share side.

**Example (from spec):** ₹1000 grocery, Ahad paid ₹600, B paid ₹400, all 4 participate equally (₹250 each):
```text
Ahad: paid 600, share 250 → net contribution from this expense = +350
B:    paid 400, share 250 → net contribution from this expense = +150
C:    paid 0,   share 250 → net contribution from this expense = −250
D:    paid 0,   share 250 → net contribution from this expense = −250
```

---

## 4. Participant ≠ Payer Rule

A payer does NOT have to be a participant, and vice versa.

**Example (from spec):** B pays ₹500, but only Ahad and C are participants (B is not).
```text
participants = [Ahad, C]
share = 500 / 2 = 250 each
B's share = 0 (B is not a participant, so no ExpenseParticipant row for B)
B's net from this expense = paid(500) − share(0) = +500
```

## 5. Personal Expense

Paid-by = participant = same single person.

```text
Paid = X, Share = X, Net = 0
```

Zero effect on everyone else in the room. This is just a normal expense with `participantUserIds = [payerId]` — no special-case code path needed, it falls out of the general formula naturally.

---

## 6. Settlement Suggestion Algorithm (Debt Simplification)

**Goal:** given the current `Outstanding_i` for every member in a room, produce the **minimum number of transactions** to bring everyone to zero.

### Algorithm (greedy largest-debtor-to-largest-creditor matching)

```text
function suggestSettlements(balances: Map<userId, outstandingPaise>):
  creditors = sorted list of {userId, amount} where outstandingPaise > 0, DESC by amount
  debtors   = sorted list of {userId, amount} where outstandingPaise < 0, DESC by abs(amount)
  transactions = []

  i = 0, j = 0
  while i < creditors.length and j < debtors.length:
    creditor = creditors[i]
    debtor   = debtors[j]
    settleAmount = min(creditor.amount, abs(debtor.amount))

    transactions.append({ from: debtor.userId, to: creditor.userId, amountPaise: settleAmount })

    creditor.amount -= settleAmount
    debtor.amount   += settleAmount   // debtor.amount is negative, moving toward 0

    if creditor.amount === 0: i += 1
    if debtor.amount === 0:   j += 1

  return transactions
```

**Worked example (from spec):**
```text
Balances: Ahad +650, B +50, C -350, D -350
Creditors: [Ahad 650, B 50]
Debtors:   [C -350, D -350]

Txn 1: C → Ahad, min(650,350) = 350   → Ahad now +300, C now 0
Txn 2: D → Ahad, min(300,350) = 300   → Ahad now 0,   D now -50
Txn 3: D → B,    min(50,50)   = 50    → B now 0,      D now 0

Result: C→Ahad ₹350, D→Ahad ₹300, D→B ₹50
```

**This is a *suggestion* only.** Users can also record settlements manually between any two people regardless of the suggestion (see §7).

---

## 7. Manual Settlement Recording

Users can record a settlement between any two people directly (`fromUserId`, `toUserId`, `amountPaise`), not just from suggestions.

**Validation on creation:**
```text
Before accepting a settlement (from A to B, amount X):
  - X > 0
  - This is a soft validation, NOT a hard block: warn if it looks unusual,
    e.g. if A's current outstanding balance is not <= -X (A doesn't "owe" that much)
    or B's balance is not >= X. Show a warning like:
      "C currently only owes ₹100, but you're recording ₹200."
    Allow the user to proceed anyway (roommates might genuinely be settling
    something outside the ledger, or pre-paying) — this is a WARNING, not a REJECTION,
    unless product decides otherwise. Document this choice clearly in the UI copy.
```

### Partial Settlement

A settlement for less than the full owed amount is valid and simply reduces the outstanding balance by that amount. No special "partial" flag needed in the schema — it's just a `Settlement` row for whatever amount was actually paid. The UI computes and displays "remaining owed" by re-running the balance calculation after the partial settlement is recorded.

---

## 8. Expense Edit & Delete (Void)

### Edit
```text
- Never overwrite silently.
- Write an AuditLog row: action=EXPENSE_EDITED, oldData=<previous full expense+shares+payments snapshot>, newData=<new snapshot>, reason=<user-provided or null>
- Recompute ALL balances for the room after the edit (balances are always derived fresh, so this is automatic if calculation is done on-read; if a cache exists, invalidate/recompute it)
```

### Delete (Void)
```text
- Never hard-delete. Set Expense.status = VOIDED.
- Write AuditLog row: action=EXPENSE_VOIDED, oldData=<snapshot>, reason=<user-provided or null>
- VOIDED expenses are EXCLUDED from all balance calculations (P_i, S_i sums only
  include status=ACTIVE expenses).
- IMPORTANT EDGE CASE: if this expense has already been factored into a settlement
  that a user made, voiding it can create a confusing new negative/positive balance
  for that user. Before voiding, the API must return a warning payload if the room
  has ANY settlements created AFTER this expense's createdAt:
    "This expense may already be reflected in a settlement. Voiding it will change
     current balances. Continue?"
  This is a confirmation step in the UI, not an automatic block.
```

### Refund

Refunds are recorded as a **new expense with a negative amount is NOT how this works** — instead:
```text
Represent a refund as its own ledger entry: a NEGATIVE-signed adjustment tied to
the original category, OR (simpler, MVP-recommended) as a new Expense with a
NEGATIVE amountPaise value that flows through the exact same formula:
  - Negative "payment" from whoever received the refund (reduces their P_i)
  - Negative "share" for whoever the refund benefits (reduces their S_i)

MVP-simplest implementation: allow Expense.amountPaise to be negative specifically
for refund-type entries (category-tagged or description-tagged "Refund"), reusing
the exact same calculation code path with no special-casing. Document this clearly
if implemented, since doc 02 schema currently assumes amountPaise > 0 as a general
validation rule — refunds are the ONE exception and must be clearly flagged
(e.g. an `isRefund: Boolean` field on Expense, defaulting false) so validation
logic can allow negative amounts only for these rows.
```

> **Antigravity note:** Add `isRefund Boolean @default(false)` to the `Expense` model in doc 02 when implementing this feature. If refunds are deferred past MVP, simply skip this and disallow negative amounts entirely for V1 — treat as a later-version feature per doc 00 §14.

---

## 9. Validation Rules (Enforced Before Any Write)

| Check | Rule |
|---|---|
| Amount | `Expense.amountPaise > 0` (except refunds, if implemented) |
| Payers | At least 1 `ExpensePayment` row; `sum(payments) === Expense.amountPaise` |
| Participants | At least 1 `ExpenseParticipant` row |
| Equal split | Generated shares must sum to exactly `Expense.amountPaise` |
| Custom split | `sum(customAmounts) === Expense.amountPaise`, else reject |
| Percentage split | `sum(percentages) === 100.00`, else reject |
| Share-based split | `sum(shareUnits) > 0` |
| Settlement amount | `Settlement.amountPaise > 0` |

All these validations run **server-side**, regardless of what the client sends. Client-side validation is for UX only (fast feedback) and must never be trusted as the source of correctness.

---

## 10. Balance Validation (System Integrity Check)

After every operation that affects balances (expense create/edit/void, settlement create/cancel), the calculation service should — at minimum in a background/periodic check, and ideally inline in development/test environments — verify:

```text
sum(Outstanding_i for all active members in the room) === 0
```

If this fails:
```text
- DO NOT show the incorrect balances to the user.
- Log the error with full context (roomId, computed balances, timestamp) for
  debugging (e.g. to an error-tracking service or a dedicated error log table).
- Return a generic "Unable to load balances, please try again" type message
  to the frontend rather than exposing broken numbers.
```

This check should also be part of the automated test suite (see §12).

---

## 11. Rounding Problem — Full Rule

```text
₹100 ÷ 3 = ₹33.333... → NOT representable exactly in rupees.
```

**Rule:** Store everything in the smallest currency unit — **paise** — as integers. ₹100 = 10000 paise.

```text
10000 ÷ 3 = 3333.33 → floor = 3333, remainder = 1
Distribute the 1 leftover paisa to one participant (deterministic rule, see §2.1-2.3)
Result: 3334 + 3333 + 3333 = 10000 exactly.
```

**Non-negotiable rule:** After rounding, `sum(shares) === Expense.amountPaise`, exactly, always. This must be a unit-tested property (see §12) — run it with random amounts and random participant counts to confirm no leftover paise ever appear.

---

## 12. Recommended Test Cases for the Calculation Engine

Antigravity should write automated tests (unit tests on `calculation.service.ts`) covering at least:

1. Equal split with evenly divisible amount (e.g. ₹1000 / 4).
2. Equal split with remainder (e.g. ₹100 / 3) — verify sum of shares = original amount, verify no participant is off by more than 1 paisa from others.
3. Custom split that sums correctly → accepted.
4. Custom split that doesn't sum correctly → rejected with clear error.
5. Percentage split summing to exactly 100% with fractional paise remainders → verify distribution and sum.
6. Share-based split (e.g. 2:1:1) → verify proportional amounts and sum.
7. Multiple payers on one expense → verify each payer's `P_i` contribution is independent of the split.
8. Payer who is not a participant → verify their share is 0 and their net is fully positive.
9. Personal expense (payer = sole participant) → verify net = 0, zero effect on others.
10. Full worked example from doc 00 (Ahad ₹1000 + B ₹400, 4 people) → verify final balances match: Ahad +650, B +50, C −350, D −350.
11. Settlement suggestion algorithm on the above → verify it produces exactly: C→Ahad 350, D→Ahad 300, D→B 50 (3 transactions, matches spec).
12. Partial settlement → verify remaining balance is correctly reduced, not zeroed out.
13. Expense edit → verify balances recompute correctly and audit log is written.
14. Expense void → verify voided expense is excluded from balance calc, audit log written.
15. New member joining mid-room-history → verify they have zero share in expenses created before their `joinedAt`.
16. **Invariant test:** for any randomly generated set of expenses/settlements, `sum(all Outstanding_i) === 0` always holds. (Property-based / fuzz test recommended.)

---

## 13. Related Documents

| File | Purpose |
|---|---|
| `00_PRODUCT_SPEC.md` | Problem, objective, MVP scope |
| `02_DATABASE_SCHEMA.md` | Tables this logic reads/writes |
| `04_API_SPECIFICATION.md` | Endpoints that trigger this logic |
