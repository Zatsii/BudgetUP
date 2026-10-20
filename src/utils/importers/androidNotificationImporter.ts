import type { TransactionImporter } from '@/utils/imports';

/**
 * Android bank-notification importer. STUB: not implemented yet.
 *
 * Plan
 * ----
 * Native module: a NotificationListenerService, either
 *   - a small local Expo Module (recommended: `npx create-expo-module --local`), written in
 *     Kotlin, plus a config plugin; or
 *   - a community package such as react-native-android-notification-listener (check it builds
 *     on the current Gradle/New Architecture first; @react-native-voice/voice did not).
 * Either way it needs a development build; it can never run in Expo Go.
 *
 * AndroidManifest (added by the config plugin, never by hand):
 *   <service
 *     android:name=".TransactionNotificationListener"
 *     android:exported="false"
 *     android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE">
 *     <intent-filter>
 *       <action android:name="android.service.notification.NotificationListenerService" />
 *     </intent-filter>
 *   </service>
 *
 * Permissions:
 *   - BIND_NOTIFICATION_LISTENER_SERVICE: declared on the service above. Notification access is
 *     not a runtime permission: the user must enable it in Settings > Notifications > Device &
 *     app notifications (open Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS from the app).
 *     Check with NotificationManagerCompat.getEnabledListenerPackages().
 *   - No INTERNET or storage permission is needed for this importer.
 *   - Google Play restricts notification-listener use; the store listing must justify it.
 *
 * Data flow:
 *   1. onNotificationPosted() filters by package name (allow-list of the user's bank and wallet
 *      apps, e.g. com.google.android.apps.walletnfcrel) and extracts title/text.
 *   2. Per-bank regexes turn the text into { amount, merchant, date }. Keep the raw text so new
 *      formats can be added.
 *   3. The service runs while the JS app is closed, so it appends to a small native queue
 *      (SharedPreferences or a file). On launch, start() drains the queue into onTransaction(),
 *      and an event emitter delivers new items while the app is open.
 *   4. Each item goes through the same addPendingTransaction() pipeline as the deep link, with
 *      source 'android-notification', so dedup and category rules apply unchanged.
 */
export const androidNotificationImporter: TransactionImporter = {
  source: 'android-notification',
  description: 'Reads bank and Google Wallet notifications (not built yet)',
  isAvailable: () => false,
  start: () => () => {},
};
