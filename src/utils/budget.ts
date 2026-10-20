export type BudgetStatus = 'good' | 'warning' | 'over';

export const WARNING_THRESHOLD = 0.7;

/** Yellow above 70% of the limit, red above 100%. */
export function budgetStatus(spentCents: number, limitCents: number): BudgetStatus {
  if (limitCents <= 0) return 'good';
  const ratio = spentCents / limitCents;
  if (ratio > 1) return 'over';
  if (ratio > WARNING_THRESHOLD) return 'warning';
  return 'good';
}

export type CategoryTotal = { category: string; totalCents: number };

export const UNCATEGORIZED = 'Uncategorized';

/** Sums amounts per category, largest first. */
export function totalsByCategory(
  expenses: { category: string | null; amountCents: number }[],
): CategoryTotal[] {
  const map = new Map<string, number>();
  for (const e of expenses) {
    const key = e.category?.trim() || UNCATEGORIZED;
    map.set(key, (map.get(key) ?? 0) + e.amountCents);
  }
  return [...map.entries()]
    .map(([category, totalCents]) => ({ category, totalCents }))
    .sort((a, b) => b.totalCents - a.totalCents || a.category.localeCompare(b.category));
}
