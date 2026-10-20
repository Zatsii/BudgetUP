import { useEffect, useRef, useState } from 'react';

import {
  speechErrorMessage,
  VoiceInputView,
  type VoiceInputProps,
  type VoiceStatus,
} from '@/components/VoiceInputView';

// Minimal Web Speech API typings (not in TypeScript's DOM lib).
type RecognitionResultList = ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: RecognitionResultList }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognitionCtor = new () => Recognition;

function getRecognitionCtor(): RecognitionCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/** Web implementation using the browser's Web Speech API (Chrome, Edge, Safari). */
export function VoiceInput({ onTranscript }: VoiceInputProps) {
  const [status, setStatus] = useState<VoiceStatus>(() =>
    getRecognitionCtor()
      ? { kind: 'idle' }
      : { kind: 'unavailable', reason: 'Voice input isn’t supported in this browser. Try Chrome, Edge or Safari.' },
  );
  const recognitionRef = useRef<Recognition | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  useEffect(() => () => recognitionRef.current?.abort(), []);

  const start = () => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = 'en-US'; // parseVoiceExpense understands English number words only
    rec.interimResults = true;
    rec.continuous = false; // stop automatically after the user pauses
    rec.maxAlternatives = 1;

    let finalText = '';
    let error: string | undefined;
    rec.onresult = (e) => {
      let interim = '';
      finalText = '';
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      setStatus({ kind: 'listening', partial: (finalText + interim).trim() });
    };
    rec.onerror = (e) => {
      if (e.error !== 'aborted') error = speechErrorMessage(e.error);
    };
    rec.onend = () => {
      recognitionRef.current = null;
      const text = finalText.trim();
      if (text) onTranscriptRef.current(text);
      else if (!error) error = speechErrorMessage('no-speech');
      setStatus({ kind: 'idle', error: text ? undefined : error });
    };

    recognitionRef.current = rec;
    setStatus({ kind: 'listening', partial: '' });
    try {
      rec.start();
    } catch {
      recognitionRef.current = null;
      setStatus({ kind: 'idle', error: 'Couldn’t start the microphone. Try again.' });
    }
  };

  const onPress = () => {
    if (recognitionRef.current) recognitionRef.current.stop(); // onend delivers what was heard
    else start();
  };

  return <VoiceInputView status={status} onPress={onPress} />;
}
