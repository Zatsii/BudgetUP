import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { SettlementSummary } from '@/components/SettlementSummary';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { deleteSplitGroup, getSplitGroup, type SplitGroup } from '@/storage/splits';
import { confirm } from '@/utils/confirm';
import { computeSplit } from '@/utils/settlement';

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/split');
}

export default function SplitDetailScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [group, setGroup] = useState<SplitGroup | null | undefined>(undefined);

  useEffect(() => {
    getSplitGroup(db, id).then(setGroup);
  }, [db, id]);

  // Recomputed from the stored payments, so saved splits always reflect the current algorithm.
  const result = useMemo(() => (group ? computeSplit(group.people) : null), [group]);

  const remove = async () => {
    if (!group || !(await confirm('Delete split?', group.title))) return;
    await deleteSplitGroup(db, group.id);
    close();
  };

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.scroll}>
      <Stack.Screen options={{ title: group?.title ?? 'Split' }} />
      <View style={styles.content}>
        {group === undefined ? (
          <ThemedText themeColor="textSecondary">Loading…</ThemedText>
        ) : group === null || !result ? (
          <ThemedText themeColor="textSecondary">This split was deleted or doesn’t exist.</ThemedText>
        ) : (
          <>
            <View>
              <ThemedText type="smallBold" style={styles.title}>
                {group.title}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Saved {new Date(group.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
              </ThemedText>
            </View>
            <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
              <SettlementSummary result={result} />
            </View>
            <Button label="Delete split" variant="danger" onPress={remove} />
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexDirection: 'row', justifyContent: 'center', padding: Spacing.three },
  content: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.three, paddingBottom: Spacing.six },
  title: { fontSize: 22, lineHeight: 30 },
  card: { borderRadius: Spacing.three, padding: Spacing.three },
});
