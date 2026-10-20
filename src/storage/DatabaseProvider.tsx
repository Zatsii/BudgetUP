import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { DATABASE_NAME } from '@/storage/database';
import { migrateDb } from '@/storage/schema';

/*
 * Web only: SQLite keeps an exclusive lock on its browser storage (OPFS). After a reload,
 * including a deep link opening /import, the new page can try to open the database before the
 * old page has released the lock, and a second tab can't open it at all.
 *
 * expo-sqlite can't recover from this within the same page: its web worker marks SQLite as
 * initialised before creating the storage layer, so after one lock failure every later open
 * fails with "Invalid VFS state". The only fix is a fresh page, so we reload with backoff
 * (counted in sessionStorage to avoid loops) and, if the lock never frees, explain why.
 */
const RELOAD_KEY = 'budgetup.dbOpenRetries';
const MAX_RELOADS = 4;

function isLockError(e: Error): boolean {
  return /access handle|createSyncAccessHandle|NoModificationAllowed|Invalid VFS state/i.test(`${e.name} ${e.message}`);
}

function readRetries(): number {
  try {
    return Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
  } catch {
    return MAX_RELOADS; // storage unavailable: don't risk a reload loop
  }
}

function writeRetries(n: number | null) {
  try {
    if (n === null) sessionStorage.removeItem(RELOAD_KEY);
    else sessionStorage.setItem(RELOAD_KEY, String(n));
  } catch {}
}

async function initDatabase(db: SQLiteDatabase) {
  await migrateDb(db);
  if (Platform.OS === 'web') writeRetries(null); // opened fine: reset the reload counter
}

type Failure = { locked: boolean; message: string; retrying: boolean };

export function DatabaseProvider({ children }: PropsWithChildren) {
  const theme = useTheme();
  const [failure, setFailure] = useState<Failure | null>(null);
  const handled = useRef(false);

  // SQLiteProvider calls onError during render, on every render while it holds an error,
  // so handle it once and change state outside render.
  const onError = (e: Error) => {
    if (handled.current) return;
    handled.current = true;
    const locked = Platform.OS === 'web' && isLockError(e);
    const retries = locked ? readRetries() : MAX_RELOADS;
    setTimeout(() => setFailure({ locked, message: e.message, retrying: locked && retries < MAX_RELOADS }), 0);
  };

  useEffect(() => {
    if (!failure?.retrying) return;
    const retries = readRetries();
    writeRetries(retries + 1);
    const timer = setTimeout(() => window.location.reload(), 300 * (retries + 1));
    return () => clearTimeout(timer);
  }, [failure]);

  if (failure) {
    return (
      <View style={[styles.failure, { backgroundColor: theme.background }]}>
        {failure.retrying ? (
          <ThemedText themeColor="textSecondary">Opening your data…</ThemedText>
        ) : (
          <>
            <ThemedText type="smallBold">
              {failure.locked ? 'BudgetUP is open in another tab' : 'Couldn’t open your data'}
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.center}>
              {failure.locked
                ? 'Your data can only be used by one tab at a time. Close the other BudgetUP tab, then reload.'
                : failure.message}
            </ThemedText>
            {Platform.OS === 'web' && (
              <Button
                label="Reload"
                onPress={() => {
                  writeRetries(null);
                  window.location.reload();
                }}
              />
            )}
          </>
        )}
      </View>
    );
  }

  return (
    <SQLiteProvider databaseName={DATABASE_NAME} onInit={initDatabase} onError={onError}>
      {children}
    </SQLiteProvider>
  );
}

const styles = StyleSheet.create({
  failure: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  center: { textAlign: 'center', maxWidth: 420 },
});
