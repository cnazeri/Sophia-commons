// Settings > Saved: the member's saved events, places, articles, talks and favorite channels (members only, owner
// 2026-11-23). Same list as on sophiacommons.org; a copy stays on the phone so they open without a connection.
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AuthForm } from '@/components/auth-form';
import { EventCard } from '@/components/event-card';
import { LinkRow } from '@/components/link-row';
import { ListingCard } from '@/components/listing-card';
import { MediaCard } from '@/components/media-card';
import { NewsCard } from '@/components/news-card';
import { Body, H2, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { type FavChannel, fetchFavChannelRows, useFavChannels } from '@/lib/fav-channels';
import { t } from '@/lib/i18n';
import { refreshSaved, useSaved } from '@/lib/saved';

export default function SavedScreen() {
  const saved = useSaved();
  const { session } = useAuth();
  const [now] = useState(() => Date.now());
  useEffect(() => { refreshSaved(); }, []);   // pick up anything saved on the website since
  const events = Object.values(saved.events).sort((a, b) => a.start_date.localeCompare(b.start_date));
  const upcoming = events.filter((e) => Date.parse(e.end_date || e.start_date) > now - 864e5);
  const news = Object.values(saved.news || {}).sort((a, b) => b.published_at.localeCompare(a.published_at));
  const listings = Object.values(saved.listings).sort((a, b) => a.organization_name.localeCompare(b.organization_name));
  const media = Object.values(saved.media || {}).sort((a, b) => a.title.localeCompare(b.title));
  // Favorite YouTube channels of a signed-in member (owner, 2026-11-23), kept with the account, not on the phone
  const { favs } = useFavChannels();
  const favKey = [...favs].sort().join(',');
  const [channels, setChannels] = useState<FavChannel[]>([]);
  useEffect(() => {
    let alive = true;
    fetchFavChannelRows(favKey ? favKey.split(',') : []).then((r) => { if (alive) setChannels(r); }).catch(() => {});
    return () => { alive = false; };
  }, [favKey]);
  if (!session) {
    return (
      <Screen title={t('app.saved_title', 'Saved')} underHeader>
        <Body muted>{t('app.saved_sign_in', 'Sign in to save events, places, articles and talks with the heart. Your saved list is the same in the app and on sophiacommons.org.')}</Body>
        <AuthForm chatIntro={false} />
      </Screen>
    );
  }
  return (
    <Screen title={t('app.saved_title', 'Saved')} underHeader>
      {!upcoming.length && !listings.length && !news.length && !media.length && !channels.length ? (
        <Body muted>{t('app.saved_empty', 'Tap the heart on an event, a place, an article or a talk and it appears here and on sophiacommons.org, even without a connection. Saved events get a reminder the day before.')}</Body>
      ) : null}
      {upcoming.length ? (
        <View style={styles.section}>
          <H2>{t('nav.events', 'Events')}</H2>
          {upcoming.map((e) => <EventCard key={e.id} e={e} />)}
        </View>
      ) : null}
      {listings.length ? (
        <View style={styles.section}>
          <H2>{t('app.places', 'Places')}</H2>
          {listings.map((l) => <ListingCard key={l.id} l={l} />)}
        </View>
      ) : null}
      {news.length ? (
        <View style={styles.section}>
          <H2>{t('app.news', 'News')}</H2>
          {news.map((a) => <NewsCard key={a.id} a={a} from="saved" />)}
        </View>
      ) : null}
      {media.length ? (
        <View style={styles.section}>
          <H2>{t('app.media_title', 'Talks, blogs and podcasts')}</H2>
          {media.map((m) => <MediaCard key={m.kind + m.id} m={m} />)}
        </View>
      ) : null}
      {channels.length ? (
        <View style={styles.section}>
          <H2>{t('app.fav_channels', 'Favorite YouTube channels')}</H2>
          {channels.map((ch) => (
            <LinkRow key={ch.slug} title={ch.name} meta={ch.language || undefined} onPress={() => WebBrowser.openBrowserAsync(ch.url)} />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({ section: { gap: Spacing.sm, marginTop: Spacing.sm } });
