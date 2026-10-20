import type { TransactionImporter } from '@/utils/imports';

/**
 * Phase 2: transactions delivered by an authenticated Django endpoint. STUB: not implemented.
 *
 * The payload is the same as the deep link's, so nothing downstream changes:
 *   GET /api/imports/pending/?since=<cursor>   (Authorization: Bearer <token>)
 *   -> { "items": [ { "id": "srv-123", "amount": "4.75", "merchant": "Tim Hortons",
 *                      "date": "2026-10-19T14:05:00Z" } ], "cursor": "..." }
 *
 * - Each item goes through parseImportPayload(item, 'server'), then addPendingTransaction().
 * - `id` becomes external_id; the UNIQUE (source, external_id) index makes re-delivery idempotent.
 * - After storing, POST /api/imports/ack/ with the ids so the server stops resending them.
 * - The token lives in secure storage (e.g. expo-secure-store), never in the bundle.
 * - The iOS Shortcut can then POST to the server instead of opening the app ("Get Contents of
 *   URL" action), so imports arrive even when the phone app isn't opened.
 */
export const serverImporter: TransactionImporter = {
  source: 'server',
  description: 'Your BudgetUP server (phase 2, not built yet)',
  isAvailable: () => false,
  start: () => () => {},
};
