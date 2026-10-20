import { USE_MOCK_RECEIPT_PARSER } from '@/constants/receipts';
import { createMockReceiptParser } from '@/utils/mockReceiptParser';
import { createOnDeviceReceiptParser } from '@/utils/onDeviceReceiptParser';
import type { ReceiptParser } from '@/utils/receiptParser';

/*
 * The one place to choose a receipt backend. Default: on-device OCR (free, offline). The demo
 * parser is development-only (see constants/receipts.ts). A paid vision API could be added later
 * behind ReceiptParser, called through our own server so no key ships in the app.
 */
let parser: ReceiptParser = USE_MOCK_RECEIPT_PARSER ? createMockReceiptParser() : createOnDeviceReceiptParser();

export function getReceiptParser(): ReceiptParser {
  return parser;
}

/** For tests or a future settings toggle. */
export function setReceiptParser(next: ReceiptParser): void {
  parser = next;
}
