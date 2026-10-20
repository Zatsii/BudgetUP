import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isValidDateKey, monthRange, shiftMonth } from '../utils/dates.ts';

test('shifts months across year boundaries', () => {
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-10', 0), '2026-10');
});

test('computes month ranges including leap years', () => {
  assert.deepEqual(monthRange('2026-02'), { start: '2026-02-01', end: '2026-02-28' });
  assert.deepEqual(monthRange('2028-02'), { start: '2028-02-01', end: '2028-02-29' });
  assert.deepEqual(monthRange('2026-10'), { start: '2026-10-01', end: '2026-10-31' });
});

test('validates real calendar dates', () => {
  assert.ok(isValidDateKey('2026-10-18'));
  assert.ok(!isValidDateKey('2026-02-30'));
  assert.ok(!isValidDateKey('2026-13-01'));
  assert.ok(!isValidDateKey('2026-1-5'));
  assert.ok(!isValidDateKey('yesterday'));
});
