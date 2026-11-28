// Pieces of the 2026-11-24 redesign shared by Home, Events and the Directory (owner: the website mockup's calmer look,
// one accent, custom anthroposophical icons): section headings, category tiles, the swipeable event card, the day's
// exercise, and the Follow card.
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { type ReactNode, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BookmarkButton } from '@/components/bookmark-button';
import { Icon, type IconName } from '@/components/icon';
import { Card, Kicker } from '@/components/ui';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import exercises from '@/data/day-exercises.json';
import { type EventRow, eventPlace, eventTitle, sizedImage } from '@/lib/events';
import { headingFont } from '@/lib/heading-font';
import { getLang, localDate, localTime, t } from '@/lib/i18n';

export const GOLD_TINT = 'rgba(201,160,53,0.16)';

/** A section title with an optional link on the same line */
export function SectionHead({ title, link, onPress }: { title: string; link?: string; onPress?: () => void }) {
  const c = useTheme();
  return (
    <View style={styles.head}>
      <Text style={[styles.headTitle, { color: c.text, fontFamily: headingFont(title) }]} accessibilityRole="header">{title}</Text>
      {link && onPress ? (
        <Pressable onPress={onPress} hitSlop={10} accessibilityRole="link" style={styles.headLink}>
          <Text style={[styles.linkText, { color: c.goldText }]}>{link}</Text>
          <Icon name="arrow" size={15} color={c.goldText} />
        </Pressable>
      ) : null}
    </View>
  );
}

export const CATEGORY_TILES: { key: string; label: string; icon: IconName; count?: string }[] = [
  { key: 'waldorf', label: 'Waldorf schools', icon: 'waldorf' },
  { key: 'biodynamic', label: 'Biodynamic farms', icon: 'biodynamic' },
  { key: 'christian_community', label: 'The Christian Community', icon: 'christian' },
  { key: 'camphill', label: 'Camphill', icon: 'camphill' },
  { key: 'societies', label: 'Societies and branches', icon: 'societies' },
  { key: 'eurythmy', label: 'Eurythmy and arts', icon: 'eurythmy' },
  { key: 'medicine', label: 'Anthroposophic medicine', icon: 'medicine' },
  { key: 'eldercare', label: 'Eldercare', icon: 'eldercare' },
];

/** Category tiles, two to a row; `onPick` receives the category key */
export function CategoryTiles({ count = 8, selected, onPick }: { count?: number; selected?: string; onPick: (key: string) => void }) {
  const c = useTheme();
  return (
    <View style={styles.tiles}>
      {CATEGORY_TILES.slice(0, count).map((x) => {
        const on = selected === x.key;
        return (
          <Pressable key={x.key} onPress={() => onPick(x.key)} accessibilityRole="button" accessibilityState={{ selected: on }}
            style={({ pressed }) => [styles.tile, { backgroundColor: c.elevated, borderColor: on ? c.gold : c.border, opacity: pressed ? 0.85 : 1 }]}>
            <View style={[styles.tileIcon, { backgroundColor: GOLD_TINT }]}><Icon name={x.icon} size={21} color={c.goldText} /></View>
            <Text style={[styles.tileLabel, { color: c.text }]} numberOfLines={2}>{t('app.cat_tile_' + x.key, x.label)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Language names when Intl.DisplayNames is missing (older Android engines)
const LANG_FALLBACK: Record<string, string> = { en: 'English', de: 'German', es: 'Spanish', ru: 'Russian', fr: 'French', nl: 'Dutch', it: 'Italian', pt: 'Portuguese' };

/** An event's language in the app's language, e.g. "German"; events with none set are English, as on the website */
function languageName(code?: string | null): string {
  const lang = code || 'en';
  try {
    const names = new Intl.DisplayNames([getLang()], { type: 'language' });
    return names.of(lang) || LANG_FALLBACK[lang] || lang.toUpperCase();
  } catch {
    return LANG_FALLBACK[lang] || lang.toUpperCase();
  }
}

/** "Online · English" or "In person · German" (owner, 2026-11-25) */
export function eventFormat(e: EventRow): string {
  const how = e.is_online ? t('home2.online', 'Online') : t('home2.in_person', 'In person');
  return how + ' · ' + languageName(e.lang);
}

/** An event as a card with its picture on top, for rows that swipe sideways */
export function EventTile({ e, width = 250 }: { e: EventRow; width?: number }) {
  const c = useTheme();
  const img = sizedImage(e.image_url, 600);
  const when = localDate(e.start_date, { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase() + ' · ' + (e.is_all_day ? t('event_detail.all_day', 'All day') : localTime(e.start_date));
  return (
    <Pressable onPress={() => router.push({ pathname: '/events/[id]', params: { id: e.id } })} accessibilityRole="link"
      accessibilityLabel={eventTitle(e) + ', ' + when}
      style={({ pressed }) => [styles.evTile, { width, backgroundColor: c.elevated, borderColor: c.border, opacity: pressed ? 0.9 : 1 }]}>
      <View style={[styles.evPic, { backgroundColor: c.surface }]}>
        {img ? <Image source={img} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} /> : null}
        <View style={styles.evSave}><BookmarkButton event={e} /></View>
      </View>
      <View style={styles.evBody}>
        <Kicker numberOfLines={1}>{when}</Kicker>
        <Text style={[styles.evTitle, { color: c.text }]} numberOfLines={2}>{eventTitle(e)}</Text>
        <Text style={[styles.evFmt, { color: c.textMuted }]} numberOfLines={1}>{eventFormat(e)}</Text>
        <View style={styles.evWhere}>
          <Icon name={e.is_online ? 'web' : 'pin'} size={14} color={c.textMuted} />
          <Text style={[styles.small, { color: c.textSecondary }]} numberOfLines={1}>{e.is_online ? t('event_detail.online', 'Online') : eventPlace(e)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

type Exercise = { day: number; name: string; theme: string; text: string[] };

/** For the Days of the Week (GA 245): today's exercise, with the daily review; all eight open in place */
export function DayExercise() {
  const c = useTheme();
  const [all, setAll] = useState(false);
  const days = exercises.days as Exercise[];
  const today = days.find((x) => x.day === new Date().getDay()) || days[0];
  const dayName = (d: number) => localDate(new Date(2023, 0, 1 + d).toISOString(), { weekday: 'long' });
  return (
    <Card>
      <Kicker>{t('days.title', 'For the days of the week')} · {dayName(today.day)}</Kicker>
      <Text style={[styles.exName, { color: c.text }]}>{today.name}</Text>
      <Text style={[styles.exTheme, { color: c.textSecondary }]}>{today.theme}</Text>
      <Text style={[styles.exText, { color: c.textSecondary }]} selectable>{today.text[0]}</Text>
      <View style={[styles.exDaily, { backgroundColor: GOLD_TINT }]}>
        <Icon name="star" size={15} color={c.goldText} />
        <Text style={[styles.small, { color: c.textSecondary, flex: 1 }]}>
          {t('days.daily', 'Daily')}: {exercises.daily.name.toLowerCase()}, {t('days.five_min', 'five minutes of looking within')}
        </Text>
      </View>
      {all ? (
        <View style={{ gap: Spacing.md, marginTop: Spacing.xs }}>
          {[...days.slice(6), ...days.slice(0, 6)].map((x) => (
            <View key={x.day} style={{ gap: 4 }}>
              <Kicker>{dayName(x.day)}{x.day === today.day ? ' · ' + t('days.today', 'today') : ''}</Kicker>
              <Text style={[styles.exAllName, { color: c.text }]}>{x.name} <Text style={{ color: c.textMuted, fontFamily: Fonts.body }}>{x.theme}</Text></Text>
              {x.text.map((p, i) => <Text key={i} style={[styles.exText, { color: c.textSecondary }]} selectable>{p}</Text>)}
            </View>
          ))}
          <View style={{ gap: 4 }}>
            <Kicker>{t('days.every_day', 'Every day')}</Kicker>
            <Text style={[styles.exAllName, { color: c.text }]}>{exercises.daily.name} <Text style={{ color: c.textMuted, fontFamily: Fonts.body }}>{exercises.daily.theme}</Text></Text>
            {exercises.daily.text.map((p, i) => <Text key={i} style={[styles.exText, { color: c.textSecondary }]} selectable>{p}</Text>)}
          </View>
          <Text style={[styles.small, { color: c.textMuted }]}>{exercises.source}</Text>
        </View>
      ) : null}
      <Pressable onPress={() => setAll(!all)} hitSlop={8} accessibilityRole="button" accessibilityState={{ expanded: all }} style={styles.headLink}>
        <Text style={[styles.linkText, { color: c.goldText }]}>{all ? t('days.fewer', 'Show only today') : t('days.all', 'Read all eight exercises')}</Text>
        {all ? null : <Icon name="arrow" size={15} color={c.goldText} />}
      </Pressable>
    </Card>
  );
}

/** Follow Sophia Commons on Instagram and X */
export function FollowCard() {
  const c = useTheme();
  const row = (icon: IconName, name: string, handle: string, url: string) => (
    <Pressable onPress={() => WebBrowser.openBrowserAsync(url)} accessibilityRole="link" accessibilityLabel={name + ' ' + handle}
      style={({ pressed }) => [styles.follow, { borderColor: c.border, backgroundColor: c.elevated, opacity: pressed ? 0.85 : 1 }]}>
      <Icon name={icon} size={20} color={c.goldText} />
      <View><Text style={[styles.followName, { color: c.text }]}>{name}</Text><Text style={[styles.small, { color: c.textMuted }]}>{handle}</Text></View>
    </Pressable>
  );
  return (
    <Card>
      <Kicker>{t('home.social_heading', 'Follow Sophia Commons')}</Kicker>
      {row('instagram', 'Instagram', '@sophiacommons7', 'https://www.instagram.com/sophiacommons7/')}
      {row('x', 'X', '@SophiaCommons7', 'https://x.com/SophiaCommons7')}
    </Card>
  );
}

/** A plain section wrapper with the redesign's spacing */
export function Section({ children }: { children: ReactNode }) {
  return <View style={styles.section}>{children}</View>;
}

const styles = StyleSheet.create({
  section: { gap: Spacing.sm, marginTop: Spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm, minHeight: 32 },
  headTitle: { fontFamily: Fonts.headingBold, fontSize: 21, lineHeight: 27, flexShrink: 1 },
  headLink: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 32 },
  linkText: { fontFamily: Fonts.bodyBold, fontSize: 14 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '48.5%', flexGrow: 1, flexBasis: '45%', minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderRadius: Radius.lg },
  tileIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { flex: 1, fontFamily: Fonts.bodyBold, fontSize: 14, lineHeight: 18 },
  // As the website's .h2-card: 14px corners, a hairline border, the picture edge to edge at 16/10
  evTile: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  evPic: { aspectRatio: 16 / 10, width: '100%' },
  evSave: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(253,251,247,0.88)', borderRadius: 999 },   // no padding: empty (no dot) when signed out
  evBody: { padding: 12, gap: 4, flex: 1 },
  evTitle: { fontFamily: Fonts.bodyBold, fontSize: 15.5, lineHeight: 20, minHeight: 40 },
  evFmt: { fontFamily: Fonts.bodySemi, fontSize: 12.5, lineHeight: 17, marginTop: 2 },
  evWhere: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  small: { fontFamily: Fonts.body, fontSize: 13.5, lineHeight: 19 },
  exName: { fontFamily: Fonts.headingBold, fontSize: 21, lineHeight: 27 },
  exTheme: { fontFamily: Fonts.bodyBold, fontSize: 13.5, marginTop: -4 },
  exText: { fontFamily: Fonts.body, fontSize: 15, lineHeight: 23 },
  exAllName: { fontFamily: Fonts.heading, fontSize: 17 },
  exDaily: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 10, borderRadius: 10 },
  follow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1, borderRadius: Radius.md },
  followName: { fontFamily: Fonts.bodyBold, fontSize: 15 },
});
