import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BERGHOTEL_RECEIPT } from '../utils/mockReceiptParser.ts';
import type { ReceiptItem } from '../utils/receiptParser.ts';
import { checkReceipt, formatQuantity, formatReceiptLine } from '../utils/receiptMath.ts';

const { items, total, tax } = BERGHOTEL_RECEIPT;

test('Berghotel fixture: items add up to the total (VAT included)', () => {
  const c = checkReceipt(items, total!, tax);
  assert.equal(c.itemsSum, 5450);
  assert.equal(c.expectedTotal, 5450);
  assert.equal(c.difference, 0);
  assert.deepEqual(c.lineMismatches, []);
  assert.equal(c.ok, true);
});

test('a total that differs from the items is reported, not corrected', () => {
  const c = checkReceipt(items, 5500, tax); // e.g. user edited the amount
  assert.equal(c.ok, false);
  assert.equal(c.difference, 50);
  assert.equal(c.expectedTotal, 5450);
  assert.equal(c.total, 5500, 'the stored total is reported as-is');
});

test('a missing item makes the sum short', () => {
  const c = checkReceipt(items.slice(0, 3), total!, tax);
  assert.equal(c.ok, false);
  assert.equal(c.difference, 1850);
});

test('a wrong line (quantity x unit price) is flagged by index', () => {
  const bad: ReceiptItem[] = items.map((i, n) => (n === 0 ? { ...i, lineTotal: 450 } : i)); // 2 x 4.50 != 4.50
  const c = checkReceipt(bad, 5000, tax); // total matches the (wrong) lines...
  assert.equal(c.difference, 0);
  assert.deepEqual(c.lineMismatches, [0]); // ...but the line itself is still wrong
  assert.equal(c.ok, false);
});

test('tax added on top (US style) is part of the expected total', () => {
  const lines: ReceiptItem[] = [{ name: 'Lunch', quantity: 1, unitPrice: 2000, lineTotal: 2000 }];
  const addedTax = { rate: 8.875, amount: 178, included: false };
  assert.equal(checkReceipt(lines, 2178, addedTax).ok, true);
  assert.equal(checkReceipt(lines, 2000, addedTax).difference, -178);
  // Included tax must NOT be added again
  assert.equal(checkReceipt(lines, 2000, { ...addedTax, included: true }).ok, true);
});

test('fractional quantities round to the cent', () => {
  const kg: ReceiptItem[] = [{ name: 'Cheese', quantity: 0.35, unitPrice: 2990, lineTotal: 1047 }]; // 10.465 -> 10.47
  assert.equal(checkReceipt(kg, 1047, null).ok, true);
});

test('no items means nothing to check', () => {
  assert.equal(checkReceipt([], 1234, null).ok, true);
});

test('line formatting matches the receipt style', () => {
  assert.equal(formatReceiptLine(items[0]), '2 x Latte Macchiato  @ 4.50 = 9.00');
  assert.equal(formatReceiptLine(items[3]), '1 x Chasspaetzli  @ 18.50 = 18.50');
  assert.equal(formatQuantity(0.35), '0.35');
});
