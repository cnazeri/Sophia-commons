import { Stack } from 'expo-router';

import { Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/lib/i18n';

export default function ChatLayout() {
  const c = useTheme();
  return (
    <Stack screenOptions={{
      headerStyle: { backgroundColor: c.background }, headerTintColor: c.goldText, headerShadowVisible: false,
      headerTitleStyle: { fontFamily: Fonts.bodyBold, color: c.text }, contentStyle: { backgroundColor: c.background },
    }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="new" options={{ title: t('board.new_post', 'New post'), headerBackTitle: '' }} />
      <Stack.Screen name="post/[id]" options={{ title: '', headerBackTitle: '' }} />
      <Stack.Screen name="[room]" options={{ title: t('board.earlier_chat', 'Earlier chat'), headerBackTitle: '' }} />
      <Stack.Screen name="sign-in" options={{ title: '', headerBackTitle: '' }} />
      <Stack.Screen name="account" options={{ title: t('app.account', 'Account'), headerBackTitle: '' }} />
    </Stack>
  );
}
