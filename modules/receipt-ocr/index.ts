import { requireNativeModule } from 'expo-modules-core';

import type { OcrLine } from './types';

export type { OcrLine };

type ReceiptOcrModule = {
  /** Apple Vision (iOS) or Google ML Kit (Android), on the device. `uri` is a file:// URI. */
  recognizeLines(uri: string): Promise<OcrLine[]>;
};

export default requireNativeModule<ReceiptOcrModule>('ReceiptOcr');
