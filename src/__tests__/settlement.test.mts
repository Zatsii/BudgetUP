import assert from 'node:assert/strict';
import { test } from 'node:test';

import { computeSplit, EXACT_LIMIT, fairShares, validateSplit, type SplitPerson } from '../utils/settlement.ts';

const people = (...entries: [string, number][]): SplitPerson[] =>
  entries.map(([name, paidCents]) => ({ name, paidCents }));

/** Invariants every split must satisfy. */
function assertSettles(input: SplitPerson[]) {
  const result = computeSplit(input);
  const total = input.reduce((s, p) => s + p.paidCents, 0);
  assert.equal(result.totalCents, total);
  assert.equal(result.balances.reduce((s, b) => s + b.shareCents, 0), total, 'shares add up to the total');
  assert.equal(result.balances.reduce((s, b) => s + b.netCents, 0), 0, 'net balances sum to zero');
  const shares = result.balances.map((b) => b.shareCents);
  assert.ok(Math.max(...shares) - Math.min(...shares) <= 1, 'nobody pays more than 1 cent extra');

  // Applying the transfers must zero everyone out.
  const remaining = new Map(result.balances.map((b) => [b.name, b.netCents]));
  for (const t of result.transfers) {
    assert.ok(Number.isInteger(t.amountCents) && t.amountCents > 0, 'positive whole-cent transfer');
    assert.notEqual(t.from, t.to);
    remaining.set(t.from, remaining.get(t.from)! + t.amountCents);
    remaining.set(t.to, remaining.get(t.to)! - t.amountCents);
  }
  for (const [name, v] of remaining) assert.equal(v, 0, `${name} is settled`);

  const nonZero = result.balances.filter((b) => b.netCents !== 0).length;
  assert.ok(result.transfers.length <= Math.max(0, nonZero - 1), 'at most n-1 transfers');
  return result;
}

test('spec example: 6000 split three ways', () => {
  // Amounts in cents: $6000 total, A paid $5000, B $1000, C $0.
  const r = assertSettles(people(['A', 500000], ['B', 100000], ['C', 0]));
  assert.equal(r.totalCents, 600000);
  assert.deepEqual(r.balances.map((b) => b.shareCents), [200000, 200000, 200000]);
  assert.deepEqual(r.balances.map((b) => b.netCents), [300000, -100000, -200000]);
  assert.deepEqual(r.transfers, [
    { from: 'B', to: 'A', amountCents: 100000 },
    { from: 'C', to: 'A', amountCents: 200000 },
  ]);
});

test('already even split needs no transfers', () => {
  const r = assertSettles(people(['A', 2500], ['B', 2500], ['C', 2500], ['D', 2500]));
  assert.deepEqual(r.transfers, []);
  assert.ok(r.balances.every((b) => b.netCents === 0));
});

test('four people, two creditors and two debtors', () => {
  // Total $200, share $50: A +70, B +10, C -50, D -30
  const r = assertSettles(people(['A', 12000], ['B', 6000], ['C', 0], ['D', 2000]));
  assert.deepEqual(r.balances.map((b) => b.netCents), [7000, 1000, -5000, -3000]);
  assert.equal(r.transfers.length, 3);
  assert.deepEqual(r.transfers, [
    { from: 'C', to: 'A', amountCents: 5000 },
    { from: 'D', to: 'A', amountCents: 2000 },
    { from: 'D', to: 'B', amountCents: 1000 },
  ]);
});

test('finds fewer transfers than greedy when a subgroup cancels out', () => {
  // Share $24. Nets: A +30, B -12, C +24, D -24, E -18.
  // Greedy (largest debtor -> largest creditor) needs 4; C and D cancel, so 3 is optimal.
  const r = assertSettles(people(['A', 5400], ['B', 1200], ['C', 4800], ['D', 0], ['E', 600]));
  assert.deepEqual(r.transfers, [
    { from: 'B', to: 'A', amountCents: 1200 },
    { from: 'D', to: 'C', amountCents: 2400 },
    { from: 'E', to: 'A', amountCents: 1800 },
  ]);
});

test('leftover cents go one each to the first people, deterministically', () => {
  assert.deepEqual(fairShares(1000, 3), [334, 333, 333]);
  assert.deepEqual(fairShares(1001, 4), [251, 250, 250, 250]);
  assert.deepEqual(fairShares(1003, 4), [251, 251, 251, 250]);
  assert.deepEqual(fairShares(5, 7), [1, 1, 1, 1, 1, 0, 0]);
  const r = assertSettles(people(['A', 1000], ['B', 0], ['C', 0]));
  assert.deepEqual(r.balances.map((b) => b.netCents), [666, -333, -333]);
  // Same input, same output.
  assert.deepEqual(computeSplit(people(['A', 1000], ['B', 0], ['C', 0])), r);
});

test('one person paid everything for a large group', () => {
  const group = people(['Host', 1200000], ...Array.from({ length: 11 }, (_, i): [string, number] => [`Guest ${i + 1}`, 0]));
  const r = assertSettles(group);
  assert.equal(r.transfers.length, 11);
  assert.ok(r.transfers.every((t) => t.to === 'Host' && t.amountCents === 100000));
});

test('random groups always settle, including above the exact-search limit', () => {
  let seed = 42;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let trial = 0; trial < 300; trial++) {
    const n = 2 + Math.floor(rand() * (trial < 250 ? 10 : EXACT_LIMIT + 6));
    const group = Array.from({ length: n }, (_, i) => ({
      name: `P${i}`,
      paidCents: rand() < 0.3 ? 0 : Math.floor(rand() * 50000),
    }));
    if (group.every((p) => p.paidCents === 0)) group[0].paidCents = 1;
    assertSettles(group);
  }
});

test('validation', () => {
  assert.deepEqual(validateSplit(people(['A', 100], ['B', 0])), { ok: true });
  const bad = (p: SplitPerson[]) => {
    const v = validateSplit(p);
    return v.ok ? [] : v.errors;
  };
  assert.ok(bad(people(['A', 100])).includes('Add at least two people.'));
  assert.ok(bad(people(['A', 100], [' ', 0])).includes('Every person needs a name.'));
  assert.ok(bad(people(['Sam', 100], ['sam ', 0])).includes('Names must be unique.'));
  assert.ok(bad(people(['A', 0], ['B', 0])).includes('Someone has to have paid something.'));
  assert.ok(bad(people(['A', -5], ['B', 10])).includes('Amounts paid must be zero or more.'));
});
