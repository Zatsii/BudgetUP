// Receipt scanning contract. Every backend (mock, a vision API behind your own server, on-device
// OCR) implements ReceiptParser, and the app only ever talks to `getReceiptParser()`.
// Pure TypeScript: no React Native imports, so the mapping logic is tested with node --test.

/** The picked or captured photo, already normalised to JPEG by getReceiptImage(). */
export type ReceiptImage = {
  uri: string;
  mimeType?: string | null;
  width?: number;
  height?: number;
};

/** All money fields are integer cents in the receipt's own currency. */
export type ReceiptItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type ReceiptTax = {
  /** Percentage, e.g. 7.6 for 7.6%. */
  rate: number | null;
  amount: number | null;
  /** true: prices already include the tax (VAT style). false: tax is added on top. */
  included: boolean;
};

export type ParsedReceipt = {
  merchant: string | null;
  /** Purchase date as 'YYYY-MM-DD', or null if not found. */
  date: string | null;
  /** The date as printed ("01-02-2018"), to show when it needs confirming. */
  dateText?: string | null;
  /** ISO 4217 code, e.g. 'CHF', or null if not printed. */
  currency: string | null;
  /** Grand total in integer cents, or null if not found. */
  total: number | null;
  tax: ReceiptTax | null;
  items: ReceiptItem[];
  /** How sure the parser is of each field. Missing (e.g. the demo parser) means all certain. */
  confidence?: ReceiptConfidence;
  /** The OCR text the parser read, one string per row. For the dev-only debug view. */
  ocrText?: string[];
};

/** high: read clearly or cross-checked. low: guessed or inconsistent, check it. none: not found. */
export type Confidence = 'high' | 'low' | 'none';

export type ReceiptConfidence = { total: Confidence; items: Confidence; merchant: Confidence; date: Confidence };

export interface ReceiptParser {
  /** Shown in the UI so it's obvious when results are sample data. */
  readonly label: string;
  readonly isMock: boolean;
  parse(image: ReceiptImage, options?: { signal?: AbortSignal }): Promise<ParsedReceipt>;
}

/** What the expense form prefills and saves from a receipt. Fields are null when not printed. */
export type ReceiptDraft = {
  amountCents: number | null;
  merchant: string | null;
  spentOn: string | null;
  currency: string | null;
  tax: ReceiptTax | null;
  items: ReceiptItem[];
  confidence: ReceiptConfidence;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;

const isCents = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n);

/**
 * Maps parser output onto expense fields. Prefers the printed total, falling back to the sum of
 * line items only when no total was printed. Drops malformed values rather than prefilling
 * garbage, but never adjusts numbers to make them agree (see checkReceipt()).
 */
export function receiptToDraft(r: ParsedReceipt): ReceiptDraft {
  const items = r.items.filter(
    (i) => i.name.trim() && Number.isFinite(i.quantity) && i.quantity > 0 && isCents(i.unitPrice) && isCents(i.lineTotal),
  );
  const itemsSum = items.reduce((s, i) => s + i.lineTotal, 0);
  const total = isCents(r.total) && r.total > 0 ? r.total : null;
  const amountCents = total ?? (itemsSum > 0 ? itemsSum : null);

  const merchant = r.merchant?.trim() || null;
  const spentOn = r.date && DATE_RE.test(r.date) && isRealDate(r.date) ? r.date : null;
  const currency = r.currency && CURRENCY_RE.test(r.currency.toUpperCase()) ? r.currency.toUpperCase() : null;
  const tax =
    r.tax && (r.tax.rate === null || (Number.isFinite(r.tax.rate) && r.tax.rate >= 0 && r.tax.rate < 100))
      ? { rate: r.tax.rate, amount: isCents(r.tax.amount) ? r.tax.amount : null, included: Boolean(r.tax.included) }
      : null;

  const confidence: ReceiptConfidence = {
    total: amountCents === null ? 'none' : (r.confidence?.total ?? 'high'),
    items: items.length === 0 ? 'none' : (r.confidence?.items ?? 'high'),
    merchant: merchant === null ? 'none' : (r.confidence?.merchant ?? 'high'),
    date: spentOn === null ? 'none' : (r.confidence?.date ?? 'high'),
  };
  return { amountCents, merchant, spentOn, currency, tax, items: items.map((i) => ({ ...i, name: i.name.trim() })), confidence };
}

function isRealDate(s: string): boolean {
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}
