// Home (redesign phase 2, owner 2026-11-25, after the website's home2.js): the date, title, search and the directory's
// categories, then the website's main column (This week, New in the directory, News and the newsletter, Jobs and
// Take part, Talks, the community's posts) and its side cards below it, as on a phone: the coming festival, the
// Calendar of the Soul, the day's exercise, Remembering this week and Follow. Settings > Home page still turns the
// festival card and the verse on and off. A section with nothing to show hides itself.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { CotsCard } from '@/components/cots-card';
import { CardRow, FestivalCard, NewPlacesSection, RememberCard, TakePartSection, TalksSection, TILE_WIDTH } from '@/components/home-cards';
import { NewsletterSection } from '@/components/home-newsletter';
import { Icon } from '@/components/icon';
import { JobCard } from '@/components/job-card';
import { LinkRow } from '@/components/link-row';
import { NewsCard } from '@/components/news-card';
import { CategoryTiles, DayExercise, EventTile, FollowCard, Section, SectionHead } from '@/components/redesign';
import { Screen } from '@/components/ui';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { type EventRow, fetchUpcoming } from '@/lib/events';
import { headingFont } from '@/lib/heading-font';
import { comingFestival, comingMemorial, type Digest, fetchLatestDigest, fetchNewPlaces, latestPerChannel, type NewPlaces } from '@/lib/home';
import { useHomePrefs } from '@/lib/home-prefs';
import { localDate, t } from '@/lib/i18n';
import { fetchJobs, type Job } from '@/lib/jobs';
import { fetchVideos, type Video } from '@/lib/media';
import { type Article, fetchNewsList } from '@/lib/news';
import { type CommunityPost, fetchCommunityPosts } from '@/lib/post';
import { cotsWeek } from '@/lib/year';

const WEEK_MS = 7 * 864e5;
const WEEK_MAX = 3, JOBS_MAX = 4, NEWS_MAX = 3;

/** This week: the next seven days, featured events and those with a picture first, then by date (h2WeekEvents) */
function thisWeek(all: EventRow[], now = Date.now()): EventRow[] {
  const rank = (e: EventRow) => (e.featured ? 0 : 2) + (e.image_url ? 0 : 1);
  return all.filter((e) => Date.parse(e.start_date) < now + WEEK_MS)
    .sort((a, b) => rank(a) - rank(b) || a.start_date.localeCompare(b.start_date))
    .slice(0, WEEK_MAX);
}

export default function Home() {
  const c = useTheme();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [places, setPlaces] = useState<NewPlaces>({ count: 0, places: [] });
  const [news, setNews] = useState<Article[]>([]);
  const [digest, setDigest] = useState<Digest | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [q, setQ] = useState('');
  const prefs = useHomePrefs();
  useEffect(() => {
    let alive = true;
    const keep = <T,>(set: (v: T) => void) => (v: T) => { if (alive) set(v); };
    fetchUpcoming().then((r) => thisWeek(r)).then(keep(setEvents)).catch(() => {});
    fetchNewPlaces().then(keep(setPlaces)).catch(() => {});
    fetchNewsList(NEWS_MAX).then(keep(setNews)).catch(() => {});
    fetchLatestDigest().then(keep(setDigest)).catch(() => {});
    fetchJobs('', 40).then((r) => r.slice(0, JOBS_MAX)).then(keep(setJobs)).catch(() => {});
    fetchVideos(40, 0).then((r) => latestPerChannel(r)).then(keep(setVideos)).catch(() => {});
    fetchCommunityPosts(3).then(keep(setPosts)).catch(() => {});
    return () => { alive = false; };
  }, []);

  const festival = prefs.days ? comingFestival() : null;
  const memorial = comingMemorial();
  const w = cotsWeek();
  const short = { month: 'short', day: 'numeric' } as const;
  const title = t('app.home_title', 'Anthroposophical and Christian Community Directory');
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
      <Text style={[styles.title, { color: c.text, fontFamily: headingFont(title) }]} accessibilityRole="header">{title}</Text>
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

      {/* The website's main column */}
      {events.length ? (
        <Section>
          <SectionHead title={t('home2.this_week', 'This week')} link={t('home2.all_events', 'All events')} onPress={() => router.push('/events')} />
          <CardRow>{events.map((e) => <EventTile key={e.id} e={e} width={TILE_WIDTH} />)}</CardRow>
        </Section>
      ) : null}

      <NewPlacesSection data={places} />

      {news.length ? (
        <Section>
          <SectionHead title={t('app.news', 'News')} />
          {/* One card around the list, as the website's .h2-list; the last row's line is tucked under the edge */}
          <View style={[styles.list, { backgroundColor: c.elevated, borderColor: c.border }]}>
            <View style={{ marginBottom: -1 }}>{news.map((n) => <NewsCard key={n.id} a={n} />)}</View>
          </View>
        </Section>
      ) : null}

      <NewsletterSection digest={digest} />

      {jobs.length ? (
        <Section>
          <SectionHead title={t('app.jobs', 'Jobs')} link={t('home2.all_jobs', 'All jobs')} onPress={() => router.push('/jobs')} />
          {jobs.map((j) => <JobCard key={j.id} j={j} />)}
        </Section>
      ) : null}

      <TakePartSection />

      <TalksSection videos={videos} />

      {posts.length ? (
        <Section>
          <SectionHead title={t('app.community_posts', 'From the community')} />
          {posts.map((p) => (
            <LinkRow key={p.id} title={p.title} meta={[p.author_name, p.published_at ? localDate(p.published_at, short) : ''].filter(Boolean).join(' · ')}
              onPress={() => router.push({ pathname: '/community/[slug]', params: { slug: p.slug } })} />
          ))}
        </Section>
      ) : null}

      {/* The website's side column, below the main one as on a phone */}
      <View style={styles.side}>
        {festival ? <FestivalCard day={festival} /> : null}
        {prefs.cots ? <CotsCard /> : null}
        <DayExercise />
        {memorial ? <RememberCard day={memorial} /> : null}
        <FollowCard />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  dateLine: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: Spacing.xs },
  dateText: { fontFamily: Fonts.bodyBold, fontSize: 13, flexShrink: 1 },
  title: { fontSize: 29, lineHeight: 35 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 18, borderWidth: 1, borderRadius: Radius.pill },
  searchInput: { flex: 1, fontFamily: Fonts.body, fontSize: 16, paddingVertical: 12 },
  near: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 50, borderRadius: Radius.pill },
  nearText: { fontFamily: Fonts.bodyBold, fontSize: 16 },
  side: { gap: Spacing.md, marginTop: Spacing.lg },
  list: { borderWidth: 1, borderRadius: 14, paddingHorizontal: Spacing.lg, overflow: 'hidden' },
});
