import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BERGHOTEL_RECEIPT, createMockReceiptParser } from '../utils/mockReceiptParser.ts';
import { receiptToDraft, type ParsedReceipt } from '../utils/receiptParser.ts';

const receipt = (r: Partial<ParsedReceipt>): ParsedReceipt => ({
  merchant: null,
  date: null,
  currency: null,
  total: null,
  tax: null,
  items: [],
  ...r,
});

test('the Berghotel fixture maps onto an expense draft', () => {
  assert.deepEqual(receiptToDraft(BERGHOTEL_RECEIPT), {
    amountCents: 5450,
    merchant: 'Berghotel Grosse Scheidegg',
    spentOn: '2007-07-30',
    currency: 'CHF',
    tax: { rate: 7.6, amount: 385, included: true },
    items: BERGHOTEL_RECEIPT.items,
    // The fixture carries no confidence, so everything found counts as certain.
    confidence: { total: 'high', items: 'high', merchant: 'high', date: 'high' },
  });
});

test('falls back to the sum of items only when no total was printed', () => {
  const items = [
    { name: 'Coffee', quantity: 1, unitPrice: 245, lineTotal: 245 },
    { name: 'Bagel', quantity: 2, unitPrice: 150, lineTotal: 300 },
  ];
  assert.equal(receiptToDraft(receipt({ items })).amountCents, 545);
  assert.equal(receiptToDraft(receipt({ items, total: 0 })).amountCents, 545);
  assert.equal(receiptToDraft(receipt({ items, total: 999 })).amountCents, 999, 'printed total wins, even if it disagrees');
});

test('drops malformed items, currency, dates and tax rates', () => {
  const d = receiptToDraft(
    receipt({
      currency: 'swiss francs',
      date: '2026-02-30',
      tax: { rate: 150, amount: 10, included: true },
      items: [
        { name: 'Ok', quantity: 1, unitPrice: 100, lineTotal: 100 },
        { name: '', quantity: 1, unitPrice: 100, lineTotal: 100 },
        { name: 'Zero qty', quantity: 0, unitPrice: 100, lineTotal: 0 },
        { name: 'Fractional cents', quantity: 1, unitPrice: 1.5, lineTotal: 1.5 },
      ],
    }),
  );
  assert.equal(d.currency, null);
  assert.equal(d.spentOn, null);
  assert.equal(d.tax, null);
  assert.deepEqual(d.items.map((i) => i.name), ['Ok']);
});

test('lowercase currency codes are normalised; no shop name is never guessed from an item', () => {
  assert.equal(receiptToDraft(receipt({ currency: 'eur' })).currency, 'EUR');
  const d = receiptToDraft(receipt({ items: [{ name: ' Parking ', quantity: 1, unitPrice: 800, lineTotal: 800 }] }));
  assert.equal(d.merchant, null);
  assert.equal(d.confidence.merchant, 'none');
});

test('mock parser returns the fixture, independent copies each time', async () => {
  const parser = createMockReceiptParser(0);
  assert.equal(parser.isMock, true);
  const a = await parser.parse({ uri: 'file:///a.jpg' });
  assert.deepEqual(a, BERGHOTEL_RECEIPT);
  a.items[0].quantity = 99;
  const b = await parser.parse({ uri: 'file:///b.jpg' });
  assert.equal(b.items[0].quantity, 2, 'mutating one result must not leak into the next');
});

test('mock parser can be cancelled', async () => {
  const parser = createMockReceiptParser(1000);
  const controller = new AbortController();
  const pending = parser.parse({ uri: 'file:///x.jpg' }, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, /aborted/);
});
