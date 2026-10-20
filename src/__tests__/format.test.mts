import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatAmount } from '../utils/format.ts';

test('amounts are plain numbers with thousands separators and two decimals', () => {
  assert.equal(formatAmount(123450), '1,234.50');
  assert.equal(formatAmount(5450), '54.50');
  assert.equal(formatAmount(7), '0.07');
  assert.equal(formatAmount(0), '0.00');
  assert.equal(formatAmount(100000000), '1,000,000.00');
  assert.equal(formatAmount(-385), '-3.85');
});

test('no currency symbol or code', () => {
  assert.doesNotMatch(formatAmount(123450), /[^\d.,-]/);
});
