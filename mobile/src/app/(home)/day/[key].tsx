// A festival, anniversary or memorial day on its own page (owner, 2026-11-22: the Advent card on Home opens), with the
// next few days and the switches to take this card or the Calendar of the Soul off the Home page.
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { HomeToggles } from '@/components/home-toggles';
import { LinkRow } from '@/components/link-row';
import { Body, H1, H2, Kicker, Screen } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { sizedImage } from '@/lib/events';
import { localDate, t } from '@/lib/i18n';
import { dayParam, findYearDay, upcomingYearDays } from '@/lib/year';

export default function DayScreen() {
  const { key, day } = useLocalSearchParams<{ key: string; day: string }>();
  const d = findYearDay(String(key), String(day || ''));
  if (!d) return <Screen underHeader><Body muted>{t('app.day_missing', 'This day could not be found.')}</Body><HomeToggles /></Screen>;
  const isToday = d.date.toDateString() === new Date().toDateString();
  const next = upcomingYearDays(8, d.date).filter((x) => !(x.key === d.key && x.date.getTime() === d.date.getTime())).slice(0, 6);
  return (
    <Screen underHeader>
      {d.img ? <Image source={sizedImage(d.img.src, 900)} style={styles.img} contentFit="cover" accessibilityLabel={d.img.alt} /> : null}
      <Kicker>{(isToday ? t('app.today', 'Today') + ' · ' : '') + localDate(d.date.toISOString(), { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</Kicker>
      <H1 style={{ marginTop: 0 }}>{d.title}</H1>
      {d.desc ? <Body>{d.desc}</Body> : null}
      {d.link ? <Button label={d.link.label} onPress={() => WebBrowser.openBrowserAsync(d.link!.url)} /> : null}
      {next.length ? (
        <>
          <H2>{t('app.day_next', 'Coming up')}</H2>
          {next.map((x) => (
            <LinkRow key={x.key + x.date.toISOString()} title={x.title} meta={localDate(x.date.toISOString(), { weekday: 'short', month: 'short', day: 'numeric' })}
              onPress={() => router.replace({ pathname: '/day/[key]', params: { key: x.key, day: dayParam(x.date) } })} />
          ))}
        </>
      ) : null}
      <View style={{ height: Spacing.sm }} />
      <HomeToggles />
    </Screen>
  );
}

const styles = StyleSheet.create({
  img: { width: '100%', aspectRatio: 16 / 9, borderRadius: Radius.lg },
});
