// One event in a list: date block, title, time and place, small poster.
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Fonts, Radius, Spacing } from '@/constants/theme';
import { BookmarkButton } from '@/components/bookmark-button';
import { useTheme } from '@/hooks/use-theme';
import { type EventRow, eventPlace, eventTitle, sizedImage } from '@/lib/events';
import { localDate, localTime, t } from '@/lib/i18n';

export function EventCard({ e }: { e: EventRow }) {
  const c = useTheme();
  const img = sizedImage(e.image_url, 240);
  const when = e.is_all_day ? t('event_detail.all_day', 'All day') : localTime(e.start_date);
  const where = e.is_online ? t('event_detail.online', 'Online') : eventPlace(e);
  return (
    <Pressable onPress={() => router.push({ pathname: '/events/[id]', params: { id: e.id } })}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })} accessibilityRole="link" accessibilityLabel={eventTitle(e) + ', ' + localDate(e.start_date, { weekday: 'long', month: 'long', day: 'numeric' }) + ', ' + where}>
        <View style={[styles.row, { backgroundColor: c.elevated, borderColor: c.border }]}>
        <View style={[styles.date, { backgroundColor: c.surface }]}>
          <Text style={[styles.month, { color: c.goldText }]}>{localDate(e.start_date, { month: 'short' }).toUpperCase()}</Text>
          <Text style={[styles.day, { color: c.text }]}>{localDate(e.start_date, { day: 'numeric' })}</Text>
          <Text style={[styles.wd, { color: c.textMuted }]}>{localDate(e.start_date, { weekday: 'short' })}</Text>
        </View>
        <View style={styles.main}>
          <Text style={[styles.title, { color: c.text }]} numberOfLines={3}>{eventTitle(e)}</Text>
          <Text style={[styles.meta, { color: c.textMuted }]} numberOfLines={1}>{[when, where].filter(Boolean).join(' · ')}</Text>
          {e.organizer_name ? <Text style={[styles.meta, { color: c.textMuted }]} numberOfLines={1}>{e.organizer_name}</Text> : null}
        </View>
        {img ? <Image source={img} style={styles.thumb} contentFit="cover" transition={150} accessibilityIgnoresInvertColors /> : null}
        <BookmarkButton event={e} />
        </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.md, padding: Spacing.md, borderWidth: 1, borderRadius: Radius.lg, alignItems: 'center' },
  date: { width: 56, borderRadius: Radius.md, paddingVertical: 6, alignItems: 'center' },
  month: { fontFamily: Fonts.bodyBold, fontSize: 11, letterSpacing: 1 },
  day: { fontFamily: Fonts.headingBold, fontSize: 22, lineHeight: 26 },
  wd: { fontFamily: Fonts.bodySemi, fontSize: 11 },
  main: { flex: 1, gap: 3 },
  title: { fontFamily: Fonts.bodyBold, fontSize: 15.5, lineHeight: 20 },
  meta: { fontFamily: Fonts.body, fontSize: 13 },
  thumb: { width: 64, height: 64, borderRadius: Radius.md },
});
