// Home: today's festival or yearly date, the Calendar of the Soul week, the next events, the latest news.
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { EventCard } from '@/components/event-card';
import { NewsCard } from '@/components/news-card';
import { Body, Card, H2, Kicker, Screen } from '@/components/ui';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { type EventRow, fetchUpcoming, sizedImage } from '@/lib/events';
import { localDate, t } from '@/lib/i18n';
import { type Article, fetchNewsList } from '@/lib/news';
import { cotsWeek, upcomingYearDays } from '@/lib/year';

export default function Home() {
  const c = useTheme();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [news, setNews] = useState<Article[]>([]);
  useEffect(() => {
    let alive = true;
    fetchUpcoming().then((r) => { if (alive) setEvents([...r].sort((a, b) => a.start_date.localeCompare(b.start_date)).slice(0, 4)); }).catch(() => {});
    fetchNewsList(4).then((r) => { if (alive) setNews(r); }).catch(() => {});
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
        <Body muted>{t('cots.mirror', 'Mirror verse')}: {t('cots.week', 'Week')} {w.mirror} · {t('cots.southern', 'Southern Hemisphere')}: {t('cots.week', 'Week')} {w.southern}</Body>
        <Button kind="secondary" label={t('cots.read', "Read this week's verse")} onPress={() => WebBrowser.openBrowserAsync(w.url(w.week))} />
      </Card>

      {events.length ? (
        <View style={styles.section}>
          <H2>{t('app.coming_up', 'Coming up')}</H2>
          {events.map((e) => <EventCard key={e.id} e={e} />)}
          <Button kind="secondary" label={t('app.all_events', 'All events')} onPress={() => router.push('/events')} />
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  festImg: { width: '100%', aspectRatio: 16 / 9, borderRadius: 10, marginBottom: Spacing.xs },
  next: { fontFamily: Fonts.body, fontSize: 14, lineHeight: 20 },
  section: { gap: Spacing.sm, marginTop: Spacing.sm },
});
