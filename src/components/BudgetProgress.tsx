import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing, StatusColors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { budgetStatus } from '@/utils/budget';
import { formatAmount } from '@/utils/format';

const STATUS_LABEL = {
  good: '● On track',
  warning: '▲ Over 70% used',
  over: '■ Over budget',
} as const;

type Props = { spentCents: number; limitCents: number };

export function BudgetProgress({ spentCents, limitCents }: Props) {
  const theme = useTheme();
  const status = budgetStatus(spentCents, limitCents);
  const ratio = limitCents > 0 ? spentCents / limitCents : 0;
  const remaining = limitCents - spentCents;

  return (
    <View style={styles.container}>
      <View style={styles.statsRow}>
        <Stat label="Spent" value={formatAmount(spentCents)} />
        <Stat label="Limit" value={formatAmount(limitCents)} />
        <Stat
          label={remaining >= 0 ? 'Remaining' : 'Over by'}
          value={formatAmount(Math.abs(remaining))}
          color={remaining < 0 ? StatusColors.over : undefined}
        />
      </View>

      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(Math.min(ratio, 1) * 100) }}
        style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
        <View
          style={[
            styles.fill,
            { width: `${Math.min(ratio, 1) * 100}%`, backgroundColor: StatusColors[status] },
          ]}
        />
      </View>

      <View style={styles.statsRow}>
        <ThemedText type="small" themeColor="textSecondary">
          {STATUS_LABEL[status]}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {Math.round(ratio * 100)}% used
        </ThemedText>
      </View>
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.stat}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold" style={[styles.statValue, color ? { color } : null]}>
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.two },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { gap: Spacing.half },
  statValue: { fontSize: 18, lineHeight: 24 },
  track: { height: 12, borderRadius: 6, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 6 },
});
