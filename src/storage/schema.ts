import type { SQLiteDatabase } from 'expo-sqlite';

/*
 * Sync-ready conventions, applied to every table:
 *  - `id` is a client-generated UUID (TEXT), never an autoincrement integer.
 *  - `created_at` / `updated_at` are UTC ISO-8601 strings; every write bumps `updated_at`.
 *  - Deletes are soft (`deleted_at` tombstone) so a future sync can propagate them.
 *    Every read must filter `deleted_at IS NULL`.
 *  - Money is INTEGER cents.
 */

const MIGRATIONS: string[] = [
  // v1: initial schema
  `
  CREATE TABLE budgets (
    id          TEXT PRIMARY KEY NOT NULL,
    month       TEXT NOT NULL UNIQUE,              -- 'YYYY-MM'
    limit_cents INTEGER NOT NULL CHECK (limit_cents >= 0),
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT
  );

  CREATE TABLE expenses (
    id           TEXT PRIMARY KEY NOT NULL,
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    description  TEXT NOT NULL,
    category     TEXT,                              -- NULL = uncategorized
    spent_on     TEXT NOT NULL,                     -- 'YYYY-MM-DD', local date
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    deleted_at   TEXT
  );
  CREATE INDEX idx_expenses_spent_on ON expenses (spent_on);
  CREATE INDEX idx_expenses_updated_at ON expenses (updated_at);

  CREATE TABLE split_groups (
    id          TEXT PRIMARY KEY NOT NULL,
    title       TEXT NOT NULL,
    total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT
  );

  CREATE TABLE split_participants (
    id         TEXT PRIMARY KEY NOT NULL,
    group_id   TEXT NOT NULL REFERENCES split_groups (id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    paid_cents INTEGER NOT NULL CHECK (paid_cents >= 0),
    position   INTEGER NOT NULL,                    -- display order; also the tie-breaker for leftover cents
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE INDEX idx_split_participants_group ON split_participants (group_id);
  `,
  // v2: optional receipt photo, stored as a file URI in the app's documents directory
  `
  ALTER TABLE expenses ADD COLUMN receipt_uri TEXT;
  `,
  // v3: imported transactions awaiting review, and merchant -> category rules
  `
  CREATE TABLE pending_transactions (
    id           TEXT PRIMARY KEY NOT NULL,
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    merchant     TEXT NOT NULL,
    occurred_at  TEXT NOT NULL,                     -- UTC ISO timestamp from the source
    source       TEXT NOT NULL,                     -- 'ios-shortcut' | 'deep-link' | 'android-notification' | 'server' | 'test'
    external_id  TEXT,                              -- upstream id, for idempotent server delivery
    category     TEXT,                              -- set only when the user overrides the rule
    status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'discarded')),
    expense_id   TEXT REFERENCES expenses (id),     -- the expense created on approval
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    deleted_at   TEXT
  );
  CREATE INDEX idx_pending_status ON pending_transactions (status, occurred_at);
  CREATE UNIQUE INDEX idx_pending_external ON pending_transactions (source, external_id)
    WHERE external_id IS NOT NULL;

  CREATE TABLE category_rules (
    id         TEXT PRIMARY KEY NOT NULL,
    pattern    TEXT NOT NULL,                       -- matched as whole words against the merchant
    category   TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  `,
  // v4: store receipt photos relative to the documents directory. iOS changes the absolute
  // container path on app updates, which broke the file:// URIs saved by v2.
  `
  UPDATE expenses
  SET receipt_uri = substr(receipt_uri, instr(receipt_uri, '/receipts/') + 1)
  WHERE receipt_uri LIKE 'file:%' AND instr(receipt_uri, '/receipts/') > 0;
  `,
  // v5: receipt details on expenses, and receipt line items. Existing rows keep their data;
  // their currency gets the column default.
  `
  ALTER TABLE expenses RENAME COLUMN receipt_uri TO receipt_image_path;
  ALTER TABLE expenses ADD COLUMN merchant TEXT;
  ALTER TABLE expenses ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD';  -- ISO 4217
  ALTER TABLE expenses ADD COLUMN tax_included INTEGER;                  -- 1 / 0, NULL = unknown
  ALTER TABLE expenses ADD COLUMN tax_rate REAL;                         -- percent, e.g. 7.6
  ALTER TABLE expenses ADD COLUMN tax_cents INTEGER;                     -- tax amount as printed

  CREATE TABLE receipt_items (
    id         TEXT PRIMARY KEY NOT NULL,
    expense_id TEXT NOT NULL REFERENCES expenses (id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    quantity   REAL NOT NULL CHECK (quantity > 0),  -- fractional for weighed goods
    unit_price INTEGER NOT NULL,                    -- cents, in the expense's currency
    line_total INTEGER NOT NULL,                    -- cents, as printed (not recomputed)
    position   INTEGER NOT NULL,                    -- order on the receipt
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE INDEX idx_receipt_items_expense ON receipt_items (expense_id);
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

/** Runs as SQLiteProvider's onInit, before any screen renders. */
export async function migrateDb(db: SQLiteDatabase): Promise<void> {
  // Connection settings must be applied outside the migration transaction.
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  if (row === null) throw new Error('Could not read the database schema version');
  const current = row.user_version;
  if (current > SCHEMA_VERSION) {
    throw new Error(`Database schema v${current} is newer than this app supports (v${SCHEMA_VERSION})`);
  }
  if (current === SCHEMA_VERSION) return;

  await db.withTransactionAsync(async () => {
    for (let v = current; v < SCHEMA_VERSION; v++) {
      await db.execAsync(MIGRATIONS[v]);
    }
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  });
}
