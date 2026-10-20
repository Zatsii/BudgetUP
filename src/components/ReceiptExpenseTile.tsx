import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { Spacing, StatusColors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Expense } from '@/storage/expenses';
import { resolveReceiptImageUri } from '@/storage/receiptImages';
import { UNCATEGORIZED } from '@/utils/budget';
import { formatDay } from '@/utils/dates';
import { formatAmount } from '@/utils/format';
import { checkReceipt, expectedLineTotal, formatQuantity, formatRate, formatReceiptLine } from '@/utils/receiptMath';
import type { ReceiptItem } from '@/utils/receiptParser';

type Props = {
  expense: Expense;
  items: ReceiptItem[];
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

/**
 * An expense created from a receipt: titled with the merchant, expands in place to show the
 * line items, tax, a sum check and the photo. Mismatches are shown, never corrected.
 */
export function ReceiptExpenseTile({ expense, items, expanded, onToggle, onEdit, onDelete }: Props) {
  const theme = useTheme();
  const [photoOpen, setPhotoOpen] = useState(false);
  const check = checkReceipt(items, expense.amountCents, expense.tax);
  const photoUri = resolveReceiptImageUri(expense.receiptImagePath);
  const title = expense.merchant ?? expense.description;

  return (
    <Animated.View
      // On web Reanimated animates layout with a scale transform, which visibly stretches text.
      layout={Platform.OS === 'web' ? undefined : LinearTransition.duration(220)}
      style={[styles.tile, { backgroundColor: theme.background, borderColor: theme.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityHint={expanded ? 'Hides the receipt details' : 'Shows the receipt details'}
        onPress={onToggle}
        style={({ pressed }) => [styles.header, pressed && { opacity: 0.6 }]}>
        <ThemedText style={styles.icon} accessibilityLabel="Receipt">
          🧾
        </ThemedText>
        <View style={styles.flex}>
          <ThemedText numberOfLines={1} style={styles.bold}>
            {title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {formatDay(expense.spentOn)} · {expense.category ?? UNCATEGORIZED}
          </ThemedText>
          {!check.ok && (
            <ThemedText type="small" style={styles.warningText}>
              ▲ Items don’t add up
            </ThemedText>
          )}
        </View>
        <ThemedText type="smallBold" style={styles.amount}>
          {formatAmount(expense.amountCents)}
        </ThemedText>
        <ThemedText themeColor="textSecondary">{expanded ? '▴' : '▾'}</ThemedText>
      </Pressable>

      {expanded && (
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={styles.details}>
          <View style={styles.lines}>
            {items.map((item, i) => {
              const bad = check.lineMismatches.includes(i);
              return (
                <View key={i} style={[styles.line, bad && styles.mismatch]}>
                  <ThemedText type="small" style={styles.mono}>
                    {formatReceiptLine(item)}
                  </ThemedText>
                  {bad && (
                    <ThemedText type="small" style={styles.warningText}>
                      ▲ {formatQuantity(item.quantity)} x {formatAmount(item.unitPrice)} is{' '}
                      {formatAmount(expectedLineTotal(item))}, not {formatAmount(item.lineTotal)}
                    </ThemedText>
                  )}
                </View>
              );
            })}
          </View>

          <View style={[styles.totals, { borderTopColor: theme.border }]}>
            <Row label="Subtotal" value={formatAmount(check.itemsSum)} />
            {expense.tax && (
              <Row
                label={`${expense.tax.included ? 'Incl.' : 'Plus'} ${
                  expense.tax.rate !== null ? `${formatRate(expense.tax.rate)}% ` : ''
                }${expense.tax.included ? 'VAT' : 'tax'}`}
                value={expense.tax.amount !== null ? formatAmount(expense.tax.amount) : '—'}
                muted
              />
            )}
            <Row label="Total" value={formatAmount(expense.amountCents)} bold />
          </View>

          {!check.ok && check.difference !== 0 && (
            <View style={[styles.mismatch, styles.mismatchBox]}>
              <ThemedText type="small" style={styles.warningText}>
                ▲ The items {expense.tax && !expense.tax.included ? 'plus tax ' : ''}add up to {formatAmount(check.expectedTotal)},
                but the total is {formatAmount(expense.amountCents)} ({check.difference > 0 ? '+' : ''}
                {formatAmount(check.difference)}). Check the receipt or edit the amount.
              </ThemedText>
            </View>
          )}

          <View style={styles.footer}>
            {photoUri ? (
              <Pressable
                accessibilityRole="imagebutton"
                accessibilityLabel="Receipt photo, opens full screen"
                onPress={() => setPhotoOpen(true)}>
                <Image source={{ uri: photoUri }} style={styles.thumb} contentFit="cover" />
              </Pressable>
            ) : (
              <View />
            )}
            <View style={styles.actions}>
              <Button label="Edit" variant="secondary" compact onPress={onEdit} />
              <Button label="Delete" variant="secondary" compact onPress={onDelete} />
            </View>
          </View>
        </Animated.View>
      )}

      {photoUri && (
        <Modal visible={photoOpen} transparent animationType="fade" onRequestClose={() => setPhotoOpen(false)}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close receipt photo"
            style={styles.viewer}
            onPress={() => setPhotoOpen(false)}>
            <Image source={{ uri: photoUri }} style={styles.full} contentFit="contain" />
            <ThemedText style={styles.closeHint}>Tap to close</ThemedText>
          </Pressable>
        </Modal>
      )}
    </Animated.View>
  );
}

function Row({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <View style={styles.row}>
      <ThemedText type={bold ? 'smallBold' : 'small'} themeColor={muted ? 'textSecondary' : 'text'}>
        {label}
      </ThemedText>
      <ThemedText type={bold ? 'smallBold' : 'small'} themeColor={muted ? 'textSecondary' : 'text'}>
        {value}
      </ThemedText>
    </View>
  );
}

const WARNING_BG = 'rgba(250, 178, 25, 0.16)';

const styles = StyleSheet.create({
  tile: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Spacing.three, marginBottom: Spacing.two, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.three },
  icon: { fontSize: 22, lineHeight: 28 },
  flex: { flex: 1 },
  bold: { fontWeight: 700 },
  amount: { fontSize: 16 },
  warningText: { color: '#b07800' },
  details: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.three, gap: Spacing.two },
  lines: { gap: Spacing.half },
  line: { paddingVertical: Spacing.half, paddingHorizontal: Spacing.one, borderRadius: Spacing.one },
  mono: { fontVariant: ['tabular-nums'] },
  mismatch: { backgroundColor: WARNING_BG, borderLeftWidth: 3, borderLeftColor: StatusColors.warning },
  mismatchBox: { padding: Spacing.two, borderRadius: Spacing.one },
  totals: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.two, gap: Spacing.half },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  footer: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: Spacing.one },
  thumb: { width: 56, height: 72, borderRadius: Spacing.one },
  actions: { flexDirection: 'row', gap: Spacing.two },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  full: { width: '100%', height: '85%' },
  closeHint: { color: '#fff', marginTop: Spacing.two },
});
