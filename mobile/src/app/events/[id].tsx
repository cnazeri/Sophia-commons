// One event: poster, when (in the phone's time zone, plus local time at the event), where, join or tickets,
// add to calendar, share, directions, description.
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BookmarkButton } from '@/components/bookmark-button';
import { Button } from '@/components/button';
import { EventSignup } from '@/components/event-signup';
import { Body, Card, H1, Kicker } from '@/components/ui';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { addToCalendar } from '@/lib/calendar';
import { cancelReminder, remindEvent } from '@/lib/reminders';
import { toggleEvent, useSaved } from '@/lib/saved';
import { type EventRow, eventDescription, eventPlace, eventTitle, fetchEvent, sizedImage } from '@/lib/events';
import { useAuth } from '@/lib/auth';
import { localDate, localTime, t } from '@/lib/i18n';
import { reportItem } from '@/lib/report';
import { SITE } from '@/lib/supabase';
import { shareItem } from '@/lib/share';

export default function EventDetail() {
  const c = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [e, setE] = useState<EventRow | null | undefined>(undefined);
  const saved = useSaved();
  const { session } = useAuth();
  useEffect(() => { fetchEvent(String(id)).then(setE).catch(() => setE(null)); }, [id]);

  if (e === undefined) return <ActivityIndicator style={{ marginTop: 80 }} color={c.goldText} />;
  if (e === null) return <Body style={{ padding: Spacing.lg }}>{t('app.event_missing', 'This event could not be found. It may have been removed.')}</Body>;

  const img = sizedImage(e.image_url, 900);
  const phoneZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const otherZone = e.timezone && e.timezone !== phoneZone && !e.is_online ? e.timezone : null;
  const sameDayEnd = e.end_date && new Date(e.end_date).toDateString() === new Date(e.start_date).toDateString();
  const time = e.is_all_day ? t('event_detail.all_day', 'All day')
    : localTime(e.start_date) + (sameDayEnd ? ' - ' + localTime(e.end_date!) : '');
  const place = [e.location_name, e.address, eventPlace(e)].filter(Boolean).join(', ');
  const url = SITE + '/event/' + e.id;
  const directions = () => {
    const q = encodeURIComponent(place);
    Linking.openURL(Platform.OS === 'ios' ? 'http://maps.apple.com/?q=' + q : 'geo:0,0?q=' + q);
  };

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.wrap}>
      <Stack.Screen options={{ title: '' }} />
      {img ? <Image source={img} style={styles.poster} contentFit="contain" transition={200} accessibilityLabel={eventTitle(e)} /> : null}
      {/* Bookmark at the top, as on talk and blog pages (owner, 2026-11-22); same saved list as "Save and remind me" */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1 }}><Kicker>{e.is_online ? t('event_detail.online', 'Online') : t('app.in_person', 'In person')}{e.is_free ? ' · ' + t('event_detail.free', 'Free') : ''}</Kicker></View>
        <BookmarkButton event={e} />
      </View>
      <H1 style={{ marginTop: 0 }}>{eventTitle(e)}</H1>

      <Card>
        <Row label={t('event_detail.date', 'Date')} value={localDate(e.start_date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
          + (e.end_date && !sameDayEnd ? ' - ' + localDate(e.end_date, { month: 'long', day: 'numeric' }) : '')} />
        <Row label={t('event_detail.time', 'Time')} value={time} />
        {otherZone && !e.is_all_day ? <Row label={t('app.local_time', 'Local time there')} value={localTime(e.start_date, otherZone)} /> : null}
        {place ? <Row label={t('event_detail.where', 'Where')} value={place} /> : null}
        {e.organizer_name ? <Row label={t('event_detail.organizer', 'Organizer')} value={e.organizer_name} /> : null}
        {e.price_text || e.ticket_price ? <Row label={t('org.price', 'Price')} value={String(e.price_text || e.ticket_price)} /> : null}
      </Card>

      {/* Sign up in the app when the organizer has sign-ups on (owner, 2026-11-23) */}
      {e.signup_enabled ? <EventSignup e={e} /> : null}

      <View style={styles.actions}>
        {e.online_url ? <Button label={t('event_detail.join_online', 'Join online')} onPress={() => WebBrowser.openBrowserAsync(e.online_url!)} /> : null}
        {e.ticket_url ? <Button label={t('event_detail.get_tickets', 'Get tickets')} onPress={() => WebBrowser.openBrowserAsync(e.ticket_url!)} /> : null}
        {/* Saving is for signed-in members (owner, 2026-11-23) */}
        {session ? (
          <Button kind="secondary" label={saved.events[e.id] ? t('app.saved_reminder', 'Saved, reminder the day before') : t('app.save', 'Save and remind me')}
            onPress={async () => {
              try { if (await toggleEvent(e)) await remindEvent(e); else await cancelReminder(e); }
              catch { Alert.alert(t('saved.error', 'Could not save. Please try again.')); }
            }} />
        ) : null}
        <Button kind="secondary" label={t('app.add_to_calendar', 'Add to calendar')} onPress={() => addToCalendar(e)} />
        {place && !e.is_online ? <Button kind="secondary" label={t('app.directions', 'Directions')} onPress={directions} /> : null}
        <Button kind="secondary" label={t('app.share', 'Share')} onPress={() => shareItem('event', { message: eventTitle(e) + '\n' + url, url })} />
        {e.organizer_url ? <Button kind="secondary" label={t('event_detail.organizer_website', 'Organizer website')} onPress={() => WebBrowser.openBrowserAsync(e.organizer_url!)} /> : null}
      </View>

      {eventDescription(e) ? (
        <Card>
          <Text style={[styles.h, { color: c.text }]}>{t('event_detail.about', 'About this event')}</Text>
          <Body selectable>{eventDescription(e)}</Body>
        </Card>
      ) : null}

      <Pressable onPress={() => reportItem({ type: 'event', id: e.id, title: eventTitle(e), url }, session)} accessibilityRole="button"
        hitSlop={8} style={styles.report}>
        <Text style={[styles.reportText, { color: c.textMuted }]}>{t('app.report_event', 'Report this event')}</Text>
      </Pressable>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const c = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: c.textMuted }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: c.text }]} selectable>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  report: { alignSelf: 'center', paddingVertical: Spacing.md },
  reportText: { fontFamily: Fonts.bodySemi, fontSize: 13, textDecorationLine: 'underline' },
  wrap: { padding: Spacing.lg, gap: Spacing.md, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingBottom: 48 },
  poster: { width: '100%', aspectRatio: 4 / 3, borderRadius: 14 },
  actions: { gap: Spacing.sm },
  row: { gap: 2 },
  rowLabel: { fontFamily: Fonts.bodyBold, fontSize: 12, letterSpacing: 0.5, textTransform: 'uppercase' },
  rowValue: { fontFamily: Fonts.body, fontSize: 15.5, lineHeight: 21 },
  h: { fontFamily: Fonts.heading, fontSize: 18 },
});
