import type { SQLiteDatabase } from 'expo-sqlite';

import { nowIso } from '@/utils/dates';
import { newId } from '@/utils/id';
import type { SplitPerson } from '@/utils/settlement';

export type SplitGroupSummary = {
  id: string;
  title: string;
  totalCents: number;
  peopleCount: number;
  createdAt: string;
};

export type SplitGroup = Omit<SplitGroupSummary, 'peopleCount'> & { people: SplitPerson[] };

export async function listSplitGroups(db: SQLiteDatabase): Promise<SplitGroupSummary[]> {
  const rows = await db.getAllAsync<{
    id: string;
    title: string;
    total_cents: number;
    created_at: string;
    people_count: number;
  }>(
    `SELECT g.id, g.title, g.total_cents, g.created_at,
            (SELECT COUNT(*) FROM split_participants p
              WHERE p.group_id = g.id AND p.deleted_at IS NULL) AS people_count
     FROM split_groups g
     WHERE g.deleted_at IS NULL
     ORDER BY g.created_at DESC`,
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    totalCents: r.total_cents,
    peopleCount: r.people_count,
    createdAt: r.created_at,
  }));
}

export async function getSplitGroup(db: SQLiteDatabase, id: string): Promise<SplitGroup | null> {
  const group = await db.getFirstAsync<{ id: string; title: string; total_cents: number; created_at: string }>(
    'SELECT id, title, total_cents, created_at FROM split_groups WHERE id = ? AND deleted_at IS NULL',
    id,
  );
  if (!group) return null;
  const people = await db.getAllAsync<{ name: string; paid_cents: number }>(
    `SELECT name, paid_cents FROM split_participants
     WHERE group_id = ? AND deleted_at IS NULL ORDER BY position`,
    id,
  );
  return {
    id: group.id,
    title: group.title,
    totalCents: group.total_cents,
    createdAt: group.created_at,
    // Order matters: the first person absorbs leftover cents, so reload in entry order.
    people: people.map((p) => ({ name: p.name, paidCents: p.paid_cents })),
  };
}

/** Saves a group and its participants atomically. */
export async function saveSplitGroup(db: SQLiteDatabase, title: string, people: SplitPerson[]): Promise<string> {
  const id = newId();
  const now = nowIso();
  const total = people.reduce((s, p) => s + p.paidCents, 0);
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'INSERT INTO split_groups (id, title, total_cents, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      id,
      title.trim(),
      total,
      now,
      now,
    );
    for (const [position, p] of people.entries()) {
      await db.runAsync(
        `INSERT INTO split_participants (id, group_id, name, paid_cents, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        newId(),
        id,
        p.name.trim(),
        p.paidCents,
        position,
        now,
        now,
      );
    }
  });
  return id;
}

/** Soft-deletes a group and its participants so a future sync can propagate the deletion. */
export async function deleteSplitGroup(db: SQLiteDatabase, id: string): Promise<void> {
  const now = nowIso();
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE split_groups SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, id);
    await db.runAsync(
      'UPDATE split_participants SET deleted_at = ?, updated_at = ? WHERE group_id = ? AND deleted_at IS NULL',
      now,
      now,
      id,
    );
  });
}
