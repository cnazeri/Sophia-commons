// A talk, blog or podcast in a list: picture, title, details and a bookmark. Tapping it opens its own page.
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BookmarkButton } from '@/components/bookmark-button';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { localDate, t } from '@/lib/i18n';
import { type MediaItem, languageName } from '@/lib/media';

export function MediaCard({ m, wide = false }: { m: MediaItem; wide?: boolean }) {
  const c = useTheme();
  const foreign = m.lang && m.lang !== 'en' ? t('app.media_in_lang', 'In {lang}').replace('{lang}', languageName(m.lang)) : '';
  const meta = [foreign, m.meta, m.date ? localDate(m.date, { month: 'short', day: 'numeric' }) : ''].filter(Boolean).join(' · ');
  return (
    <Pressable onPress={() => router.push({ pathname: '/media/[kind]/[id]', params: { kind: m.kind, id: m.id } })}
      accessibilityRole="button" accessibilityLabel={m.title}
      style={({ pressed }) => [styles.card, { backgroundColor: c.elevated, borderColor: c.border, opacity: pressed ? 0.85 : 1 }]}>
      {m.image && wide ? <Image source={m.image} style={styles.wide} contentFit="cover" transition={150} /> : null}
      <View style={styles.row}>
        {m.image && !wide ? <Image source={m.image} style={styles.square} contentFit="cover" transition={150} /> : null}
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.title, { color: c.text }]} numberOfLines={3}>{m.title}</Text>
          {meta ? <Text style={[styles.meta, { color: c.textMuted }]} numberOfLines={1}>{meta}</Text> : null}
          {m.body ? <Text style={[styles.body, { color: c.textSecondary }]} numberOfLines={2}>{m.body}</Text> : null}
        </View>
        <BookmarkButton media={m} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: Radius.lg, overflow: 'hidden' },
  wide: { width: '100%', aspectRatio: 16 / 9 },
  row: { flexDirection: 'row', gap: Spacing.md, padding: Spacing.md, alignItems: 'flex-start' },
  square: { width: 56, height: 56, borderRadius: Radius.sm },
  title: { fontFamily: Fonts.bodyBold, fontSize: 15, lineHeight: 20 },
  meta: { fontFamily: Fonts.body, fontSize: 12.5 },
  body: { fontFamily: Fonts.body, fontSize: 13.5, lineHeight: 19 },
});
