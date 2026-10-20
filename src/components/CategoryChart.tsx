import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { CategoryTotal } from '@/utils/budget';
import { formatAmount } from '@/utils/format';

/**
 * Horizontal bar chart of spending per category. Single series, so one hue; every bar is
 * direct-labeled with its category, amount and share, which doubles as the table view.
 * Built from plain Views, so it needs no charting dependency and renders identically everywhere.
 */
export function CategoryChart({ data }: { data: CategoryTotal[] }) {
  const theme = useTheme();
  const total = data.reduce((sum, d) => sum + d.totalCents, 0);
  const max = data[0]?.totalCents ?? 0;

  if (total === 0) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        No spending yet this month.
      </ThemedText>
    );
  }

  return (
    <View style={styles.container}>
      {data.map((d) => (
        <View
          key={d.category}
          style={styles.row}
          accessible
          accessibilityLabel={`${d.category}: ${formatAmount(d.totalCents)}, ${Math.round((d.totalCents / total) * 100)} percent`}>
          <View style={styles.labels}>
            <ThemedText type="small" numberOfLines={1} style={styles.category}>
              {d.category}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {formatAmount(d.totalCents)} · {Math.round((d.totalCents / total) * 100)}%
            </ThemedText>
          </View>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.bar,
                { width: `${(d.totalCents / max) * 100}%`, backgroundColor: theme.chartBar },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.two + Spacing.one },
  row: { gap: Spacing.one },
  labels: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  category: { flexShrink: 1 },
  barTrack: { height: 10 },
  // Square at the baseline, 4px rounded at the data end.
  bar: { height: '100%', minWidth: 2, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
});
