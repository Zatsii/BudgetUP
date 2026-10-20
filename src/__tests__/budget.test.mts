import assert from 'node:assert/strict';
import { test } from 'node:test';

import { budgetStatus, totalsByCategory, UNCATEGORIZED } from '../utils/budget.ts';

test('status thresholds: yellow above 70%, red above 100%', () => {
  assert.equal(budgetStatus(0, 1000), 'good');
  assert.equal(budgetStatus(700, 1000), 'good'); // exactly 70% is not "above"
  assert.equal(budgetStatus(701, 1000), 'warning');
  assert.equal(budgetStatus(1000, 1000), 'warning'); // exactly 100% is not "above"
  assert.equal(budgetStatus(1001, 1000), 'over');
});

test('groups by category, folds blanks into Uncategorized, sorts largest first', () => {
  const totals = totalsByCategory([
    { category: 'Food', amountCents: 500 },
    { category: null, amountCents: 300 },
    { category: 'Food', amountCents: 250 },
    { category: '  ', amountCents: 100 },
    { category: 'Bills', amountCents: 2000 },
  ]);
  assert.deepEqual(totals, [
    { category: 'Bills', totalCents: 2000 },
    { category: 'Food', totalCents: 750 },
    { category: UNCATEGORIZED, totalCents: 400 },
  ]);
});
