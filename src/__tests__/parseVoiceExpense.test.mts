import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseVoiceExpense } from '../utils/parseVoiceExpense.ts';

const cases: [string, number | null, string][] = [
  // The two examples from the spec
  ['coffee twelve dollars', 1200, 'Coffee'],
  ['groceries 45.50', 4550, 'Groceries'],
  // Digits as speech engines usually emit them
  ['coffee $12', 1200, 'Coffee'],
  ['Groceries $45.50', 4550, 'Groceries'],
  ['lunch 12 dollars', 1200, 'Lunch'],
  ['uber 1,250', 125000, 'Uber'],
  // Number words
  ['groceries forty five dollars and fifty cents', 4550, 'Groceries'],
  ['groceries forty-five fifty', 4550, 'Groceries'],
  ['parking twelve fifty', 1250, 'Parking'],
  ['rent one thousand two hundred dollars', 120000, 'Rent'],
  ['new shoes a hundred bucks', 10000, 'New shoes'],
  ['snack a dollar fifty', 150, 'Snack'],
  ['tip seventy five cents', 75, 'Tip'],
  ['gas twenty point five zero', 2050, 'Gas'],
  ['phone bill 3 dollars 99', 399, 'Phone bill'],
  // Any currency word or symbol: the number is kept, the currency dropped
  ['lunch twelve euros', 1200, 'Lunch'],
  ['twelve euros for lunch', 1200, 'Lunch'],
  ['taxi 8 pounds 50', 850, 'Taxi'],
  ['chai fifty rupees', 5000, 'Chai'],
  ['museum 25 francs', 2500, 'Museum'],
  ['croissant €3.20', 320, 'Croissant'],
  ['sandwich £4.50', 450, 'Sandwich'],
  // Amount first, filler words trimmed
  ['spent 30 dollars on dinner', 3000, 'Dinner'],
  ['twelve dollars for coffee and bagel', 1200, 'Coffee and bagel'],
  ['I paid nineteen ninety nine for a book', 1999, 'Book'],
  // No amount: description kept, amount left for the user
  ['coffee', null, 'Coffee'],
  ['', null, ''],
];

for (const [input, cents, description] of cases) {
  test(`"${input}"`, () => {
    const r = parseVoiceExpense(input);
    assert.equal(r.amountCents, cents, 'amount');
    assert.equal(r.description, description, 'description');
    assert.equal(r.transcript, input);
  });
}
