// Automatic transaction import: the shared contract and pure logic. Every import path
// (iOS Shortcuts deep link, Android notification listener, a future Django endpoint) produces an
// ImportedTransaction and feeds the same pending inbox. No React Native imports: tested with node --test.

export type ImportSource = 'ios-shortcut' | 'deep-link' | 'android-notification' | 'server' | 'test';

/** The one payload shape every importer emits. */
export type ImportedTransaction = {
  /** Integer cents, always positive. */
  amount: number;
  merchant: string;
  /** When the transaction happened, as a UTC ISO-8601 timestamp. */
  date: string;
  source: ImportSource;
  /** Upstream id when the source has one (e.g. a server row id), for idempotent re-delivery. */
  externalId?: string | null;
};

export interface TransactionImporter {
  readonly source: ImportSource;
  /** Human-readable status, e.g. why it's unavailable on this platform. */
  readonly description: string;
  /** Whether this importer can run on the current platform/build. */
  isAvailable(): boolean;
  /**
   * Starts delivering transactions. Push-style importers (notification listener, server
   * websocket) call `onTransaction` as items arrive; returns an unsubscribe function.
   * The deep-link importer is driven by the /import route instead, see importFromParams().
   */
  start(onTransaction: (t: ImportedTransaction) => void): () => void;
}

export const UNKNOWN_MERCHANT = 'Unknown merchant';
const MAX_MERCHANT_LENGTH = 120;
/** Imports more than this far in the future or past are almost certainly a malformed date. */
const MAX_CLOCK_SKEW_MS = 2 * 24 * 60 * 60 * 1000;
const MAX_AGE_MS = 400 * 24 * 60 * 60 * 1000;

export type ImportParams = Record<string, string | string[] | undefined>;
export type ImportParseResult = { ok: true; transaction: ImportedTransaction } | { ok: false; error: string };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Parses amounts as sent by Shortcuts, bank notifications or a server: "12.50", "$12.50",
 * "CA$1,234.56", "12,50 €", "USD 12.50". Returns integer cents or null.
 */
export function parseImportAmount(raw: string | undefined): number | null {
  if (!raw) return null;
  let s = raw.trim();
  if (/^-|\(.*\)|−/.test(s)) return null; // refunds/credits aren't spending
  s = s.replace(/[^\d.,]/g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot && /,\d{1,2}$/.test(s)) {
    // Decimal comma: "1.234,56" or "12,50"
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    s = s.replace(/,/g, '');
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return cents > 0 && Number.isSafeInteger(cents) ? cents : null;
}

/** Accepts ISO-8601, "YYYY-MM-DD" (treated as local noon) or anything Date.parse understands. */
export function parseImportDate(raw: string | undefined, now: Date): string | null {
  if (!raw?.trim()) return now.toISOString();
  const s = raw.trim();
  let d: Date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, day] = s.split('-').map(Number);
    d = new Date(y, m - 1, day, 12);
    if (d.getMonth() !== m - 1) return null;
  } else {
    // Shortcuts may format dates as "Oct 19, 2026 at 3:45 PM".
    d = new Date(s.replace(/\s+at\s+/i, ' '));
  }
  if (Number.isNaN(d.getTime())) return null;
  const diff = d.getTime() - now.getTime();
  if (diff > MAX_CLOCK_SKEW_MS || -diff > MAX_AGE_MS) return null;
  return d.toISOString();
}

/**
 * Validates an incoming payload. Used for deep-link query params today and, in phase 2, for the
 * JSON body delivered by the authenticated Django endpoint, so both paths accept the same fields:
 * amount (required), merchant, date, id.
 */
export function parseImportPayload(params: ImportParams, source: ImportSource, now = new Date()): ImportParseResult {
  const amount = parseImportAmount(first(params.amount));
  if (amount === null) return { ok: false, error: 'The link didn’t include a valid amount.' };

  const date = parseImportDate(first(params.date), now);
  if (date === null) return { ok: false, error: 'The link’s date couldn’t be read.' };

  const merchant = (first(params.merchant) ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_MERCHANT_LENGTH);
  const externalId = first(params.id)?.trim().slice(0, 200) || null;
  return { ok: true, transaction: { amount, merchant: merchant || UNKNOWN_MERCHANT, date, source, externalId } };
}

/** "TIM HORTONS #1234" and "Tim Hortons" both become "tim hortons". */
export function normalizeMerchant(s: string): string {
  return s
    .toLowerCase()
    .replace(/#\s*\d+/g, ' ') // store numbers
    .replace(/\b\d{3,}\b/g, ' ') // terminal ids, card digits
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export type CategoryRule = { id: string; pattern: string; category: string };

/** The most specific (longest) rule whose pattern appears in the merchant name wins. */
export function matchCategoryRule(merchant: string, rules: CategoryRule[]): CategoryRule | null {
  const m = ` ${normalizeMerchant(merchant)} `;
  let best: CategoryRule | null = null;
  let bestLen = 0;
  for (const rule of rules) {
    const p = normalizeMerchant(rule.pattern);
    if (!p) continue;
    // Whole-word match: "shell" shouldn't match "shellfish shack".
    if (m.includes(` ${p} `) && p.length > bestLen) {
      best = rule;
      bestLen = p.length;
    }
  }
  return best;
}

export const DUPLICATE_WINDOW_MS = 15 * 60 * 1000;

export type PendingForDedup = { id: string; amountCents: number; merchant: string; occurredAt: string; createdAt: string };
export type ExpenseForDedup = { id: string; amountCents: number; description: string; spentOn: string };
export type DuplicateFlag =
  | { kind: 'pending'; otherId: string; minutesApart: number }
  | { kind: 'expense'; otherId: string; description: string };

function sameMerchant(a: string, b: string): boolean {
  const x = normalizeMerchant(a);
  const y = normalizeMerchant(b);
  if (!x || !y) return false;
  return x === y || ` ${x} `.includes(` ${y} `) || ` ${y} `.includes(` ${x} `);
}

const localDateKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Flags likely duplicates. A pending item is flagged if:
 *  - an earlier pending item has the same amount and merchant within `windowMs` (the later one is
 *    flagged, so approving the first and discarding the second is the obvious action), or
 *  - an existing expense on the same local day has the same amount and a matching description
 *    (it was probably entered by hand or approved already).
 */
export function findDuplicates(
  pending: PendingForDedup[],
  expenses: ExpenseForDedup[],
  windowMs = DUPLICATE_WINDOW_MS,
): Map<string, DuplicateFlag> {
  const flags = new Map<string, DuplicateFlag>();
  const ordered = [...pending].sort(
    (a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.createdAt.localeCompare(b.createdAt),
  );

  for (let i = 0; i < ordered.length; i++) {
    const item = ordered[i];
    const t = Date.parse(item.occurredAt);
    for (let j = i - 1; j >= 0; j--) {
      const prev = ordered[j];
      const gap = t - Date.parse(prev.occurredAt);
      if (gap > windowMs) break;
      if (prev.amountCents === item.amountCents && sameMerchant(prev.merchant, item.merchant)) {
        flags.set(item.id, { kind: 'pending', otherId: prev.id, minutesApart: Math.round(gap / 60000) });
        break;
      }
    }
    if (flags.has(item.id)) continue;

    const day = localDateKey(item.occurredAt);
    const match = expenses.find(
      (e) => e.amountCents === item.amountCents && e.spentOn === day && sameMerchant(e.description, item.merchant),
    );
    if (match) flags.set(item.id, { kind: 'expense', otherId: match.id, description: match.description });
  }
  return flags;
}
