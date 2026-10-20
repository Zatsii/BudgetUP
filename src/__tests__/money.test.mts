import assert from 'node:assert/strict';
import { test } from 'node:test';

import { centsToInputString, parseAmountToCents, parseNonNegativeCents } from '../utils/money.ts';

test('non-negative parsing treats blank and zero as 0', () => {
  for (const zero of ['', '  ', '0', '0.00', '.0']) assert.equal(parseNonNegativeCents(zero), 0, `"${zero}"`);
  assert.equal(parseNonNegativeCents('12.5'), 1250);
  assert.equal(parseNonNegativeCents('-3'), null);
  assert.equal(parseNonNegativeCents('abc'), null);
});

test('parses whole and decimal amounts into cents', () => {
  assert.equal(parseAmountToCents('12'), 1200);
  assert.equal(parseAmountToCents('45.50'), 4550);
  assert.equal(parseAmountToCents('45.5'), 4550);
  assert.equal(parseAmountToCents('0.07'), 7);
  assert.equal(parseAmountToCents('.5'), 50);
  assert.equal(parseAmountToCents(' 1,234.56 '), 123456);
  assert.equal(parseAmountToCents('€12.50'), 1250); // a pasted symbol is ignored
});

test('avoids floating-point drift', () => {
  // 0.1 + 0.2 style errors: 19.99 * 100 === 1998.9999999999998 in floats
  assert.equal(parseAmountToCents('19.99'), 1999);
  assert.equal(parseAmountToCents('1.005'), null); // more than 2 decimals is rejected, not rounded
});

test('rejects invalid or non-positive input', () => {
  for (const bad of ['', 'abc', '0', '0.00', '-5', '1.2.3', '12abc', '.']) {
    assert.equal(parseAmountToCents(bad), null, `expected null for "${bad}"`);
  }
});

test('formats cents for input fields', () => {
  assert.equal(centsToInputString(1250), '12.50');
  assert.equal(centsToInputString(7), '0.07');
});
