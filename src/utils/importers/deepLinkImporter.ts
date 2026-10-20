import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

import type { TransactionImporter } from '@/utils/imports';

/**
 * iOS Shortcuts importer. A Wallet "Transaction" automation opens
 *   budgetup://import?amount=<Amount>&merchant=<Merchant>[&date=<Date>]
 * Expo Router (built on expo-linking) routes that URL to src/app/import.tsx, which validates it
 * with parseImportPayload() and adds it to the pending inbox. Because routing delivers the
 * payload, start() has nothing to subscribe to.
 *
 * The link itself works on every platform, but only iOS has a built-in way to fire it per payment
 * (Shortcuts). Android has no equivalent, so this importer counts as available on iOS and on web
 * (where the setup guide and test import are useful while developing). Android's real import
 * path is the notification listener.
 */
export const deepLinkImporter: TransactionImporter = {
  source: 'ios-shortcut',
  description: 'iPhone Shortcuts automation that opens a budgetup://import link',
  isAvailable: () => Platform.OS === 'ios' || Platform.OS === 'web',
  start: () => () => {},
};

/**
 * The import link for the current environment: budgetup://import in a development or store
 * build, exp://…/--/import in Expo Go, http(s)://…/import on web.
 */
export function buildImportUrl(params: { amount: string; merchant: string; date?: string }): string {
  return Linking.createURL('import', { queryParams: params });
}
