import type { ParsedReceipt, ReceiptImage, ReceiptParser } from './receiptParser.ts';

/**
 * Test fixture: a real-world style Swiss receipt (VAT included in prices).
 * Items sum exactly to the total: 9.00 + 5.00 + 22.00 + 18.50 = 54.50.
 */
export const BERGHOTEL_RECEIPT: ParsedReceipt = {
  merchant: 'Berghotel Grosse Scheidegg',
  date: '2007-07-30',
  currency: 'CHF',
  total: 5450,
  tax: { rate: 7.6, amount: 385, included: true },
  items: [
    { name: 'Latte Macchiato', quantity: 2, unitPrice: 450, lineTotal: 900 },
    { name: 'Gloki', quantity: 1, unitPrice: 500, lineTotal: 500 },
    { name: 'Schweinschnitzel', quantity: 1, unitPrice: 2200, lineTotal: 2200 },
    { name: 'Chasspaetzli', quantity: 1, unitPrice: 1850, lineTotal: 1850 },
  ],
};

/**
 * Development only (see constants/receipts.ts). Never reads the image; returns the fixture
 * after a short delay so the loading state is visible.
 */
export function createMockReceiptParser(delayMs = 700): ReceiptParser {
  return {
    label: 'DEMO MODE: every scan returns the same sample receipt, not your photo',
    isMock: true,
    parse(_image: ReceiptImage, options?: { signal?: AbortSignal }) {
      return new Promise<ParsedReceipt>((resolve, reject) => {
        const timer = setTimeout(
          () =>
            resolve({
              ...BERGHOTEL_RECEIPT,
              tax: BERGHOTEL_RECEIPT.tax && { ...BERGHOTEL_RECEIPT.tax },
              items: BERGHOTEL_RECEIPT.items.map((i) => ({ ...i })),
            }),
          delayMs,
        );
        options?.signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('aborted'));
        });
      });
    },
  };
}
