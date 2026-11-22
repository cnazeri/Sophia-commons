// A news article read inside the app. Works offline once opened or bookmarked; the original source is an
// optional link at the end, never where the reader is sent.
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { BookmarkButton } from '@/components/bookmark-button';
import { Button } from '@/components/button';
import { Body, Kicker } from '@/components/ui';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { localDate, t } from '@/lib/i18n';
import { type Article, fetchArticle, paragraphs } from '@/lib/news';
import { useSaved } from '@/lib/saved';
import { SITE } from '@/lib/supabase';

const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

export function ArticleView() {
  const c = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const saved = useSaved();
  const [a, setA] = useState<Article | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchArticle(String(id))
      .then((r) => { if (alive) setA(r); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [id]);

  const shown = a || saved.news[String(id)] || null;
  if (!shown) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        {failed ? <Body muted>{t('app.article_offline', 'This article is not on your phone yet. Open it once with a connection and it will be kept.')}</Body>
          : <ActivityIndicator color={c.goldText} />}
      </View>
    );
  }
  const url = SITE + '/article/' + shown.id;
  const openSource = () => { if (shown.source_url) WebBrowser.openBrowserAsync(shown.source_url); };
  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.wrap}>
      <View style={styles.head}>
        <Kicker>{localDate(shown.published_at, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</Kicker>
        <BookmarkButton article={shown} />
      </View>
      <Text style={[styles.title, { color: c.text }]} selectable>{shown.title}</Text>
      {shown.source_url ? (
        <Pressable onPress={openSource} accessibilityRole="link" hitSlop={6}
          accessibilityLabel={t('app.read_source', 'Original source') + ': ' + (shown.source_name || hostOf(shown.source_url))}
          style={({ pressed }) => [styles.srcRow, { opacity: pressed ? 0.6 : 1 }]}>
          <Text style={[styles.source, styles.srcLink, { color: c.goldText }]}>{shown.source_name || hostOf(shown.source_url)}</Text>
          <MaterialIcons name="open-in-new" size={15} color={c.goldText} />
        </Pressable>
      ) : shown.source_name ? <Text style={[styles.source, { color: c.textMuted }]}>{shown.source_name}</Text> : null}
      {paragraphs(shown.body || shown.excerpt).map((p, i) => (
        <Text key={i} style={[styles.para, { color: c.text }]} selectable>{p}</Text>
      ))}
      <View style={styles.actions}>
        {shown.source_url ? (
          <Button label={t('app.read_full', 'Read the full article at') + ' ' + (shown.source_name || hostOf(shown.source_url))} onPress={openSource} />
        ) : null}
        <Button kind="secondary" label={t('app.share', 'Share')} onPress={() => Share.share({ message: shown.title + '\n' + url, url })} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  wrap: { padding: Spacing.lg, gap: Spacing.md, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingBottom: 120 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: Fonts.headingBold, fontSize: 26, lineHeight: 32 },
  source: { fontFamily: Fonts.bodySemi, fontSize: 14 },
  srcRow: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  srcLink: { textDecorationLine: 'underline' },
  para: { fontFamily: Fonts.body, fontSize: 17, lineHeight: 26 },
  actions: { gap: Spacing.sm, marginTop: Spacing.md },
});
