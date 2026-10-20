// Dates are stored as local calendar strings ("YYYY-MM-DD") and months as "YYYY-MM".
// Using local strings (not UTC timestamps) means an expense logged at 11pm stays on that day.

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayKey(): string {
  return toDateKey(new Date());
}

export function currentMonthKey(): string {
  return todayKey().slice(0, 7);
}

export function monthOf(dateKey: string): string {
  return dateKey.slice(0, 7);
}

/** Shifts "YYYY-MM" by `delta` months. */
export function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** First and last date keys of a month, for range queries. */
export function monthRange(monthKey: string): { start: string; end: string } {
  const [y, m] = monthKey.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return { start: `${monthKey}-01`, end: `${monthKey}-${pad(lastDay)}` };
}

/** Validates a real calendar date in "YYYY-MM-DD" form (rejects 2026-02-30). */
export function isValidDateKey(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

export function formatMonth(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/** Localized month name for 1–12, e.g. 10 -> "October". */
export function monthName(month: number): string {
  return new Date(2000, month - 1, 1).toLocaleDateString(undefined, { month: 'long' });
}

export function formatDay(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** "1 February 2018" in the phone's language, for confirming a date read off a receipt. */
export function formatLongDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

/** UTC ISO timestamp for `created_at` / `updated_at` / `deleted_at` columns. */
export function nowIso(): string {
  return new Date().toISOString();
}
