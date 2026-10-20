import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkReceipt } from '../utils/receiptMath.ts';
import { receiptToDraft } from '../utils/receiptParser.ts';
import { parseReceiptText } from '../utils/receiptTextParser.ts';

// OCR output in the two shapes the devices produce. iOS (Vision) returns one string per line;
// Android (ML Kit) returns blocks, and on receipts the prices are often a separate block.

const BERGHOTEL_IOS = [
  'Berghotel',
  'Grosse Scheidegg',
  '3818 Grindelwald',
  'Familie R. Müller',
  'Rech. Nr. 4572 30.07.2007/13:29:17',
  'Bar Tisch 7/01',
  '2xLatte Macchiato à 4.50 CHF 9.00',
  '1xGloki à 5.00 CHF 5.00',
  '1xSchweinschnitzel à 22.00 CHF 22.00',
  '1xChässpätzli à 18.50 CHF 18.50',
  'Total : CHF 54.50',
  'Incl. 7.6% MwSt 54.50 CHF: 3.85',
  'Entspricht in Euro 36.33 EUR',
  'Es bediente Sie: Ursula',
  'MwSt Nr. : 430 234',
  'Tel.: 033 853 67 16',
  'E-mail: grossescheidegg@bluewin.ch',
];

const BERGHOTEL_ANDROID = [
  'Berghotel\nGrosse Scheidegg\n3818 Grindelwald\nFamilie R. Müller',
  'Rech. Nr. 4572\nBar',
  '30.07.2007/13:29:17\nTisch 7/01',
  '2xLatte Macchiato à 4.50 CHF\n1xGloki à 5.00 CHF\n1xSchweinschnitzel à 22.00 CHF\n1xChässpätzli à 18.50 CHF\nTotal :',
  '9.00\n5.00\n22.00\n18.50\nCHF 54.50',
  'Incl. 7.6% MwSt 54.50 CHF: 3.85\nEntspricht in Euro 36.33 EUR',
  'Es bediente Sie: Ursula\nMwSt Nr. : 430 234',
];

const BERGHOTEL_ITEMS = [
  { name: 'Latte Macchiato', quantity: 2, unitPrice: 450, lineTotal: 900 },
  { name: 'Gloki', quantity: 1, unitPrice: 500, lineTotal: 500 },
  { name: 'Schweinschnitzel', quantity: 1, unitPrice: 2200, lineTotal: 2200 },
  { name: 'Chässpätzli', quantity: 1, unitPrice: 1850, lineTotal: 1850 },
];

for (const [shape, text] of [
  ['iOS lines', BERGHOTEL_IOS],
  ['Android blocks, prices in their own column', BERGHOTEL_ANDROID],
] as const) {
  test(`Berghotel receipt (${shape})`, () => {
    const r = parseReceiptText([...text]);
    assert.equal(r.merchant, 'Berghotel Grosse Scheidegg');
    assert.equal(r.date, '2007-07-30');
    assert.equal(r.currency, 'CHF');
    assert.equal(r.total, 5450);
    assert.deepEqual(r.items, BERGHOTEL_ITEMS);
    assert.deepEqual(r.tax, { rate: 7.6, amount: 385, included: true });
    assert.ok(checkReceipt(r.items, r.total!, r.tax).ok, 'items add up to the total');
  });
}

// Real Apple Vision output (same request as the iOS module) for the three rendered test receipts.
// Vision returns the names column first and the prices column after it.
const VISION_BERGHOTEL = ["Berghotel", "Grosse Scheidegg", "3818 Grindelwald", "Familie R. Müller", "Rech. Nr. 4572", "Bar", "30.07.2007/13:29:17", "Tisch 7/01", "2xLatte Macchiato à 4.50 CHF", "1xGloki à 5.00 CHF", "1xSchweinschnitzel à 22.00 CHF", "1xChässpätzli à 18.50 CHF", "Total :", "9.00", "5.00", "22.00", "18.50", "CHF 54.50", "3.85", "36.33 EUR", "Incl. 7.6% MwSt 54.50 CHF:", "Entspricht in Euro", "Es bediente Sie: Ursula", "MwSt Nr. : 430 234", "lel.:", "033 853 67 16"];
const VISION_TRADER_JOES = ["TRADER JOE'S", "123 Main Street", "Springfield, IL 62701", "STORE #552 (217) 555-0100", "BANANAS", "ORGANIC MILK", "SOURDOUGH BREAD", "2 @ 3.99", "SUBTOTAL", "TAX 8.25%", "TOTAL", "VISA", "CHANGE", "10/14/2026 18:42", "THANK YOU FOR SHOPPING", "1.29", "4.49", "7.98", "13.76", "1.14", "14.90", "14.90", "0.00"];
const VISION_BAECKEREI = ["Bäckerei Huber", "Hauptstraße 8", "80331 München", "Datum: 12.10.2026", "Laugenbrezel", "2 x Kaffee Crema", "Apfelstrudel", "Summe EUR", "inkl. 7% MwSt", "Bar", "Rückgeld", "Vielen Dank!", "08:15", "1.20", "6.40", "3.90", "11.50", "0.75", "20.00", "8.50"];

test('real Vision output: Berghotel', () => {
  const r = parseReceiptText(VISION_BERGHOTEL);
  assert.equal(r.merchant, 'Berghotel Grosse Scheidegg');
  assert.equal(r.total, 5450);
  assert.deepEqual(r.items, BERGHOTEL_ITEMS);
  assert.deepEqual(r.tax, { rate: 7.6, amount: 385, included: true });
});

test('real Vision output: Trader Joe\'s', () => {
  const r = parseReceiptText(VISION_TRADER_JOES);
  assert.equal(r.merchant, "TRADER JOE'S");
  assert.equal(r.date, '2026-10-14');
  assert.equal(r.total, 1490);
  assert.deepEqual(r.items.map((i) => [i.name, i.lineTotal]), [['BANANAS', 129], ['ORGANIC MILK', 449], ['SOURDOUGH BREAD', 798]]);
  assert.deepEqual(r.tax, { rate: 8.25, amount: 114, included: false });
  assert.ok(checkReceipt(r.items, r.total!, r.tax).ok);
});

test('real Vision output: Bäckerei Huber', () => {
  const r = parseReceiptText(VISION_BAECKEREI);
  assert.equal(r.merchant, 'Bäckerei Huber');
  assert.equal(r.date, '2026-10-12');
  assert.equal(r.currency, 'EUR');
  assert.equal(r.total, 1150);
  assert.deepEqual(r.items, [
    { name: 'Laugenbrezel', quantity: 1, unitPrice: 120, lineTotal: 120 },
    { name: 'Kaffee Crema', quantity: 2, unitPrice: 320, lineTotal: 640 },
    { name: 'Apfelstrudel', quantity: 1, unitPrice: 390, lineTotal: 390 },
  ]);
  assert.deepEqual(r.tax, { rate: 7, amount: 75, included: true });
});

// The same receipt read by Vision on the iOS simulator: the tax amount comes after the tax text.
const DEVICE_IOS_BERGHOTEL = ["Berghotel", "Grosse Scheidegg", "3818 Grindelwald", "Familie R. Müller", "30.07.2007/13:29:17", "Tisch 7/01", "Rech. Nr. 4572", "Bar", "2xLatte Macchiato à 4.50 CHF", "1xGloki à 5.00 CHF", "1xSchweinschnitzel à 22.00 CHF", "1xChässpätzli à 18.50 CHF", "Total :", "9.00", "5.00", "22.00", "18.50", "CHF 54.50", "Incl. 7.6% MwSt 54.50 CHF:", "Entspricht in Euro", "Es bediente Sie: Ursula", "MwSt Nr. : 430 234", "leL. :", "033 853 67 16", "3.85", "36.33 EUR"];

test('device iOS output: Berghotel tax amount from the prices column', () => {
  const r = parseReceiptText(DEVICE_IOS_BERGHOTEL);
  assert.equal(r.total, 5450);
  assert.deepEqual(r.items, BERGHOTEL_ITEMS);
  assert.deepEqual(r.tax, { rate: 7.6, amount: 385, included: true });
});

test('US grocery receipt: tax added on top, quantity on its own line', () => {
  const r = parseReceiptText([
    "TRADER JOE'S",
    '123 Main Street',
    'Springfield, IL 62701',
    'STORE #552 (217) 555-0100',
    'BANANAS 1.29',
    'ORGANIC MILK 4.49',
    'SOURDOUGH BREAD 7.98',
    '2 @ 3.99',
    'SUBTOTAL 13.76',
    'TAX 8.25% 1.14',
    'TOTAL 14.90',
    'VISA 14.90',
    'CHANGE 0.00',
    '10/14/2026 18:42',
  ]);
  assert.equal(r.merchant, "TRADER JOE'S");
  assert.equal(r.date, '2026-10-14');
  assert.equal(r.currency, null);
  assert.equal(r.total, 1490);
  assert.deepEqual(r.items, [
    { name: 'BANANAS', quantity: 1, unitPrice: 129, lineTotal: 129 },
    { name: 'ORGANIC MILK', quantity: 1, unitPrice: 449, lineTotal: 449 },
    { name: 'SOURDOUGH BREAD', quantity: 2, unitPrice: 399, lineTotal: 798 },
  ]);
  assert.deepEqual(r.tax, { rate: 8.25, amount: 114, included: false });
  assert.ok(checkReceipt(r.items, r.total!, r.tax).ok);
});

test('single-item café receipt: cash and change are not the total', () => {
  const r = parseReceiptText([
    'Café Sprüngli',
    'Bahnhofstrasse 21\n8001 Zürich',
    'Datum: 14.10.2026 09:12',
    '1 Cappuccino 6.20',
    'Total CHF 6.20',
    'Bar 10.00\nRückgeld 3.80',
  ]);
  assert.equal(r.merchant, 'Café Sprüngli');
  assert.equal(r.date, '2026-10-14');
  assert.equal(r.total, 620);
  assert.deepEqual(r.items, [{ name: 'Cappuccino', quantity: 1, unitPrice: 620, lineTotal: 620 }]);
  assert.equal(r.tax, null);
});

test('three different receipts give three different results', () => {
  const results = [BERGHOTEL_IOS, ['Café Sprüngli', '1 Cappuccino 6.20', 'Total CHF 6.20'], ['SHOP', 'A 1.00', 'B 2.00', 'TOTAL 3.00']].map(
    (t) => receiptToDraft(parseReceiptText(t)),
  );
  assert.deepEqual(
    results.map((d) => [d.merchant, d.amountCents, d.items.length]),
    [
      ['Berghotel Grosse Scheidegg', 5450, 4],
      ['Café Sprüngli', 620, 1],
      ['SHOP', 300, 2],
    ],
  );
});

test('a total that does not match the items is kept as printed, and flagged', () => {
  const r = parseReceiptText(['Corner Deli', 'Sandwich 8.50', 'Soda 2.00', 'Chips 1.50', 'TOTAL 13.00']);
  assert.equal(r.total, 1300);
  // The items (12.00) are kept for review, and both fields are marked so the user checks them.
  assert.deepEqual(r.items.map((i) => i.lineTotal), [850, 200, 150]);
  assert.equal(r.confidence?.total, 'low');
  assert.equal(r.confidence?.items, 'low');
});

test('dates in other formats', () => {
  assert.equal(parseReceiptText(['Shop', 'Oct 3, 2026', 'TOTAL 1.00']).date, '2026-10-03');
  assert.equal(parseReceiptText(['Shop', '3 Okt 2026', 'TOTAL 1.00']).date, '2026-10-03');
  assert.equal(parseReceiptText(['Shop', '2026-10-03', 'TOTAL 1.00']).date, '2026-10-03');
  assert.equal(parseReceiptText(['Shop', '31/12/2026', 'TOTAL 1.00']).date, '2026-12-31');
  assert.equal(parseReceiptText(['Shop', '31.02.2026', 'TOTAL 1.00']).date, null); // not a real day
});

test('European and Swiss number formats', () => {
  assert.equal(parseReceiptText(['Möbel Haus', 'Summe 1.234,50 €']).total, 123450);
  assert.equal(parseReceiptText(['Möbel Haus', 'Summe 1.234,50 €']).currency, 'EUR');
  assert.equal(parseReceiptText(['Uhren AG', "Total CHF 1'299.00"]).total, 129900);
});

test('no text or no amounts: nothing invented', () => {
  assert.deepEqual(parseReceiptText([]), {
    merchant: null,
    date: null,
    dateText: null,
    currency: null,
    total: null,
    tax: null,
    items: [],
    confidence: { total: 'none', items: 'none', merchant: 'none', date: 'none' },
  });
  const r = parseReceiptText(['Thank you for shopping']);
  assert.equal(r.total, null);
  assert.deepEqual(r.items, []);
});
