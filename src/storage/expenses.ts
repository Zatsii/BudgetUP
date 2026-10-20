import type { SQLiteDatabase } from 'expo-sqlite';

import { monthRange, nowIso } from '@/utils/dates';
import { newId } from '@/utils/id';
import type { ReceiptItem, ReceiptTax } from '@/utils/receiptParser';

/** Details captured from a scanned receipt. */
export type ReceiptDetails = {
  merchant: string | null;
  /** ISO 4217 code if the receipt printed one. Stored for later; not displayed or converted. */
  currency: string | null;
  tax: ReceiptTax | null;
  items: ReceiptItem[];
};

export type Expense = {
  id: string;
  amountCents: number;
  description: string;
  category: string | null;
  spentOn: string;
  /** ISO 4217 as stored (the column default when no receipt said otherwise). Not displayed yet. */
  currency: string;
  merchant: string | null;
  tax: ReceiptTax | null;
  /** Receipt photo path relative to the documents directory (native only); see receiptImages.ts. */
  receiptImagePath: string | null;
  updatedAt: string;
};

export type ExpenseInput = Pick<Expense, 'amountCents' | 'description' | 'category' | 'spentOn'> & {
  receiptImagePath?: string | null;
  /**
   * Receipt details and line items. On update: undefined leaves them unchanged, null removes
   * them (the expense becomes a plain one), an object replaces them.
   */
  receipt?: ReceiptDetails | null;
};

type ExpenseRow = {
  id: string;
  amount_cents: number;
  description: string;
  category: string | null;
  spent_on: string;
  currency: string;
  merchant: string | null;
  tax_included: number | null;
  tax_rate: number | null;
  tax_cents: number | null;
  receipt_image_path: string | null;
  updated_at: string;
};

const COLUMNS =
  'id, amount_cents, description, category, spent_on, currency, merchant, tax_included, tax_rate, tax_cents, receipt_image_path, updated_at';

function fromRow(r: ExpenseRow): Expense {
  return {
    id: r.id,
    amountCents: r.amount_cents,
    description: r.description,
    category: r.category,
    spentOn: r.spent_on,
    currency: r.currency,
    merchant: r.merchant,
    tax:
      r.tax_included === null && r.tax_rate === null && r.tax_cents === null
        ? null
        : { included: r.tax_included === 1, rate: r.tax_rate, amount: r.tax_cents },
    receiptImagePath: r.receipt_image_path,
    updatedAt: r.updated_at,
  };
}

function normalizeCategory(category: string | null): string | null {
  return category?.trim() || null;
}

export async function listExpensesForMonth(db: SQLiteDatabase, month: string): Promise<Expense[]> {
  const { start, end } = monthRange(month);
  const rows = await db.getAllAsync<ExpenseRow>(
    `SELECT ${COLUMNS} FROM expenses
     WHERE spent_on BETWEEN ? AND ? AND deleted_at IS NULL
     ORDER BY spent_on DESC, created_at DESC`,
    start,
    end,
  );
  return rows.map(fromRow);
}

/** Expenses with spent_on in [start, end] (inclusive 'YYYY-MM-DD'), e.g. for duplicate checks. */
export async function listExpensesBetween(db: SQLiteDatabase, start: string, end: string): Promise<Expense[]> {
  const rows = await db.getAllAsync<ExpenseRow>(
    `SELECT ${COLUMNS} FROM expenses WHERE spent_on BETWEEN ? AND ? AND deleted_at IS NULL`,
    start,
    end,
  );
  return rows.map(fromRow);
}

export async function getExpense(db: SQLiteDatabase, id: string): Promise<Expense | null> {
  const row = await db.getFirstAsync<ExpenseRow>(
    `SELECT ${COLUMNS} FROM expenses WHERE id = ? AND deleted_at IS NULL`,
    id,
  );
  return row && fromRow(row);
}

/** Line items for the given expenses, in receipt order, keyed by expense id. */
export async function listReceiptItems(db: SQLiteDatabase, expenseIds: string[]): Promise<Map<string, ReceiptItem[]>> {
  const byExpense = new Map<string, ReceiptItem[]>();
  if (expenseIds.length === 0) return byExpense;
  const rows = await db.getAllAsync<{
    expense_id: string;
    name: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>(
    `SELECT expense_id, name, quantity, unit_price, line_total FROM receipt_items
     WHERE expense_id IN (${expenseIds.map(() => '?').join(',')}) AND deleted_at IS NULL
     ORDER BY expense_id, position`,
    ...expenseIds,
  );
  for (const r of rows) {
    const list = byExpense.get(r.expense_id) ?? [];
    list.push({ name: r.name, quantity: r.quantity, unitPrice: r.unit_price, lineTotal: r.line_total });
    byExpense.set(r.expense_id, list);
  }
  return byExpense;
}

/** Year of the oldest expense, or null if there are none. Bounds the month picker. */
export async function getEarliestExpenseYear(db: SQLiteDatabase): Promise<number | null> {
  const row = await db.getFirstAsync<{ first: string | null }>(
    'SELECT MIN(spent_on) AS first FROM expenses WHERE deleted_at IS NULL',
  );
  return row?.first ? Number(row.first.slice(0, 4)) : null;
}

/** Distinct categories used before, most recent first, for suggestion chips. */
export async function listRecentCategories(db: SQLiteDatabase, limit = 8): Promise<string[]> {
  const rows = await db.getAllAsync<{ category: string }>(
    `SELECT category FROM expenses
     WHERE category IS NOT NULL AND deleted_at IS NULL
     GROUP BY category ORDER BY MAX(updated_at) DESC LIMIT ?`,
    limit,
  );
  return rows.map((r) => r.category);
}

function receiptColumns(receipt: ReceiptDetails | null) {
  return {
    merchant: receipt?.merchant?.trim() || null,
    currency: receipt?.currency ?? null,
    taxIncluded: receipt?.tax ? (receipt.tax.included ? 1 : 0) : null,
    taxRate: receipt?.tax?.rate ?? null,
    taxCents: receipt?.tax?.amount ?? null,
  };
}

/** Soft-deletes the current items and inserts `items`, preserving receipt order. */
async function replaceReceiptItems(db: SQLiteDatabase, expenseId: string, items: ReceiptItem[], now: string) {
  await db.runAsync(
    'UPDATE receipt_items SET deleted_at = ?, updated_at = ? WHERE expense_id = ? AND deleted_at IS NULL',
    now,
    now,
    expenseId,
  );
  for (const [position, item] of items.entries()) {
    await db.runAsync(
      `INSERT INTO receipt_items (id, expense_id, name, quantity, unit_price, line_total, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      newId(),
      expenseId,
      item.name.trim(),
      item.quantity,
      item.unitPrice,
      item.lineTotal,
      position,
      now,
      now,
    );
  }
}

export async function addExpense(db: SQLiteDatabase, input: ExpenseInput): Promise<string> {
  const id = newId();
  const now = nowIso();
  const r = receiptColumns(input.receipt ?? null);
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO expenses (id, amount_cents, description, category, spent_on, merchant,
         tax_included, tax_rate, tax_cents, receipt_image_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.amountCents,
      input.description.trim(),
      normalizeCategory(input.category),
      input.spentOn,
      r.merchant,
      r.taxIncluded,
      r.taxRate,
      r.taxCents,
      input.receiptImagePath ?? null,
      now,
      now,
    );
    // Without a printed currency the column keeps its schema default.
    if (r.currency) await db.runAsync('UPDATE expenses SET currency = ? WHERE id = ?', r.currency, id);
    if (input.receipt?.items.length) await replaceReceiptItems(db, id, input.receipt.items, now);
  });
  return id;
}

export async function updateExpense(db: SQLiteDatabase, id: string, input: ExpenseInput): Promise<void> {
  const now = nowIso();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE expenses
       SET amount_cents = ?, description = ?, category = ?, spent_on = ?, receipt_image_path = ?, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`,
      input.amountCents,
      input.description.trim(),
      normalizeCategory(input.category),
      input.spentOn,
      input.receiptImagePath ?? null,
      now,
      id,
    );
    if (input.receipt === undefined) return; // receipt details unchanged
    const r = receiptColumns(input.receipt);
    await db.runAsync(
      'UPDATE expenses SET currency = COALESCE(?, currency), merchant = ?, tax_included = ?, tax_rate = ?, tax_cents = ? WHERE id = ?',
      r.currency,
      r.merchant,
      r.taxIncluded,
      r.taxRate,
      r.taxCents,
      id,
    );
    await replaceReceiptItems(db, id, input.receipt?.items ?? [], now);
  });
}

/** Soft delete: keeps a tombstone so a future sync can propagate the deletion. */
export async function deleteExpense(db: SQLiteDatabase, id: string): Promise<void> {
  const now = nowIso();
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE expenses SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, id);
    await db.runAsync(
      'UPDATE receipt_items SET deleted_at = ?, updated_at = ? WHERE expense_id = ? AND deleted_at IS NULL',
      now,
      now,
      id,
    );
  });
}
