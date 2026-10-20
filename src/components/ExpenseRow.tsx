import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Expense } from '@/storage/expenses';
import { UNCATEGORIZED } from '@/utils/budget';
import { formatDay } from '@/utils/dates';
import { formatAmount } from '@/utils/format';

type Props = { expense: Expense; onEdit: () => void; onDelete: () => void };

export function ExpenseRow({ expense, onEdit, onDelete }: Props) {
  const theme = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: theme.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityHint="Edit expense"
        onPress={onEdit}
        style={({ pressed }) => [styles.main, pressed && { opacity: 0.6 }]}>
        <View style={styles.text}>
          <ThemedText numberOfLines={1}>{expense.description}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {formatDay(expense.spentOn)} · {expense.category ?? UNCATEGORIZED}
          </ThemedText>
        </View>
        <ThemedText type="smallBold" style={styles.amount}>
          {formatAmount(expense.amountCents)}
        </ThemedText>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Delete ${expense.description}`}
        onPress={onDelete}
        hitSlop={8}
        style={({ pressed }) => [styles.delete, pressed && { opacity: 0.5 }]}>
        <ThemedText type="small" style={{ color: theme.danger }}>
          Delete
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.two,
  },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  text: { flex: 1 },
  amount: { fontSize: 16 },
  delete: { paddingLeft: Spacing.three, paddingVertical: Spacing.two },
});
