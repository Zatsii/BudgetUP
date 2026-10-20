import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Keyboard, Linking, Platform } from 'react-native';

import { fitLongEdge, RECEIPT_JPEG_QUALITY } from '@/utils/imageSize';

/*
 * The one place that gets a receipt photo: permissions, camera/library, recovery after Android
 * kills the app mid-capture, and normalisation. Both "Take photo" and "Choose photo" use it.
 */

export type ReceiptImageResult = { uri: string; width: number; height: number };

export type ReceiptImageOutcome =
  | { status: 'ok'; image: ReceiptImageResult }
  | { status: 'cancelled' }
  /** canOpenSettings: the OS won't ask again, so the only way forward is the Settings app. */
  | { status: 'denied'; message: string; canOpenSettings: boolean }
  | { status: 'error'; message: string };

export type ReceiptImageSource = 'camera' | 'library';

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: 1, // full quality here; normalizeReceiptImage() does the single re-encode
  exif: false,
};

/** Opens the app's page in the system Settings app (iOS and Android). */
export function openAppSettings(): void {
  Linking.openSettings().catch(() => {});
}

async function ensureCameraPermission(): Promise<ReceiptImageOutcome | null> {
  if (Platform.OS === 'web') return null; // the browser prompts on its own
  let permission = await ImagePicker.getCameraPermissionsAsync();
  if (!permission.granted && permission.canAskAgain) {
    permission = await ImagePicker.requestCameraPermissionsAsync();
  }
  if (permission.granted) return null;
  return {
    status: 'denied',
    canOpenSettings: !permission.canAskAgain,
    message: permission.canAskAgain
      ? 'Camera access is needed to photograph receipts.'
      : 'Camera access is turned off for BudgetUP. Turn it on in Settings, or choose a photo instead.',
  };
}

/**
 * Re-encodes to JPEG (handles HEIC and PNG) and scales the long edge to RECEIPT_LONG_EDGE, so
 * stored photos and parser uploads stay small. Returns a new file in the cache directory.
 */
export async function normalizeReceiptImage(asset: { uri: string; width: number; height: number }): Promise<ReceiptImageResult> {
  const target = fitLongEdge(asset.width, asset.height);
  const context = ImageManipulator.manipulate(asset.uri);
  if (target.scaled) context.resize({ width: target.width, height: target.height });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: RECEIPT_JPEG_QUALITY });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

async function fromPickerResult(result: ImagePicker.ImagePickerResult): Promise<ReceiptImageOutcome> {
  if (result.canceled || !result.assets?.[0]) return { status: 'cancelled' };
  const asset = result.assets[0];
  try {
    return { status: 'ok', image: await normalizeReceiptImage(asset) };
  } catch {
    return { status: 'error', message: 'Couldn’t read that image. Try another photo.' };
  }
}

/** Takes or picks a receipt photo. Never throws; every failure comes back as an outcome. */
export async function getReceiptImage(source: ReceiptImageSource): Promise<ReceiptImageOutcome> {
  Keyboard.dismiss(); // otherwise an open keyboard covers half of Android's photo picker
  try {
    if (source === 'camera') {
      const blocked = await ensureCameraPermission();
      if (blocked) return blocked;
      return await fromPickerResult(await ImagePicker.launchCameraAsync(PICKER_OPTIONS));
    }
    // The system photo picker (iOS 14+, Android 13+) needs no library permission.
    return await fromPickerResult(await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (source === 'camera' && /simulator|not available|unavailable|no camera/i.test(message)) {
      return { status: 'error', message: 'There’s no camera on this device. Choose a photo instead.' };
    }
    return {
      status: 'error',
      message: source === 'camera' ? `Couldn’t open the camera (${message}).` : `Couldn’t open your photos (${message}).`,
    };
  }
}

/**
 * Android can kill the app while the camera or picker is in front. The photo isn't lost: the
 * picker keeps the result, and this returns it after the app restarts. Null if nothing pending.
 */
export async function recoverPendingReceiptImage(): Promise<ReceiptImageOutcome | null> {
  if (Platform.OS !== 'android') return null;
  try {
    const pending = await ImagePicker.getPendingResultAsync();
    if (!pending) return null;
    if ('code' in pending) return { status: 'error', message: `The photo couldn’t be recovered (${pending.message}).` };
    const outcome = await fromPickerResult(pending);
    return outcome.status === 'cancelled' ? null : outcome;
  } catch {
    return null;
  }
}

// A photo recovered at startup waits here until the expense form opens and claims it.
let recovered: ReceiptImageOutcome | null = null;

export function stashRecoveredReceipt(outcome: ReceiptImageOutcome): void {
  recovered = outcome;
}

/** Reads without clearing: safe to call during render (React may render twice in development). */
export function peekRecoveredReceipt(): ReceiptImageOutcome | null {
  return recovered;
}

export function clearRecoveredReceipt(): void {
  recovered = null;
}
