import { Stack } from 'expo-router';

import { Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function StackLayout() {
  const c = useTheme();
  return (
    <Stack screenOptions={{
      headerStyle: { backgroundColor: c.background }, headerTintColor: c.goldText, headerShadowVisible: false,
      headerTitleStyle: { fontFamily: Fonts.bodyBold, color: c.text }, contentStyle: { backgroundColor: c.background },
    }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="list" options={{ title: '', headerBackTitle: '' }} />
      <Stack.Screen name="mine" options={{ title: '', headerBackTitle: '' }} />
      <Stack.Screen name="password" options={{ title: '', headerBackTitle: '' }} />
      <Stack.Screen name="account" options={{ title: '', headerBackTitle: '' }} />
      <Stack.Screen name="article/[id]" options={{ title: '', headerBackTitle: '' }} />
    </Stack>
  );
}
