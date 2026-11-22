import { Stack } from 'expo-router';

import { Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/lib/i18n';

export default function StackLayout() {
  const c = useTheme();
  return (
    <Stack screenOptions={{
      headerStyle: { backgroundColor: c.background }, headerTintColor: c.goldText, headerShadowVisible: false,
      headerTitleStyle: { fontFamily: Fonts.bodyBold, color: c.text }, contentStyle: { backgroundColor: c.background },
    }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="article/[id]" options={{ title: '', headerBackTitle: '' }} />
      <Stack.Screen name="jobs/index" options={{ title: t('app.jobs', 'Jobs'), headerBackTitle: '' }} />
      <Stack.Screen name="jobs/[id]" options={{ title: '', headerBackTitle: '' }} />
      <Stack.Screen name="media" options={{ title: '', headerBackTitle: '' }} />
    </Stack>
  );
}
