// Opening screen (owner, 2026-11-22: a splash screen saying "Worldwide Anthroposophy"). It starts from exactly what the
// native splash shows (the feather, 120 wide, centered on ivory or dark brown), so there is no jump; then the feather
// rises, "Sophia Commons" and "Worldwide Anthroposophy" fade in, and after about two seconds it fades into the app.
// A tap skips it. With Reduce Motion on, it shows the finished picture without movement and leaves sooner.
// The app loads underneath while this plays.
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, useColorScheme } from 'react-native';

import { Fonts } from '@/constants/theme';
import { t } from '@/lib/i18n';

const ICON = require('@/assets/images/splash-icon.png');

export function Intro({ onDone }: { onDone: () => void }) {
  const dark = useColorScheme() === 'dark';
  const [rise] = useState(() => new Animated.Value(0));     // feather: 0 = centered like the native splash, 1 = raised
  const [words] = useState(() => new Animated.Value(0));    // "Sophia Commons"
  const [tagline] = useState(() => new Animated.Value(0));  // "Worldwide Anthroposophy"
  const [fade] = useState(() => new Animated.Value(1));     // the whole screen
  const finished = useRef(false);
  const [lift] = useState(() => rise.interpolate({ inputRange: [0, 1], outputRange: [0, -56] }));

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    Animated.timing(fade, { toValue: 0, duration: 350, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => onDone());
  };

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!alive) return;
      if (reduce) {
        rise.setValue(1); words.setValue(1); tagline.setValue(1);
        setTimeout(finish, 1200);
        return;
      }
      const ease = Easing.out(Easing.cubic);
      Animated.sequence([
        Animated.timing(rise, { toValue: 1, duration: 550, easing: ease, useNativeDriver: true }),
        Animated.timing(words, { toValue: 1, duration: 450, easing: ease, useNativeDriver: true }),
        Animated.timing(tagline, { toValue: 1, duration: 450, easing: ease, useNativeDriver: true }),
        Animated.delay(800),
      ]).start(({ finished: ok }) => { if (ok) finish(); });
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const up = (from: number) => ({ transform: [{ translateY: from }] });
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.wrap, { backgroundColor: dark ? '#1E1810' : '#FDFBF7', opacity: fade }]}
      accessible accessibilityRole="header" accessibilityLabel={'Sophia Commons. ' + t('app.intro_tagline', 'Worldwide Anthroposophy')}>
      <Pressable style={styles.fill} onPress={finish} accessibilityRole="button" accessibilityHint={t('app.intro_skip', 'Tap to continue')}>
        <Animated.View style={{ transform: [{ translateY: lift }] }}>
          <Image source={ICON} style={styles.icon} contentFit="contain" />
        </Animated.View>
        <Animated.View style={[styles.textBox, { opacity: words }, up(-40)]}>
          <Text style={[styles.name, { color: dark ? '#F3EDE2' : '#1E1810' }]} maxFontSizeMultiplier={1.2}>Sophia Commons</Text>
        </Animated.View>
        <Animated.View style={[{ opacity: tagline }, up(-34)]}>
          <Text style={[styles.tagline, { color: dark ? '#E0BE5C' : '#7F6116' }]} maxFontSizeMultiplier={1.3}>
            {t('app.intro_tagline', 'Worldwide Anthroposophy')}
          </Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { zIndex: 1000, elevation: 1000 },
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  icon: { width: 120, height: 120 },
  textBox: { marginTop: 18 },
  name: { fontFamily: Fonts.logo, fontSize: 34, letterSpacing: 0.5 },
  tagline: { fontFamily: Fonts.heading, fontStyle: 'italic', fontSize: 19, marginTop: 6, letterSpacing: 0.3 },
});
