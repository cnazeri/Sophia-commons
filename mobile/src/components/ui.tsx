// Small shared pieces so every screen has the same look.
import { type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View, type TextProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Fonts, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Page with the wordmark on top, scrolling content, centered on tablets
export function Screen({ children, title, scroll = true, underHeader = false }: { children: ReactNode; title?: string; scroll?: boolean; underHeader?: boolean }) {
  const c = useTheme();
  const inner = (
    <View style={styles.inner}>
      <Wordmark />
      {title ? <H1>{title}</H1> : null}
      {children}
    </View>
  );
  return (
    <SafeAreaView edges={underHeader ? [] : ['top']} style={{ flex: 1, backgroundColor: c.background }}>
      {scroll ? <ScrollView contentContainerStyle={styles.scroll}>{inner}</ScrollView> : <View style={[styles.scroll, { flex: 1 }]}>{inner}</View>}
    </SafeAreaView>
  );
}

export function Wordmark() {
  const c = useTheme();
  return (
    <View style={styles.wordmarkRow} accessibilityRole="header" accessibilityLabel="Sophia Commons">
      <Text style={[styles.wordmark, { color: c.text }]} maxFontSizeMultiplier={1.25}>Sophia Commons</Text>
    </View>
  );
}

export function H1(p: TextProps) {
  const c = useTheme();
  return <Text {...p} accessibilityRole="header" style={[styles.h1, { color: c.text }, p.style]} />;
}
export function H2(p: TextProps) {
  const c = useTheme();
  return <Text {...p} accessibilityRole="header" style={[styles.h2, { color: c.text }, p.style]} />;
}
export function Body(p: TextProps & { muted?: boolean }) {
  const c = useTheme();
  return <Text {...p} style={[styles.body, { color: p.muted ? c.textMuted : c.textSecondary }, p.style]} />;
}
export function Kicker(p: TextProps) {
  const c = useTheme();
  return <Text {...p} style={[styles.kicker, { color: c.goldText }, p.style]} />;
}
export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const c = useTheme();
  return <View style={[styles.card, { backgroundColor: c.elevated, borderColor: c.border }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
  inner: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', gap: Spacing.md },
  wordmarkRow: { paddingTop: Spacing.sm, paddingBottom: Spacing.xs },
  wordmark: { fontFamily: Fonts.logo, fontSize: 26, letterSpacing: 0.5 },
  h1: { fontFamily: Fonts.headingBold, fontSize: 26, lineHeight: 32, marginTop: Spacing.sm },
  h2: { fontFamily: Fonts.heading, fontSize: 19, lineHeight: 25 },
  body: { fontFamily: Fonts.body, fontSize: 15, lineHeight: 22 },
  kicker: { fontFamily: Fonts.bodyBold, fontSize: 11.5, letterSpacing: 1.2, textTransform: 'uppercase' },
  card: { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.sm },
});
