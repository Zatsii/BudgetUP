import { requireOptionalNativeModule } from 'expo';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import type { ExpoSpeechRecognitionModule as SpeechModule } from 'expo-speech-recognition';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import {
  speechErrorMessage,
  VoiceInputView,
  type VoiceInputProps,
  type VoiceStatus,
} from '@/components/VoiceInputView';

type Speech = typeof SpeechModule;

// Fallback: stop if no new words arrive for this long (iOS doesn't always end on silence by itself).
const SILENCE_MS = 2000;

/**
 * Loads expo-speech-recognition only when its native module is in the binary. Importing it
 * unconditionally throws in Expo Go, which doesn't include this module.
 */
function loadSpeech(): Speech | null {
  if (!requireOptionalNativeModule('ExpoSpeechRecognition')) return null;
  return require('expo-speech-recognition').ExpoSpeechRecognitionModule as Speech;
}

function unavailableReason(): string {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient
    ? 'Voice input needs a development build. It isn’t available in Expo Go.'
    : 'Speech recognition isn’t in this build. Rebuild with npm run ios / npm run android.';
}

/** iOS/Android implementation using expo-speech-recognition (requires a development build). */
export function VoiceInput({ onTranscript }: VoiceInputProps) {
  const [speech] = useState(loadSpeech);
  const [status, setStatus] = useState<VoiceStatus>(
    speech ? { kind: 'checking' } : { kind: 'unavailable', reason: unavailableReason() },
  );
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const session = useRef({
    active: false,
    latest: '',
    error: undefined as string | undefined,
    silenceTimer: null as ReturnType<typeof setTimeout> | null,
  });

  useEffect(() => {
    if (!speech) return;
    let mounted = true;
    const s = session.current;

    setStatus(
      speech.isRecognitionAvailable()
        ? { kind: 'idle' }
        : {
            kind: 'unavailable',
            reason:
              Platform.OS === 'android'
                ? 'No speech recognition service on this device. Install or enable the Google app.'
                : 'Speech recognition isn’t available on this device.',
          },
    );

    const subs = [
      speech.addListener('result', (e) => {
        if (!s.active) return;
        const text = e.results[0]?.transcript;
        if (text) s.latest = text;
        if (mounted) setStatus({ kind: 'listening', partial: s.latest });
        if (s.silenceTimer) clearTimeout(s.silenceTimer);
        if (!e.isFinal) s.silenceTimer = setTimeout(() => speech.stop(), SILENCE_MS);
      }),
      speech.addListener('error', (e) => {
        if (e.error !== 'aborted') s.error = speechErrorMessage(e.error);
      }),
      // "end" always fires last, after any result or error, so it delivers the transcript.
      speech.addListener('end', () => {
        if (!s.active) return;
        s.active = false;
        if (s.silenceTimer) clearTimeout(s.silenceTimer);
        const text = s.latest.trim();
        if (mounted) {
          setStatus({ kind: 'idle', error: text ? undefined : (s.error ?? speechErrorMessage('no-speech')) });
        }
        if (text) onTranscriptRef.current(text);
      }),
    ];

    return () => {
      mounted = false;
      if (s.silenceTimer) clearTimeout(s.silenceTimer);
      subs.forEach((sub) => sub.remove());
      if (s.active) speech.abort();
      s.active = false;
    };
  }, [speech]);

  const onPress = async () => {
    if (!speech) return;
    const s = session.current;
    if (s.active) {
      speech.stop(); // the "end" event delivers what was heard
      return;
    }
    const permission = await speech.requestPermissionsAsync();
    if (!permission.granted) {
      setStatus({ kind: 'idle', error: speechErrorMessage('not-allowed') });
      return;
    }
    s.active = true;
    s.latest = '';
    s.error = undefined;
    setStatus({ kind: 'listening', partial: '' });
    speech.start({
      lang: 'en-US', // parseVoiceExpense understands English number words only
      interimResults: true,
      continuous: false, // end automatically after the user pauses
      addsPunctuation: false,
    });
  };

  return <VoiceInputView status={status} onPress={onPress} />;
}
