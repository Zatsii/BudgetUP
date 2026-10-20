import { router } from 'expo-router';
import { useEffect } from 'react';

import { recoverPendingReceiptImage, stashRecoveredReceipt } from '@/utils/receiptImage';

/**
 * If Android killed the app while the camera was open, reopen the expense form with the photo
 * once the app is back. Mounted once, in the tab layout (the first screen after a restart).
 */
export function useReceiptRecovery(): void {
  useEffect(() => {
    let active = true;
    recoverPendingReceiptImage().then((outcome) => {
      if (!active || !outcome) return;
      stashRecoveredReceipt(outcome);
      router.push({ pathname: '/expense', params: { recovered: '1' } });
    });
    return () => {
      active = false;
    };
  }, []);
}
