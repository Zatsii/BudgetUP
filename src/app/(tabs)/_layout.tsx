import AppTabs from '@/components/app-tabs';
import { useReceiptRecovery } from '@/hooks/use-receipt-recovery';

export default function TabLayout() {
  useReceiptRecovery();
  return <AppTabs />;
}
