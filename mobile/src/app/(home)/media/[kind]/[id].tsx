// One talk, blog or podcast on its own page: picture, details, bookmark (saved to Settings > Saved), the main button
// (Watch on YouTube / Read the latest post / Listen) and Share. Opens from lists, from Saved, or from a shared link.
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { BookmarkButton } from '@/components/bookmark-button';
import { Button } from '@/components/button';
import { Body, H1, Kicker, Screen } from '@/components/ui';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { toggleFavChannel, useFavChannels } from '@/lib/fav-channels';
import { localDate, t } from '@/lib/i18n';
import { type MediaItem, fetchMediaItem, languageName, mediaKey } from '@/lib/media';
import { useSaved } from '@/lib/saved';
import { shareItem } from '@/lib/share';

export default function MediaItemScreen() {
  const c = useTheme();
  const { kind, id } = useLocalSearchParams<{ kind: string; id: string }>();
  const saved = useSaved();
  const fav = useFavChannels();
  const [busy, setBusy] = useState(false);
  // A saved copy opens at once (and offline); the live copy replaces it when it loads
  const [m, setM] = useState<MediaItem | null | undefined>(() => (saved.media || {})[String(kind) + ':' + String(id)]);
  useEffect(() => {
    fetchMediaItem(String(kind), String(id)).then((x) => setM((old) => x || old || null)).catch(() => setM((old) => old || null));
  }, [kind, id]);

  if (m === undefined) return <Screen underHeader><ActivityIndicator color={c.goldText} /></Screen>;
  if (!m) return <Screen underHeader><Body muted>{t('app.media_missing', 'This could not be found. It may have been removed.')}</Body></Screen>;

  const label = { video: t('app.media_talk', 'Talk'), blog: t('app.media_blog', 'Blog'), podcast: t('app.media_podcast', 'Podcast') }[m.kind];
  const open = { video: t('app.media_watch', 'Watch on YouTube'), blog: t('app.media_read_latest', 'Read the latest post'), podcast: t('app.media_listen', 'Listen') }[m.kind];
  const kicker = [label, m.meta, m.date ? localDate(m.date, { month: 'long', day: 'numeric', year: 'numeric' }) : ''].filter(Boolean).join(' · ');
  return (
    <Screen underHeader>
      {m.image ? <Image source={m.image} style={m.kind === 'video' ? styles.pic : styles.logo}
        contentFit="cover" transition={150} accessibilityLabel={m.title} /> : null}
      <View style={styles.head}>
        <View style={{ flex: 1 }}><Kicker>{kicker}</Kicker></View>
        <BookmarkButton media={m} />
      </View>
      <H1 style={{ marginTop: 0 }}>{m.title}</H1>
      {m.kind === 'video' && m.lang ? (
        <Body muted style={{ fontSize: 14 }}>{t('app.media_language', 'Language')}: {languageName(m.lang)}
          {m.lang !== 'en' && m.original ? '\n' + t('app.media_original_title', 'Original title') + ': ' + m.original : ''}</Body>
      ) : null}
      {m.body ? <Body>{m.kind === 'blog' ? t('podcasts.substack_latest', 'Latest:') + ' ' + m.body : m.body}</Body> : null}
      <Button label={open} onPress={() => WebBrowser.openBrowserAsync(m.url)} />
      {m.kind === 'blog' && m.home && m.home !== m.url ? <Button kind="secondary" label={t('app.media_open_blog', 'Open the blog')} onPress={() => WebBrowser.openBrowserAsync(m.home!)} /> : null}
      {m.kind === 'video' && m.channel && fav.userId ? (
        // Favorite channels (owner, 2026-11-23): their talks show first in Talks, same list as on the website
        <Button kind="secondary" disabled={busy}
          label={(fav.favs.has(m.channel) ? t('app.fav_channel_remove', 'Remove from favorite channels') : t('app.fav_channel_add', 'Add channel to favorites')) + (m.meta ? ': ' + m.meta : '')}
          onPress={async () => {
            setBusy(true);
            try { await toggleFavChannel(m.channel!, fav.userId!); } catch { Alert.alert(t('saved.error', 'Could not save. Please try again.')); }
            setBusy(false);
          }} />
      ) : null}
      <Button kind="secondary" label={t('app.share', 'Share')} onPress={() => shareItem('media', { message: m.title + '\n' + m.url })} />
      <Body muted style={{ fontSize: 13 }}>{!fav.userId
        ? t('app.media_saved_signin', 'Sign in to save this with the heart.')
        : saved.media?.[mediaKey(m)]
          ? t('app.media_saved_yes', 'Saved. Find it in Settings > Saved.')
          : t('app.media_saved_hint', 'Tap the heart to keep this in Settings > Saved.')}</Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pic: { width: '100%', aspectRatio: 16 / 9, borderRadius: Radius.lg },
  logo: { width: 160, height: 160, borderRadius: Radius.lg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
