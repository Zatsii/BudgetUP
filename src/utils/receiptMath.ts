// Receipt arithmetic checks. Pure functions, tested with node --test.
// These only REPORT problems; nothing here changes amounts. A mismatch is shown to the user.

import { formatAmount } from './format.ts';
import type { ReceiptItem, ReceiptTax } from './receiptParser.ts';

export type ReceiptCheck = {
  /** Sum of the line totals. */
  itemsSum: number;
  /** What the total should be given the items and tax (items + tax when tax is added on top). */
  expectedTotal: number;
  /** The total actually on the expense. */
  total: number;
  /** total - expectedTotal. Non-zero means the items don't add up. */
  difference: number;
  /** Indexes of items where quantity x unit price != line total. */
  lineMismatches: number[];
  ok: boolean;
};

/** quantity x unit price, rounded to the cent (quantities can be fractional, e.g. 0.5 kg). */
export function expectedLineTotal(item: Pick<ReceiptItem, 'quantity' | 'unitPrice'>): number {
  return Math.round(item.quantity * item.unitPrice);
}

export function checkReceipt(items: ReceiptItem[], totalCents: number, tax: ReceiptTax | null): ReceiptCheck {
  const itemsSum = items.reduce((s, i) => s + i.lineTotal, 0);
  const taxOnTop = tax && !tax.included && tax.amount !== null ? tax.amount : 0;
  const expectedTotal = itemsSum + taxOnTop;
  const lineMismatches = items.flatMap((item, i) => (expectedLineTotal(item) === item.lineTotal ? [] : [i]));
  const difference = totalCents - expectedTotal;
  return {
    itemsSum,
    expectedTotal,
    total: totalCents,
    difference,
    lineMismatches,
    ok: items.length === 0 || (difference === 0 && lineMismatches.length === 0),
  };
}

/** "2", "0.5", "1.25": no trailing zeros. */
export function formatQuantity(q: number): string {
  return Number.isInteger(q) ? String(q) : String(Number(q.toFixed(3)));
}

/** "2 x Latte Macchiato  @ 4.50 = 9.00" */
export function formatReceiptLine(item: ReceiptItem): string {
  return `${formatQuantity(item.quantity)} x ${item.name}  @ ${formatAmount(item.unitPrice)} = ${formatAmount(item.lineTotal)}`;
}

/** "7.6" -> "7.6", 8 -> "8" */
export function formatRate(rate: number): string {
  return String(Number(rate.toFixed(3)));
}
