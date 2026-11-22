// Saved: bookmarked events, places and news articles kept on the phone, so they open without a connection.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { EventCard } from '@/components/event-card';
import { ListingCard } from '@/components/listing-card';
import { NewsCard } from '@/components/news-card';
import { Body, H2, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { t } from '@/lib/i18n';
import { useSaved } from '@/lib/saved';

export default function SavedScreen() {
  const saved = useSaved();
  const [now] = useState(() => Date.now());
  const events = Object.values(saved.events).sort((a, b) => a.start_date.localeCompare(b.start_date));
  const upcoming = events.filter((e) => Date.parse(e.end_date || e.start_date) > now - 864e5);
  const news = Object.values(saved.news || {}).sort((a, b) => b.published_at.localeCompare(a.published_at));
  const listings = Object.values(saved.listings).sort((a, b) => a.organization_name.localeCompare(b.organization_name));
  return (
    <Screen title={t('app.saved_title', 'Saved')}>
      {!upcoming.length && !listings.length && !news.length ? (
        <Body muted>{t('app.saved_empty', 'Tap the bookmark on an event, a place or a news article and it appears here, even without a connection. Bookmarked events get a reminder the day before.')}</Body>
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
    </Screen>
  );
}

const styles = StyleSheet.create({ section: { gap: Spacing.sm, marginTop: Spacing.sm } });
