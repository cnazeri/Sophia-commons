import { Stack } from 'expo-router';

import { Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function DirectoryLayout() {
  const c = useTheme();
  return (
    <Stack screenOptions={{
      headerStyle: { backgroundColor: c.background }, headerTintColor: c.goldText, headerShadowVisible: false,
      headerTitleStyle: { fontFamily: Fonts.bodyBold, color: c.text }, contentStyle: { backgroundColor: c.background },
    }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[id]" options={{ title: '', headerBackTitle: '' }} />
    </Stack>
  );
}
