# Product Specification — Shared Hostel Expense Manager

> **Document purpose:** Yeh document product ka "why" aur "what" define karta hai. Development shuru karne se pehle poori team (aur AI coding agent) ko yeh 100% clear hona chahiye. Business logic ke details ke liye `03_BUSINESS_LOGIC_AND_CALCULATION_ENGINE.md` dekhein — yahan sirf product-level requirements hain.

---

## 1. Problem Statement

Hostel/PG/shared room mein 3–10 log rehte hain aur shared expenses (ration, grocery, gas, milk, vegetables, cleaning supplies) collectively use karte hain, lekin har baar alag-alag person payment karta hai.

Manually track karna padta hai:
- Kisne kitna pay kiya
- Kis bande ka actual share kitna hai
- Kisne apne share se zyada/kam pay kiya
- Purana balance naye payment se kaise adjust hoga
- Partial payment ka remaining kitna hai
- Kisi expense mein jo involved nahi tha uska share na ho
- Month-end settlement kaise ho
- Expense edit/delete hone par purane calculations ka kya ho

WhatsApp/calculator/memory se yeh calculation mistakes, double counting, aur roommates ke beech arguments create karta hai.

**Core problem:** Shared expenses ko continuously track karna aur har waqt accurately batana ki kaun kitna dega ya receive karega.

---

## 2. Product Objective

> Roommates ke shared expenses ka ek central ledger maintain karna aur automatically calculate karna ki har person ne apne fair share ke comparison mein kitna zyada ya kam pay kiya hai.

User ko kabhi manually debt calculate nahi karna padega. App har waqt current status dikhayega — kaun kitna receive karega, kaun kitna pay karega.

## 3. One-Line Product Definition

> A roommate expense-management app where users record who actually paid for a shared expense and who consumed it, while the system continuously calculates each person's net balance and generates the minimum practical settlement transactions.

---

## 4. Golden Principle (Non-Negotiable)

**"Kisne kisko kitna dena hai" yeh directly kabhi store nahi hoga.**

App sirf financial *events* store karta hai:
1. Expenses (kisne actual payment kiya, har participant ka share kya tha)
2. Settlements (kisne kisko repayment ki)

"Who owes whom" hamesha ek **calculated/derived result** hai, in events se compute hota hai — kabhi manually maintain nahi hota.

Yeh app ki reliability ka foundation hai, chahe room mein 3 log hon ya 10, chahe expenses ki hundreds of entries ho jayein.

Master formula: `Net Balance = Total Paid − Total Share` — full detail `03_BUSINESS_LOGIC_AND_CALCULATION_ENGINE.md` mein hai.

---

## 5. Target Users

- Hostel/PG/shared-room roommates (typically 3–10 people per room)
- Primary persona: college students ya working professionals sharing accommodation
- Users expect: mobile-friendly, fast expense entry, zero manual calculation, Hindi/English mixed comfort (Hinglish-friendly UI copy is acceptable)

---

## 6. Core Entities (Product-Level Overview)

Detailed schema `02_DATABASE_SCHEMA.md` mein hai. Product-level concepts:

- **User** — ek individual account
- **Room** — shared living unit jahan expenses track hote hain (e.g. "Room 304")
- **Room Member** — user ka room ke saath association (admin/member, active/inactive)
- **Expense** — ek shared kharch ka record (amount, payer(s), participants, split method)
- **Settlement** — do logon ke beech direct debt repayment
- **Audit Log** — important actions ka immutable trail

---

## 7. Key Product Rules — Anti-Conflict Features

App ka purpose sirf calculation nahi, balki **roommates ke beech confusion prevent karna** bhi hai. Yeh rules kabhi violate nahi honi chahiye:

1. Never silently change historical data — har edit audit-logged hoga.
2. Never double-count a person's own share.
3. Never assume UPI/payment succeeded automatically — explicit confirmation chahiye.
4. Never automatically add a new member to old expenses — naya member sirf future expenses mein participant banega.
5. Never allow split totals to differ from expense total — validation enforce karega.
6. Never delete financial history without controlled reversal/audit — soft-delete/void pattern use hoga.

---

## 8. Split Types (Product Requirement)

App equal-split tak limited nahi hoga. Support karna hai:

| Split Type | Description |
|---|---|
| **Equal Split** | Amount sabhi participants mein barabar divide hota hai |
| **Custom Amount** | Har participant ka exact amount manually enter hota hai; sum = total expense |
| **Percentage Split** | Har participant ka % define hota hai; sum = 100% |
| **Share-Based Split** | Har participant ko "shares" milte hain (e.g. 2:1:1); proportionally divide hota hai |

**Item-level split** (ek bill ke andar different items ke liye different participants) — MVP ke baad ki feature hai, lekin data model isko future-proof rakhega.

---

## 9. Participant vs Payer — Critical Distinction

"Paid by" aur "For whom (participants)" alag concepts hain:
- Ek person expense pay kar sakta hai bina uska participant hue (e.g. B ne Ahad aur C ke liye pay kiya, khud B use nahi karega).
- Personal expenses possible hain jahan paid-by = participant = same person, aur room ke baaki members par zero effect ho.
- Ek expense mein **multiple payers** bhi ho sakte hain (e.g. cash + UPI split, ya do logon ne milkar bill diya) — yeh MVP mein required hai.

---

## 10. Default Room Rules

Room creation ke time admin default participant-rules set kar sakta hai (e.g. "Grocery → everyone", "Personal items → individual"), lekin **har individual expense par yeh default override kiya ja sakta hai.**

---

## 11. Settlement System

- App net balances se **minimum number of transactions** suggest karega (greedy debtor-creditor matching algorithm — detail `03_BUSINESS_LOGIC_AND_CALCULATION_ENGINE.md` mein).
- Settlement aur Expense do alag types ke financial events hain — inko delete/edit karna alag treat hota hai.
- **Partial settlement** support hona chahiye (e.g. C ne ₹350 mein se sirf ₹200 diya, remaining ₹150 outstanding rahega).
- UPI button sirf payment intent open karega — success automatically assume nahi hoga; user ko "Mark as Paid" confirm karna hoga.

---

## 12. Member Lifecycle Rules

- **Member leaving:** Direct delete nahi hoga. Pehle outstanding balance settle karna hoga (ya explicitly written off), phir member "Left"/"Inactive" mark hoga. History preserve rahegi.
- **New member joining:** Purane expenses mein automatically participant nahi banega — sirf join-date ke baad ke expenses mein.
- **Room roles:** Admin (invite/remove members, room settings, close month, export data) aur Member (add expense, view balances, add settlement, view history).

---

## 13. Monthly Closing

Month-end par app current outstanding balances show karega, users settle kar sakte hain, phir month "Closed" mark hota hai — lekin history hamesha accessible rahegi. Next month ka tracking separately start hota hai (balances carry-forward nahi hote automatically; yeh explicit decision hai — agar kisi ka balance close hone tak unsettled reh gaya, wo agle month bhi dikhega jab tak settle na ho).

---

## 14. MVP Scope (Version 1)

### Must Have (V1)
- Create room / Join room (invite link or code)
- Add/remove members
- Add expense — equal split, custom split, share-based split
- Multiple payers per expense
- Real-time current balances (per person, per room)
- Expense history with full breakdown
- Settlement recording (manual + suggested)
- Partial settlement
- Automatic balance calculation (server-side, always derived)
- Edit/void expense (with audit trail)
- Basic audit history log
- Rounding handling (paise-accurate, no leftover)
- Monthly summary view

### Explicitly Out of Scope for V1 (Later Versions)
- Item-level grocery splitting (line-item bill splitting)
- Receipt scanning / OCR
- Real UPI payment integration (deep-link intent only in V1, no payment gateway)
- Push notifications
- Recurring expenses
- Analytics/insights dashboards
- Advanced custom categories beyond the preset list
- Data export (CSV/PDF)
- Offline mode
- Multi-currency support

> **Note for Antigravity / dev team:** Data model should be designed so these later features don't require breaking schema changes (see `02_DATABASE_SCHEMA.md` notes), but they should NOT be built in V1.

---

## 15. Core Success Criteria

App successful tab maana jayega jab:

- User ko calculator ki zarurat na pade.
- Kisi ko manually purane dues adjust na karne pade.
- Koi expense double-count na ho.
- Kisi ka own share galti se debt na ban jaye.
- Partial payments accurately reflect hon.
- Different expenses automatically offset hon.
- Total receivables = total payables (hamesha).

**Non-negotiable invariant:** `Sum of all Net Balances in a room = 0`, har valid state mein. Agar kabhi non-zero ho, yeh ek system bug hai, aur silently user ko wrong data show nahi karna — error log karke gracefully handle karna hai.

---

## 16. Related Documents

| File | Purpose |
|---|---|
| `01_TECH_STACK_AND_ARCHITECTURE.md` | Tech stack, project structure, architecture decisions |
| `02_DATABASE_SCHEMA.md` | Complete database schema with tables, constraints, indexes |
| `03_BUSINESS_LOGIC_AND_CALCULATION_ENGINE.md` | Balance formula, split algorithms, settlement algorithm, rounding rules, edge cases |
| `04_API_SPECIFICATION.md` | REST API endpoints, request/response contracts |
| `05_UI_UX_REQUIREMENTS.md` | Screens, user flows, component inventory |
