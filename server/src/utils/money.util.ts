// ─────────────────────────────────────────────
// Money utility functions — paise-based integer math
// CRITICAL: All money calculations use BigInt paise, never floats
// ─────────────────────────────────────────────

/**
 * Convert rupees (number) to paise (bigint).
 * e.g. 100.50 → 10050n
 */
export function rupeesToPaise(rupees: number): bigint {
  return BigInt(Math.round(rupees * 100));
}

/**
 * Convert paise (bigint) to rupees display string.
 * e.g. 10050n → "100.50"
 * This is for DISPLAY ONLY — never use the result for further math.
 */
export function paiseToRupees(paise: bigint): string {
  const isNegative = paise < 0n;
  const absPaise = isNegative ? -paise : paise;
  const rupees = absPaise / 100n;
  const remainingPaise = absPaise % 100n;
  const sign = isNegative ? '-' : '';
  return `${sign}${rupees}.${remainingPaise.toString().padStart(2, '0')}`;
}

/**
 * Convert paise (bigint) to rupees display string with ₹ symbol.
 * e.g. 10050n → "₹100.50"
 */
export function formatPaiseAsRupees(paise: bigint): string {
  return `₹${paiseToRupees(paise)}`;
}

/**
 * Distribute remainder paise deterministically.
 * 
 * Given raw shares that sum to less than the total (due to floor division),
 * distribute the remaining paise one-at-a-time to participants.
 * 
 * For equal splits: extra paise go to first N participants (sorted by userId).
 * For percentage/share splits: uses largest-fractional-remainder method.
 * 
 * @param rawShares - Map of userId → floor'd share in paise
 * @param totalPaise - The exact total that shares must sum to
 * @param fractionalRemainders - Optional map of userId → fractional remainder for
 *                               largest-remainder distribution (percentage/share splits)
 * @returns Map of userId → final share in paise (guaranteed to sum to totalPaise)
 */
export function distributeRemainder(
  rawShares: Map<string, bigint>,
  totalPaise: bigint,
  fractionalRemainders?: Map<string, number>
): Map<string, bigint> {
  const result = new Map(rawShares);
  let currentSum = 0n;
  for (const share of result.values()) {
    currentSum += share;
  }

  let remainder = totalPaise - currentSum;
  if (remainder === 0n) return result;

  if (remainder < 0n) {
    throw new Error(
      `Rounding error: shares sum (${currentSum}) exceeds total (${totalPaise})`
    );
  }

  // Determine distribution order
  let sortedUserIds: string[];

  if (fractionalRemainders && fractionalRemainders.size > 0) {
    // Largest fractional remainder first, tie-broken by userId ascending
    sortedUserIds = Array.from(fractionalRemainders.keys()).sort((a, b) => {
      const remDiff = (fractionalRemainders.get(b) || 0) - (fractionalRemainders.get(a) || 0);
      if (remDiff !== 0) return remDiff;
      return a.localeCompare(b);
    });
  } else {
    // Simple userId ascending order (for equal splits)
    sortedUserIds = Array.from(result.keys()).sort((a, b) => a.localeCompare(b));
  }

  // Distribute 1 paisa each until remainder is 0
  let idx = 0;
  while (remainder > 0n) {
    const userId = sortedUserIds[idx % sortedUserIds.length];
    result.set(userId, (result.get(userId) || 0n) + 1n);
    remainder -= 1n;
    idx++;
  }

  return result;
}
