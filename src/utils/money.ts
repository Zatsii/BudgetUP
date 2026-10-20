// All money is stored and computed as integer cents to avoid floating-point drift.
// Kept free of React Native imports so it can run under `node --test`.
// Display formatting lives in format.ts (formatAmount).

/** Parses user input like "12", "12.5", "1,234.56" into cents. Returns null if invalid or <= 0. */
export function parseAmountToCents(input: string): number | null {
  // Pasted amounts may carry a currency symbol; it's ignored.
  const cleaned = input.replace(/[\s,$€£¥₹]/g, '');
  if (!/^\d+(\.\d{0,2})?$|^\.\d{1,2}$/.test(cleaned)) return null;
  const [whole, frac = ''] = cleaned.split('.');
  const cents = Number(whole || '0') * 100 + Number(frac.padEnd(2, '0'));
  return cents > 0 && Number.isSafeInteger(cents) ? cents : null;
}

/** Like parseAmountToCents but allows zero; blank input counts as 0. Returns null if invalid. */
export function parseNonNegativeCents(input: string): number | null {
  if (/^\s*0*(\.0*)?\s*$/.test(input)) return 0;
  return parseAmountToCents(input);
}

/** Formats cents for an input field: 1250 -> "12.50". */
export function centsToInputString(cents: number): string {
  return (cents / 100).toFixed(2);
}
