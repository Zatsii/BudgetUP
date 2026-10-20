import type { OcrLine } from './types';

export type { OcrLine };

// No on-device text recognition in the browser; the parser shows a message instead.
export default {
  async recognizeLines(_uri: string): Promise<OcrLine[]> {
    throw new Error('Text recognition is not available on web');
  },
};
