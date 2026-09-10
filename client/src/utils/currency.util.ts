/**
 * Currency display utilities — paise → ₹X.XX
 * DISPLAY ONLY — never does math
 */

export function formatPaise(paise: number): string {
  const isNegative = paise < 0;
  const absPaise = Math.abs(paise);
  const rupees = Math.floor(absPaise / 100);
  const remainingPaise = absPaise % 100;
  const sign = isNegative ? '-' : '';
  const formatted = rupees.toLocaleString('en-IN');
  if (remainingPaise === 0) return `${sign}₹${formatted}`;
  return `${sign}₹${formatted}.${remainingPaise.toString().padStart(2, '0')}`;
}

export function formatPaiseWithSign(paise: number): string {
  const sign = paise > 0 ? '+' : '';
  return `${sign}${formatPaise(paise)}`;
}

export function formatPaiseAmount(paise: number): string {
  const absPaise = Math.abs(paise);
  const rupees = Math.floor(absPaise / 100);
  return rupees.toLocaleString('en-IN');
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function paiseToRupees(paise: number): number {
  return paise / 100;
}
