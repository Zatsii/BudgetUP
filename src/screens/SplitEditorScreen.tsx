import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { SettlementSummary } from '@/components/SettlementSummary';
import { TextField } from '@/components/TextField';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { saveSplitGroup } from '@/storage/splits';
import { formatDay, todayKey } from '@/utils/dates';
import { parseNonNegativeCents } from '@/utils/money';
import { computeSplit, validateSplit } from '@/utils/settlement';

type Row = { key: number; name: string; paid: string };

export default function SplitEditorScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const nextKey = useRef(3);
  const [title, setTitle] = useState('');
  const [rows, setRows] = useState<Row[]>([
    { key: 0, name: '', paid: '' },
    { key: 1, name: '', paid: '' },
    { key: 2, name: '', paid: '' },
  ]);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);

  const parsed = rows.map((r) => ({ name: r.name, paidCents: parseNonNegativeCents(r.paid) }));
  const badAmount = parsed.some((p) => p.paidCents === null);
  const people = parsed.map((p) => ({ name: p.name.trim(), paidCents: p.paidCents ?? 0 }));
  const validation = validateSplit(people);
  const errors = [...(badAmount ? ['Fix the highlighted amounts.'] : []), ...(validation.ok ? [] : validation.errors)];
  const valid = errors.length === 0;

  // Recomputed live as you type; a few milliseconds at most for realistic group sizes.
  const result = valid ? computeSplit(people) : null;

  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addPerson = () => setRows((rs) => [...rs, { key: nextKey.current++, name: '', paid: '' }]);
  const removePerson = (key: number) => setRows((rs) => rs.filter((r) => r.key !== key));

  const save = async () => {
    setShowErrors(true);
    if (!valid) return;
    setSaving(true);
    try {
      const id = await saveSplitGroup(db, title.trim() || `Split on ${formatDay(todayKey())}`, people);
      router.replace({ pathname: '/splits/[id]', params: { id } });
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'New split' }} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
          <TextField
            label="What was it for? (optional)"
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Weekend cabin"
            maxLength={80}
          />

          <View style={styles.section}>
            <View style={styles.headerRow}>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.nameCol}>
                Name
              </ThemedText>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.paidCol}>
                Paid
              </ThemedText>
              <View style={styles.removeCol} />
            </View>
            {rows.map((r, i) => {
              const amountBad = showErrors && parsed[i].paidCents === null;
              const inputStyle = [
                styles.input,
                { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
              ];
              return (
                <View key={r.key} style={styles.personRow}>
                  <TextInput
                    accessibilityLabel={`Person ${i + 1} name`}
                    value={r.name}
                    onChangeText={(name) => update(r.key, { name })}
                    placeholder={`Person ${i + 1}`}
                    placeholderTextColor={theme.textSecondary}
                    maxLength={40}
                    style={[inputStyle, styles.nameCol]}
                  />
                  <TextInput
                    accessibilityLabel={`Amount ${r.name || `person ${i + 1}`} paid`}
                    value={r.paid}
                    onChangeText={(paid) => update(r.key, { paid })}
                    placeholder="0.00"
                    placeholderTextColor={theme.textSecondary}
                    keyboardType="decimal-pad"
                    inputMode="decimal"
                    style={[inputStyle, styles.paidCol, amountBad && { borderColor: theme.danger }]}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${r.name || `person ${i + 1}`}`}
                    disabled={rows.length <= 2}
                    onPress={() => removePerson(r.key)}
                    hitSlop={8}
                    style={[styles.removeCol, { opacity: rows.length <= 2 ? 0.25 : 1 }]}>
                    <ThemedText themeColor="textSecondary">✕</ThemedText>
                  </Pressable>
                </View>
              );
            })}
            <View style={styles.alignStart}>
              <Button label="+ Add person" variant="secondary" compact onPress={addPerson} />
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            {result ? (
              <SettlementSummary result={result} />
            ) : showErrors ? (
              errors.map((e) => (
                <ThemedText key={e} type="small" style={{ color: theme.danger }}>
                  {e}
                </ThemedText>
              ))
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                Enter everyone’s name and how much they paid to see who owes whom.
              </ThemedText>
            )}
          </View>

          <Button label={saving ? 'Saving…' : 'Save split'} onPress={save} disabled={saving} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexDirection: 'row', justifyContent: 'center', padding: Spacing.three },
  content: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.four, paddingBottom: Spacing.six },
  section: { gap: Spacing.two },
  headerRow: { flexDirection: 'row', gap: Spacing.two },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  nameCol: { flex: 3 },
  paidCol: { flex: 2 },
  removeCol: { width: 28, alignItems: 'center' },
  input: {
    fontSize: 16,
    paddingVertical: Spacing.two + Spacing.half,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 0,
  },
  alignStart: { alignItems: 'flex-start' },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
});
