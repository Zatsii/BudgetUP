import type { SQLiteDatabase } from 'expo-sqlite';
import { useEffect, useSyncExternalStore } from 'react';

// Pending-inbox count shared by the tab badge and the budget screen banner. Refreshed whenever
// pending_transactions changes through the storage functions.

let count = 0;
const listeners = new Set<() => void>();

export function notifyPendingChanged(db: SQLiteDatabase): void {
  db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM pending_transactions WHERE status = 'pending' AND deleted_at IS NULL",
  )
    .then((row) => {
      const next = row?.n ?? 0;
      if (next === count) return;
      count = next;
      listeners.forEach((l) => l());
    })
    .catch(() => {});
}

export function usePendingCount(db: SQLiteDatabase): number {
  useEffect(() => notifyPendingChanged(db), [db]);
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => count,
  );
}
