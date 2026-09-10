# UI/UX Requirements — Shared Hostel Expense Manager

> **Document purpose:** Screens, flows, and component inventory. Yeh document reference images banane ka base hoga — jab aap UI reference images generate/design karenge Antigravity ke liye, unhe in exact screens aur states ko cover karna chahiye.

---

## 1. Design Philosophy

- **Home screen ka main purpose:** "Abhi mujhe kitna dena/lena hai?" — yeh ek glance mein clear hona chahiye.
- **Fast expense entry** — minimum taps se ek expense add ho sake. Advanced options (custom split, items, receipt, notes) collapsed/secondary honi chahiye.
- Mobile-first responsive web (roommates phone par use karenge).
- Currency: ₹ (INR), Hinglish-friendly copy is fine (e.g. "You'll receive ₹650").
- Positive balance = green, negative balance = red/orange — consistent color coding throughout.

---

## 2. Screen Inventory

### 2.1 Auth Screens
- **Login** — email/phone + password
- **Register** — name, email/phone, password
- (Optional later: magic link / OTP — not required for MVP UI)

### 2.2 Room List Screen
- List of rooms user belongs to, each showing: room name, user's current balance in that room (color-coded), member count.
- "+ Create Room" and "Join Room" (via invite code) actions.

### 2.3 Room Dashboard (Home Screen) — **Most Important Screen**
Layout per spec §33:
```text
Room 304

Your Balance
+₹650
"You should receive ₹650"

Settlement (your suggested transactions)
  C → You  ₹350   [Remind / Settle]
  D → You  ₹300   [Remind / Settle]

Others (room-wide status, read-only summary)
  B → Receive ₹50
  C → Pay ₹350
  D → Pay ₹350

[+ Add Expense]  (prominent floating/primary action)
```
Key elements:
- Large, unmissable "Your Balance" number with color coding.
- Plain-language line under it ("You should receive ₹X" / "You owe ₹X" / "You're settled up").
- Your suggested settlements front and center, with quick actions.
- Room-wide balances visible but visually secondary.
- Primary CTA to add an expense always reachable.

### 2.4 Add Expense Screen (Quick Flow)
Per spec §34, minimum flow:
```text
+ Add Expense
  Amount: ₹___
  What? (description, free text, maybe category chip suggestions)
  Paid by: [member picker, default = current user]
  For: [Everyone (default) | Select members | Custom]
  [Add Expense]
```
- Default split = Equal, participants = Everyone (or room's default rule for the selected category).
- "Advanced" expandable section reveals: Custom Split / Percentage Split / Share-based Split, Multiple Payers, Category picker, Note, Date (defaults to now).
- Real-time validation feedback: if custom/percentage split doesn't sum correctly, show inline error before allowing submit (mirrors doc 03 §9, doc 04 §5 validation).

### 2.5 Split Type Selector (component, used inside Add/Edit Expense)
- Segmented control or tabs: **Equal | Custom Amount | Percentage | Shares**
- Each mode shows a per-participant input row with a live-updating "remaining to allocate" indicator (e.g. "₹50 left to assign" / "12% left" / helps user hit the exact total).

### 2.6 Multi-Payer Input (component)
- "Split payment across multiple people?" toggle.
- When on: list of (payer, amount, payment method) rows, with a running total vs. expense amount, and an inline error if they don't match.

### 2.7 Expense History Screen
Per spec §35, list view:
```text
🛒 Grocery
₹400
Paid by B
4 participants
Today, 8:30 PM
```
- Filters: by category, by date range, by status (active/voided).
- Tap → Expense Detail screen.

### 2.8 Expense Detail Screen
Full breakdown:
```text
Grocery — ₹400
Paid by B

Ahad's share  ₹100
B's share     ₹100
C's share     ₹100
D's share     ₹100

[Edit] [Void]
```
- If multiple payers: show each payer + amount + method.
- Edit/Void actions visible to the person who created it and to admins.
- Edit/Void trigger the audit-trail-aware flows (with reason prompt, and warning modal if already-settled per doc 03 §8).

### 2.9 Settlement Screen
- Shows suggested settlements (from `GET /rooms/:roomId/balances`).
- "Pay ₹350" button → opens UPI intent (deep link) if applicable; always followed by an explicit **"Mark as Paid"** confirmation step (never auto-confirm).
- "Record a payment" manual entry option: pick from-user, to-user, amount, method, note.
- Partial payment supported — if user enters less than the suggested amount, accept it and show updated "remaining owed" after.

### 2.10 Room Settings Screen (Admin)
- Room name edit.
- Member list with roles; invite/remove actions.
- Default category rules editor (per spec §14): category → default participant scope (Everyone / Selected Members / Individual).
- Category management (preset list + add custom).
- "Close Month" action (per spec §31) — shows current outstanding balances before confirming.
- Export data (later version — show as disabled/"coming soon" if included in UI at all, not required for MVP UI).

### 2.11 Monthly Summary Screen
Per spec §30:
```text
September 2026
Total expenses: ₹18,450
People: 4
Categories: Grocery, Milk, Gas, Vegetables, Meat, Other (breakdown chart/list)
Current balances: Ahad +₹650, B +₹50, C −₹350, D −₹350
```

### 2.12 Audit Trail / Activity Log Screen
Simple reverse-chronological feed:
```text
B added ₹400 Grocery — Today, 8:30 PM
Ahad edited "Gas" ₹500 → ₹700 (Bill correction) — Yesterday
C settled ₹200 to Ahad — 2 days ago
```

### 2.13 Member Leaving Flow (modal/screen)
- Shows member's current outstanding balance.
- Requires settling (or explicit admin override) before marking as "Left".
- Confirmation step, matches doc 04 §3 `409 MEMBER_HAS_OUTSTANDING_BALANCE` flow.

---

## 3. Core Component Inventory (for reference image / design system planning)

| Component | Used In |
|---|---|
| `BalanceSummaryCard` | Room Dashboard — the big "+₹650" display |
| `MemberBalanceRow` | Dashboard "Others" list, Settlement screen |
| `SettlementSuggestionCard` | Dashboard, Settlement screen |
| `ExpenseCard` | Expense History list |
| `ExpenseForm` | Add/Edit Expense |
| `SplitTypeSelector` | Add/Edit Expense |
| `ParticipantPicker` | Add/Edit Expense |
| `MultiPayerInput` | Add/Edit Expense |
| `CurrencyInput` | Any amount entry field — must handle rupees input but store/emit paise |
| `Avatar` | Member lists everywhere |
| `CategoryChip` | Add Expense, filters |
| `AuditLogEntry` | Activity log |
| `Modal` / `ConfirmDialog` | Void expense warning, member removal warning, settlement confirmation |

---

## 4. Key UX States to Design For (don't skip these when preparing reference images)

- **Empty states:** No rooms yet / No expenses yet / Room fully settled (everyone at ₹0 — should feel like a positive "all clear" state, not empty/broken).
- **Validation error states:** Custom/percentage split not summing correctly (inline, before submit).
- **Warning/confirmation states:** Voiding an already-settled expense; removing a member with outstanding balance.
- **Partial settlement state:** Showing "₹150 still owed" after a partial payment.
- **Loading/skeleton states:** Balances screen while server computes (should feel instant, but design for a brief loading state).

---

## 5. What Reference Images Should Cover

Jab aap Antigravity ke liye UI reference images banayenge/collect karenge, in priority order cover karein:

1. Room Dashboard (home screen) — most important, sets the visual tone.
2. Add Expense (quick flow + advanced/split-type expanded state).
3. Expense History list + Expense Detail breakdown.
4. Settlement screen (with suggested transactions).
5. Room Settings (member list + default rules).

Yeh 5 screens app ka 80% user-facing surface area cover karte hain.

---

## 6. Related Documents

| File | Purpose |
|---|---|
| `00_PRODUCT_SPEC.md` | Why these screens/flows exist |
| `03_BUSINESS_LOGIC_AND_CALCULATION_ENGINE.md` | What the numbers on these screens mean |
| `04_API_SPECIFICATION.md` | Endpoints each screen calls |
