// Split-expense math. All amounts are integer cents. Pure functions: no React Native imports,
// tested with node --test.

export type SplitPerson = { name: string; paidCents: number };

export type PersonBalance = SplitPerson & {
  /** This person's fair share of the total. */
  shareCents: number;
  /** paid - share. Positive: is owed money. Negative: owes money. */
  netCents: number;
};

export type Transfer = { from: string; to: string; amountCents: number };

export type SplitResult = {
  totalCents: number;
  balances: PersonBalance[];
  transfers: Transfer[];
};

/**
 * Exact minimisation is exponential in the number of people with a non-zero balance, so above
 * this many it falls back to greedy matching (at most n-1 transfers, usually optimal).
 */
export const EXACT_LIMIT = 12;

/**
 * Splits the total equally. When the total doesn't divide evenly, the leftover cents (fewer
 * than the number of people) go one each to the first people in entry order, so nobody pays
 * more than 1 cent extra and results are deterministic.
 */
export function fairShares(totalCents: number, people: number): number[] {
  if (people <= 0) return [];
  const base = Math.floor(totalCents / people);
  const leftover = totalCents - base * people;
  return Array.from({ length: people }, (_, i) => (i < leftover ? base + 1 : base));
}

/** The total is what everyone paid combined; each person's net balance is paid minus fair share. */
export function computeBalances(people: SplitPerson[]): PersonBalance[] {
  const total = people.reduce((sum, p) => sum + p.paidCents, 0);
  const shares = fairShares(total, people.length);
  return people.map((p, i) => ({ ...p, shareCents: shares[i], netCents: p.paidCents - shares[i] }));
}

/**
 * Settlement plan with the fewest transfers. Transfers are ordered by payer, then payee, in the
 * order people were entered.
 */
export function computeSplit(people: SplitPerson[]): SplitResult {
  const balances = computeBalances(people);
  const totalCents = balances.reduce((sum, b) => sum + b.paidCents, 0);

  // Work on indices of people who are owed or owe something.
  const nonZero = balances.map((b, i) => i).filter((i) => balances[i].netCents !== 0);
  const groups =
    nonZero.length <= EXACT_LIMIT ? zeroSumGroups(nonZero.map((i) => balances[i].netCents)) : [nonZero.map((_, k) => k)];

  const transfers: { from: number; to: number; amountCents: number }[] = [];
  for (const group of groups) {
    transfers.push(...greedySettle(group.map((k) => nonZero[k]), balances));
  }
  transfers.sort((a, b) => a.from - b.from || a.to - b.to);

  return {
    totalCents,
    balances,
    transfers: transfers.map((t) => ({ from: people[t.from].name, to: people[t.to].name, amountCents: t.amountCents })),
  };
}

/**
 * Partitions balances (none zero, summing to zero) into the maximum number of zero-sum groups.
 * Each group of size k settles in k-1 transfers, so this minimises the total: n - groups.
 * dp[mask] = most zero-sum groups formable when the people in `mask` are removed one at a time;
 * every time the remaining set sums to zero, a group closes.
 */
function zeroSumGroups(nets: number[]): number[][] {
  const n = nets.length;
  if (n === 0) return [];
  const full = (1 << n) - 1;
  const sum = new Array<number>(1 << n).fill(0);
  const dp = new Array<number>(1 << n).fill(0);
  const removed = new Array<number>(1 << n).fill(-1);

  for (let mask = 1; mask <= full; mask++) {
    const low = Math.log2(mask & -mask);
    sum[mask] = sum[mask & (mask - 1)] + nets[low];
    let best = -1;
    for (let i = 0; i < n; i++) {
      if (!(mask & (1 << i))) continue;
      const prev = mask ^ (1 << i);
      if (dp[prev] > best) {
        best = dp[prev];
        removed[mask] = i; // lowest index wins ties, keeping results deterministic
      }
    }
    dp[mask] = best + (sum[mask] === 0 ? 1 : 0);
  }

  // Walk back from the full set; each zero-sum prefix boundary closes a group.
  const groups: number[][] = [];
  let current: number[] = [];
  let mask = full;
  while (mask) {
    const i = removed[mask];
    current.push(i);
    mask ^= 1 << i;
    if (sum[mask] === 0) {
      groups.push(current.sort((a, b) => a - b));
      current = [];
    }
  }
  return groups;
}

/**
 * Settles one zero-sum group: repeatedly match the largest debtor with the largest creditor.
 * For a group that can't be split further, this takes exactly size-1 transfers.
 */
function greedySettle(indices: number[], balances: PersonBalance[]) {
  const remaining = new Map(indices.map((i) => [i, balances[i].netCents]));
  const transfers: { from: number; to: number; amountCents: number }[] = [];
  const pick = (sign: 1 | -1) => {
    let best = -1;
    for (const [i, v] of remaining) {
      if (Math.sign(v) !== sign) continue;
      if (best === -1 || Math.abs(v) > Math.abs(remaining.get(best)!) || (Math.abs(v) === Math.abs(remaining.get(best)!) && i < best)) {
        best = i;
      }
    }
    return best;
  };

  for (;;) {
    const debtor = pick(-1);
    const creditor = pick(1);
    if (debtor === -1 || creditor === -1) break;
    const amount = Math.min(-remaining.get(debtor)!, remaining.get(creditor)!);
    transfers.push({ from: debtor, to: creditor, amountCents: amount });
    remaining.set(debtor, remaining.get(debtor)! + amount);
    remaining.set(creditor, remaining.get(creditor)! - amount);
    if (remaining.get(debtor) === 0) remaining.delete(debtor);
    if (remaining.get(creditor) === 0) remaining.delete(creditor);
  }
  return transfers;
}

export type SplitValidation = { ok: true } | { ok: false; errors: string[] };

export function validateSplit(people: SplitPerson[]): SplitValidation {
  const errors: string[] = [];
  if (people.length < 2) errors.push('Add at least two people.');
  const names = people.map((p) => p.name.trim().toLowerCase());
  if (names.some((n) => !n)) errors.push('Every person needs a name.');
  if (new Set(names.filter(Boolean)).size !== names.filter(Boolean).length) errors.push('Names must be unique.');
  if (people.some((p) => !Number.isSafeInteger(p.paidCents) || p.paidCents < 0)) {
    errors.push('Amounts paid must be zero or more.');
  }
  if (people.reduce((s, p) => s + p.paidCents, 0) <= 0) errors.push('Someone has to have paid something.');
  return errors.length ? { ok: false, errors } : { ok: true };
}
