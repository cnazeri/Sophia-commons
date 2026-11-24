// Home (redesign, owner 2026-11-24, after the website mockup): the title and search first, the directory's categories,
// this week's events in a row that swipes, today's festival, the Calendar of the Soul and today's exercise, then jobs,
// news, talks, the community and Follow. Settings > Home page still turns the festival card and the verse on and off.
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { JobCard } from '@/components/job-card';
import { LinkRow } from '@/components/link-row';
import { MediaCard } from '@/components/media-card';
import { NewsCard } from '@/components/news-card';
import { CategoryTiles, DayExercise, EventTile, FollowCard, Section, SectionHead } from '@/components/redesign';
import { Body, Card, Kicker, Screen } from '@/components/ui';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import cotsDe from '@/data/cots-de.json';
import cotsEn from '@/data/cots-en.json';
import { type EventRow, fetchUpcoming, sizedImage } from '@/lib/events';
import { useHomePrefs } from '@/lib/home-prefs';
import { localDate, t } from '@/lib/i18n';
import { fetchJobs, type Job } from '@/lib/jobs';
import { fetchVideos, type Video, videoItem } from '@/lib/media';
import { type Article, fetchNewsList } from '@/lib/news';
import { type CommunityPost, fetchCommunityPosts } from '@/lib/post';
import { cotsWeek, dayParam, upcomingYearDays, type YearDay } from '@/lib/year';

const WEEK_MS = 7 * 864e5;

export default function Home() {
  const c = useTheme();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [news, setNews] = useState<Article[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [q, setQ] = useState('');
  const [verseOpen, setVerseOpen] = useState(false);
  const [showDe, setShowDe] = useState(false);
  const prefs = useHomePrefs();
  useEffect(() => {
    let alive = true;
    fetchUpcoming().then((r) => {
      if (!alive) return;
      // This week: soonest first, one card per picture, then fill with the next ones
      const soon = [...r].sort((a, b) => a.start_date.localeCompare(b.start_date));
      const week = soon.filter((e) => Date.parse(e.start_date) < Date.now() + WEEK_MS);
      setEvents((week.length >= 3 ? week : soon).slice(0, 8));
    }).catch(() => {});
    fetchNewsList(3).then((r) => { if (alive) setNews(r); }).catch(() => {});
    fetchJobs('', 40).then((r) => { if (alive) setJobs(r.slice(0, 3)); }).catch(() => {});
    fetchVideos(2, 0).then((r) => { if (alive) setVideos(r); }).catch(() => {});
    fetchCommunityPosts(3).then((r) => { if (alive) setPosts(r); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const days = upcomingYearDays(4);
  const first = days[0];
  const isToday = first && first.date.toDateString() === new Date().toDateString();
  const inDays = first ? Math.round((new Date(first.date).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 864e5) : 0;
  const w = cotsWeek();
  const enVerse = (cotsEn as Record<string, string[]>)[String(w.week)] || [];
  const deVerse = (cotsDe as Record<string, string[]>)[String(w.week)] || [];
  const verse = enVerse.length ? enVerse : deVerse;
  const short = { month: 'short', day: 'numeric' } as const;
  const openDay = (d: YearDay) => router.push({ pathname: '/day/[key]', params: { key: d.key, day: dayParam(d.date) } });
  const search = () => router.push({ pathname: '/directory', params: q.trim() ? { q: q.trim() } : {} });

  return (
    <Screen post>
      {/* The top: date, title, search and Near me */}
      <View style={styles.dateLine}>
        <Icon name="events" size={15} color={c.goldText} />
        <Text style={[styles.dateText, { color: c.goldText }]}>
          {localDate(new Date().toISOString(), { weekday: 'long', month: 'long', day: 'numeric' })} · {t('cots.title', 'Calendar of the Soul')}, {t('cots.week', 'week').toLowerCase()} {w.week}
        </Text>
      </View>
      <Text style={[styles.title, { color: c.text }]} accessibilityRole="header">{t('app.home_title', 'Anthroposophical and Christian Community Directory')}</Text>
      <View style={[styles.search, { backgroundColor: c.elevated, borderColor: c.border }]}>
        <Icon name="search" size={19} color={c.goldText} />
        <TextInput value={q} onChangeText={setQ} onSubmitEditing={search} returnKeyType="search" autoCorrect={false}
          placeholder={t('app.home_search', 'Search schools, farms, events, articles')} placeholderTextColor={c.textMuted}
          accessibilityLabel={t('app.home_search', 'Search schools, farms, events, articles')} style={[styles.searchInput, { color: c.text }]} />
      </View>
      <Pressable onPress={() => router.push({ pathname: '/directory', params: { near: '1' } })} accessibilityRole="button"
        style={({ pressed }) => [styles.near, { backgroundColor: c.gold, opacity: pressed ? 0.88 : 1 }]}>
        <Icon name="pin" size={18} color={c.onGold} />
        <Text style={[styles.nearText, { color: c.onGold }]}>{t('app.near_me', 'Near me')}</Text>
      </Pressable>

      <Section>
        <SectionHead title={t('app.explore', 'Explore the directory')} link={t('app.all_categories', 'All categories')} onPress={() => router.push('/directory')} />
        <CategoryTiles count={4} onPick={(key) => router.push({ pathname: '/directory', params: { cat: key } })} />
      </Section>

      {events.length ? (
        <Section>
          <SectionHead title={t('app.this_week', 'This week')} link={t('app.all_events', 'All events')} onPress={() => router.push('/events')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.bleed}
            snapToInterval={262} decelerationRate="fast">
            {events.map((e) => <EventTile key={e.id} e={e} />)}
          </ScrollView>
        </Section>
      ) : null}

      {/* Today's festival or yearly day, as a card like the events */}
      {first && prefs.days ? (
        <Pressable onPress={() => openDay(first)} accessibilityRole="button" accessibilityLabel={first.title}
          style={({ pressed }) => [styles.fest, { backgroundColor: c.elevated, borderColor: c.border, opacity: pressed ? 0.9 : 1 }]}>
          {first.img ? (
            <View>
              <Image source={sizedImage(first.img.src, 800)} style={styles.festImg} contentFit="cover" accessibilityLabel={first.img.alt} />
              {!isToday && inDays > 0 ? <Text style={[styles.badge, { color: c.goldText }]}>{t('app.in_days', 'in {n} days').replace('{n}', String(inDays))}</Text> : null}
            </View>
          ) : null}
          <View style={styles.festBody}>
            <Kicker>{isToday ? t('app.today', 'Today') : localDate(first.date.toISOString(), { weekday: 'long', month: 'long', day: 'numeric' })}</Kicker>
            <Text style={[styles.festTitle, { color: c.text }]}>{first.title}</Text>
            {first.desc ? <Text style={[styles.small, { color: c.textSecondary }]} numberOfLines={3}>{first.desc}</Text> : null}
            {days.slice(1, 3).map((d) => (
              <Text key={d.key + d.date.toISOString()} style={[styles.small, { color: c.textSecondary }]}>
                <Text style={{ color: c.goldText, fontFamily: Fonts.bodyBold }}>{localDate(d.date.toISOString(), short)}  </Text>{d.title}
              </Text>
            ))}
          </View>
        </Pressable>
      ) : null}

      {/* The Calendar of the Soul: the first lines, the whole verse with a tap */}
      {prefs.cots && verse.length ? (
        <Card>
          <Kicker>{t('cots.title', 'Calendar of the Soul')} · {t('cots.week', 'Week')} {w.week}</Kicker>
          <View style={styles.verse} accessible accessibilityLabel={verse.join(' ')}>
            {(verseOpen ? verse : verse.slice(0, 3)).map((ln, i) => (
              <Text key={i} style={[styles.verseLine, { color: c.text }]} selectable>{ln}{!verseOpen && i === 2 && verse.length > 3 ? ' ...' : ''}</Text>
            ))}
          </View>
          {verseOpen ? (
            <>
              <Text style={[styles.verseBy, { color: c.textMuted }]}>
                {enVerse.length ? 'Rudolf Steiner, Calendar of the Soul (1912). ' + t('app.cots_english_by', 'English rendering: Sophia Commons') : 'Rudolf Steiner, Anthroposophischer Seelenkalender (1912)'}
              </Text>
              {enVerse.length && deVerse.length ? (
                <Pressable onPress={() => setShowDe(!showDe)} accessibilityRole="button" accessibilityState={{ expanded: showDe }} hitSlop={8}>
                  <Text style={[styles.link, { color: c.goldText }]}>{showDe ? t('app.cots_hide_german', 'Hide the German original') : t('app.cots_show_german', 'Show the German original')}</Text>
                </Pressable>
              ) : null}
              {showDe ? <View style={styles.verse}>{deVerse.map((ln, i) => <Text key={i} style={[styles.verseDe, { color: c.textSecondary }]} selectable>{ln}</Text>)}</View> : null}
              <Body muted>{t('cots.mirror', 'Mirror verse')}: {t('cots.week', 'Week')} {w.mirror} · {t('cots.southern', 'Southern Hemisphere')}: {t('cots.week', 'Week')} {w.southern}</Body>
              <Pressable onPress={() => WebBrowser.openBrowserAsync(w.url(w.week))} accessibilityRole="link" hitSlop={8}>
                <Text style={[styles.link, { color: c.goldText }]}>{t('app.cots_other_translations', 'Other translations')} ↗</Text>
              </Pressable>
            </>
          ) : null}
          <Pressable onPress={() => setVerseOpen(!verseOpen)} accessibilityRole="button" accessibilityState={{ expanded: verseOpen }} hitSlop={8} style={styles.linkRow}>
            <Text style={[styles.link, { color: c.goldText }]}>{verseOpen ? t('app.cots_less', 'Show less') : t('app.cots_read', 'Read the whole verse')}</Text>
            {verseOpen ? null : <Icon name="arrow" size={15} color={c.goldText} />}
          </Pressable>
        </Card>
      ) : null}

      <DayExercise />

      {jobs.length ? (
        <Section>
          <SectionHead title={t('app.jobs', 'Jobs')} link={t('app.jobs_all', 'All jobs')} onPress={() => router.push('/jobs')} />
          {jobs.map((j) => <JobCard key={j.id} j={j} />)}
        </Section>
      ) : null}

      {news.length ? (
        <Section>
          <SectionHead title={t('app.news', 'News')} />
          {news.map((n) => <NewsCard key={n.id} a={n} />)}
        </Section>
      ) : null}

      <Section>
        <SectionHead title={t('app.media_short', 'Talks and podcasts')} link={t('app.more', 'More')} onPress={() => router.push('/media')} />
        {videos.map((v) => <MediaCard key={v.video_id} m={videoItem(v)} wide />)}
      </Section>

      <Section>
        <SectionHead title={t('app.community_posts', 'From the community')} />
        {posts.map((p) => (
          <LinkRow key={p.id} title={p.title} meta={[p.author_name, p.published_at ? localDate(p.published_at, short) : ''].filter(Boolean).join(' · ')}
            onPress={() => router.push({ pathname: '/community/[slug]', params: { slug: p.slug } })} />
        ))}
        {!posts.length ? <Body muted>{t('app.community_empty', 'Share news, a reflection or a question with the community.')}</Body> : null}
        <Button kind="secondary" label={t('app.post_community', 'Write a community post')} onPress={() => router.push('/post/community')} />
      </Section>

      <FollowCard />
    </Screen>
  );
}

const styles = StyleSheet.create({
  dateLine: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: Spacing.xs },
  dateText: { fontFamily: Fonts.bodyBold, fontSize: 13, flexShrink: 1 },
  title: { fontFamily: Fonts.headingBold, fontSize: 29, lineHeight: 35 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 18, borderWidth: 1, borderRadius: Radius.pill },
  searchInput: { flex: 1, fontFamily: Fonts.body, fontSize: 16, paddingVertical: 12 },
  near: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 50, borderRadius: Radius.pill },
  nearText: { fontFamily: Fonts.bodyBold, fontSize: 16 },
  bleed: { marginHorizontal: -Spacing.lg },
  row: { paddingHorizontal: Spacing.lg, gap: 12 },
  fest: { borderWidth: 1, borderRadius: Radius.lg, overflow: 'hidden', marginTop: Spacing.sm },
  festImg: { width: '100%', aspectRatio: 16 / 9 },
  badge: { position: 'absolute', top: 10, right: 10, overflow: 'hidden', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: 'rgba(253,251,247,0.88)', fontFamily: Fonts.bodyBold, fontSize: 12 },
  festBody: { padding: Spacing.md, gap: 4 },
  festTitle: { fontFamily: Fonts.bodyBold, fontSize: 17, lineHeight: 22 },
  small: { fontFamily: Fonts.body, fontSize: 14, lineHeight: 20 },
  verse: { gap: 2, paddingVertical: Spacing.xs },
  verseLine: { fontFamily: Fonts.heading, fontStyle: 'italic', fontSize: 17, lineHeight: 25 },
  verseDe: { fontFamily: Fonts.body, fontSize: 15.5, lineHeight: 24 },
  verseBy: { fontFamily: Fonts.body, fontSize: 12.5 },
  link: { fontFamily: Fonts.bodyBold, fontSize: 14, paddingVertical: 2 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start' },
});
