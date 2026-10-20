import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { ReceiptScanner, type ScannedReceipt } from '@/components/ReceiptScanner';
import { TextField } from '@/components/TextField';
import { ThemedText } from '@/components/themed-text';
import { VoiceInput } from '@/components/VoiceInput';
import { DEFAULT_CATEGORIES } from '@/constants/categories';
import { MaxContentWidth, Spacing, StatusColors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { listCategoryRules } from '@/storage/categoryRules';
import {
  addExpense,
  deleteExpense,
  getExpense,
  listReceiptItems,
  listRecentCategories,
  type ReceiptDetails,
  updateExpense,
} from '@/storage/expenses';
import {
  approvePendingTransaction,
  discardPendingTransaction,
  getPendingTransaction,
  pendingSpentOn,
} from '@/storage/pendingTransactions';
import { deleteReceiptImage, resolveReceiptImageUri, saveReceiptImage } from '@/storage/receiptImages';
import { confirm } from '@/utils/confirm';
import {
  currentMonthKey,
  formatLongDate,
  formatMonth,
  isValidDateKey,
  monthOf,
  toDateKey,
  todayKey,
} from '@/utils/dates';
import { formatAmount } from '@/utils/format';
import { matchCategoryRule } from '@/utils/imports';
import { centsToInputString, parseAmountToCents } from '@/utils/money';
import { parseVoiceExpense } from '@/utils/parseVoiceExpense';
import { peekRecoveredReceipt } from '@/utils/receiptImage';
import { checkReceipt, formatReceiptLine } from '@/utils/receiptMath';
import { receiptToDraft, type ReceiptConfidence } from '@/utils/receiptParser';
import { getReceiptParser } from '@/utils/receiptScanner';

type Errors = Partial<Record<'amount' | 'description' | 'date', string>>;

/** Shown above the form after voice or a receipt prefilled it, so the user knows to review. */
type PrefillNotice = { heading: string; note: string; lines?: string[]; warning?: string };

/** Return to the budget screen. On web the form can be opened directly by URL, with no history. */
function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export default function ExpenseFormScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  // id: edit an expense. pendingId: review an imported transaction; saving approves it.
  const { id, pendingId, recovered } = useLocalSearchParams<{ id?: string; pendingId?: string; recovered?: string }>();
  const isEdit = Boolean(id);
  const isReview = !isEdit && Boolean(pendingId);

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [date, setDate] = useState(todayKey);
  const [errors, setErrors] = useState<Errors>({});
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_CATEGORIES);
  const [loading, setLoading] = useState(isEdit || isReview);
  const [saving, setSaving] = useState(false);
  // State updates are async, so a quick double tap could otherwise save the same expense twice.
  const savingRef = useRef(false);
  const [notice, setNotice] = useState<PrefillNotice | null>(null);
  // Receipt photo: the one already saved on this expense, a newly scanned one, and whether it was removed.
  const [storedReceipt, setStoredReceipt] = useState<string | null>(null);
  const [pendingReceipt, setPendingReceipt] = useState<string | null>(null);
  const [receiptRemoved, setReceiptRemoved] = useState(false);
  const receiptPreview = pendingReceipt ?? (receiptRemoved ? null : resolveReceiptImageUri(storedReceipt));
  // Receipt details (merchant, currency, tax, items): undefined = unchanged, null = removed, object = new scan.
  const [receipt, setReceipt] = useState<ReceiptDetails | null | undefined>(undefined);
  const [storedItemCount, setStoredItemCount] = useState(0);
  // From the last scan: the shop name (editable, optional), what to double-check, and in dev the
  // raw OCR text so reading errors can be told apart from parsing errors.
  const [shopName, setShopName] = useState('');
  const [confidence, setConfidence] = useState<ReceiptConfidence | null>(null);
  const [checkHints, setCheckHints] = useState<{ amount?: string; date?: string }>({});
  const [ocrText, setOcrText] = useState<string[] | null>(null);
  const [showOcr, setShowOcr] = useState(false);
  const hasReceipt = Boolean(receiptPreview) || Boolean(receipt) || (receipt === undefined && storedItemCount > 0);

  // Prefill from speech; the user reviews and saves manually.
  const applyVoice = (transcript: string) => {
    const parsed = parseVoiceExpense(transcript);
    if (parsed.amountCents !== null) setAmount(centsToInputString(parsed.amountCents));
    if (parsed.description) setDescription(parsed.description);
    const words = transcript.toLowerCase().split(/\s+/);
    const matchedCategory = suggestions.find((c) => words.includes(c.toLowerCase()));
    if (matchedCategory && !category) setCategory(matchedCategory);
    setErrors({});
    setNotice({
      heading: `Heard “${transcript}”`,
      note:
        parsed.amountCents === null
          ? 'Couldn’t find an amount. Enter it below.'
          : `Filled in ${formatAmount(parsed.amountCents)}${parsed.description ? ` for “${parsed.description}”` : ''}. Review, then save.`,
    });
  };

  // A new receipt photo is in: drop everything the previous scan (or typing) put in the form,
  // so nothing from an earlier receipt can carry over into this one.
  const resetForScan = () => {
    setAmount('');
    setDescription('');
    setCategory('');
    setDate(todayKey());
    setReceipt(null);
    setPendingReceipt(null);
    setReceiptRemoved(true); // the new photo replaces any saved one
    setNotice(null);
    setErrors({});
    setShopName('');
    setConfidence(null);
    setCheckHints({});
    setOcrText(null);
    setShowOcr(false);
  };

  // Prefill from this scan only; the user reviews and saves manually. Problems are highlighted.
  const applyReceipt = ({ parsed, image, problem }: ScannedReceipt) => {
    setPendingReceipt(image.uri);
    if (!parsed) {
      setNotice({ heading: 'Couldn’t read this receipt', note: 'The photo is attached. Fill in the details below.', warning: problem ?? undefined });
      setErrors({ amount: 'Enter the total from the receipt' });
      return;
    }
    const draft = receiptToDraft(parsed);
    const conf = draft.confidence;
    setAmount(draft.amountCents !== null ? centsToInputString(draft.amountCents) : '');
    setDescription(draft.merchant ?? '');
    setShopName(draft.merchant ?? '');
    setDate(draft.spentOn ?? todayKey());
    setReceipt({ merchant: draft.merchant, currency: draft.currency, tax: draft.tax, items: draft.items });
    setConfidence(conf);
    setOcrText(parsed.ocrText ?? null);
    const sample = getReceiptParser().isMock ? ' (DEMO sample data, not your photo)' : '';
    const check = draft.amountCents !== null ? checkReceipt(draft.items, draft.amountCents, draft.tax) : null;
    const warnings = [
      draft.amountCents === null && 'No total found.',
      check && !check.ok && `The items add up to ${formatAmount(check.expectedTotal)}, not ${formatAmount(check.total)}.`,
      conf.items === 'low' && check?.ok && 'Some items may be misread.',
      draft.amountCents !== null && draft.items.length === 0 && 'Couldn’t pick out the items; only the total was read.',
      !draft.spentOn && 'No date found; set to today.',
    ].filter((w): w is string => Boolean(w));
    setNotice({
      heading: `Scanned ${draft.merchant ?? 'receipt'}${sample}`,
      note: draft.amountCents === null ? 'Enter the amount below.' : `Filled in ${formatAmount(draft.amountCents)}. Review, then save.`,
      lines: draft.items.map(formatReceiptLine),
      warning: warnings.length ? warnings.join(' ') : undefined,
    });
    // Missing total blocks saving (red). Low-confidence values are only marked (amber).
    setErrors({ amount: draft.amountCents === null ? 'Enter the total from the receipt' : undefined });
    setCheckHints({
      amount:
        conf.total !== 'low'
          ? undefined
          : check && !check.ok
            ? `The items add up to ${formatAmount(check.expectedTotal)}. Check the total on the receipt.`
            : 'No total line found; this is the sum of the items. Check it.',
      date:
        conf.date === 'low' && draft.spentOn
          ? `Printed as ${parsed.dateText ?? 'an ambiguous date'}, which could be day-month or month-day. Read as ${formatLongDate(draft.spentOn)} using your phone’s date format.`
          : undefined,
    });
  };

  useEffect(() => {
    listRecentCategories(db).then((recent) =>
      setSuggestions([...new Set([...recent, ...DEFAULT_CATEGORIES])].slice(0, 8)),
    );
  }, [db]);

  useEffect(() => {
    if (!id) return;
    getExpense(db, id).then((e) => {
      if (!e) {
        close();
        return;
      }
      setAmount(centsToInputString(e.amountCents));
      setDescription(e.description);
      setCategory(e.category ?? '');
      setDate(e.spentOn);
      setStoredReceipt(e.receiptImagePath);
      listReceiptItems(db, [e.id]).then((m) => setStoredItemCount(m.get(e.id)?.length ?? 0));
      setLoading(false);
    });
  }, [db, id]);

  useEffect(() => {
    if (!isReview || !pendingId) return;
    Promise.all([getPendingTransaction(db, pendingId), listCategoryRules(db)]).then(([p, rules]) => {
      if (!p) {
        close(); // already approved or discarded
        return;
      }
      setAmount(centsToInputString(p.amountCents));
      setDescription(p.merchant);
      setCategory(p.category ?? matchCategoryRule(p.merchant, rules)?.category ?? '');
      setDate(pendingSpentOn(p));
      setLoading(false);
    });
  }, [db, isReview, pendingId]);

  const save = async () => {
    const amountCents = parseAmountToCents(amount);
    const next: Errors = {};
    if (amountCents === null) next.amount = 'Enter a positive amount, e.g. 12.50';
    // A scanned receipt never needs a description: the shop name, or "Receipt", stands in.
    const finalDescription = description.trim() || (receipt ? shopName.trim() || 'Receipt' : '');
    if (!finalDescription) next.description = 'Add a short description';
    if (!isValidDateKey(date)) next.date = 'Use YYYY-MM-DD, e.g. ' + todayKey();
    setErrors(next);
    if (Object.keys(next).length > 0 || amountCents === null || savingRef.current) return;

    savingRef.current = true;
    setSaving(true);
    if (isReview && pendingId) {
      try {
        await approvePendingTransaction(db, pendingId, {
          amountCents,
          description,
          category: category || null,
          spentOn: date,
        });
        close();
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
      return;
    }
    try {
      let receiptImagePath = receiptRemoved ? null : storedReceipt;
      if (pendingReceipt) {
        try {
          receiptImagePath = (await saveReceiptImage(pendingReceipt)) ?? receiptImagePath; // null on web
        } catch {
          // Keep the expense even if the photo couldn't be copied.
        }
      }
      const receiptToSave = receipt ? { ...receipt, merchant: shopName.trim() || null } : receipt;
      const input = { amountCents, description: finalDescription, category: category || null, spentOn: date, receiptImagePath, receipt: receiptToSave };
      if (id) await updateExpense(db, id, input);
      else await addExpense(db, input);
      if (storedReceipt && storedReceipt !== receiptImagePath) deleteReceiptImage(storedReceipt);
      close();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!id || !(await confirm('Delete expense?', description))) return;
    await deleteExpense(db, id);
    deleteReceiptImage(storedReceipt);
    close();
  };

  const discardImport = async () => {
    if (!pendingId) return;
    await discardPendingTransaction(db, pendingId);
    close();
  };

  const yesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toDateKey(d);
  })();

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: isEdit ? 'Edit expense' : isReview ? 'Review import' : 'Add expense' }} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.form}>
          {loading ? (
            <ThemedText themeColor="textSecondary">Loading…</ThemedText>
          ) : (
            <>
              {!isEdit && !isReview && <VoiceInput onTranscript={applyVoice} />}
              {!isReview && (
                <ReceiptScanner onScanStart={resetForScan} onScanned={applyReceipt} initialOutcome={recovered ? peekRecoveredReceipt() : null} />
              )}
              {isReview && (
                <ThemedText type="small" themeColor="textSecondary">
                  Imported transaction. Adjust anything, then approve to add it to your budget.
                </ThemedText>
              )}
              {notice && (
                <View style={[styles.notice, { borderColor: theme.border }]}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {notice.heading}
                  </ThemedText>
                  <ThemedText type="small">{notice.note}</ThemedText>
                  {notice.lines && notice.lines.length > 0 && (
                    <View style={[styles.items, confidence?.items === 'low' && styles.checkBox]}>
                      {notice.lines.map((line, i) => (
                        <ThemedText key={i} type="small" themeColor="textSecondary">
                          {line}
                        </ThemedText>
                      ))}
                    </View>
                  )}
                  {notice.warning && (
                    <ThemedText type="small" style={styles.warning}>
                      ▲ {notice.warning}
                    </ThemedText>
                  )}
                  {__DEV__ && ocrText && (
                    // Dev only: what OCR read, to tell reading errors from parsing errors.
                    <View style={styles.items}>
                      <Pressable accessibilityRole="button" onPress={() => setShowOcr((v) => !v)}>
                        <ThemedText type="small" themeColor="textSecondary">
                          {showOcr ? '▾' : '▸'} OCR text (dev only, {ocrText.length} rows)
                        </ThemedText>
                      </Pressable>
                      {showOcr && (
                        <ThemedText type="small" selectable style={styles.mono}>
                          {ocrText.join('\n')}
                        </ThemedText>
                      )}
                    </View>
                  )}
                </View>
              )}
              {hasReceipt && (
                <View style={styles.receiptRow}>
                  {receiptPreview ? (
                    <Image
                      source={{ uri: receiptPreview }}
                      style={styles.receiptThumb}
                      contentFit="cover"
                      accessibilityLabel="Receipt photo"
                    />
                  ) : (
                    <ThemedText style={styles.receiptIcon}>🧾</ThemedText>
                  )}
                  <View style={styles.flex}>
                    <ThemedText type="small">
                      Receipt attached
                      {(receipt?.items.length ?? storedItemCount) > 0
                        ? ` · ${receipt?.items.length ?? storedItemCount} items`
                        : ''}
                    </ThemedText>
                    {Platform.OS === 'web' && (
                      <ThemedText type="small" themeColor="textSecondary">
                        Photos aren’t saved on web. Only the details are.
                      </ThemedText>
                    )}
                  </View>
                  <Button
                    label="Remove"
                    variant="secondary"
                    compact
                    onPress={() => {
                      setPendingReceipt(null);
                      setReceiptRemoved(true);
                      setReceipt(null); // also drops merchant, tax and line items
                    }}
                  />
                </View>
              )}
              <TextField
                label="Amount"
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                keyboardType="decimal-pad"
                inputMode="decimal"
                autoFocus={!isEdit && !isReview}
                error={errors.amount}
                hint={checkHints.amount}
              />
              {receipt && (
                <TextField
                  label="Shop name"
                  value={shopName}
                  onChangeText={setShopName}
                  placeholder="Unknown shop"
                  maxLength={120}
                  hint={confidence?.merchant === 'low' ? 'Check the shop name' : undefined}
                />
              )}
              <TextField
                label="Description"
                value={description}
                onChangeText={setDescription}
                placeholder="e.g. Coffee"
                returnKeyType="next"
                maxLength={120}
                error={errors.description}
              />

              <View style={styles.group}>
                <TextField
                  label="Category (optional)"
                  value={category}
                  onChangeText={setCategory}
                  placeholder="e.g. Food"
                  maxLength={40}
                />
                <Chips
                  options={suggestions}
                  selected={category}
                  onSelect={(c) => setCategory(c === category ? '' : c)}
                />
              </View>

              <View style={styles.group}>
                <TextField
                  label="Date"
                  value={date}
                  onChangeText={setDate}
                  placeholder="YYYY-MM-DD"
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={10}
                  error={errors.date}
                  hint={checkHints.date}
                />
                <Chips
                  options={['Today', 'Yesterday']}
                  selected={date === todayKey() ? 'Today' : date === yesterday ? 'Yesterday' : ''}
                  onSelect={(c) => setDate(c === 'Today' ? todayKey() : yesterday)}
                />
                {isValidDateKey(date) && monthOf(date) !== currentMonthKey() && (
                  <ThemedText type="small" themeColor="textSecondary">
                    This will appear under {formatMonth(monthOf(date))}.
                  </ThemedText>
                )}
              </View>

              <Button
                testID="expense-save"
                label={saving ? 'Saving…' : isEdit ? 'Save changes' : isReview ? 'Approve' : 'Add expense'}
                onPress={save}
                disabled={saving}
              />
              {isEdit && <Button label="Delete expense" variant="danger" onPress={remove} />}
              {isReview && <Button label="Discard import" variant="secondary" onPress={discardImport} />}
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Chips({
  options,
  selected,
  onSelect,
}: {
  options: string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const active = o === selected;
        return (
          <Pressable
            key={o}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(o)}
            style={[
              styles.chip,
              { backgroundColor: active ? theme.tint : theme.backgroundElement, borderColor: theme.border },
            ]}>
            <ThemedText type="small" style={{ color: active ? theme.onTint : theme.text }}>
              {o}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexDirection: 'row', justifyContent: 'center', padding: Spacing.three },
  form: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.three, paddingBottom: Spacing.six },
  group: { gap: Spacing.two },
  items: { marginTop: Spacing.one, gap: Spacing.half },
  receiptRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  receiptThumb: { width: 48, height: 64, borderRadius: Spacing.one },
  receiptIcon: { fontSize: 28, lineHeight: 36 },
  warning: { color: '#b07800' },
  checkBox: { borderLeftWidth: 3, borderLeftColor: StatusColors.warning, paddingLeft: Spacing.two },
  mono: { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), fontSize: 12 },
  notice: {
    gap: Spacing.half,
    padding: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    paddingVertical: Spacing.one + Spacing.half,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
