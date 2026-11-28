// Cards for the Home redesign phase 2 (owner, 2026-11-25, after the website's home2.js and the .h2-* styles):
// the picture card used for new places and talks, the coming festival, Remembering this week, and Take part.
import { Image } from 'expo-image';
import { type Href, router } from 'expo-router';
import { type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BookmarkButton } from '@/components/bookmark-button';
import { Icon, type IconName } from '@/components/icon';
import { GOLD_TINT, Section, SectionHead } from '@/components/redesign';
import { Card, Kicker } from '@/components/ui';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Listing } from '@/lib/directory';
import { sizedImage } from '@/lib/events';
import { adventSunday, daysUntil, type NewPlaces, rememberParts } from '@/lib/home';
import { localDate, t } from '@/lib/i18n';
import { type Video, videoItem } from '@/lib/media';
import { dayParam, type YearDay } from '@/lib/year';
import { headingFont } from '@/lib/heading-font';
import * as WebBrowser from 'expo-web-browser';

export const TILE_WIDTH = 250;
const ROW_GAP = 12;
const ADVENT_LIGHTS = ['The light of stones', 'The light of plants', 'The light of animals', 'The light of human beings'];

const openDay = (d: YearDay) => router.push({ pathname: '/day/[key]', params: { key: d.key, day: dayParam(d.date) } });
/** The first sentence of a description (the website splits after the first full stop) */
const firstSentence = (s?: string | null) => { const m = /^.*?\.(?=\s|$)/.exec(s || ''); return m ? m[0] : s || ''; };
const shortDay = (d: Date) => localDate(d.toISOString(), { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();

type PicCardProps = {
  img: string | null; title: string; onPress: () => void; label: string;
  kicker?: string; meta?: string; metaIcon?: IconName; width?: number; aspect?: number;
  corner?: ReactNode; badge?: string; play?: boolean;
};

/** A card with its picture edge to edge on top (the website's .h2-card.h2-ev) */
export function PicCard({ img, title, onPress, label, kicker, meta, metaIcon, width, aspect = 16 / 10, corner, badge, play }: PicCardProps) {
  const c = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={label}
      style={({ pressed }) => [styles.card, width ? { width } : null, { backgroundColor: c.elevated, borderColor: c.border, opacity: pressed ? 0.9 : 1 }]}>
      <View style={[styles.pic, { aspectRatio: aspect, backgroundColor: c.surface }]}>
        {img ? <Image source={img} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} /> : null}
        {play ? <View style={styles.play}><Icon name="play" size={22} color="#FFFFFF" /></View> : null}
        {badge ? <Text style={styles.badge}>{badge}</Text> : null}
        {corner ? <View style={styles.corner}>{corner}</View> : null}
      </View>
      <View style={styles.body}>
        {kicker ? <Kicker numberOfLines={1}>{kicker}</Kicker> : null}
        <Text style={[styles.title, { color: c.text }]} numberOfLines={2}>{title}</Text>
        {meta ? (
          <View style={styles.meta}>
            {metaIcon ? <Icon name={metaIcon} size={14} color={c.textMuted} /> : null}
            <Text style={[styles.small, { color: c.textSecondary, flex: 1 }]} numberOfLines={2}>{meta}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

/** A row of cards that swipes sideways on phones, bleeding to the screen edges */
export function CardRow({ children }: { children: ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.row}
      snapToInterval={TILE_WIDTH + ROW_GAP} decelerationRate="fast">
      {children}
    </ScrollView>
  );
}

/** New in the directory: listings added this week that have a picture */
export function NewPlacesSection({ data }: { data: NewPlaces }) {
  if (!data.places.length) return null;
  return (
    <Section>
      <SectionHead title={t('home2.new_places', 'New in the directory')} link={t('home2.n_this_week', '{n} this week', { n: data.count })}
        onPress={() => router.push('/directory')} />
      <CardRow>
        {data.places.map((x) => {
          const place = [x.location, x.country].filter(Boolean).join(', ') || t('event_detail.online', 'Online');
          return (
            <PicCard key={x.id} width={TILE_WIDTH} img={sizedImage(x.photo_url, 600)} title={x.organization_name}
              kicker={t('home2.new', 'New')} meta={place} metaIcon="pin" label={x.organization_name + ', ' + place}
              corner={<BookmarkButton listing={x as Listing} />}
              onPress={() => router.push({ pathname: '/directory/[id]', params: { id: x.id } })} />
          );
        })}
      </CardRow>
    </Section>
  );
}

/** Talks and podcasts: the newest talk from each channel */
export function TalksSection({ videos }: { videos: Video[] }) {
  if (!videos.length) return null;
  return (
    <Section>
      <SectionHead title={t('home2.talks', 'Talks and podcasts')} link={t('home2.all_channels', 'All channels')} onPress={() => router.push('/media')} />
      <CardRow>
        {videos.map((v) => {
          const m = videoItem(v);
          return (
            <PicCard key={v.video_id} width={TILE_WIDTH} aspect={16 / 9} img={m.image || null} title={m.title} meta={m.meta}
              label={m.title + (m.meta ? ', ' + m.meta : '')} play corner={<BookmarkButton media={m} />}
              onPress={() => router.push({ pathname: '/media/[kind]/[id]', params: { kind: m.kind, id: m.id } })} />
          );
        })}
      </CardRow>
    </Section>
  );
}

/** The coming festival, up to three weeks ahead, with "in 4 days" on the picture (h2FestivalCard) */
export function FestivalCard({ day }: { day: YearDay }) {
  const n = daysUntil(day.date);
  const advent = adventSunday(day.title);
  const line = advent ? t('home2.advent_light_' + advent, ADVENT_LIGHTS[advent - 1]) : firstSentence(day.desc);
  const badge = n === 0 ? t('home2.today', 'Today') : n === 1 ? t('home2.tomorrow', 'Tomorrow') : t('home2.in_days', 'in {n} days', { n });
  return (
    <PicCard img={day.img ? sizedImage(day.img.src, 800) : null} title={day.title} badge={badge}
      kicker={shortDay(day.date) + ' · ' + t('home2.festival', 'Festival').toUpperCase()} meta={line} metaIcon="waldorf"
      label={day.title + ', ' + badge} onPress={() => openDay(day)} />
  );
}

/** Remembering this week: the next memorial day, with initials in a circle (h2RememberCard) */
// ── Advent and the Holy Nights: a banner at the top of Home in season, Nov 28 to Jan 7, as on the website (owner,
// 2026-11-28). It scrolls with the page and opens the website's Advent page. ──
const ADVENT_URL = 'https://sophiacommons.org/advent';
const ADVENT_SEAL = 'https://bnrvgitzbpocratvszgk.supabase.co/storage/v1/object/public/event-images/festivals/holynights.jpg';
const ADVENT_NIGHT = '#1C1A2B';
/** Advent Sunday 1 of a year: the fourth Sunday before December 25 */
function firstAdventSunday(year: number): Date {
  const xmas = new Date(year, 11, 25);
  const back = xmas.getDay() === 0 ? 28 : 21 + xmas.getDay();
  return new Date(year, 11, 25 - back);
}
export function adventLine(now = new Date()): string | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const year = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear();
  const first = firstAdventSunday(year), from = new Date(first.getFullYear(), first.getMonth(), first.getDate() - 1);
  const holy = new Date(year, 11, 24), until = new Date(year + 1, 0, 7);
  if (today < from || today > until) return null;
  if (today < first) return t('advent.app_soon', 'Advent begins Sunday: the Advent calendar, gatherings and the Holy Nights');
  if (today < holy) {
    const week = Math.min(4, Math.floor((today.getTime() - first.getTime()) / (7 * 864e5)) + 1);
    return t('advent.app_week_' + week, ['First', 'Second', 'Third', 'Fourth'][week - 1] + ' week of Advent: open today\'s door in the Advent calendar');
  }
  return t('advent.app_holy', 'The Holy Nights, from Christmas to Epiphany');
}
export function AdventBanner() {
  const line = adventLine();
  if (!line) return null;
  return (
    <Pressable onPress={() => WebBrowser.openBrowserAsync(ADVENT_URL)} accessibilityRole="link" accessibilityLabel={t('advent.banner_title', 'Advent and the Holy Nights') + '. ' + line}
      style={({ pressed }) => [styles.adv, { backgroundColor: ADVENT_NIGHT, opacity: pressed ? 0.9 : 1 }]}>
      <Image source={{ uri: ADVENT_SEAL }} style={styles.advSeal} contentFit="cover" />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.advTitle, { fontFamily: headingFont(t('advent.banner_title', 'Advent and the Holy Nights')) }]}>{t('advent.banner_title', 'Advent and the Holy Nights')}</Text>
        <Text style={styles.advLine}>{line}</Text>
      </View>
      <Icon name="chevron" size={18} color="#F3D27A" />
    </Pressable>
  );
}

export function RememberCard({ day }: { day: YearDay }) {
  const c = useTheme();
  const r = rememberParts(day.title);
  const when = localDate(day.date.toISOString(), { month: 'long', day: 'numeric' }) + (r.years ? ', ' + t('home2.years_ago', '{n} years ago', { n: r.years }) : '');
  return (
    <Card>
      <Kicker>{t('home2.remembering', 'Remembering this week')}</Kicker>
      <Pressable onPress={() => openDay(day)} accessibilityRole="link" accessibilityLabel={r.name + ', ' + when}
        style={({ pressed }) => [styles.rm, { opacity: pressed ? 0.85 : 1 }]}>
        <View style={[styles.ini, { backgroundColor: GOLD_TINT }]}><Text style={[styles.iniText, { color: c.goldText, fontFamily: headingFont(r.initials) }]}>{r.initials}</Text></View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.rmName, { color: c.text, fontFamily: headingFont(r.name) }]}>{r.name}</Text>
          <Text style={[styles.small, { color: c.textMuted }]}>{when}</Text>
          {day.desc ? <Text style={[styles.small, { color: c.textSecondary }]} numberOfLines={3}>{day.desc}</Text> : null}
        </View>
        <Icon name="chevron" size={18} color={c.textMuted} />
      </Pressable>
    </Card>
  );
}

const TAKE_PART: { icon: IconName; title: [string, string]; sub: [string, string]; href: Href }[] = [
  { icon: 'events', title: ['home2.post_event', 'Post an event'], sub: ['home2.post_event_sub', 'Free, and seen by readers worldwide'], href: '/post/event' },
  { icon: 'directory', title: ['home2.add_place', 'Add a place'], sub: ['home2.add_place_sub', 'A school, farm or community'], href: '/post/place' },
  { icon: 'pen', title: ['home2.write', 'Write an article'], sub: ['home2.write_sub', 'A reflection, report or question'], href: '/post/community' },
  { icon: 'chat', title: ['app.board_join', 'Join the board'], sub: ['app.board_join_sub', 'Posts and comments, free membership'], href: '/chat' },
];

/** Take part: post an event, add a place, write an article, join the chat */
export function TakePartSection() {
  const c = useTheme();
  return (
    <Section>
      <SectionHead title={t('home2.take_part', 'Take part')} />
      <View style={[styles.take, { backgroundColor: c.elevated, borderColor: c.border }]}>
        {TAKE_PART.map((x, i) => {
          const title = t(...x.title), sub = t(...x.sub);
          return (
            <Pressable key={x.icon} onPress={() => router.push(x.href)} accessibilityRole="button" accessibilityLabel={title + '. ' + sub}
              style={({ pressed }) => [styles.takeRow, i ? { borderTopWidth: 1, borderTopColor: c.border } : null, pressed ? { backgroundColor: c.surface } : null]}>
              <Icon name={x.icon} size={22} color={c.goldText} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.takeTitle, { color: c.text }]}>{title}</Text>
                <Text style={[styles.small, { color: c.textMuted }]}>{sub}</Text>
              </View>
              <Icon name="chevron" size={18} color={c.textMuted} />
            </Pressable>
          );
        })}
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  pic: { width: '100%' },
  play: { position: 'absolute', top: '50%', left: '50%', width: 44, height: 44, marginTop: -22, marginLeft: -22, borderRadius: 22,
    backgroundColor: 'rgba(30,24,16,0.6)', alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 10, right: 10, overflow: 'hidden', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: 'rgba(253,251,247,0.9)', color: Colors.light.goldText, fontFamily: Fonts.bodyBold, fontSize: 12.5 },   // ivory in both themes, so light gold text
  corner: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(253,251,247,0.88)', borderRadius: 999 },   // no padding: empty (no dot) when signed out
  body: { padding: 12, gap: 4 },
  title: { fontFamily: Fonts.bodyBold, fontSize: 15.5, lineHeight: 20 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  small: { fontFamily: Fonts.body, fontSize: 13.5, lineHeight: 19 },
  bleed: { marginHorizontal: -Spacing.lg },
  row: { paddingHorizontal: Spacing.lg, gap: ROW_GAP },
  rm: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52 },
  ini: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  iniText: { fontFamily: Fonts.heading, fontSize: 19 },
  adv: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, marginBottom: Spacing.lg },
  advSeal: { width: 50, height: 50, borderRadius: 25, borderWidth: 2, borderColor: 'rgba(243,210,122,.55)' },
  advTitle: { color: '#F7F1E3', fontSize: 19, lineHeight: 24 },
  advLine: { color: '#EDE5D2', fontFamily: Fonts.body, fontSize: 13.5, lineHeight: 19 },
  rmName: { fontFamily: Fonts.bodyBold, fontSize: 15.5, lineHeight: 20 },
  take: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  takeRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 16, minHeight: 64 },
  takeTitle: { fontFamily: Fonts.bodyBold, fontSize: 15.5 },
});
