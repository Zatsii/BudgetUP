import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { ThemedText } from '@/components/themed-text';
import { DEFAULT_CATEGORIES } from '@/constants/categories';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  addCategoryRule,
  deleteCategoryRule,
  listCategoryRules,
  updateCategoryRule,
} from '@/storage/categoryRules';
import { listRecentCategories } from '@/storage/expenses';
import { confirm } from '@/utils/confirm';
import { normalizeMerchant, type CategoryRule } from '@/utils/imports';

export default function CategoryRulesScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [rules, setRules] = useState<CategoryRule[]>([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pattern, setPattern] = useState('');
  const [category, setCategory] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => setRules(await listCategoryRules(db)), [db]);

  useEffect(() => {
    refresh();
    listRecentCategories(db).then((recent) => setCategories([...new Set([...recent, ...DEFAULT_CATEGORIES])].slice(0, 8)));
  }, [db, refresh]);

  const reset = () => {
    setEditingId(null);
    setPattern('');
    setCategory('');
    setError(null);
  };

  const save = async () => {
    if (!normalizeMerchant(pattern)) return setError('Enter part of a merchant name, e.g. Tim Hortons');
    if (!category.trim()) return setError('Choose or type a category');
    const clash = rules.find((r) => r.id !== editingId && normalizeMerchant(r.pattern) === normalizeMerchant(pattern));
    if (clash) return setError(`There’s already a rule for “${clash.pattern}”`);
    if (editingId) await updateCategoryRule(db, editingId, pattern, category);
    else await addCategoryRule(db, pattern, category);
    reset();
    await refresh();
  };

  const remove = async (rule: CategoryRule) => {
    if (!(await confirm('Delete rule?', `${rule.pattern} → ${rule.category}`))) return;
    await deleteCategoryRule(db, rule.id);
    if (editingId === rule.id) reset();
    await refresh();
  };

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Category rules' }} />
      <View style={styles.content}>
        <ThemedText type="small" themeColor="textSecondary">
          Imported transactions get a category automatically when the merchant name contains a rule’s words. The
          longest matching rule wins, and you can still change the category before approving.
        </ThemedText>

        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="smallBold">{editingId ? 'Edit rule' : 'New rule'}</ThemedText>
          <TextField
            label="When the merchant contains"
            value={pattern}
            onChangeText={(t) => {
              setPattern(t);
              setError(null);
            }}
            placeholder="e.g. Tim Hortons"
            autoCapitalize="words"
            maxLength={60}
          />
          <TextField
            label="Set category to"
            value={category}
            onChangeText={(t) => {
              setCategory(t);
              setError(null);
            }}
            placeholder="e.g. Food"
            maxLength={40}
          />
          <View style={styles.chips}>
            {categories.map((c) => (
              <Pressable
                key={c}
                accessibilityRole="button"
                accessibilityState={{ selected: c === category }}
                onPress={() => setCategory(c)}
                style={[
                  styles.chip,
                  { borderColor: theme.border, backgroundColor: c === category ? theme.tint : theme.backgroundSelected },
                ]}>
                <ThemedText type="small" style={{ color: c === category ? theme.onTint : theme.text }}>
                  {c}
                </ThemedText>
              </Pressable>
            ))}
          </View>
          {error && (
            <ThemedText type="small" style={{ color: theme.danger }}>
              {error}
            </ThemedText>
          )}
          <View style={styles.buttons}>
            {editingId && <Button label="Cancel" variant="secondary" onPress={reset} />}
            <Button label={editingId ? 'Save rule' : 'Add rule'} onPress={save} />
          </View>
        </View>

        <View style={styles.list}>
          <ThemedText type="smallBold">Your rules{rules.length ? ` (${rules.length})` : ''}</ThemedText>
          {rules.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              No rules yet.
            </ThemedText>
          ) : (
            rules.map((r) => (
              <View key={r.id} style={[styles.row, { borderBottomColor: theme.border }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityHint="Edit rule"
                  style={styles.flex}
                  onPress={() => {
                    setEditingId(r.id);
                    setPattern(r.pattern);
                    setCategory(r.category);
                    setError(null);
                  }}>
                  <ThemedText>
                    {r.pattern} <ThemedText themeColor="textSecondary">→</ThemedText> {r.category}
                  </ThemedText>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={`Delete rule ${r.pattern}`} onPress={() => remove(r)} hitSlop={8}>
                  <ThemedText type="small" style={{ color: theme.danger }}>
                    Delete
                  </ThemedText>
                </Pressable>
              </View>
            ))
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexDirection: 'row', justifyContent: 'center', padding: Spacing.three },
  content: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.three, paddingBottom: Spacing.six },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.three },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { paddingVertical: Spacing.one + Spacing.half, paddingHorizontal: Spacing.three, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.two },
  list: { gap: Spacing.one },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  flex: { flex: 1 },
});
