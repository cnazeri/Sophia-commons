// Events: upcoming events grouped by day, with filters.
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chips } from '@/components/chips';
import { EventCard } from '@/components/event-card';
import { Body, H1, Wordmark } from '@/components/ui';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { type EventFilter, type EventRow, fetchUpcoming, matches } from '@/lib/events';
import { localDate, t } from '@/lib/i18n';

export default function EventsScreen() {
  const c = useTheme();
  const [rows, setRows] = useState<EventRow[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<EventFilter>('all');
  const [refreshing, setRefreshing] = useState(false);

  const load = () => fetchUpcoming()
    .then((r) => { setRows(r); setError(''); })
    .catch((e: Error) => setError(e.message));
  useEffect(() => {
    let alive = true;
    fetchUpcoming().then((r) => { if (alive) setRows(r); }).catch((e: Error) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, []);

  const sections = useMemo(() => {
    const byDay = new Map<string, EventRow[]>();
    (rows || []).filter((e) => matches(e, filter))
      .sort((a, b) => a.start_date.localeCompare(b.start_date))
      .forEach((e) => {
        const key = new Date(e.start_date).toDateString();
        byDay.set(key, [...(byDay.get(key) || []), e]);
      });
    return [...byDay.values()].map((list) => ({ title: localDate(list[0].start_date, { weekday: 'long', month: 'long', day: 'numeric' }), data: list }));
  }, [rows, filter]);

  const header = (
    <View style={styles.head}>
      <Wordmark post />
      <H1>{t('app.events_title', 'Upcoming events')}</H1>
      <Chips<EventFilter> value={filter} onChange={setFilter} items={[
        { key: 'all', label: t('app.filter_all', 'All') },
        { key: 'online', label: t('event_detail.online', 'Online') },
        { key: 'in_person', label: t('app.filter_in_person', 'In person') },
        { key: 'festival', label: t('app.filter_festivals', 'Festivals') },
      ]} />
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.background }}>
      {!rows && !error ? <ActivityIndicator style={{ marginTop: 80 }} color={c.goldText} /> : (
        <SectionList
          sections={sections}
          keyExtractor={(e) => e.id}
          ListHeaderComponent={header}
          renderSectionHeader={({ section }) => <Text style={[styles.day, { color: c.goldText, backgroundColor: c.background }]}>{section.title}</Text>}
          renderItem={({ item }) => <View style={styles.item}><EventCard e={item} /></View>}
          ListEmptyComponent={<Body muted style={{ padding: Spacing.lg }}>{error ? t('app.load_error', 'Could not load events. Pull down to try again.') : t('app.no_events', 'No events match this filter.')}</Body>}
          refreshControl={<RefreshControl refreshing={refreshing} tintColor={c.goldText} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  head: { gap: Spacing.md, paddingBottom: Spacing.sm },
  day: { fontFamily: Fonts.bodyBold, fontSize: 13, letterSpacing: 0.6, textTransform: 'uppercase', paddingTop: Spacing.lg, paddingBottom: Spacing.sm },
  item: { paddingBottom: Spacing.sm },
});
