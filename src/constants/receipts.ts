/**
 * Receipt scanning config.
 *
 * Receipts are read on the device (Apple Vision / Google ML Kit via modules/receipt-ocr): free,
 * offline, no server or API key.
 *
 * The demo parser ignores the photo and always returns the Berghotel sample. It is only for
 * development, and only when started with:  EXPO_PUBLIC_MOCK_RECEIPTS=1 npx expo start
 * Release builds never use it. The scan card labels it when it is on.
 */
export const USE_MOCK_RECEIPT_PARSER = __DEV__ && process.env.EXPO_PUBLIC_MOCK_RECEIPTS === '1';
