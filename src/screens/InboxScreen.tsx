import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Section, TabScreen } from '@/components/TabScreen';
import { ThemedText } from '@/components/themed-text';
import { Spacing, StatusColors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { listCategoryRules } from '@/storage/categoryRules';
import { listExpensesBetween } from '@/storage/expenses';
import {
  approvePendingTransaction,
  discardPendingTransaction,
  listPendingTransactions,
  pendingSpentOn,
  restorePendingTransaction,
  type PendingTransaction,
} from '@/storage/pendingTransactions';
import { formatDay } from '@/utils/dates';
import { formatAmount } from '@/utils/format';
import { findDuplicates, matchCategoryRule, type CategoryRule, type DuplicateFlag } from '@/utils/imports';

const SOURCE_LABEL: Record<PendingTransaction['source'], string> = {
  'ios-shortcut': 'iPhone Shortcut',
  'deep-link': 'Import link',
  'android-notification': 'Android notification',
  server: 'Server',
  test: 'Test import',
};

type Item = PendingTransaction & {
  effectiveCategory: string | null;
  fromRule: boolean;
  duplicate: DuplicateFlag | undefined;
};

export default function InboxScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const { added } = useLocalSearchParams<{ added?: string }>();
  const [items, setItems] = useState<Item[] | null>(null);
  const [undo, setUndo] = useState<{ id: string; label: string } | null>(null);

  const load = useCallback(async () => {
    const [pending, rules] = await Promise.all([listPendingTransactions(db), listCategoryRules(db)]);
    const days = pending.map(pendingSpentOn).sort();
    const expenses = days.length ? await listExpensesBetween(db, days[0], days[days.length - 1]) : [];
    const flags = findDuplicates(pending, expenses);
    return pending.map((p) => decorate(p, rules, flags));
  }, [db]);

  const refresh = useCallback(async () => setItems(await load()), [load]);

  useFocusEffect(
    useCallback(() => {
      let stale = false;
      load().then((next) => !stale && setItems(next));
      return () => {
        stale = true;
      };
    }, [load]),
  );

  const approve = async (item: Item) => {
    await approvePendingTransaction(db, item.id, {
      amountCents: item.amountCents,
      description: item.merchant,
      category: item.effectiveCategory,
      spentOn: pendingSpentOn(item),
    });
    setUndo(null);
    await refresh();
  };

  const discard = async (item: Item) => {
    await discardPendingTransaction(db, item.id);
    setUndo({ id: item.id, label: `${item.merchant} ${formatAmount(item.amountCents)}` });
    await refresh();
  };

  const restore = async () => {
    if (!undo) return;
    await restorePendingTransaction(db, undo.id);
    setUndo(null);
    await refresh();
  };

  const byId = new Map(items?.map((i) => [i.id, i]));

  return (
    <TabScreen>
      <Section>
        <ThemedText type="smallBold">Imported transactions</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Imports wait here until you approve them. Only approved ones count toward your budget.
        </ThemedText>
        <View style={styles.linkRow}>
          <Button label="Category rules" variant="secondary" compact onPress={() => router.push('/rules')} />
          {Platform.OS !== 'android' && (
            <Button label="Set up iPhone import" variant="secondary" compact onPress={() => router.push('/import-guide')} />
          )}
        </View>
      </Section>

      {undo && (
        <View style={[styles.undo, { backgroundColor: theme.backgroundSelected }]}>
          <ThemedText type="small" style={styles.flex}>
            Discarded {undo.label}
          </ThemedText>
          <Pressable accessibilityRole="button" onPress={restore} hitSlop={8}>
            <ThemedText type="smallBold" style={{ color: theme.tint }}>
              Undo
            </ThemedText>
          </Pressable>
        </View>
      )}

      {items === null ? (
        <ThemedText type="small" themeColor="textSecondary">
          Loading…
        </ThemedText>
      ) : items.length === 0 ? (
        <Section>
          <ThemedText type="smallBold">Inbox is empty</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {Platform.OS === 'android'
              ? 'Nothing waiting for review.'
              : 'Set up the iPhone Shortcuts automation to send card payments here automatically.'}
          </ThemedText>
        </Section>
      ) : (
        items.map((item) => (
          <View
            key={item.id}
            style={[
              styles.card,
              { backgroundColor: theme.backgroundElement },
              item.id === added && { borderColor: theme.tint, borderWidth: 2 },
            ]}>
            <View style={styles.cardTop}>
              <View style={styles.flex}>
                <ThemedText numberOfLines={1}>{item.merchant}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatDay(pendingSpentOn(item))},{' '}
                  {new Date(item.occurredAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} ·{' '}
                  {SOURCE_LABEL[item.source]}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {item.effectiveCategory ?? 'Uncategorized'}
                  {item.fromRule ? ' (from rule)' : ''}
                </ThemedText>
              </View>
              <ThemedText type="smallBold" style={styles.amount}>
                {formatAmount(item.amountCents)}
              </ThemedText>
            </View>

            {item.duplicate && (
              <View style={[styles.flag, { borderColor: StatusColors.warning }]}>
                <ThemedText type="small">
                  ▲ Possible duplicate:{' '}
                  {item.duplicate.kind === 'pending'
                    ? `same as ${byId.get(item.duplicate.otherId)?.merchant ?? 'another import'}, ${
                        item.duplicate.minutesApart
                      } min earlier`
                    : `you already logged “${item.duplicate.description}” for this amount that day`}
                </ThemedText>
              </View>
            )}

            <View style={styles.actions}>
              <Button label="Approve" compact onPress={() => approve(item)} />
              <Button
                label="Edit"
                variant="secondary"
                compact
                onPress={() => router.push({ pathname: '/expense', params: { pendingId: item.id } })}
              />
              <Button label="Discard" variant="secondary" compact onPress={() => discard(item)} />
            </View>
          </View>
        ))
      )}
    </TabScreen>
  );
}

function decorate(p: PendingTransaction, rules: CategoryRule[], flags: Map<string, DuplicateFlag>): Item {
  const rule = p.category ? null : matchCategoryRule(p.merchant, rules);
  return {
    ...p,
    effectiveCategory: p.category ?? rule?.category ?? null,
    fromRule: Boolean(rule),
    duplicate: flags.get(p.id),
  };
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  linkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  undo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two, borderWidth: 0 },
  cardTop: { flexDirection: 'row', gap: Spacing.three },
  amount: { fontSize: 18, lineHeight: 24 },
  flag: { borderLeftWidth: 3, paddingLeft: Spacing.two, paddingVertical: Spacing.half },
  actions: { flexDirection: 'row', gap: Spacing.two },
});
