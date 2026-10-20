import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatAmount } from '@/utils/format';
import type { SplitResult } from '@/utils/settlement';

/** Who owes whom, plus each person's paid / share / balance. */
export function SettlementSummary({ result }: { result: SplitResult }) {
  const theme = useTheme();
  const shares = result.balances.map((b) => b.shareCents);
  const minShare = Math.min(...shares);
  // People who absorb a leftover cent (always the first ones entered).
  const roundedUp = result.balances.filter((b) => b.shareCents > minShare).map((b) => b.name);

  return (
    <View style={styles.container}>
      <View style={styles.statsRow}>
        <Stat label="Total" value={formatAmount(result.totalCents)} />
        <Stat label="People" value={String(result.balances.length)} />
        <Stat label="Fair share" value={formatAmount(minShare)} />
      </View>
      {roundedUp.length > 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          {formatAmount(result.totalCents)} doesn’t split evenly, so {formatNames(roundedUp)}{' '}
          {roundedUp.length === 1 ? 'pays' : 'each pay'} 1¢ more.
        </ThemedText>
      )}

      <View style={styles.section}>
        <ThemedText type="smallBold">Settle up</ThemedText>
        {result.transfers.length === 0 ? (
          <ThemedText themeColor="textSecondary">Everyone’s even. Nobody owes anything.</ThemedText>
        ) : (
          result.transfers.map((t, i) => (
            <View
              key={i}
              style={[styles.transfer, { backgroundColor: theme.backgroundSelected }]}
              accessible
              accessibilityLabel={`${t.from} owes ${t.to} ${formatAmount(t.amountCents)}`}>
              <ThemedText style={styles.transferText}>
                <ThemedText style={styles.bold}>{t.from}</ThemedText> owes{' '}
                <ThemedText style={styles.bold}>{t.to}</ThemedText>
              </ThemedText>
              <ThemedText style={styles.bold}>{formatAmount(t.amountCents)}</ThemedText>
            </View>
          ))
        )}
        {result.transfers.length > 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            {result.transfers.length === 1 ? '1 payment settles' : `${result.transfers.length} payments settle`} everything.
          </ThemedText>
        )}
      </View>

      <View style={styles.section}>
        <ThemedText type="smallBold">Balances</ThemedText>
        {result.balances.map((b, i) => (
          <View key={i} style={[styles.balanceRow, { borderBottomColor: theme.border }]}>
            <View style={styles.flex}>
              <ThemedText numberOfLines={1}>{b.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Paid {formatAmount(b.paidCents)} · share {formatAmount(b.shareCents)}
              </ThemedText>
            </View>
            <ThemedText type="smallBold" themeColor={b.netCents === 0 ? 'textSecondary' : 'text'}>
              {b.netCents > 0
                ? `gets back ${formatAmount(b.netCents)}`
                : b.netCents < 0
                  ? `owes ${formatAmount(-b.netCents)}`
                  : 'even'}
            </ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

/** "A", "A and B", "A, B and C" */
function formatNames(names: string[]): string {
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold" style={styles.statValue}>
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.three },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { gap: Spacing.half },
  statValue: { fontSize: 18, lineHeight: 24 },
  section: { gap: Spacing.two },
  transfer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingVertical: Spacing.two + Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
  transferText: { flexShrink: 1 },
  bold: { fontWeight: 700 },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  flex: { flex: 1 },
});
