// Small shared pieces so every screen has the same look.
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type TextProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Fonts, MaxContentWidth, Radius, Spacing, isIOS } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/lib/i18n';

// Page with the wordmark on top, scrolling content, centered on tablets
export function Screen({ children, title, scroll = true, underHeader = false, post = false }: { children: ReactNode; title?: string; scroll?: boolean; underHeader?: boolean; post?: boolean }) {
  const c = useTheme();
  const inner = (
    <View style={styles.inner}>
      <Wordmark post={post} />
      {title ? <H1>{title}</H1> : null}
      {children}
    </View>
  );
  return (
    <SafeAreaView edges={underHeader ? [] : ['top']} style={{ flex: 1, backgroundColor: c.background }}>
      {/* Forms: the page scrolls above the keyboard (iOS insets), taps on buttons work while it is open, and dragging
          the page down closes it (the number pad has no Done key) */}
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scroll} automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled"
          keyboardDismissMode={isIOS ? 'interactive' : 'on-drag'}>{inner}</ScrollView>
      ) : <View style={[styles.scroll, { flex: 1 }]}>{inner}</View>}
    </SafeAreaView>
  );
}

// The site name; with `post`, a gold "Post" button on the right opens the Post screen
export function Wordmark({ post = false }: { post?: boolean }) {
  const c = useTheme();
  return (
    <View style={styles.wordmarkRow}>
      <Text style={[styles.wordmark, { color: c.text }]} maxFontSizeMultiplier={1.25} accessibilityRole="header">Sophia Commons</Text>
      {post ? (
        <Pressable onPress={() => router.push('/post')} accessibilityRole="button"
          accessibilityLabel={t('app.post_open', 'Post: share an event, a place, a job or a community post')}
          hitSlop={8} style={({ pressed }) => [styles.postBtn, { backgroundColor: c.gold, opacity: pressed ? 0.85 : 1 }]}>
          <MaterialIcons name="add" size={18} color={c.onGold} />
          <Text style={[styles.postLabel, { color: c.onGold }]} maxFontSizeMultiplier={1.3}>{t('app.post_btn', 'Post')}</Text>
        </Pressable>
      ) : null}
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
  wordmarkRow: { paddingTop: Spacing.sm, paddingBottom: Spacing.xs, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  postBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 40, paddingHorizontal: 14, borderRadius: Radius.pill },
  postLabel: { fontFamily: Fonts.bodyBold, fontSize: 15 },
  wordmark: { fontFamily: Fonts.logo, fontSize: 26, letterSpacing: 0.5 },
  h1: { fontFamily: Fonts.headingBold, fontSize: 26, lineHeight: 32, marginTop: Spacing.sm },
  h2: { fontFamily: Fonts.heading, fontSize: 19, lineHeight: 25 },
  body: { fontFamily: Fonts.body, fontSize: 15, lineHeight: 22 },
  kicker: { fontFamily: Fonts.bodyBold, fontSize: 11.5, letterSpacing: 1.2, textTransform: 'uppercase' },
  card: { borderWidth: 1, borderRadius: 14, padding: Spacing.lg, gap: Spacing.sm },   // 14px, as the website's .h2-card
});
