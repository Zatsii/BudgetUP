import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type VoiceInputProps = {
  /** Called once per listening session with the final transcript. */
  onTranscript: (transcript: string) => void;
};

export type VoiceStatus =
  | { kind: 'checking' }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'idle'; error?: string }
  | { kind: 'listening'; partial: string };

// Error codes are shared by the Web Speech API and expo-speech-recognition.
const SPEECH_ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone or speech permission was denied. Enable it in settings to use voice.',
  'service-not-allowed': 'Speech recognition isn’t allowed here.',
  'no-speech': 'Didn’t catch that. Tap the mic and try again.',
  'speech-timeout': 'Didn’t catch that. Tap the mic and try again.',
  'audio-capture': 'No microphone was found.',
  network: 'Speech recognition needs an internet connection.',
  'language-not-supported': 'English speech recognition isn’t supported here.',
  interrupted: 'Listening was interrupted. Try again.',
  busy: 'The speech recognizer is busy. Try again in a moment.',
};

export function speechErrorMessage(code: string): string {
  return SPEECH_ERRORS[code] ?? `Speech recognition failed (${code}).`;
}

type Props = { status: VoiceStatus; onPress: () => void };

/** Shared mic button UI used by both VoiceInput.native.tsx and VoiceInput.web.tsx. */
export function VoiceInputView({ status, onPress }: Props) {
  const theme = useTheme();
  const listening = status.kind === 'listening';
  const disabled = status.kind === 'unavailable' || status.kind === 'checking';

  let hint: string;
  switch (status.kind) {
    case 'checking':
      hint = 'Checking microphone…';
      break;
    case 'unavailable':
      hint = status.reason;
      break;
    case 'listening':
      hint = status.partial ? `“${status.partial}”` : 'Listening… say e.g. “coffee twelve dollars”';
      break;
    default:
      hint = status.error ?? 'Tap the mic and say what you spent, e.g. “groceries 45.50”';
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundElement }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={listening ? 'Stop listening' : 'Add expense by voice'}
        accessibilityState={{ disabled, busy: listening }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.mic,
          {
            backgroundColor: listening ? theme.danger : theme.tint,
            opacity: disabled ? 0.35 : pressed ? 0.75 : 1,
          },
        ]}>
        <ThemedText style={[styles.micIcon, { color: theme.onTint }]}>{listening ? '■' : '🎙'}</ThemedText>
      </Pressable>
      <View style={styles.text}>
        <ThemedText type="smallBold">{listening ? 'Listening — tap to stop' : 'Voice input'}</ThemedText>
        <ThemedText
          type="small"
          themeColor="textSecondary"
          style={status.kind === 'idle' && status.error ? { color: theme.danger } : null}>
          {hint}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  mic: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  micIcon: { fontSize: 22, lineHeight: 28 },
  text: { flex: 1, gap: Spacing.half },
});
