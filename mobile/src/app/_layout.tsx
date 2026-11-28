import { Lora_600SemiBold, Lora_700Bold } from '@expo-google-fonts/lora';
import { NunitoSans_400Regular, NunitoSans_600SemiBold, NunitoSans_700Bold } from '@expo-google-fonts/nunito-sans';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { useColorScheme, View } from 'react-native';
import { PostHogProvider } from 'posthog-react-native';

import AppTabs from '@/components/app-tabs';
import { Intro } from '@/components/intro';
import { Colors } from '@/constants/theme';
import { posthog, useScreenTracking } from '@/lib/analytics';
import { noteAppOpened } from '@/lib/review';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme = useColorScheme();
  const [intro, setIntro] = useState(true);   // the opening screen, once per launch
  useScreenTracking();
  useEffect(() => { noteAppOpened(); }, []);
  const [loaded, error] = useFonts({
    SophiaCommonsDisplay: require('@/assets/fonts/SophiaCommonsDisplay.ttf'),
    // Baar Zeitgeist for headings, as on the website (owner, 2026-11-25). Loaded here only, not in app.json, so it ships as an update
    BaarZeitgeist: require('@/assets/fonts/BaarZeitgeist.ttf'),
    Lora_600SemiBold, Lora_700Bold, NunitoSans_400Regular, NunitoSans_600SemiBold, NunitoSans_700Bold,
  });
  useEffect(() => { if (loaded || error) SplashScreen.hideAsync(); }, [loaded, error]);
  if (!loaded && !error) return null;

  const c = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return (
    // Screens are tracked by useScreenTracking (PostHog's own screen capture does not work with Expo Router); no touch capture
    <PostHogProvider client={posthog} autocapture={{ captureScreens: false, captureTouches: false }}>
    <ThemeProvider value={{ ...base, colors: { ...base.colors, background: c.background, card: c.background, text: c.text, primary: c.goldText, border: c.border } }}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <View style={{ flex: 1 }}>
        <AppTabs />
        {intro ? <Intro onDone={() => setIntro(false)} /> : null}
      </View>
    </ThemeProvider>
    </PostHogProvider>
  );
}
