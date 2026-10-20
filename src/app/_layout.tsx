import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import { DatabaseProvider } from '@/storage/DatabaseProvider';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      {/* Opens the database and runs migrations before any screen renders. */}
      <DatabaseProvider>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="expense" options={{ presentation: 'modal', title: 'Expense' }} />
          <Stack.Screen name="splits/new" options={{ title: 'New split' }} />
          <Stack.Screen name="splits/[id]" options={{ title: 'Split' }} />
          <Stack.Screen name="import" options={{ title: 'Import' }} />
          <Stack.Screen name="rules" options={{ title: 'Category rules' }} />
          <Stack.Screen name="import-guide" options={{ title: 'iPhone import' }} />
        </Stack>
      </DatabaseProvider>
    </ThemeProvider>
  );
}
