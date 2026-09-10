// ─────────────────────────────────────────────
// Calculation Engine Tests — All 16 cases from doc 03 §12
// ─────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  calculateEqualSplit,
  calculateCustomSplit,
  calculatePercentageSplit,
  calculateShareBasedSplit,
  calculateBalances,
  suggestSettlements,
  validateBalanceInvariant,
} from '../services/calculation.service';

// Helper: sum of all shares
function sumShares(shares: { shareAmountPaise: bigint }[]): bigint {
  return shares.reduce((sum, s) => sum + s.shareAmountPaise, 0n);
}

describe('Calculation Engine', () => {

  // ─────────────────────────────────────────────
  // Test 1: Equal split — evenly divisible
  // ─────────────────────────────────────────────
  it('1. Equal split with evenly divisible amount (₹1000 / 4)', () => {
    const shares = calculateEqualSplit(100000n, ['A', 'B', 'C', 'D']);
    
    expect(shares).toHaveLength(4);
    for (const s of shares) {
      expect(s.shareAmountPaise).toBe(25000n);
    }
    expect(sumShares(shares)).toBe(100000n);
  });

  // ─────────────────────────────────────────────
  // Test 2: Equal split with remainder (₹100 / 3)
  // ─────────────────────────────────────────────
  it('2. Equal split with remainder (₹100 / 3) — sum = original, no participant off by > 1 paise', () => {
    const shares = calculateEqualSplit(10000n, ['A', 'B', 'C']);
    
    expect(shares).toHaveLength(3);
    expect(sumShares(shares)).toBe(10000n);
    
    // No participant should be off by more than 1 paise from others
    const amounts = shares.map(s => s.shareAmountPaise);
    const min = amounts.reduce((a, b) => a < b ? a : b);
    const max = amounts.reduce((a, b) => a > b ? a : b);
    expect(max - min).toBeLessThanOrEqual(1n);
    
    // Specifically: 10000 / 3 = 3333 remainder 1
    // First participant (by userId sort) gets extra paise
    // Sorted: A, B, C → A gets 3334, B gets 3333, C gets 3333
    const aShare = shares.find(s => s.userId === 'A')!;
    expect(aShare.shareAmountPaise).toBe(3334n);
    
    const bShare = shares.find(s => s.userId === 'B')!;
    expect(bShare.shareAmountPaise).toBe(3333n);
    
    const cShare = shares.find(s => s.userId === 'C')!;
    expect(cShare.shareAmountPaise).toBe(3333n);
  });

  // ─────────────────────────────────────────────
  // Test 3: Custom split that sums correctly → accepted
  // ─────────────────────────────────────────────
  it('3. Custom split that sums correctly → accepted', () => {
    const shares = calculateCustomSplit(100000n, [
      { userId: 'A', customAmountPaise: 50000n },
      { userId: 'B', customAmountPaise: 30000n },
      { userId: 'C', customAmountPaise: 20000n },
    ]);
    
    expect(shares).toHaveLength(3);
    expect(sumShares(shares)).toBe(100000n);
    expect(shares.find(s => s.userId === 'A')!.shareAmountPaise).toBe(50000n);
    expect(shares.find(s => s.userId === 'B')!.shareAmountPaise).toBe(30000n);
    expect(shares.find(s => s.userId === 'C')!.shareAmountPaise).toBe(20000n);
  });

  // ─────────────────────────────────────────────
  // Test 4: Custom split that doesn't sum correctly → rejected
  // ─────────────────────────────────────────────
  it('4. Custom split that doesn\'t sum correctly → rejected with clear error', () => {
    expect(() => calculateCustomSplit(100000n, [
      { userId: 'A', customAmountPaise: 50000n },
      { userId: 'B', customAmountPaise: 30000n },
      { userId: 'C', customAmountPaise: 15000n }, // sum = 95000, not 100000
    ])).toThrow('Sum of custom split amounts (95000) does not match expense amount (100000)');
  });

  // ─────────────────────────────────────────────
  // Test 5: Percentage split with fractional paise remainders
  // ─────────────────────────────────────────────
  it('5. Percentage split with fractional paise remainders → verify distribution and sum', () => {
    // ₹1000, 33.33% / 33.33% / 33.34%
    const shares = calculatePercentageSplit(100000n, [
      { userId: 'A', percentage: 33.33 },
      { userId: 'B', percentage: 33.33 },
      { userId: 'C', percentage: 33.34 },
    ]);
    
    expect(shares).toHaveLength(3);
    expect(sumShares(shares)).toBe(100000n);
  });

  it('5b. Percentage split — clean percentages (40/30/20/10)', () => {
    const shares = calculatePercentageSplit(100000n, [
      { userId: 'A', percentage: 40 },
      { userId: 'B', percentage: 30 },
      { userId: 'C', percentage: 20 },
      { userId: 'D', percentage: 10 },
    ]);
    
    expect(sumShares(shares)).toBe(100000n);
    expect(shares.find(s => s.userId === 'A')!.shareAmountPaise).toBe(40000n);
    expect(shares.find(s => s.userId === 'B')!.shareAmountPaise).toBe(30000n);
    expect(shares.find(s => s.userId === 'C')!.shareAmountPaise).toBe(20000n);
    expect(shares.find(s => s.userId === 'D')!.shareAmountPaise).toBe(10000n);
  });

  // ─────────────────────────────────────────────
  // Test 6: Share-based split (2:1:1)
  // ─────────────────────────────────────────────
  it('6. Share-based split (2:1:1) → verify proportional amounts and sum', () => {
    // ₹1000, A=2 shares, B=1, C=1 (total=4)
    const shares = calculateShareBasedSplit(100000n, [
      { userId: 'A', shareUnits: 2 },
      { userId: 'B', shareUnits: 1 },
      { userId: 'C', shareUnits: 1 },
    ]);
    
    expect(shares).toHaveLength(3);
    expect(sumShares(shares)).toBe(100000n);
    expect(shares.find(s => s.userId === 'A')!.shareAmountPaise).toBe(50000n);
    expect(shares.find(s => s.userId === 'B')!.shareAmountPaise).toBe(25000n);
    expect(shares.find(s => s.userId === 'C')!.shareAmountPaise).toBe(25000n);
  });

  it('6b. Share-based split with remainder (₹100, 2:1:1:1 = 5 units)', () => {
    // 10000 / 5 = 2000 each base
    // A=2: 4000, B=1: 2000, C=1: 2000, D=1: 2000 → sum = 10000, no remainder
    const shares = calculateShareBasedSplit(10000n, [
      { userId: 'A', shareUnits: 2 },
      { userId: 'B', shareUnits: 1 },
      { userId: 'C', shareUnits: 1 },
      { userId: 'D', shareUnits: 1 },
    ]);
    expect(sumShares(shares)).toBe(10000n);
    
    // ₹100.01 (10001 paise), shares 2:1:1:1 → remainder handling
    const shares2 = calculateShareBasedSplit(10001n, [
      { userId: 'A', shareUnits: 2 },
      { userId: 'B', shareUnits: 1 },
      { userId: 'C', shareUnits: 1 },
      { userId: 'D', shareUnits: 1 },
    ]);
    expect(sumShares(shares2)).toBe(10001n);
  });

  // ─────────────────────────────────────────────
  // Test 7: Multiple payers — independent P_i contributions
  // ─────────────────────────────────────────────
  it('7. Multiple payers on one expense → each payer\'s P_i is independent of split', () => {
    // Ahad paid ₹600, B paid ₹400 → total ₹1000
    // All 4 participate equally → each share = ₹250
    const payments = [
      { payerId: 'Ahad', amountPaise: 60000n },
      { payerId: 'B', amountPaise: 40000n },
    ];
    const participantShares = [
      { userId: 'Ahad', shareAmountPaise: 25000n },
      { userId: 'B', shareAmountPaise: 25000n },
      { userId: 'C', shareAmountPaise: 25000n },
      { userId: 'D', shareAmountPaise: 25000n },
    ];
    
    const balances = calculateBalances(
      ['Ahad', 'B', 'C', 'D'],
      payments,
      participantShares,
      []
    );
    
    const ahadBal = balances.find(b => b.userId === 'Ahad')!;
    const bBal = balances.find(b => b.userId === 'B')!;
    
    // Ahad: paid 60000 - share 25000 = +35000
    expect(ahadBal.outstandingPaise).toBe(35000n);
    // B: paid 40000 - share 25000 = +15000
    expect(bBal.outstandingPaise).toBe(15000n);
    
    expect(validateBalanceInvariant(balances)).toBe(true);
  });

  // ─────────────────────────────────────────────
  // Test 8: Payer who is not a participant
  // ─────────────────────────────────────────────
  it('8. Payer who is not a participant → share = 0, net = fully positive', () => {
    // B pays ₹500, only Ahad and C are participants
    const payments = [{ payerId: 'B', amountPaise: 50000n }];
    const participantShares = [
      { userId: 'Ahad', shareAmountPaise: 25000n },
      { userId: 'C', shareAmountPaise: 25000n },
    ];
    
    const balances = calculateBalances(
      ['Ahad', 'B', 'C'],
      payments,
      participantShares,
      []
    );
    
    const bBal = balances.find(b => b.userId === 'B')!;
    expect(bBal.totalPaidPaise).toBe(50000n);
    expect(bBal.totalSharePaise).toBe(0n);
    expect(bBal.outstandingPaise).toBe(50000n); // fully positive (creditor)
    
    expect(validateBalanceInvariant(balances)).toBe(true);
  });

  // ─────────────────────────────────────────────
  // Test 9: Personal expense (payer = sole participant)
  // ─────────────────────────────────────────────
  it('9. Personal expense → net = 0, zero effect on others', () => {
    const payments = [{ payerId: 'Ahad', amountPaise: 50000n }];
    const participantShares = [{ userId: 'Ahad', shareAmountPaise: 50000n }];
    
    const balances = calculateBalances(
      ['Ahad', 'B', 'C'],
      payments,
      participantShares,
      []
    );
    
    const ahadBal = balances.find(b => b.userId === 'Ahad')!;
    expect(ahadBal.outstandingPaise).toBe(0n); // paid 50000, share 50000 → net 0
    
    const bBal = balances.find(b => b.userId === 'B')!;
    expect(bBal.outstandingPaise).toBe(0n); // not involved
    
    const cBal = balances.find(b => b.userId === 'C')!;
    expect(cBal.outstandingPaise).toBe(0n); // not involved
    
    expect(validateBalanceInvariant(balances)).toBe(true);
  });

  // ─────────────────────────────────────────────
  // Test 10: Full worked example from doc 00
  // Ahad paid ₹1000, B paid ₹400, 4 participants equal split
  // Expected: Ahad +650, B +50, C -350, D -350
  // ─────────────────────────────────────────────
  it('10. Full worked example — Ahad ₹1000 + B ₹400, 4 equal → Ahad +650, B +50, C -350, D -350', () => {
    // Expense 1: Ahad pays ₹1000, all 4 participate equally (₹250 each)
    // Expense 2: B pays ₹400, all 4 participate equally (₹100 each)
    const payments = [
      { payerId: 'Ahad', amountPaise: 100000n }, // ₹1000
      { payerId: 'B', amountPaise: 40000n },      // ₹400
    ];
    const participantShares = [
      // Expense 1: ₹1000 / 4 = ₹250 each
      { userId: 'Ahad', shareAmountPaise: 25000n },
      { userId: 'B', shareAmountPaise: 25000n },
      { userId: 'C', shareAmountPaise: 25000n },
      { userId: 'D', shareAmountPaise: 25000n },
      // Expense 2: ₹400 / 4 = ₹100 each
      { userId: 'Ahad', shareAmountPaise: 10000n },
      { userId: 'B', shareAmountPaise: 10000n },
      { userId: 'C', shareAmountPaise: 10000n },
      { userId: 'D', shareAmountPaise: 10000n },
    ];
    
    const balances = calculateBalances(
      ['Ahad', 'B', 'C', 'D'],
      payments,
      participantShares,
      []
    );
    
    // Ahad: paid 100000 - share (25000+10000=35000) = +65000
    expect(balances.find(b => b.userId === 'Ahad')!.outstandingPaise).toBe(65000n);
    // B: paid 40000 - share (25000+10000=35000) = +5000
    expect(balances.find(b => b.userId === 'B')!.outstandingPaise).toBe(5000n);
    // C: paid 0 - share (25000+10000=35000) = -35000
    expect(balances.find(b => b.userId === 'C')!.outstandingPaise).toBe(-35000n);
    // D: paid 0 - share (25000+10000=35000) = -35000
    expect(balances.find(b => b.userId === 'D')!.outstandingPaise).toBe(-35000n);
    
    expect(validateBalanceInvariant(balances)).toBe(true);
  });

  // ─────────────────────────────────────────────
  // Test 11: Settlement suggestion on the above
  // Expected: C→Ahad 350, D→Ahad 300, D→B 50
  // ─────────────────────────────────────────────
  it('11. Settlement suggestion → C→Ahad 350, D→Ahad 300, D→B 50', () => {
    const balances = [
      { userId: 'Ahad', totalPaidPaise: 100000n, totalSharePaise: 35000n, settlementsPaidPaise: 0n, settlementsReceivedPaise: 0n, outstandingPaise: 65000n },
      { userId: 'B', totalPaidPaise: 40000n, totalSharePaise: 35000n, settlementsPaidPaise: 0n, settlementsReceivedPaise: 0n, outstandingPaise: 5000n },
      { userId: 'C', totalPaidPaise: 0n, totalSharePaise: 35000n, settlementsPaidPaise: 0n, settlementsReceivedPaise: 0n, outstandingPaise: -35000n },
      { userId: 'D', totalPaidPaise: 0n, totalSharePaise: 35000n, settlementsPaidPaise: 0n, settlementsReceivedPaise: 0n, outstandingPaise: -35000n },
    ];
    
    const suggestions = suggestSettlements(balances);
    
    expect(suggestions).toHaveLength(3);
    
    // C → Ahad ₹350
    expect(suggestions[0]).toEqual({
      fromUserId: 'C',
      toUserId: 'Ahad',
      amountPaise: 35000n,
    });
    
    // D → Ahad ₹300
    expect(suggestions[1]).toEqual({
      fromUserId: 'D',
      toUserId: 'Ahad',
      amountPaise: 30000n,
    });
    
    // D → B ₹50
    expect(suggestions[2]).toEqual({
      fromUserId: 'D',
      toUserId: 'B',
      amountPaise: 5000n,
    });
  });

  // ─────────────────────────────────────────────
  // Test 12: Partial settlement
  // ─────────────────────────────────────────────
  it('12. Partial settlement → remaining balance correctly reduced, not zeroed', () => {
    // Start from test 10 state: Ahad +650, B +50, C -350, D -350
    // C pays Ahad ₹200 (partial of the ₹350 owed)
    const payments = [
      { payerId: 'Ahad', amountPaise: 100000n },
      { payerId: 'B', amountPaise: 40000n },
    ];
    const participantShares = [
      { userId: 'Ahad', shareAmountPaise: 25000n },
      { userId: 'B', shareAmountPaise: 25000n },
      { userId: 'C', shareAmountPaise: 25000n },
      { userId: 'D', shareAmountPaise: 25000n },
      { userId: 'Ahad', shareAmountPaise: 10000n },
      { userId: 'B', shareAmountPaise: 10000n },
      { userId: 'C', shareAmountPaise: 10000n },
      { userId: 'D', shareAmountPaise: 10000n },
    ];
    
    const settlements = [
      { fromUserId: 'C', toUserId: 'Ahad', amountPaise: 20000n }, // C pays Ahad ₹200
    ];
    
    const balances = calculateBalances(
      ['Ahad', 'B', 'C', 'D'],
      payments,
      participantShares,
      settlements
    );
    
    // Ahad: (100000-35000) + 0 - 20000 = 45000 (was 65000, reduced by 20000 received)
    expect(balances.find(b => b.userId === 'Ahad')!.outstandingPaise).toBe(45000n);
    // C: (0-35000) + 20000 - 0 = -15000 (was -35000, reduced by 20000 paid)
    expect(balances.find(b => b.userId === 'C')!.outstandingPaise).toBe(-15000n);
    // B and D unchanged
    expect(balances.find(b => b.userId === 'B')!.outstandingPaise).toBe(5000n);
    expect(balances.find(b => b.userId === 'D')!.outstandingPaise).toBe(-35000n);
    
    expect(validateBalanceInvariant(balances)).toBe(true);
  });

  // ─────────────────────────────────────────────
  // Test 13: Expense edit → balances recompute correctly
  // ─────────────────────────────────────────────
  it('13. Expense edit → balances recompute with updated data', () => {
    // Original: Ahad pays ₹1000, 4 equal (₹250 each)
    // Edited: Ahad pays ₹1200, 4 equal (₹300 each)
    // Since balances are always derived, just pass the NEW data
    const payments = [{ payerId: 'Ahad', amountPaise: 120000n }];
    const participantShares = [
      { userId: 'Ahad', shareAmountPaise: 30000n },
      { userId: 'B', shareAmountPaise: 30000n },
      { userId: 'C', shareAmountPaise: 30000n },
      { userId: 'D', shareAmountPaise: 30000n },
    ];
    
    const balances = calculateBalances(
      ['Ahad', 'B', 'C', 'D'],
      payments,
      participantShares,
      []
    );
    
    // Ahad: 120000 - 30000 = +90000
    expect(balances.find(b => b.userId === 'Ahad')!.outstandingPaise).toBe(90000n);
    // B: 0 - 30000 = -30000
    expect(balances.find(b => b.userId === 'B')!.outstandingPaise).toBe(-30000n);
    
    expect(validateBalanceInvariant(balances)).toBe(true);
  });

  // ─────────────────────────────────────────────
  // Test 14: Expense void → excluded from balance calc
  // ─────────────────────────────────────────────
  it('14. Expense void → voided expense excluded from balances', () => {
    // Two expenses: Exp1 (active), Exp2 (voided, so not included)
    // Only Exp1 data is passed to calculateBalances (voided expenses are excluded at query level)
    const payments = [{ payerId: 'Ahad', amountPaise: 100000n }]; // only active expense
    const participantShares = [
      { userId: 'Ahad', shareAmountPaise: 25000n },
      { userId: 'B', shareAmountPaise: 25000n },
      { userId: 'C', shareAmountPaise: 25000n },
      { userId: 'D', shareAmountPaise: 25000n },
    ];
    
    const balances = calculateBalances(
      ['Ahad', 'B', 'C', 'D'],
      payments,
      participantShares,
      []
    );
    
    // Only Exp1 matters — voided Exp2 is simply not in the input
    expect(balances.find(b => b.userId === 'Ahad')!.outstandingPaise).toBe(75000n);
    expect(validateBalanceInvariant(balances)).toBe(true);
  });

  // ─────────────────────────────────────────────
  // Test 15: New member mid-history → zero share in old expenses
  // ─────────────────────────────────────────────
  it('15. New member mid-history → zero share in pre-join expenses', () => {
    // Exp1 (before E joined): Ahad pays ₹800, 4 participants (A,B,C,D), ₹200 each
    // Exp2 (after E joined): B pays ₹500, 5 participants (A,B,C,D,E), ₹100 each
    // E was NOT a participant in Exp1 — enforced by never writing an ExpenseParticipant row for E in Exp1
    const payments = [
      { payerId: 'Ahad', amountPaise: 80000n },
      { payerId: 'B', amountPaise: 50000n },
    ];
    const participantShares = [
      // Exp1: 4 people
      { userId: 'Ahad', shareAmountPaise: 20000n },
      { userId: 'B', shareAmountPaise: 20000n },
      { userId: 'C', shareAmountPaise: 20000n },
      { userId: 'D', shareAmountPaise: 20000n },
      // Exp2: 5 people
      { userId: 'Ahad', shareAmountPaise: 10000n },
      { userId: 'B', shareAmountPaise: 10000n },
      { userId: 'C', shareAmountPaise: 10000n },
      { userId: 'D', shareAmountPaise: 10000n },
      { userId: 'E', shareAmountPaise: 10000n },
    ];
    
    const balances = calculateBalances(
      ['Ahad', 'B', 'C', 'D', 'E'],
      payments,
      participantShares,
      []
    );
    
    // E only has share from Exp2 (10000), no payment → E outstanding = 0 - 10000 = -10000
    const eBal = balances.find(b => b.userId === 'E')!;
    expect(eBal.totalSharePaise).toBe(10000n);
    expect(eBal.totalPaidPaise).toBe(0n);
    expect(eBal.outstandingPaise).toBe(-10000n);
    
    expect(validateBalanceInvariant(balances)).toBe(true);
  });

  // ─────────────────────────────────────────────
  // Test 16: Invariant fuzz test — random expenses/settlements
  // ─────────────────────────────────────────────
  it('16. Invariant fuzz test — sum(Outstanding_i) = 0 for random data', () => {
    const members = ['U1', 'U2', 'U3', 'U4', 'U5'];
    
    // Run 100 random scenarios
    for (let trial = 0; trial < 100; trial++) {
      const allPayments: { payerId: string; amountPaise: bigint }[] = [];
      const allShares: { userId: string; shareAmountPaise: bigint }[] = [];
      const allSettlements: { fromUserId: string; toUserId: string; amountPaise: bigint }[] = [];
      
      // Generate 1-5 random expenses
      const numExpenses = Math.floor(Math.random() * 5) + 1;
      for (let e = 0; e < numExpenses; e++) {
        const totalPaise = BigInt(Math.floor(Math.random() * 100000) + 100); // 1-1000 rupees
        
        // Pick 1-3 random payers
        const numPayers = Math.floor(Math.random() * 3) + 1;
        const payers: string[] = [];
        for (let p = 0; p < numPayers; p++) {
          payers.push(members[Math.floor(Math.random() * members.length)]);
        }
        
        // Distribute payment among payers
        let remainingPayment = totalPaise;
        for (let p = 0; p < payers.length; p++) {
          const paymentAmount = p === payers.length - 1
            ? remainingPayment
            : BigInt(Math.floor(Math.random() * Number(remainingPayment - BigInt(payers.length - p - 1)))) + 1n;
          allPayments.push({ payerId: payers[p], amountPaise: paymentAmount });
          remainingPayment -= paymentAmount;
        }
        
        // Pick 1-5 random participants
        const numParticipants = Math.floor(Math.random() * members.length) + 1;
        const participantSet = new Set<string>();
        while (participantSet.size < numParticipants) {
          participantSet.add(members[Math.floor(Math.random() * members.length)]);
        }
        const participantIds = Array.from(participantSet);
        
        // Equal split
        const shares = calculateEqualSplit(totalPaise, participantIds);
        for (const share of shares) {
          allShares.push(share);
        }
      }
      
      // Generate 0-3 random settlements
      const numSettlements = Math.floor(Math.random() * 4);
      for (let s = 0; s < numSettlements; s++) {
        const from = members[Math.floor(Math.random() * members.length)];
        let to = members[Math.floor(Math.random() * members.length)];
        while (to === from) {
          to = members[Math.floor(Math.random() * members.length)];
        }
        allSettlements.push({
          fromUserId: from,
          toUserId: to,
          amountPaise: BigInt(Math.floor(Math.random() * 50000) + 100),
        });
      }
      
      const balances = calculateBalances(members, allPayments, allShares, allSettlements);
      
      // THE INVARIANT: sum of all outstanding balances must be exactly 0
      expect(validateBalanceInvariant(balances)).toBe(true);
    }
  });
});
