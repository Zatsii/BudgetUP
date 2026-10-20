import { router, Stack } from 'expo-router';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { buildImportUrl, IMPORTERS } from '@/utils/importers';

const TEMPLATE = 'budgetup://import?amount=[Amount]&merchant=[URL Encoded Text]';

const STEPS: { title: string; body: string }[] = [
  {
    title: 'Create the automation',
    body: 'Open the Shortcuts app, go to the Automation tab and tap + (New Automation). Choose Transaction.',
  },
  {
    title: 'Pick when it runs',
    body: 'Select the Wallet cards to track (all of them is fine). Choose Run Immediately so it doesn’t ask each time, then tap Next and choose New Blank Automation.',
  },
  {
    title: 'Encode the merchant name',
    body: 'Add the action URL Encode. Tap its text field, choose Shortcut Input, then tap Shortcut Input again and pick Merchant.',
  },
  {
    title: 'Build the link',
    body: 'Add a Text action and type the link below. Where it says [Amount], insert the variable Shortcut Input → Amount. Where it says [URL Encoded Text], insert the URL Encoded Text variable from the previous step.',
  },
  {
    title: 'Open it',
    body: 'Add the action Open URLs and make sure its input is the Text from the previous step. Tap Done.',
  },
  {
    title: 'Try it',
    body: 'Pay with Apple Pay. BudgetUP opens and the payment appears in the Inbox for you to approve.',
  },
];

export default function ImportGuideScreen() {
  const theme = useTheme();
  const thisBuildUrl = buildImportUrl({ amount: '4.75', merchant: 'Tim Hortons' });

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.scroll}>
      <Stack.Screen options={{ title: 'iPhone import' }} />
      <View style={styles.content}>
        <ThemedText type="small" themeColor="textSecondary">
          A Shortcuts automation can send every Apple Pay payment to BudgetUP. Needs iOS 17 or later. Only Apple Pay
          (Wallet) payments trigger it, not physical card swipes.
        </ThemedText>

        {STEPS.map((step, i) => (
          <View key={step.title} style={styles.step}>
            <View style={[styles.number, { backgroundColor: theme.tint }]}>
              <ThemedText type="smallBold" style={{ color: theme.onTint }}>
                {i + 1}
              </ThemedText>
            </View>
            <View style={styles.flex}>
              <ThemedText type="smallBold">{step.title}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {step.body}
              </ThemedText>
              {i === 3 && (
                <View style={[styles.code, { backgroundColor: theme.backgroundElement }]}>
                  <ThemedText selectable style={styles.mono}>
                    {TEMPLATE}
                  </ThemedText>
                </View>
              )}
            </View>
          </View>
        ))}

        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="smallBold">Good to know</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            • iOS brings BudgetUP to the front each time the automation runs. That’s how deep links work; a future
            server sync will remove this.{'\n'}• A currency symbol in the amount is ignored.{'\n'}• You can
            add &date=… to the link. Without it the time of the payment is used.{'\n'}• Paying twice quickly at the same
            place is flagged as a possible duplicate, never dropped.
          </ThemedText>
        </View>

        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="smallBold">Test it now</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Sends a sample 4.75 Tim Hortons payment through the same import link.
          </ThemedText>
          {Platform.OS !== 'web' && (
            <ThemedText type="small" themeColor="textSecondary" selectable>
              This build’s link: {thisBuildUrl}
            </ThemedText>
          )}
          <Button
            label="Send a test import"
            variant="secondary"
            onPress={() => router.push({ pathname: '/import', params: { amount: '4.75', merchant: 'Tim Hortons' } })}
          />
        </View>

        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="smallBold">Import sources</ThemedText>
          {IMPORTERS.map((imp) => (
            <ThemedText key={imp.source} type="small" themeColor="textSecondary">
              {imp.isAvailable() ? '● ' : '○ '}
              {imp.description}
            </ThemedText>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexDirection: 'row', justifyContent: 'center', padding: Spacing.three },
  content: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.three, paddingBottom: Spacing.six },
  step: { flexDirection: 'row', gap: Spacing.three },
  number: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, gap: Spacing.half },
  code: { marginTop: Spacing.two, padding: Spacing.three, borderRadius: Spacing.two },
  mono: { fontFamily: Fonts.mono, fontSize: 13, lineHeight: 20 },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
});
