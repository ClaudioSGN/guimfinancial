import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { LanguageProvider, useLanguage } from '@/lib/language';

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootLayoutInner() {
  const colorScheme = useColorScheme();
  const { t } = useLanguage();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        <Stack.Screen
          name="new-transaction"
          options={{ presentation: 'modal', title: t('newEntry.title') }}
        />
        <Stack.Screen name="accounts" options={{ title: t('accounts.title') }} />
        <Stack.Screen name="cards" options={{ title: t('cards.subtitle') }} />
        <Stack.Screen name="export" options={{ title: t('export.title') }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <LanguageProvider>
      <RootLayoutInner />
    </LanguageProvider>
  );
}
