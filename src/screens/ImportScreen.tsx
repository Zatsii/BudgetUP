import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { addPendingTransaction } from '@/storage/pendingTransactions';
import { parseImportPayload } from '@/utils/imports';

// The same link can be delivered twice (React dev double-effects, or the OS re-sending the URL
// on resume). Remember recently handled links for a few seconds; genuine repeat purchases arrive
// later and are kept, then flagged as possible duplicates in the inbox.
const recentlyHandled = new Map<string, number>();
const REPEAT_GUARD_MS = 5000;

/** Target of budgetup://import?amount=&merchant=[&date=][&id=] (see deepLinkImporter). */
export default function ImportScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const params = useLocalSearchParams<{ amount?: string; merchant?: string; date?: string; id?: string }>();
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify([params.amount, params.merchant, params.date, params.id]);

  useEffect(() => {
    // On iPhone the link comes from the Shortcuts automation; elsewhere it's just a link.
    const parsed = parseImportPayload(params, Platform.OS === 'ios' ? 'ios-shortcut' : 'deep-link');
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    const last = recentlyHandled.get(key);
    if (last && Date.now() - last < REPEAT_GUARD_MS) {
      router.replace('/inbox');
      return;
    }
    recentlyHandled.set(key, Date.now());
    addPendingTransaction(db, parsed.transaction)
      .then((id) => router.replace({ pathname: '/inbox', params: id ? { added: id } : {} }))
      .catch(() => setError('Couldn’t save the imported transaction. Try again.'));
  }, [db, key]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: 'Import' }} />
      {error ? (
        <>
          <ThemedText type="smallBold">Import failed</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.center}>
            {error}
          </ThemedText>
          <Button label="Go to inbox" onPress={() => router.replace('/inbox')} />
        </>
      ) : (
        <>
          <ActivityIndicator color={theme.tint} />
          <ThemedText themeColor="textSecondary">Adding to your inbox…</ThemedText>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  center: { textAlign: 'center' },
});
