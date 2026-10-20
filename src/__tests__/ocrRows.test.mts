import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import type { OcrLine } from '../../modules/receipt-ocr/types.ts';
import { linesToRows } from '../utils/ocrRows.ts';
import { checkReceipt } from '../utils/receiptMath.ts';
import { parseReceiptText } from '../utils/receiptTextParser.ts';

// Real Apple Vision lines (pixel boxes + angle, same maths as modules/receipt-ocr on iOS) for the
// three rendered test receipts, then Berghotel tilted 4° and Trader Joe's tilted -3°.
const [berghotel, traderJoes, baeckerei, berghotelTilted, traderJoesTilted] = readFileSync(
  new URL('./fixtures/vision-lines.jsonl', import.meta.url),
  'utf8',
)
  .trim()
  .split('\n')
  .map((l) => JSON.parse(l) as OcrLine[]);

const line = (text: string, x: number, y: number, width = 200, angle = 0): OcrLine => ({ text, x, y, width, height: 30, angle });

test('pieces of one printed row are joined left to right, rows top to bottom', () => {
  // Shuffled, like ML Kit's blocks.
  const rows = linesToRows([line('9.00', 900, 500, 80), line('Total', 70, 600), line('Latte', 70, 502), line('CHF 9.00', 850, 598, 130), line('Café', 400, 100)]);
  assert.deepEqual(rows, ['Café', 'Latte  9.00', 'Total  CHF 9.00']);
});

test('a tilted page is straightened before grouping rows', () => {
  // 4° clockwise: the right end of each row is ~63px lower than the left over 900px, more than
  // a line height, so without straightening "9.00" would join the next row.
  const t = Math.tan((4 * Math.PI) / 180);
  const at = (text: string, x: number, row: number, width = 200) => line(text, x, row * 50 + x * t, width, 4);
  const rows = linesToRows([at('Latte', 70, 10), at('9.00', 900, 10, 80), at('Gloki', 70, 11), at('5.00', 900, 11, 80), at('Total', 70, 12), at('14.00', 880, 12, 100)]);
  assert.deepEqual(rows, ['Latte  9.00', 'Gloki  5.00', 'Total  14.00']);
});

test('empty input', () => {
  assert.deepEqual(linesToRows([]), []);
});

for (const [name, lines, merchant, total, itemCount] of [
  ['Berghotel', berghotel, 'Berghotel Grosse Scheidegg', 5450, 4],
  ['Trader Joe’s', traderJoes, "TRADER JOE'S", 1490, 3],
  ['Bäckerei Huber', baeckerei, 'Bäckerei Huber', 1150, 3],
  ['Berghotel tilted 4°', berghotelTilted, 'Berghotel Grosse Scheidegg', 5450, 4],
  ['Trader Joe’s tilted -3°', traderJoesTilted, "TRADER JOE'S", 1490, 3],
] as const) {
  test(`real Vision lines end to end: ${name}`, () => {
    const r = parseReceiptText(linesToRows([...lines]));
    assert.equal(r.merchant, merchant);
    assert.equal(r.total, total);
    assert.equal(r.items.length, itemCount);
    assert.ok(checkReceipt(r.items, r.total!, r.tax).ok, 'items add up');
  });
}

test('Trader Joe’s rows: quantity line attaches to its item, tax added on top', () => {
  const r = parseReceiptText(linesToRows(traderJoes));
  assert.deepEqual(r.items[2], { name: 'SOURDOUGH BREAD', quantity: 2, unitPrice: 399, lineTotal: 798 });
  assert.deepEqual(r.tax, { rate: 8.25, amount: 114, included: false });
});

test('ML Kit style date with a space after the separator', () => {
  assert.equal(parseReceiptText(['Shop', '30.07. 2007/13:29:17', 'TOTAL 1.00']).date, '2007-07-30');
  assert.equal(parseReceiptText(['Shop', '10/14/ 2026 18:42', 'TOTAL 1.00']).date, '2026-10-14');
});

// Rows rebuilt on the Android emulator from Google ML Kit lines (logged by the app in dev) for the
// same three receipts. ML Kit returned these blocks scattered; the rows came out in order.
const mlkitRows = readFileSync(new URL('./fixtures/mlkit-rows.jsonl', import.meta.url), 'utf8')
  .trim()
  .split('\n')
  .map((l) => JSON.parse(l) as string[]);

for (const [i, [merchant, total, items]] of (
  [
    ['Berghotel Grosse Scheidegg', 5450, ['Latte Macchiato', 'Gloki', 'Schweinschnitzel', 'Chässpätzli']],
    ["TRADER JOE'S", 1490, ['BANANAS', 'ORGANIC MILK', 'SOURDOUGH BREAD']],
    ['Bäckerei Huber', 1150, ['Laugenbrezel', 'Kaffee Crema', 'Apfelstrudel']],
  ] as const
).entries()) {
  test(`real ML Kit rows (Android): ${merchant}`, () => {
    const r = parseReceiptText(mlkitRows[i]);
    assert.equal(r.merchant, merchant);
    assert.equal(r.total, total);
    assert.deepEqual(r.items.map((x) => x.name), items);
    assert.ok(checkReceipt(r.items, r.total!, r.tax).ok);
  });
}
