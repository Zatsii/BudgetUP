import type { SQLiteDatabase } from 'expo-sqlite';

import { nowIso } from '@/utils/dates';
import { newId } from '@/utils/id';
import type { CategoryRule } from '@/utils/imports';

export async function listCategoryRules(db: SQLiteDatabase): Promise<CategoryRule[]> {
  return db.getAllAsync<CategoryRule>(
    `SELECT id, pattern, category FROM category_rules
     WHERE deleted_at IS NULL ORDER BY pattern COLLATE NOCASE`,
  );
}

export async function addCategoryRule(db: SQLiteDatabase, pattern: string, category: string): Promise<void> {
  const now = nowIso();
  await db.runAsync(
    'INSERT INTO category_rules (id, pattern, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    newId(),
    pattern.trim(),
    category.trim(),
    now,
    now,
  );
}

export async function updateCategoryRule(db: SQLiteDatabase, id: string, pattern: string, category: string) {
  await db.runAsync(
    'UPDATE category_rules SET pattern = ?, category = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
    pattern.trim(),
    category.trim(),
    nowIso(),
    id,
  );
}

export async function deleteCategoryRule(db: SQLiteDatabase, id: string): Promise<void> {
  const now = nowIso();
  await db.runAsync('UPDATE category_rules SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, id);
}
