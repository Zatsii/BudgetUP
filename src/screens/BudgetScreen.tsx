import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BudgetProgress } from '@/components/BudgetProgress';
import { Button } from '@/components/Button';
import { CategoryChart } from '@/components/CategoryChart';
import { ExpenseRow } from '@/components/ExpenseRow';
import { ReceiptExpenseTile } from '@/components/ReceiptExpenseTile';
import { MonthSwitcher } from '@/components/MonthSwitcher';
import { Section, TabScreen } from '@/components/TabScreen';
import { TextField } from '@/components/TextField';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getBudget, setBudgetLimit, type Budget } from '@/storage/budgets';
import {
  deleteExpense,
  getEarliestExpenseYear,
  listReceiptItems,
  listExpensesForMonth,
  type Expense,
} from '@/storage/expenses';
import { usePendingCount } from '@/storage/pendingCount';
import { deleteReceiptImage } from '@/storage/receiptImages';
import { totalsByCategory } from '@/utils/budget';
import { confirm } from '@/utils/confirm';
import { currentMonthKey, formatMonth } from '@/utils/dates';
import { formatAmount } from '@/utils/format';
import { centsToInputString, parseAmountToCents } from '@/utils/money';
import type { ReceiptItem } from '@/utils/receiptParser';

export default function BudgetScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const pendingCount = usePendingCount(db);
  const [month, setMonth] = useState(currentMonthKey);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editingLimit, setEditingLimit] = useState(false);
  const [firstYear, setFirstYear] = useState(() => new Date().getFullYear());
  const [receiptItems, setReceiptItems] = useState<Map<string, ReceiptItem[]>>(new Map());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [b, e, y] = await Promise.all([
      getBudget(db, month),
      listExpensesForMonth(db, month),
      getEarliestExpenseYear(db),
    ]);
    const items = await listReceiptItems(db, e.map((x) => x.id));
    return { b, e, y, items };
  }, [db, month]);

  // Refetch whenever the screen regains focus (e.g. after saving in the expense form) or the month changes.
  useFocusEffect(
    useCallback(() => {
      let stale = false;
      reload().then(({ b, e, y, items }) => {
        if (stale) return; // a newer month was selected while this query ran
        setBudget(b);
        setExpenses(e);
        setReceiptItems(items);
        if (y !== null) setFirstYear(y);
        setLoaded(true);
      });
      return () => {
        stale = true;
      };
    }, [reload]),
  );

  const refresh = async () => {
    const { b, e, y, items } = await reload();
    setBudget(b);
    setExpenses(e);
    setReceiptItems(items);
    if (y !== null) setFirstYear(y);
  };

  // Every expense counts, whatever currency a receipt was in (amounts are shown as plain numbers).
  const spentCents = useMemo(() => expenses.reduce((sum, e) => sum + e.amountCents, 0), [expenses]);
  const categoryTotals = useMemo(() => totalsByCategory(expenses), [expenses]);

  const onDelete = async (expense: Expense) => {
    const ok = await confirm(
      'Delete expense?',
      `${expense.merchant ?? expense.description} – ${formatAmount(expense.amountCents)}`,
    );
    if (!ok) return;
    await deleteExpense(db, expense.id);
    deleteReceiptImage(expense.receiptImagePath);
    await refresh();
  };

  const changeMonth = (m: string) => {
    setEditingLimit(false);
    setMonth(m);
  };

  return (
    <TabScreen>
      <MonthSwitcher month={month} onChange={changeMonth} firstYear={firstYear} />

      {pendingCount > 0 && (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/inbox')}
          style={({ pressed }) => [styles.pendingBanner, { borderColor: theme.tint, opacity: pressed ? 0.7 : 1 }]}>
          <ThemedText type="small" style={styles.flex}>
            {pendingCount} imported {pendingCount === 1 ? 'transaction is' : 'transactions are'} waiting for review.
            They don’t count toward your budget until approved.
          </ThemedText>
          <ThemedText type="smallBold" style={{ color: theme.tint }}>
            Review
          </ThemedText>
        </Pressable>
      )}

      <Section>
        {budget && !editingLimit ? (
          <>
            <BudgetProgress spentCents={spentCents} limitCents={budget.limitCents} />
            <View style={styles.alignStart}>
              <Button label="Edit limit" variant="secondary" compact onPress={() => setEditingLimit(true)} />
            </View>
          </>
        ) : loaded ? (
          <LimitEditor
            key={month}
            month={month}
            initialCents={budget?.limitCents}
            spentCents={spentCents}
            onCancel={budget ? () => setEditingLimit(false) : undefined}
            onSave={async (cents) => {
              await setBudgetLimit(db, month, cents);
              setEditingLimit(false);
              await refresh();
            }}
          />
        ) : null}
      </Section>

      <Button label="+ Add expense" onPress={() => router.push('/expense')} />

      <Section>
        <ThemedText type="smallBold">Spending by category</ThemedText>
        <CategoryChart data={categoryTotals} />
      </Section>

      <Section>
        <ThemedText type="smallBold">
          Expenses{expenses.length ? ` (${expenses.length})` : ''}
        </ThemedText>
        {expenses.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            {loaded ? `Nothing logged for ${formatMonth(month)}.` : 'Loading…'}
          </ThemedText>
        ) : (
          <View>
            {expenses.map((e) => {
              const items = receiptItems.get(e.id) ?? [];
              const onEdit = () => router.push({ pathname: '/expense', params: { id: e.id } });
              // Receipt expenses get the expandable tile; manual and voice ones keep the plain row.
              return items.length > 0 || e.merchant ? (
                <ReceiptExpenseTile
                  key={e.id}
                  expense={e}
                  items={items}
                  expanded={expandedId === e.id}
                  onToggle={() => setExpandedId((id) => (id === e.id ? null : e.id))}
                  onEdit={onEdit}
                  onDelete={() => onDelete(e)}
                />
              ) : (
                <ExpenseRow key={e.id} expense={e} onEdit={onEdit} onDelete={() => onDelete(e)} />
              );
            })}
          </View>
        )}
      </Section>
    </TabScreen>
  );
}

type LimitEditorProps = {
  month: string;
  initialCents?: number;
  spentCents: number;
  onSave: (cents: number) => Promise<void>;
  onCancel?: () => void;
};

function LimitEditor({ month, initialCents, spentCents, onSave, onCancel }: LimitEditorProps) {
  const [text, setText] = useState(initialCents ? centsToInputString(initialCents) : '');
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const cents = parseAmountToCents(text);
    if (cents === null) {
      setError('Enter a positive amount, e.g. 1500 or 1500.00');
      return;
    }
    await onSave(cents);
  };

  return (
    <View style={styles.editor}>
      {!initialCents && (
        <ThemedText type="small" themeColor="textSecondary">
          No spending limit set for {formatMonth(month)}
          {spentCents > 0 ? ` (${formatAmount(spentCents)} spent so far)` : ''}.
        </ThemedText>
      )}
      <TextField
        label="Monthly spending limit"
        value={text}
        onChangeText={(t) => {
          setText(t);
          setError(null);
        }}
        placeholder="0.00"
        keyboardType="decimal-pad"
        inputMode="decimal"
        returnKeyType="done"
        onSubmitEditing={save}
        error={error}
      />
      <View style={styles.buttonRow}>
        {onCancel && <Button label="Cancel" variant="secondary" onPress={onCancel} />}
        <Button label="Save limit" onPress={save} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 1,
  },
  alignStart: { alignItems: 'flex-start' },
  editor: { gap: Spacing.three },
  buttonRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.two },
});
