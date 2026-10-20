import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  findDuplicates,
  matchCategoryRule,
  normalizeMerchant,
  parseImportAmount,
  parseImportDate,
  parseImportPayload,
  UNKNOWN_MERCHANT,
  type PendingForDedup,
} from '../utils/imports.ts';

const NOW = new Date('2026-10-19T15:00:00Z');

test('amounts in the formats Shortcuts and banks send', () => {
  const cases: [string, number | null][] = [
    ['12.50', 1250],
    ['$12.50', 1250],
    ['CA$1,234.56', 123456],
    ['USD 12.5', 1250],
    ['12,50 €', 1250],
    ['1.234,56', 123456],
    ['7', 700],
    ['0', null],
    ['-12.50', null],
    ['($12.50)', null],
    ['abc', null],
    ['12.345', null],
    ['', null],
  ];
  for (const [input, cents] of cases) assert.equal(parseImportAmount(input), cents, input);
});

test('dates: ISO, plain day, Shortcuts style, missing, and out-of-range', () => {
  assert.equal(parseImportDate('2026-10-19T14:30:00Z', NOW), '2026-10-19T14:30:00.000Z');
  assert.equal(parseImportDate(undefined, NOW), NOW.toISOString());
  assert.equal(parseImportDate('  ', NOW), NOW.toISOString());
  const day = parseImportDate('2026-10-18', NOW)!;
  assert.equal(new Date(day).getDate(), 18, 'plain dates keep their local day');
  assert.ok(parseImportDate('Oct 19, 2026 at 9:45 AM', NOW), 'Shortcuts long format');
  assert.equal(parseImportDate('2026-02-30', NOW), null);
  assert.equal(parseImportDate('not a date', NOW), null);
  assert.equal(parseImportDate('2031-01-01', NOW), null, 'far future rejected');
  assert.equal(parseImportDate('2020-01-01', NOW), null, 'too old rejected');
});

test('payload: the deep-link example', () => {
  const r = parseImportPayload({ amount: '4.75', merchant: 'Tim Hortons #1234' }, 'ios-shortcut', NOW);
  assert.deepEqual(r, {
    ok: true,
    transaction: { amount: 475, merchant: 'Tim Hortons #1234', date: NOW.toISOString(), source: 'ios-shortcut', externalId: null },
  });
});

test('payload: missing merchant, repeated params, ids, errors', () => {
  const r = parseImportPayload({ amount: ['9.99', '1'], merchant: '   ', id: 'abc' }, 'server', NOW);
  assert.ok(r.ok);
  assert.equal(r.transaction.merchant, UNKNOWN_MERCHANT);
  assert.equal(r.transaction.amount, 999);
  assert.equal(r.transaction.externalId, 'abc');
  assert.deepEqual(parseImportPayload({ merchant: 'X' }, 'test', NOW), {
    ok: false,
    error: 'The link didn’t include a valid amount.',
  });
  assert.equal(parseImportPayload({ amount: '5', date: 'garbage' }, 'test', NOW).ok, false);
  const long = parseImportPayload({ amount: '1', merchant: 'x'.repeat(500) }, 'test', NOW);
  assert.ok(long.ok && long.transaction.merchant.length === 120);
});

test('merchant normalization strips store numbers and punctuation', () => {
  assert.equal(normalizeMerchant('TIM HORTONS #1234'), 'tim hortons');
  assert.equal(normalizeMerchant('Tim Hortons'), 'tim hortons');
  assert.equal(normalizeMerchant("McDonald's 00451 Toronto"), 'mcdonald s toronto');
  assert.equal(normalizeMerchant('SQ *BLUE BOTTLE'), 'sq blue bottle');
});

test('category rules: whole words, longest match wins', () => {
  const rules = [
    { id: '1', pattern: 'Tim Hortons', category: 'Food' },
    { id: '2', pattern: 'Shell', category: 'Transport' },
    { id: '3', pattern: 'Amazon', category: 'Shopping' },
    { id: '4', pattern: 'Amazon Prime Video', category: 'Fun' },
  ];
  assert.equal(matchCategoryRule('TIM HORTONS #1234', rules)?.category, 'Food');
  assert.equal(matchCategoryRule('Shell Canada', rules)?.category, 'Transport');
  assert.equal(matchCategoryRule('Shellfish Shack', rules), null, 'no partial-word match');
  assert.equal(matchCategoryRule('AMAZON PRIME VIDEO', rules)?.category, 'Fun');
  assert.equal(matchCategoryRule('Amazon.ca', rules)?.category, 'Shopping');
  assert.equal(matchCategoryRule('Starbucks', rules), null);
});

const p = (id: string, amountCents: number, merchant: string, occurredAt: string): PendingForDedup => ({
  id,
  amountCents,
  merchant,
  occurredAt,
  createdAt: occurredAt,
});

test('duplicates: same amount + merchant within the window flags the later item', () => {
  const flags = findDuplicates(
    [
      p('b', 475, 'Tim Hortons', '2026-10-19T14:05:00Z'),
      p('a', 475, 'TIM HORTONS #12', '2026-10-19T14:00:00Z'),
      p('c', 475, 'Tim Hortons', '2026-10-19T15:00:00Z'), // outside 15 min of b
      p('d', 500, 'Tim Hortons', '2026-10-19T14:06:00Z'), // different amount
      p('e', 475, 'Starbucks', '2026-10-19T14:06:00Z'), // different merchant
    ],
    [],
  );
  assert.deepEqual(flags.get('b'), { kind: 'pending', otherId: 'a', minutesApart: 5 });
  assert.equal(flags.has('a'), false);
  assert.equal(flags.has('c'), false);
  assert.equal(flags.has('d'), false);
  assert.equal(flags.has('e'), false);
});

test('duplicates: matches an existing expense on the same day', () => {
  const at = new Date(2026, 9, 19, 9, 30).toISOString(); // local 9:30 on Oct 19
  const flags = findDuplicates(
    [p('x', 1200, 'Shell Canada 0042', at), p('y', 1200, 'Shell', new Date(2026, 9, 20, 9).toISOString())],
    [{ id: 'exp1', amountCents: 1200, description: 'Shell', spentOn: '2026-10-19' }],
  );
  assert.deepEqual(flags.get('x'), { kind: 'expense', otherId: 'exp1', description: 'Shell' });
  assert.equal(flags.has('y'), false, 'different day');
});
