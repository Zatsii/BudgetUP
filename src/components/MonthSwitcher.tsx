import { Pressable, StyleSheet, View } from 'react-native';

import { Dropdown } from '@/components/Dropdown';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { currentMonthKey, monthName, shiftMonth } from '@/utils/dates';

type Props = {
  month: string;
  onChange: (month: string) => void;
  /** Earliest year to offer in the year dropdown (e.g. the year of the oldest expense). */
  firstYear: number;
};

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: monthName(i + 1) }));

export function MonthSwitcher({ month, onChange, firstYear }: Props) {
  const current = currentMonthKey();
  const isCurrent = month === current;
  const [year, monthNum] = month.split('-').map(Number);
  const currentYear = Number(current.slice(0, 4));

  // Always include the viewed year, even if arrows moved outside the usual range.
  const from = Math.min(firstYear, currentYear - 2, year);
  const to = Math.max(currentYear + 1, year);
  const yearOptions = Array.from({ length: to - from + 1 }, (_, i) => {
    const y = to - i; // newest first
    return { value: y, label: String(y) };
  });

  const select = (y: number, m: number) => onChange(`${y}-${String(m).padStart(2, '0')}`);

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Arrow label="‹" hint="Previous month" onPress={() => onChange(shiftMonth(month, -1))} />
        <View style={styles.dropdowns}>
          <Dropdown title="Month" value={monthNum} options={MONTH_OPTIONS} onChange={(m) => select(year, m)} />
          <Dropdown title="Year" value={year} options={yearOptions} onChange={(y) => select(y, monthNum)} />
        </View>
        <Arrow label="›" hint="Next month" onPress={() => onChange(shiftMonth(month, 1))} />
      </View>
      {!isCurrent && (
        <Pressable accessibilityRole="button" onPress={() => onChange(current)} hitSlop={8}>
          <ThemedText type="linkPrimary">Back to this month</ThemedText>
        </Pressable>
      )}
    </View>
  );
}

function Arrow({ label, hint, onPress }: { label: string; hint: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint}
      onPress={onPress}
      hitSlop={12}
      style={({ pressed }) => [styles.arrow, pressed && { opacity: 0.5 }]}>
      <ThemedText style={styles.arrowText}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch' },
  dropdowns: { flexDirection: 'row', gap: Spacing.two },
  arrow: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  arrowText: { fontSize: 32, lineHeight: 36 },
});
