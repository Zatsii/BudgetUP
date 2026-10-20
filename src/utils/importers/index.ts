import { androidNotificationImporter } from '@/utils/importers/androidNotificationImporter';
import { deepLinkImporter } from '@/utils/importers/deepLinkImporter';
import { serverImporter } from '@/utils/importers/serverImporter';
import type { TransactionImporter } from '@/utils/imports';

/** Every import path. All of them feed addPendingTransaction(), so dedup and rules apply to all. */
export const IMPORTERS: TransactionImporter[] = [deepLinkImporter, androidNotificationImporter, serverImporter];

/** Whether any import path works on this platform. Decides whether import UI is shown at all. */
export function importsSupported(): boolean {
  return IMPORTERS.some((i) => i.isAvailable());
}

export { buildImportUrl } from '@/utils/importers/deepLinkImporter';
