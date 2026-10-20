import { randomUUID } from 'expo-crypto';

/** UUID v4 primary key. Client-generated so rows can be created offline and synced later. */
export function newId(): string {
  return randomUUID();
}
