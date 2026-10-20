import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Section, TabScreen } from '@/components/TabScreen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { listSplitGroups, type SplitGroupSummary } from '@/storage/splits';
import { formatAmount } from '@/utils/format';

export default function SplitScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [groups, setGroups] = useState<SplitGroupSummary[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      let stale = false;
      listSplitGroups(db).then((g) => !stale && setGroups(g));
      return () => {
        stale = true;
      };
    }, [db]),
  );

  return (
    <TabScreen>
      <Section>
        <ThemedText type="smallBold">Split a shared expense</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Enter who paid what. BudgetUP splits the total equally and works out the fewest payments to settle up.
        </ThemedText>
        <Button label="+ New split" onPress={() => router.push('/splits/new')} />
      </Section>

      <Section>
        <ThemedText type="smallBold">Past splits</ThemedText>
        {groups === null ? (
          <ThemedText type="small" themeColor="textSecondary">
            Loading…
          </ThemedText>
        ) : groups.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            Splits you save will appear here.
          </ThemedText>
        ) : (
          <View>
            {groups.map((g) => (
              <Pressable
                key={g.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/splits/[id]', params: { id: g.id } })}
                style={({ pressed }) => [
                  styles.row,
                  { borderBottomColor: theme.border },
                  pressed && { opacity: 0.6 },
                ]}>
                <View style={styles.flex}>
                  <ThemedText numberOfLines={1}>{g.title}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {new Date(g.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })} · {g.peopleCount}{' '}
                    people
                  </ThemedText>
                </View>
                <ThemedText type="smallBold">{formatAmount(g.totalCents)}</ThemedText>
                <ThemedText themeColor="textSecondary">›</ThemedText>
              </Pressable>
            ))}
          </View>
        )}
      </Section>
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  flex: { flex: 1 },
});
