import { Platform } from 'react-native';

import ReceiptOcr from '../../modules/receipt-ocr';
import { linesToRows } from '@/utils/ocrRows';
import type { ParsedReceipt, ReceiptImage, ReceiptParser } from '@/utils/receiptParser';
import { parseReceiptText } from '@/utils/receiptTextParser';

/** A scan that couldn't be read. `message` is shown to the user as is. */
export class ReceiptReadError extends Error {}

/** Whether the phone's locale writes the day before the month (en-GB, de-CH: yes; en-US: no). */
export function localeDayFirst(): boolean {
  try {
    const parts = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'numeric', year: 'numeric' }).formatToParts(new Date(2000, 11, 31));
    return parts.findIndex((p) => p.type === 'day') < parts.findIndex((p) => p.type === 'month');
  } catch {
    return true;
  }
}

/**
 * Reads the receipt on the device: OCR with line positions (Apple Vision on iOS, Google ML Kit on
 * Android, via modules/receipt-ocr), rows rebuilt from the positions, then parseReceiptText().
 * Free and offline. Each call reads only the photo it is given.
 */
export function createOnDeviceReceiptParser(): ReceiptParser {
  return {
    label: 'Reads the receipt on your phone',
    isMock: false,
    async parse(image: ReceiptImage, options?: { signal?: AbortSignal }): Promise<ParsedReceipt> {
      if (Platform.OS === 'web') {
        throw new ReceiptReadError('Reading receipts works in the iPhone and Android apps. Enter the details below.');
      }
      let rows: string[];
      try {
        rows = linesToRows(await ReceiptOcr.recognizeLines(image.uri));
      } catch (err) {
        throw new ReceiptReadError(`Couldn’t read text from the photo (${err instanceof Error ? err.message : String(err)}).`);
      }
      if (options?.signal?.aborted) throw new Error('aborted');
      if (__DEV__) console.log('[receipt OCR]', JSON.stringify(rows));
      if (rows.length === 0) {
        throw new ReceiptReadError('No text found in the photo. Try again with the receipt flat, in good light, filling the frame.');
      }
      return { ...parseReceiptText(rows, { dayFirst: localeDayFirst() }), ocrText: rows };
    },
  };
}
