// Talks, blogs and podcasts (owner, 2026-11-22: each section has its own page, and each item its own page that can be
// saved). This hub shows the newest talk and opens the three pages: Talks, Blogs, Podcasts.
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { type Href, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MediaCard } from '@/components/media-card';
import { Body, Screen } from '@/components/ui';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/lib/i18n';
import { type MediaItem, PODCASTS, fetchBlogs, fetchVideos, videoItem } from '@/lib/media';

export default function MediaHub() {
  const c = useTheme();
  const [latest, setLatest] = useState<MediaItem | null>(null);
  const [blogCount, setBlogCount] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    fetchVideos(1, 0).then((r) => { if (alive && r[0]) setLatest(videoItem(r[0])); }).catch(() => {});
    fetchBlogs().then((r) => { if (alive) setBlogCount(r.length); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const sections: { href: Href; icon: keyof typeof MaterialIcons.glyphMap; title: string; desc: string }[] = [
    { href: '/media/talks', icon: 'smart-display', title: t('app.media_talks', 'Talks'), desc: t('app.media_talks_desc', 'The newest videos from anthroposophical YouTube channels') },
    { href: '/media/blogs', icon: 'article', title: t('app.media_blogs', 'Blogs'), desc: (blogCount ? blogCount + ' ' : '') + t('app.media_blogs_desc', 'Substack writers, with their latest post') },
    { href: '/media/podcasts', icon: 'podcasts', title: t('app.media_podcasts', 'Podcasts'), desc: PODCASTS.length + ' ' + t('app.media_podcasts_desc', 'podcasts to listen to') },
  ];

  return (
    <Screen underHeader title={t('app.media_title', 'Talks, blogs and podcasts')}>
      <Body muted>{t('app.media_hub_intro', 'Open a talk, blog or podcast to see it on its own page. Signed-in members can tap the heart to keep it in Settings > Saved.')}</Body>
      {sections.map((s) => (
        <Pressable key={s.title} onPress={() => router.push(s.href)} accessibilityRole="button" accessibilityLabel={s.title + '. ' + s.desc}
          style={({ pressed }) => [styles.row, { backgroundColor: c.elevated, borderColor: c.border, opacity: pressed ? 0.85 : 1 }]}>
          <View style={[styles.icon, { backgroundColor: c.surface }]}><MaterialIcons name={s.icon} size={24} color={c.goldText} /></View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.title, { color: c.text }]}>{s.title}</Text>
            <Text style={[styles.desc, { color: c.textSecondary }]}>{s.desc}</Text>
          </View>
          <MaterialIcons name="chevron-right" size={24} color={c.textMuted} />
        </Pressable>
      ))}
      {latest ? (
        <>
          <Text style={[styles.h, { color: c.text }]}>{t('app.media_newest', 'Newest talk')}</Text>
          <MediaCard m={latest} wide />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.lg },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: Fonts.bodyBold, fontSize: 17 },
  desc: { fontFamily: Fonts.body, fontSize: 14, lineHeight: 20 },
  h: { fontFamily: Fonts.heading, fontSize: 19, marginTop: Spacing.sm },
});
