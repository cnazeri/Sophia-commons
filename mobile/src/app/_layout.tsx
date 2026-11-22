import { Lora_600SemiBold, Lora_700Bold } from '@expo-google-fonts/lora';
import { NunitoSans_400Regular, NunitoSans_600SemiBold, NunitoSans_700Bold } from '@expo-google-fonts/nunito-sans';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import AppTabs from '@/components/app-tabs';
import { Colors } from '@/constants/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme = useColorScheme();
  const [loaded, error] = useFonts({
    SophiaCommonsDisplay: require('@/assets/fonts/SophiaCommonsDisplay.ttf'),
    Lora_600SemiBold, Lora_700Bold, NunitoSans_400Regular, NunitoSans_600SemiBold, NunitoSans_700Bold,
  });
  useEffect(() => { if (loaded || error) SplashScreen.hideAsync(); }, [loaded, error]);
  if (!loaded && !error) return null;

  const c = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider value={{ ...base, colors: { ...base.colors, background: c.background, card: c.background, text: c.text, primary: c.goldText, border: c.border } }}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <AppTabs />
    </ThemeProvider>
  );
}
