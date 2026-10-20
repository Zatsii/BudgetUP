import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  clearRecoveredReceipt,
  getReceiptImage,
  openAppSettings,
  type ReceiptImageOutcome,
  type ReceiptImageSource,
} from '@/utils/receiptImage';
import { ReceiptReadError } from '@/utils/onDeviceReceiptParser';
import type { ParsedReceipt, ReceiptImage } from '@/utils/receiptParser';
import { getReceiptParser } from '@/utils/receiptScanner';

/** One scan. `parsed` is null when the photo couldn't be read; `problem` says why. */
export type ScannedReceipt = { image: ReceiptImage; parsed: ParsedReceipt | null; problem: string | null };

type Status =
  | { kind: 'idle' }
  | { kind: 'opening' }
  | { kind: 'reading'; uri: string }
  | { kind: 'error'; message: string; canOpenSettings?: boolean };

type Props = {
  /** A new photo is in and about to be read: clear everything the previous scan filled in. */
  onScanStart: () => void;
  onScanned: (receipt: ScannedReceipt) => void;
  /** A photo recovered after Android killed the app mid-capture; processed on mount. */
  initialOutcome?: ReceiptImageOutcome | null;
};

/**
 * "Scan receipt" buttons. Gets a normalised photo from getReceiptImage(), runs it through the
 * current ReceiptParser and hands the result to the form. Always shows progress or an error.
 */
export function ReceiptScanner({ onScanStart, onScanned, initialOutcome }: Props) {
  const theme = useTheme();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const abortRef = useRef<AbortController | null>(null);
  const parser = getReceiptParser();

  useEffect(() => () => abortRef.current?.abort(), []);

  const handle = async (outcome: ReceiptImageOutcome) => {
    switch (outcome.status) {
      case 'cancelled':
        setStatus({ kind: 'idle' });
        return;
      case 'denied':
        setStatus({ kind: 'error', message: outcome.message, canOpenSettings: outcome.canOpenSettings });
        return;
      case 'error':
        setStatus({ kind: 'error', message: outcome.message });
        return;
    }
    const image: ReceiptImage = { uri: outcome.image.uri, mimeType: 'image/jpeg', width: outcome.image.width, height: outcome.image.height };
    onScanStart();
    setStatus({ kind: 'reading', uri: image.uri });
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      const parsed = await parser.parse(image, { signal: abort.signal });
      if (abort.signal.aborted) return;
      setStatus({ kind: 'idle' });
      onScanned({ image, parsed, problem: null });
    } catch (err) {
      if (abort.signal.aborted) return;
      // The photo is still attached; the form shows the problem and the fields to fill in.
      setStatus({ kind: 'idle' });
      onScanned({
        image,
        parsed: null,
        problem: err instanceof ReceiptReadError ? err.message : 'Couldn’t read that receipt. Enter the details below.',
      });
    }
  };

  useEffect(() => {
    if (initialOutcome) {
      clearRecoveredReceipt();
      handle(initialOutcome);
    }
    // Only on mount: the recovered photo is handed over once.
  }, []);

  const run = async (source: ReceiptImageSource) => {
    setStatus({ kind: 'opening' });
    await handle(await getReceiptImage(source));
  };

  const busy = status.kind === 'opening' || status.kind === 'reading';

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.header}>
        <ThemedText type="smallBold">Scan receipt</ThemedText>
        {parser.isMock ? (
          <ThemedText type="smallBold" style={{ color: theme.danger }}>
            {parser.label}
          </ThemedText>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            {parser.label}
          </ThemedText>
        )}
      </View>

      {busy ? (
        <View style={styles.progress}>
          {status.kind === 'reading' && <Image source={{ uri: status.uri }} style={styles.thumb} contentFit="cover" />}
          <ActivityIndicator color={theme.tint} />
          <ThemedText type="small" themeColor="textSecondary">
            {status.kind === 'reading' ? 'Reading receipt…' : 'Preparing photo…'}
          </ThemedText>
        </View>
      ) : (
        <View style={styles.buttons}>
          {Platform.OS === 'web' ? (
            <Button label="Upload receipt photo" variant="secondary" onPress={() => run('library')} />
          ) : (
            <>
              <Button label="Take photo" variant="secondary" onPress={() => run('camera')} />
              <Button label="Choose photo" variant="secondary" onPress={() => run('library')} />
            </>
          )}
        </View>
      )}

      {status.kind === 'error' && (
        <View style={styles.error}>
          <ThemedText type="small" style={{ color: theme.danger }}>
            {status.message}
          </ThemedText>
          {status.canOpenSettings && (
            <View style={styles.alignStart}>
              <Button label="Open Settings" variant="secondary" compact onPress={openAppSettings} />
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.two, padding: Spacing.three, borderRadius: Spacing.three },
  header: { gap: Spacing.half },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  progress: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 48 },
  thumb: { width: 48, height: 64, borderRadius: Spacing.one },
  error: { gap: Spacing.two },
  alignStart: { alignItems: 'flex-start' },
});
