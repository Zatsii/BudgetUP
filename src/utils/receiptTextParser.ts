// Turns the text that on-device OCR reads off a receipt photo into a ParsedReceipt.
// Pure TypeScript, tested with node --test.
//
// Input is text in reading order: normally one string per printed row (see ocrRows.ts), but
// names and prices may still arrive as separate pieces (a "\n" splits a piece into lines), so
// this doesn't rely on layout alone. The total comes from a keyword line ("TOTAL", "Summe"),
// never from the largest amount; items are cross-checked against it, and anything uncertain
// is reported through `confidence` so the review form can point at it.

import type { Confidence, ParsedReceipt, ReceiptItem, ReceiptTax } from './receiptParser.ts';

/**
 * column: an amount with no text (prices read as their own column). qty: "2 @ 3.99".
 * discount: savings/discount lines (part of the item block, never the total).
 */
type Kind = 'item' | 'total' | 'subtotal' | 'tax' | 'payment' | 'discount' | 'meta' | 'column' | 'qty';

type Line = {
  index: number;
  text: string;
  /** The text with amounts, dates, times and currency markers removed. */
  label: string;
  /** Every money amount on the line, in cents, in reading order. */
  amounts: number[];
  kind: Kind;
};

/** One priced line: its last amount is the line total. */
type Entry = { cents: number; line: Line; name: string; unitCents: number | null };

export type ParseOptions = {
  /**
   * How to read a date like 01-02-2018 where either part could be the month: true = 1 February
   * (most of the world), false = January 2 (US). Pass the phone's locale. Default true.
   */
  dayFirst?: boolean;
};

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** OCR swaps letters and digits inside words ("T0TAL"); for keyword matching only. */
const letterSlips = (s: string) =>
  s.replace(/[\p{L}\d]+/gu, (w) => (/\p{L}/u.test(w) && /\d/.test(w) ? w.replace(/0/g, 'o').replace(/1/g, 'l').replace(/5/g, 's') : w));

const SUBTOTAL_RE = /\b(sub ?-?total|zwischensumme|subtotale|sous[- ]total|net amount|netto)\b/;
const TOTAL_RE =
  /\b(grand total|total|totale|totaal|gesamt\w*|summe|sum|betrag|zu zahlen|amount due|balance due|balance|montant|importe|to pay)\b/;
const TAX_RE = /\b(tax|vat|mwst|mws|ust|tva|iva|gst|hst|pst|btw|moms)\b/;
const TAX_INCLUDED_RE = /\b(incl|inkl|included|inclusive|enthalten|compris|incluso|incluida)\b/;
// "bar" (German for cash) only counts on a line with an amount, so "Snack Bar" can be a shop.
const PAYMENT_RE =
  /\b(cash|change|ruckgeld|retour|card|credit|debit|visa|mastercard|maestro|amex|twint|tendered|given|rendu|cambio|tip|tips|gratuity|trinkgeld|payment|zahlung|eftpos|contactless|paid|approval|approved|auth)\b/;
const DISCOUNT_RE = /\b(discount|savings?|you saved|coupon|rabatt|remise|sconto|descuento)\b/;
const META_RE =
  /\b(tel|phone|fax|www|https?|e-?mail|thank|thanks|danke|merci|grazie|gracias|table|tisch|invoice|rechnung|rech|receipt|quittung|beleg|date|datum|time|zeit|uhr|server|cashier|kasse|bedient|operator|order|uid|guests?|covers?|page|store|terminal|copy|reg|register|trans|transaction|ref|survey|policy|returns?)\b|@|\.(com|ch|de)\b/;
const QTY_ONLY_RE = /^(\d+(?:[.,]\d+)?)\s*(?:@|x|×|\*)$/i;

const CURRENCY_CODES = ['CHF', 'EUR', 'USD', 'GBP', 'CAD', 'AUD', 'NZD', 'INR', 'JPY', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'SGD', 'HKD', 'AED', 'ZAR', 'MXN', 'BRL'];
const CURRENCY_SYMBOLS: Record<string, string> = { '€': 'EUR', '£': 'GBP', '₹': 'INR', '¥': 'JPY' };
const CURRENCY_TOKEN_RE = new RegExp(`\\b(${CURRENCY_CODES.join('|')}|Fr|SFr|Rs)\\.?(?![a-z])|[€£₹¥$]`, 'gi');

// 1,234.50 / 1.234,50 / 1'234.50 / 54.50 / 54,50. Not part of a longer number (dates, codes),
// not a percentage, and exactly two decimals so quantities and weights don't count.
const AMOUNT_RE = /(?<!\d|\d[.,])(-\s?)?(\d{1,3}(?:[,.'’]\d{3})+|\d+)[.,](\d{2})(?!\d|[.,]\d|\s?%)(\s?-)?/g;

// A price with OCR slips: O/o for 0, l/I for 1, and S for a $ in front ("S2.50", "1.O0", "l.25").
// Only touches tokens that are otherwise a price (one separator, two decimals, a real digit).
const SLIPPED_PRICE_RE = /(?<![\p{L}\d])(S?)([\dOolI]+)([.,])([\dOolI]{2})(?![\p{L}\d])/gu;

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, mär: 3, apr: 4, may: 5, mai: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, dez: 12,
};
const MONTH_ALT = Object.keys(MONTHS).join('|');
const TIME_RE = /\b\d{1,2}:\d{2}(?::\d{2})?\s?(?:[AP]M)?\b/gi;

type FoundDate = { ymd: string; match: string; ambiguous: boolean };

function validYmd(y: number, mo: number, d: number): string | null {
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (y < 2000 || y > 2100 || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function findDate(text: string, dayFirst: boolean): FoundDate | null {
  let m = text.match(/\b(\d{4})[-./](\d{1,2})[-./](\d{1,2})\b/);
  if (m) {
    const ymd = validYmd(+m[1], +m[2], +m[3]);
    if (ymd) return { ymd, match: m[0], ambiguous: false };
  }
  // OCR sometimes adds a space after a separator ("30.07. 2007").
  m = text.match(/\b(\d{1,2})([./-])\s?(\d{1,2})\2\s?(\d{4}|\d{2})\b/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[3]);
    const y = m[4].length === 2 ? 2000 + Number(m[4]) : Number(m[4]);
    // Dots are day first by convention (30.07.2007). With / or - either order is possible
    // unless one part can't be a month; then the phone's locale decides and it's flagged.
    const certain = m[2] === '.' || a > 12 || b > 12 || a === b;
    const dayIsFirst = m[2] === '.' || a > 12 ? true : b > 12 ? false : dayFirst;
    const ymd = dayIsFirst ? validYmd(y, b, a) : validYmd(y, a, b);
    if (ymd) return { ymd, match: m[0], ambiguous: !certain };
  }
  m = text.match(new RegExp(`\\b(\\d{1,2})\\.?\\s+(${MONTH_ALT})[a-z]*\\.?,?\\s+(\\d{4})\\b`, 'i'));
  if (m) {
    const ymd = validYmd(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
    if (ymd) return { ymd, match: m[0], ambiguous: false };
  }
  m = text.match(new RegExp(`\\b(${MONTH_ALT})[a-z]*\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`, 'i'));
  if (m) {
    const ymd = validYmd(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
    if (ymd) return { ymd, match: m[0], ambiguous: false };
  }
  return null;
}

function classify(label: string, amounts: number[]): Kind {
  const l = letterSlips(norm(label));
  if (amounts.length === 1 && QTY_ONLY_RE.test(label)) return 'qty';
  if (SUBTOTAL_RE.test(l)) return 'subtotal';
  if (TAX_RE.test(l) || /\d\s?%/.test(l)) return 'tax';
  if (PAYMENT_RE.test(l) || (amounts.length > 0 && /\bbar\b/.test(l))) return 'payment';
  if (DISCOUNT_RE.test(l)) return 'discount';
  if (TOTAL_RE.test(l)) return 'total';
  if (META_RE.test(l)) return 'meta';
  if (!/\p{L}{2}/u.test(label)) return amounts.length ? 'column' : 'meta';
  return 'item';
}

function readLine(text: string, index: number, dayFirst: boolean): Line {
  let rest = text;
  const date = findDate(rest, dayFirst);
  if (date) rest = rest.replace(date.match, ' ');
  rest = rest.replace(TIME_RE, ' ');
  rest = rest.replace(SLIPPED_PRICE_RE, (m, s: string, whole: string, sep: string, frac: string) => {
    if (!/\d/.test(whole + frac)) return m;
    const fix = (t: string) => t.replace(/[Oo]/g, '0').replace(/[lI]/g, '1');
    return `${s ? '$' : ''}${fix(whole)}${sep}${fix(frac)}`;
  });
  const amounts: number[] = [];
  rest = rest.replace(AMOUNT_RE, (_m, lead: string | undefined, whole: string, frac: string, trail: string | undefined) => {
    const cents = Number(whole.replace(/[,.'’]/g, '')) * 100 + Number(frac);
    amounts.push(lead || trail ? -cents : cents);
    return ' ';
  });
  const label = rest.replace(CURRENCY_TOKEN_RE, ' ').replace(/[:=]+/g, ' ').replace(/\s+/g, ' ').trim();
  return { index, text, label, amounts, kind: classify(label, amounts) };
}

/**
 * "2 x Latte Macchiato à" / "2xLatte" / "Coffee x2" / "Orange Juice 3x" -> quantity + name.
 * Barcodes (8+ digits) and dot leaders are dropped from the name.
 */
function splitQuantity(label: string): { quantity: number; name: string } {
  const clean = label.replace(/\b\d{8,}\b/g, ' ').replace(/\.{2,}/g, ' ').replace(/\s+/g, ' ').trim();
  let quantity = 1;
  let name = clean;
  const first = clean.match(/^(\d+(?:[.,]\d+)?)\s*(?:x|×|\*)\s*(.+)$/i) ?? clean.match(/^(\d{1,2})\s+(?=\p{L})(.+)$/u);
  const last = clean.match(/^(.+?)\s+(?:[x×]\s?(\d{1,3})|(\d{1,3})\s?[x×])$/i);
  if (first) {
    quantity = Number(first[1].replace(',', '.'));
    name = first[2];
  } else if (last) {
    quantity = Number(last[2] ?? last[3]);
    name = last[1];
  }
  name = name
    .replace(/\s+(?:à|a|@|x|×|je|each|ea)\.?$/i, '')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N})]+$/gu, '')
    .trim();
  return { quantity: quantity > 0 ? quantity : 1, name };
}

function toItem(label: string, lineCents: number, printedUnit: number | null): ReceiptItem {
  const { quantity, name } = splitQuantity(label);
  if (printedUnit !== null && Math.round(quantity * printedUnit) === lineCents) {
    return { name, quantity, unitPrice: printedUnit, lineTotal: lineCents };
  }
  // Only keep a quantity that divides the line total exactly; otherwise the sum check would flag
  // a rounding difference that isn't on the receipt.
  if (quantity > 1 && Number.isInteger(quantity) && lineCents % quantity === 0) {
    return { name, quantity, unitPrice: lineCents / quantity, lineTotal: lineCents };
  }
  return { name: quantity === 1 ? name : label, quantity: 1, unitPrice: lineCents, lineTotal: lineCents };
}

/**
 * Priced lines in reading order. A "2 @ 3.99" line is folded into the neighbouring item whose
 * total it explains.
 */
function toEntries(lines: Line[]): Entry[] {
  const entries: Entry[] = lines
    .filter((l) => l.amounts.length > 0)
    .map((l) => ({
      cents: l.amounts[l.amounts.length - 1],
      line: l,
      name: l.label,
      unitCents: l.kind === 'item' && l.amounts.length >= 2 ? l.amounts[l.amounts.length - 2] : null,
    }));
  for (const [i, e] of entries.entries()) {
    if (e.line.kind !== 'qty') continue;
    const quantity = Number(e.line.label.match(QTY_ONLY_RE)![1].replace(',', '.'));
    const owner = [entries[i - 1], entries[i + 1]].find(
      (o) => o && o.line.kind === 'item' && o.unitCents === null && Math.round(quantity * e.cents) === o.cents,
    );
    if (owner) {
      owner.name = `${quantity} x ${owner.name}`;
      owner.unitCents = e.cents;
    }
  }
  return entries.filter((e) => e.line.kind !== 'qty');
}

const IN_ITEM_BLOCK: Kind[] = ['item', 'column', 'discount'];

type Run = { items: Entry[]; target: Entry };

/** Longest run (2+) of item-block amounts that adds up to the amount right after it. */
function findItemRun(entries: Entry[]): Run | null {
  let best: Run | null = null;
  for (let t = 2; t < entries.length; t++) {
    const target = entries[t].cents;
    if (target <= 0) continue;
    let sum = 0;
    for (let s = t - 1; s >= 0; s--) {
      if (!IN_ITEM_BLOCK.includes(entries[s].line.kind)) break;
      sum += entries[s].cents;
      if (sum === target && t - s >= 2 && (!best || t - s > best.items.length)) {
        best = { items: entries.slice(s, t), target: entries[t] };
      }
    }
  }
  return best;
}

/** A text line that names an item: no price of its own, or only a unit price. */
const isNameLine = (l: Line | undefined, skip: Set<Line>): l is Line =>
  !!l && !skip.has(l) && l.kind === 'item' && (l.amounts.length === 0 || (l.amounts.length === 1 && splitQuantity(l.label).quantity > 1));

/**
 * Names for prices that came back on their own line. A price right under a name line belongs to
 * it ("Fruit Salad" / "4.25"). Otherwise the prices are a separate column: pair them in order
 * with the name lines just above the "Total"/"Subtotal" label (or the first ones at the top).
 */
function nameColumnPrices(lines: Line[], entries: Entry[], skip: Set<Line>): Map<Entry, Line> {
  const names = new Map<Entry, Line>();
  const used = new Set(skip);
  const rest: Entry[] = [];
  for (const e of entries) {
    if (e.line.kind !== 'column') continue;
    const above = lines[e.line.index - 1];
    if (isNameLine(above, used)) {
      names.set(e, above);
      used.add(above);
    } else {
      rest.push(e);
    }
  }
  if (rest.length === 0) return names;
  // In a names column, a name line may carry its unit price ("1xGloki à 5.00 CHF").
  const inNamesColumn = (l: Line) => !used.has(l) && l.kind === 'item' && l.amounts.length <= 1;
  const anchor = lines.findIndex((l) => l.amounts.length === 0 && (l.kind === 'total' || l.kind === 'subtotal'));
  const pool = (anchor >= 0 ? lines.slice(0, anchor) : lines).filter(inNamesColumn);
  const picked = anchor >= 0 ? pool.slice(-rest.length) : pool.slice(0, rest.length);
  rest.forEach((e, i) => picked[i] && names.set(e, picked[i]));
  return names;
}

/** The shop name: the first plain-text line near the top, plus the next one if it's plain too. */
function findMerchant(lines: Line[]): Line[] {
  const plain = (l: Line | undefined): l is Line =>
    !!l && l.amounts.length === 0 && l.kind === 'item' && (l.label.match(/\p{L}/gu)?.length ?? 0) >= 3 && !/\d/.test(l.label);
  const first = lines.slice(0, 6).findIndex(plain);
  if (first < 0) return [];
  return plain(lines[first + 1]) && first + 1 < 6 ? [lines[first], lines[first + 1]] : [lines[first]];
}

/**
 * Amounts printed with a total keyword: on the same line, or alone on the next line. A price on
 * the next line only counts when it stands alone; at the top of a prices column it belongs to
 * the first item, not the total. Excluded words (cash, card, tax, subtotal, discount, ...) never
 * get here: classify() gives those lines another kind.
 */
function totalCandidates(lines: Line[]): { cents: number; line: Line }[] {
  const out: { cents: number; line: Line }[] = [];
  for (const l of lines) {
    if (l.kind !== 'total') continue;
    const next = lines[l.index + 1];
    if (l.amounts.length > 0) out.push({ cents: l.amounts[l.amounts.length - 1], line: l });
    else if (next?.kind === 'column' && lines[l.index + 2]?.kind !== 'column') out.push({ cents: next.amounts[0], line: l });
  }
  return out.filter((c) => c.cents > 0);
}

/** Several totals: the one lowest in the item block but above the payment lines. */
function pickTotal(candidates: { cents: number; line: Line }[], lines: Line[]): { cents: number; line: Line } | null {
  if (candidates.length === 0) return null;
  const firstPayment = lines.find((l) => l.kind === 'payment' && l.index > candidates[0].line.index);
  const above = candidates.filter((c) => !firstPayment || c.line.index < firstPayment.index);
  const pool = above.length ? above : candidates;
  return pool[pool.length - 1];
}

export function parseReceiptText(pieces: string[], options: ParseOptions = {}): ParsedReceipt {
  const dayFirst = options.dayFirst ?? true;
  const lines = pieces
    .flatMap((p) => p.split(/\r?\n/))
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((t, i) => readLine(t, i, dayFirst));

  const merchantLines = findMerchant(lines);
  const merchant = merchantLines.length ? merchantLines.map((l) => l.label).join(' ') : null;
  const foundDate = lines.map((l) => findDate(l.text, dayFirst)).find(Boolean) ?? null;
  const currency = findCurrency(lines.map((l) => l.text).join('\n'));

  const entries = toEntries(lines);
  const candidates = totalCandidates(lines);
  const keyword = pickTotal(candidates, lines);
  const skip = new Set(merchantLines);

  // 1. Items that add up to a printed amount: the strongest signal. If the first pass finds
  //    nothing, retry without name lines that carry only a unit price ("2 x Latte 4.50") while
  //    the line totals sit in a prices column.
  const run =
    findItemRun(entries) ??
    findItemRun(entries.filter((e) => !(e.line.kind === 'item' && e.line.amounts.length === 1 && splitQuantity(e.name).quantity > 1)));

  let itemEntries: Entry[];
  let taxOnTop: number | null = null;
  if (run) {
    itemEntries = run.items;
    // Subtotal, then tax, then a total that's their sum: the tax is added on top.
    const at = entries.indexOf(run.target);
    const [tax, after] = [entries[at + 1], entries[at + 2]];
    if (tax && after && tax.cents > 0 && after.cents === run.target.cents + tax.cents) taxOnTop = tax.cents;
  } else {
    // 2. No arithmetic match: take the priced lines of the item block, above the total line
    //    (or above the payment lines when there's no total). They may not add up; that's flagged.
    const end = keyword?.line.index ?? lines.find((l) => l.kind === 'payment' || l.kind === 'subtotal')?.index ?? Infinity;
    itemEntries = entries.filter(
      (e) =>
        e.line.index < end &&
        !skip.has(e.line) &&
        (e.line.kind === 'item' || e.line.kind === 'discount' || (e.line.kind === 'column' && isNameLine(lines[e.line.index - 1], skip))),
    );
  }

  const names = nameColumnPrices(lines, itemEntries, skip);
  let unnamed = 0;
  const items = itemEntries.map((e) => {
    if (e.line.kind !== 'column') return toItem(e.name, e.cents, e.unitCents);
    const name = names.get(e);
    return name ? toItem(name.label, e.cents, name.amounts.length === 1 ? name.amounts[0] : null) : toItem(`Item ${++unnamed}`, e.cents, null);
  });
  const itemsSum = items.reduce((s, i) => s + i.lineTotal, 0);

  // Total: a keyword total that matches the items wins; otherwise the keyword total (flagged if
  // the items disagree). Without a keyword: the printed amount the items add up to, else the
  // items' sum (flagged). Never the largest or last amount.
  const matching = items.length ? candidates.find((c) => c.cents === itemsSum + (taxOnTop ?? 0) || c.cents === itemsSum) : undefined;
  const chosen = matching ?? keyword;
  let total: number | null;
  let totalConfidence: Confidence;
  if (chosen) {
    total = chosen.cents;
    totalConfidence = items.length === 0 || matching ? 'high' : 'low';
  } else if (run) {
    total = run.target.cents + (taxOnTop ?? 0);
    totalConfidence = 'high';
  } else if (items.length) {
    total = itemsSum;
    totalConfidence = 'low';
  } else {
    total = null;
    totalConfidence = 'none';
  }

  const taxLine = lines.find((l) => l.kind === 'tax');
  const columnTax = run && taxLine ? columnTaxAmount(lines, entries, run, taxLine) : null;
  const tax = readTax(taxLine, total, itemsSum, taxOnTop, columnTax);
  const taxAdded = tax && !tax.included && tax.amount !== null ? tax.amount : 0;
  const itemsAddUp = total !== null && (itemsSum === total || itemsSum + taxAdded === total);

  return {
    merchant,
    date: foundDate?.ymd ?? null,
    dateText: foundDate?.match ?? null,
    currency,
    total,
    tax,
    items,
    confidence: {
      total: totalConfidence,
      items: items.length === 0 ? 'none' : itemsAddUp && unnamed === 0 ? 'high' : 'low',
      merchant: merchant ? 'high' : 'none',
      date: !foundDate ? 'none' : foundDate.ambiguous ? 'low' : 'high',
    },
  };
}

/**
 * Prices in their own column: the text lines after the "Total" label pair, in order, with the
 * column amounts after the total. Returns the amount that lines up with the tax line.
 */
function columnTaxAmount(lines: Line[], entries: Entry[], run: Run, taxLine: Line): number | null {
  const anchor = lines.findIndex((l) => l.amounts.length === 0 && (l.kind === 'total' || l.kind === 'subtotal'));
  if (anchor < 0 || taxLine.index < anchor) return null;
  const labels = lines.slice(anchor + 1).filter((l) => l.kind !== 'column' && l.kind !== 'meta');
  // Text lines with their own amount (e.g. "Incl. 7.6% MwSt 54.50 CHF:") can sit between them.
  const column = entries.slice(entries.indexOf(run.target) + 1).filter((e) => e.line.kind === 'column').map((e) => e.cents);
  const k = labels.indexOf(taxLine);
  return k >= 0 && k < column.length ? column[k] : null;
}

function readTax(
  line: Line | undefined,
  total: number | null,
  itemsSum: number,
  taxOnTop: number | null,
  columnTax: number | null,
): ReceiptTax | null {
  if (!line && taxOnTop === null) return null;
  const text = line ? norm(line.text) : '';
  const rateMatch = text.match(/(\d{1,2}(?:[.,]\d{1,3})?)\s?%/);
  const rate = rateMatch ? Number(rateMatch[1].replace(',', '.')) : null;
  // The tax is the smallest amount on its line ("Incl. 7.6% VAT on 54.50: 3.85").
  const onLine = line?.amounts.filter((a) => a > 0 && (total === null || a < total)) ?? [];
  const amount = taxOnTop ?? (onLine.length ? Math.min(...onLine) : columnTax);
  if (taxOnTop !== null) return { rate, amount, included: false };
  const addsUpOnTop = amount !== null && total !== null && itemsSum > 0 && itemsSum + amount === total;
  return { rate, amount, included: TAX_INCLUDED_RE.test(text) || !addsUpOnTop };
}

function findCurrency(text: string): string | null {
  const code = text.match(new RegExp(`\\b(${CURRENCY_CODES.join('|')})\\b`));
  if (code) return code[1];
  const symbol = Object.keys(CURRENCY_SYMBOLS).find((s) => text.includes(s));
  return symbol ? CURRENCY_SYMBOLS[symbol] : null;
}
