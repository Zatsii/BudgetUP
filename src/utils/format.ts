// Display formatting for amounts. Pure, no React Native imports, tested with node --test.

/**
 * The one formatter for amounts on every screen: integer cents -> "1,234.50".
 * Plain number, no currency symbol or code. Built by hand rather than with Intl so it looks the
 * same on Hermes builds that ship without full locale data.
 *
 * TODO(currency): when currency support comes back, take an optional ISO code here (the
 * expenses.currency column is still stored) and add the symbol in this one place.
 */
export function formatAmount(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = String(abs % 100).padStart(2, '0');
  return `${sign}${whole}.${frac}`;
}
