import type { SQLiteDatabase } from 'expo-sqlite';

import { notifyPendingChanged } from '@/storage/pendingCount';
import { nowIso, toDateKey } from '@/utils/dates';
import { newId } from '@/utils/id';
import type { ImportedTransaction, ImportSource } from '@/utils/imports';

export type PendingTransaction = {
  id: string;
  amountCents: number;
  merchant: string;
  occurredAt: string;
  source: ImportSource;
  /** User override; null means "use the matching category rule". */
  category: string | null;
  createdAt: string;
};

type Row = {
  id: string;
  amount_cents: number;
  merchant: string;
  occurred_at: string;
  source: ImportSource;
  category: string | null;
  created_at: string;
};

const fromRow = (r: Row): PendingTransaction => ({
  id: r.id,
  amountCents: r.amount_cents,
  merchant: r.merchant,
  occurredAt: r.occurred_at,
  source: r.source,
  category: r.category,
  createdAt: r.created_at,
});

const COLUMNS = 'id, amount_cents, merchant, occurred_at, source, category, created_at';

/**
 * Adds an imported transaction to the inbox. A transaction with an externalId already seen from
 * the same source is ignored (server re-delivery); everything else is kept and duplicates are
 * flagged for the user rather than silently dropped. Returns the new id, or null if ignored.
 */
export async function addPendingTransaction(db: SQLiteDatabase, t: ImportedTransaction): Promise<string | null> {
  const id = newId();
  const now = nowIso();
  const result = await db.runAsync(
    `INSERT OR IGNORE INTO pending_transactions
       (id, amount_cents, merchant, occurred_at, source, external_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    t.amount,
    t.merchant,
    t.date,
    t.source,
    t.externalId ?? null,
    now,
    now,
  );
  notifyPendingChanged(db);
  return result.changes > 0 ? id : null;
}

export async function listPendingTransactions(db: SQLiteDatabase): Promise<PendingTransaction[]> {
  const rows = await db.getAllAsync<Row>(
    `SELECT ${COLUMNS} FROM pending_transactions
     WHERE status = 'pending' AND deleted_at IS NULL
     ORDER BY occurred_at DESC, created_at DESC`,
  );
  return rows.map(fromRow);
}

export async function getPendingTransaction(db: SQLiteDatabase, id: string): Promise<PendingTransaction | null> {
  const row = await db.getFirstAsync<Row>(
    `SELECT ${COLUMNS} FROM pending_transactions WHERE id = ? AND status = 'pending' AND deleted_at IS NULL`,
    id,
  );
  return row && fromRow(row);
}

export type ApprovalInput = {
  amountCents: number;
  description: string;
  category: string | null;
  spentOn: string;
};

/**
 * Turns a pending item into a real expense, atomically: only now does it count toward the budget.
 */
export async function approvePendingTransaction(db: SQLiteDatabase, id: string, input: ApprovalInput): Promise<void> {
  const expenseId = newId();
  const now = nowIso();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO expenses (id, amount_cents, description, category, spent_on, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      expenseId,
      input.amountCents,
      input.description.trim(),
      input.category?.trim() || null,
      input.spentOn,
      now,
      now,
    );
    await db.runAsync(
      `UPDATE pending_transactions SET status = 'approved', expense_id = ?, updated_at = ?
       WHERE id = ? AND status = 'pending'`,
      expenseId,
      now,
      id,
    );
  });
  notifyPendingChanged(db);
}

/** Discarded items are kept (status only) so a later sync knows they were reviewed. */
export async function discardPendingTransaction(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync(
    "UPDATE pending_transactions SET status = 'discarded', updated_at = ? WHERE id = ? AND status = 'pending'",
    nowIso(),
    id,
  );
  notifyPendingChanged(db);
}

/** Puts a discarded item back in the inbox (undo). */
export async function restorePendingTransaction(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync(
    "UPDATE pending_transactions SET status = 'pending', updated_at = ? WHERE id = ? AND status = 'discarded'",
    nowIso(),
    id,
  );
  notifyPendingChanged(db);
}

/** Local calendar day of an import, for the expense's spent_on. */
export function pendingSpentOn(p: Pick<PendingTransaction, 'occurredAt'>): string {
  return toDateKey(new Date(p.occurredAt));
}
