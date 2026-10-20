// Type entry for the platform-specific implementations. Metro resolves `@/components/VoiceInput`
// to VoiceInput.native.tsx (iOS/Android) or VoiceInput.web.tsx (web); TypeScript resolves it here.
import type { VoiceInputProps } from './VoiceInputView';

export declare function VoiceInput(props: VoiceInputProps): React.JSX.Element;
