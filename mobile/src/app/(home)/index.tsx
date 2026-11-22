// Home: today's festival or yearly date, the Calendar of the Soul week, the next events, the latest news.
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { EventCard } from '@/components/event-card';
import { JobCard } from '@/components/job-card';
import { LinkRow } from '@/components/link-row';
import { NewsCard } from '@/components/news-card';
import { Body, Card, H2, Kicker, Screen } from '@/components/ui';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { type EventRow, fetchUpcoming, sizedImage } from '@/lib/events';
import { localDate, t } from '@/lib/i18n';
import { fetchJobs, type Job } from '@/lib/jobs';
import { fetchVideos, type Video } from '@/lib/media';
import { type Article, fetchNewsList } from '@/lib/news';
import cotsDe from '@/data/cots-de.json';
import { cotsWeek, upcomingYearDays } from '@/lib/year';

export default function Home() {
  const c = useTheme();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [news, setNews] = useState<Article[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  useEffect(() => {
    let alive = true;
    fetchUpcoming().then((r) => { if (alive) setEvents([...r].sort((a, b) => a.start_date.localeCompare(b.start_date)).slice(0, 4)); }).catch(() => {});
    fetchNewsList(4).then((r) => { if (alive) setNews(r); }).catch(() => {});
    fetchJobs('', 40).then((r) => { if (alive) setJobs(r.slice(0, 3)); }).catch(() => {});
    fetchVideos(2).then((r) => { if (alive) setVideos(r); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const days = upcomingYearDays(4);
  const first = days[0];
  const isToday = first && first.date.toDateString() === new Date().toDateString();
  const w = cotsWeek();
  const short = { month: 'short', day: 'numeric' } as const;

  return (
    <Screen>
      {first ? (
        <Card>
          {first.img ? <Image source={sizedImage(first.img.src, 800)} style={styles.festImg} contentFit="cover" accessibilityLabel={first.img.alt} /> : null}
          <Kicker>{isToday ? t('app.today', 'Today') : localDate(first.date.toISOString(), { weekday: 'long', month: 'long', day: 'numeric' })}</Kicker>
          <H2>{first.title}</H2>
          {first.desc ? <Body>{first.desc}</Body> : null}
          {days.slice(1).map((d) => (
            <Text key={d.key + d.date.toISOString()} style={[styles.next, { color: c.textSecondary }]}>
              <Text style={{ color: c.goldText, fontFamily: Fonts.bodyBold }}>{localDate(d.date.toISOString(), short)}  </Text>{d.title}
            </Text>
          ))}
        </Card>
      ) : null}

      <Card>
        <Kicker>{t('cots.title', 'Calendar of the Soul')}</Kicker>
        <H2>{t('cots.week', 'Week')} {w.week} · {localDate(w.from.toISOString(), short)} - {localDate(w.to.toISOString(), short)}</H2>
        <View style={styles.verse} accessible accessibilityLabel={(cotsDe as Record<string, string[]>)[String(w.week)]?.join(' ')}>
          {((cotsDe as Record<string, string[]>)[String(w.week)] || []).map((ln, i) => (
            <Text key={i} style={[styles.verseLine, { color: c.text }]} selectable>{ln}</Text>
          ))}
        </View>
        <Text style={[styles.verseBy, { color: c.textMuted }]}>Rudolf Steiner, Anthroposophischer Seelenkalender (1912)</Text>
        <Body muted>{t('cots.mirror', 'Mirror verse')}: {t('cots.week', 'Week')} {w.mirror} · {t('cots.southern', 'Southern Hemisphere')}: {t('cots.week', 'Week')} {w.southern}</Body>
        <Button kind="secondary" label={t('app.cots_translations', 'English and other translations')} onPress={() => WebBrowser.openBrowserAsync(w.url(w.week))} />
      </Card>

      {events.length ? (
        <View style={styles.section}>
          <H2>{t('app.coming_up', 'Coming up')}</H2>
          {events.map((e) => <EventCard key={e.id} e={e} />)}
          <Button kind="secondary" label={t('app.all_events', 'All events')} onPress={() => router.push('/events')} />
        </View>
      ) : null}

      {jobs.length ? (
        <View style={styles.section}>
          <H2>{t('app.jobs', 'Jobs')}</H2>
          {jobs.map((j) => <JobCard key={j.id} j={j} />)}
          <Button kind="secondary" label={t('app.jobs_all', 'All jobs')} onPress={() => router.push('/jobs')} />
        </View>
      ) : null}

      {news.length ? (
        <View style={styles.section}>
          <H2>{t('app.news', 'News')}</H2>
          {news.map((n) => (
            <NewsCard key={n.id} a={n} />
          ))}
        </View>
      ) : null}
      <View style={styles.section}>
        <H2>{t('app.media_title', 'Talks, blogs and podcasts')}</H2>
        {videos.map((v) => (
          <LinkRow key={v.video_id} wide title={v.title} image={v.thumbnail_url} url={v.url || 'https://www.youtube.com/watch?v=' + v.video_id}
            meta={[v.channel, localDate(v.published_at, short)].filter(Boolean).join(' · ')} />
        ))}
        <Button kind="secondary" label={t('app.media_more', 'More talks, blogs and podcasts')} onPress={() => router.push('/media')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  festImg: { width: '100%', aspectRatio: 16 / 9, borderRadius: 10, marginBottom: Spacing.xs },
  next: { fontFamily: Fonts.body, fontSize: 14, lineHeight: 20 },
  section: { gap: Spacing.sm, marginTop: Spacing.sm },
  verse: { gap: 2, paddingVertical: Spacing.xs },
  verseLine: { fontFamily: Fonts.heading, fontStyle: 'italic', fontSize: 17, lineHeight: 25 },
  verseBy: { fontFamily: Fonts.body, fontSize: 12.5 },
});
