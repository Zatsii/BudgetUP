import type { SQLiteDatabase } from 'expo-sqlite';

import { nowIso } from '@/utils/dates';
import { newId } from '@/utils/id';

export type Budget = { id: string; month: string; limitCents: number; updatedAt: string };

type BudgetRow = { id: string; month: string; limit_cents: number; updated_at: string };

export async function getBudget(db: SQLiteDatabase, month: string): Promise<Budget | null> {
  const row = await db.getFirstAsync<BudgetRow>(
    'SELECT id, month, limit_cents, updated_at FROM budgets WHERE month = ? AND deleted_at IS NULL',
    month,
  );
  return row && { id: row.id, month: row.month, limitCents: row.limit_cents, updatedAt: row.updated_at };
}

/** Creates or updates the limit for a month (one budget row per month). */
export async function setBudgetLimit(db: SQLiteDatabase, month: string, limitCents: number): Promise<void> {
  const now = nowIso();
  await db.runAsync(
    `INSERT INTO budgets (id, month, limit_cents, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, NULL)
     ON CONFLICT (month) DO UPDATE SET
       limit_cents = excluded.limit_cents,
       updated_at  = excluded.updated_at,
       deleted_at  = NULL`,
    newId(),
    month,
    limitCents,
    now,
    now,
  );
}
