import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkReceipt } from '../utils/receiptMath.ts';
import { parseReceiptText } from '../utils/receiptTextParser.ts';

const sum = (items: { lineTotal: number }[]) => items.reduce((s, i) => s + i.lineTotal, 0);

// The receipt from the bug report, as clean text.
const TERMINAL_RECEIPT = [
  'RECEIPT / Terminal#1  01-02-2018 11:32AM',
  '1 x T-Shirt $25.50',
  '1 x Watches $299.00',
  '1 x Pants $32.99',
  '1 x Socks $6.50',
  'TOTAL AMOUNT $363.99',
  'CASH $400.00',
  'CHANGE $36.01',
  'Bank Card **** **** **** 7211  Approval# 192107',
];

test('bug report receipt: total is TOTAL AMOUNT, not CASH; 4 items; no merchant', () => {
  const r = parseReceiptText(TERMINAL_RECEIPT);
  assert.equal(r.total, 36399);
  assert.equal(r.items.length, 4);
  assert.equal(sum(r.items), 36399);
  assert.deepEqual(r.items.map((i) => i.name), ['T-Shirt', 'Watches', 'Pants', 'Socks']);
  assert.equal(r.merchant, null);
  assert.ok(r.date === '2018-02-01' || r.date === '2018-01-02', `date ${r.date}`);
  assert.equal(r.confidence?.total, 'high');
  assert.equal(r.confidence?.items, 'high');
  assert.equal(r.confidence?.merchant, 'none');
  assert.equal(r.confidence?.date, 'low', '01-02-2018 could be either order');
});

test('bug report receipt as the phone actually read it (T0TAL, LAS#, 299.08)', () => {
  // Exact text logged by the app on the device for the user's photo.
  const r = parseReceiptText([
    '**************************',
    'RECEIPT',
    '****************#*********',
    'Teminal#1  01-02-2018 T1:32AM',
    '1xT-Shirt  $25.50',
    '1x Watches  $299.08',
    '1x Pants  $32.99',
    '1X Socks  $6.50',
    'T0TAL AMOUNT  $363.99',
    'LAS#  $400.00',
    'CHANGE  $36.01',
    '#**** T211',
    'Barnk Card',
    'Approvait  192107',
    '******** THANK YOU!*********',
    'Copy',
  ]);
  assert.equal(r.total, 36399, 'the keyword total, never the larger cash amount');
  assert.deepEqual(r.items.map((i) => [i.name, i.lineTotal]), [['T-Shirt', 2550], ['Watches', 29908], ['Pants', 3299], ['Socks', 650]]);
  assert.equal(r.merchant, null);
  // OCR misread 299.00 as 299.08: items add up to 364.07, so both are flagged for review.
  assert.equal(r.confidence?.total, 'low');
  assert.equal(r.confidence?.items, 'low');
  assert.equal(checkReceipt(r.items, r.total!, r.tax).ok, false);
});

test('Berghotel: total, items, CHF, "2xLatte Macchiato" quantity format', () => {
  const r = parseReceiptText([
    'Berghotel',
    'Grosse Scheidegg',
    '3818 Grindelwald',
    'Rech. Nr. 4572  30.07.2007/13:29:17',
    '2xLatte Macchiato à 4.50 CHF  9.00',
    '1xGloki à 5.00 CHF  5.00',
    '1xSchweinschnitzel à 22.00 CHF  22.00',
    '1xChässpätzli à 18.50 CHF  18.50',
    'Total :  CHF 54.50',
    'Incl. 7.6% MwSt 54.50 CHF:  3.85',
  ]);
  assert.equal(r.total, 5450);
  assert.deepEqual(r.items.map((i) => i.lineTotal), [900, 500, 2200, 1850]);
  assert.equal(r.currency, 'CHF');
  assert.deepEqual(r.items[0], { name: 'Latte Macchiato', quantity: 2, unitPrice: 450, lineTotal: 900 });
  assert.equal(r.merchant, 'Berghotel Grosse Scheidegg');
  assert.equal(r.date, '2007-07-30');
  assert.deepEqual(r.confidence, { total: 'high', items: 'high', merchant: 'high', date: 'high' });
});

test('only a total, no items', () => {
  const r = parseReceiptText(['City Parking', 'Ticket 4471', '2026-10-03 14:05', 'TOTAL DUE $12.00', 'VISA $12.00', 'Approval 553311']);
  assert.equal(r.total, 1200);
  assert.deepEqual(r.items, []);
  assert.equal(r.merchant, 'City Parking');
  assert.equal(r.confidence?.total, 'high');
  assert.equal(r.confidence?.items, 'none');
});

test('cash larger than total, with change', () => {
  const r = parseReceiptText(['Corner Cafe', 'Latte 4.50', 'Blueberry Muffin 3.25', 'TOTAL 7.75', 'CASH 20.00', 'CHANGE 12.25']);
  assert.equal(r.total, 775);
  assert.deepEqual(r.items.map((i) => [i.name, i.lineTotal]), [['Latte', 450], ['Blueberry Muffin', 325]]);
  assert.equal(r.confidence?.total, 'high');
});

test('several total lines: the one above the payment lines wins', () => {
  const r = parseReceiptText(['Hardware Co', 'Drill 149.00', 'Glue 6.97', 'TOTAL $155.97', 'PAYMENT MASTERCARD', 'AMOUNT $155.97', 'TOTAL SAVINGS $20.00']);
  assert.equal(r.total, 15597);
});

test('excluded lines are never the total', () => {
  for (const line of ['CASH TENDERED 50.00', 'TOTAL PAID 50.00', 'CARD TOTAL 50.00', 'SUBTOTAL 50.00', 'TOTAL TAX 50.00', 'TIP 50.00', 'TOTAL DISCOUNT 50.00']) {
    const r = parseReceiptText(['Shop', 'Item 10.00', line]);
    assert.notEqual(r.total, 5000, line);
  }
});

test('no keyword total: falls back to the item sum, low confidence', () => {
  const r = parseReceiptText(['Market Stall', 'Apples 3.00', 'Pears 2.50', 'CASH 10.00', 'CHANGE 4.50']);
  assert.equal(r.total, 550);
  assert.equal(r.confidence?.total, 'low');
});

test('no total and no items: nothing guessed (never the largest amount)', () => {
  const r = parseReceiptText(['Shop', 'CASH 400.00', 'CHANGE 36.01', 'Ref 123.45']);
  assert.equal(r.total, null);
  assert.equal(r.confidence?.total, 'none');
});

test('item formats: quantity first or last, dot leaders, price on the next line', () => {
  const r = parseReceiptText([
    'Deli Shop',
    '2 x Bagel 1.50 3.00',
    'Coffee x2 5.00',
    'Orange Juice 3x 6.00',
    'Sandwich .......... 8.50',
    'Fruit Salad',
    '4.25',
    'TOTAL 26.75',
  ]);
  assert.deepEqual(r.items, [
    { name: 'Bagel', quantity: 2, unitPrice: 150, lineTotal: 300 },
    { name: 'Coffee', quantity: 2, unitPrice: 250, lineTotal: 500 },
    { name: 'Orange Juice', quantity: 3, unitPrice: 200, lineTotal: 600 },
    { name: 'Sandwich', quantity: 1, unitPrice: 850, lineTotal: 850 },
    { name: 'Fruit Salad', quantity: 1, unitPrice: 425, lineTotal: 425 },
  ]);
  assert.equal(r.total, 2675);
});

test('barcodes, card numbers and approval codes are not items or names', () => {
  const r = parseReceiptText([
    'Tool Store',
    'GORILLA GLUE 40Z 567890123456 $6.97',
    'DEWALT DRILL KIT $149.00',
    '098765432109',
    'TOTAL $155.97',
    'CARD # **** 8867',
    'APPROVAL # 789012',
  ]);
  assert.deepEqual(r.items.map((i) => i.name), ['GORILLA GLUE 40Z', 'DEWALT DRILL KIT']);
});

test('OCR slips inside numbers: S/$ for 5, O for 0, l for 1', () => {
  const r = parseReceiptText(['Snack Bar', 'Chips S2.50', 'Cola 1.O0', 'Candy l.25', 'T0TAL 4.75']);
  assert.deepEqual(r.items.map((i) => i.lineTotal), [250, 100, 125]);
  assert.equal(r.total, 475);
  // Words are left alone.
  assert.deepEqual(r.items.map((i) => i.name), ['Chips', 'Cola', 'Candy']);
});

test('merchant skips generic words and asterisk rules; empty when nothing qualifies', () => {
  assert.equal(parseReceiptText(['*******', 'RECEIPT', 'INVOICE', 'Terminal 4', 'Item 1.00', 'TOTAL 1.00']).merchant, null);
  assert.equal(parseReceiptText(['RECEIPT OF SALE', 'Blue Bottle Coffee', 'Item 1.00', 'TOTAL 1.00']).merchant, 'Blue Bottle Coffee');
});

test('ambiguous day/month uses the phone locale and is marked low confidence', () => {
  const lines = ['Shop', '01-02-2018', 'TOTAL 1.00'];
  assert.equal(parseReceiptText(lines, { dayFirst: true }).date, '2018-02-01');
  assert.equal(parseReceiptText(lines, { dayFirst: false }).date, '2018-01-02');
  assert.equal(parseReceiptText(lines).confidence?.date, 'low');
  // Not ambiguous: one part can't be a month, or both parts are the same.
  assert.equal(parseReceiptText(['Shop', '13-02-2018', 'TOTAL 1.00'], { dayFirst: false }).date, '2018-02-13');
  assert.equal(parseReceiptText(['Shop', '03/18/2026', 'TOTAL 1.00'], { dayFirst: true }).date, '2026-03-18');
  assert.equal(parseReceiptText(['Shop', '03/18/2026', 'TOTAL 1.00']).confidence?.date, 'high');
  assert.equal(parseReceiptText(['Shop', '05.05.2026', 'TOTAL 1.00']).confidence?.date, 'high');
});
