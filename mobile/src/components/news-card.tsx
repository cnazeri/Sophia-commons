// One news article in a list. Opens inside the app (never the website), in the tab it was tapped from.
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BookmarkButton } from '@/components/bookmark-button';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { localDate } from '@/lib/i18n';
import type { Article } from '@/lib/news';

export function NewsCard({ a, from = 'home' }: { a: Article; from?: 'home' | 'saved' }) {
  const c = useTheme();
  const meta = [a.source_name, localDate(a.published_at, { month: 'short', day: 'numeric' })].filter(Boolean).join(' · ');
  const open = () => router.push(from === 'saved'
    ? { pathname: '/saved/article/[id]', params: { id: a.id } }
    : { pathname: '/article/[id]', params: { id: a.id } });
  return (
    <Pressable onPress={open} accessibilityRole="link" accessibilityLabel={a.title}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      <View style={[styles.row, { borderColor: c.border }]}>
        <View style={styles.main}>
          <Text style={[styles.title, { color: c.text }]} numberOfLines={3}>{a.title}</Text>
          {meta ? <Text style={[styles.meta, { color: c.textMuted }]} numberOfLines={1}>{meta}</Text> : null}
          {a.excerpt ? <Text style={[styles.body, { color: c.textSecondary }]} numberOfLines={3}>{a.excerpt}</Text> : null}
        </View>
        <BookmarkButton article={a} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.md, paddingVertical: Spacing.md, borderBottomWidth: 1 },
  main: { flex: 1, gap: 3 },
  title: { fontFamily: Fonts.bodyBold, fontSize: 15.5, lineHeight: 20 },
  meta: { fontFamily: Fonts.body, fontSize: 13 },
  body: { fontFamily: Fonts.body, fontSize: 14, lineHeight: 19 },
});
