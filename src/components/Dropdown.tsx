import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type DropdownOption<T extends string | number> = { value: T; label: string };

type Props<T extends string | number> = {
  /** Shown as the sheet title and used as the trigger's accessibility label. */
  title: string;
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
};

/**
 * A trigger button that opens a list of options in a modal sheet. Built on RN's Modal so it
 * behaves the same on iOS, Android and web without a native picker dependency.
 */
export function Dropdown<T extends string | number>({ title, value, options, onChange }: Props<T>) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}: ${selected?.label ?? ''}`}
        accessibilityHint="Opens a list to choose from"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.trigger,
          { backgroundColor: theme.backgroundElement, borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
        ]}>
        <ThemedText type="smallBold" style={styles.triggerText}>
          {selected?.label ?? '—'}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          ▾
        </ThemedText>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Close">
          {/* Inner Pressable swallows taps so they don't close the sheet. */}
          <Pressable style={[styles.sheet, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sheetTitle}>
              {title}
            </ThemedText>
            <ScrollView>
              {options.map((o) => {
                const active = o.value === value;
                return (
                  <Pressable
                    key={String(o.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => {
                      setOpen(false);
                      if (!active) onChange(o.value);
                    }}
                    style={({ pressed }) => [
                      styles.option,
                      active && { backgroundColor: theme.tint },
                      pressed && !active && { backgroundColor: theme.backgroundSelected },
                    ]}>
                    <ThemedText style={active ? { color: theme.onTint } : null}>{o.label}</ThemedText>
                    {active && <ThemedText style={{ color: theme.onTint }}>✓</ThemedText>}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
  },
  triggerText: { fontSize: 16 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  sheet: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '75%',
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.two,
  },
  sheetTitle: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two + Spacing.one,
    paddingHorizontal: Spacing.three,
    marginHorizontal: Spacing.two,
    borderRadius: Spacing.two,
  },
});
