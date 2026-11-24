// One job: place, posted date, full description, and how to apply (website, email or phone).
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { BookmarkButton } from '@/components/bookmark-button';
import { Button } from '@/components/button';
import { Body, Kicker } from '@/components/ui';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { localDate, t } from '@/lib/i18n';
import { fetchJob, type Job, jobPlace } from '@/lib/jobs';
import { paragraphs } from '@/lib/news';
import { SITE } from '@/lib/supabase';

export default function JobScreen() {
  const c = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [j, setJ] = useState<Job | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchJob(String(id))
      .then((r) => { if (alive) { if (r) setJ(r); else setFailed(true); } })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [id]);

  if (!j) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        {failed ? <Body muted>{t('app.jobs_error', 'Could not load jobs. Try again in a moment.')}</Body> : <ActivityIndicator color={c.goldText} />}
      </View>
    );
  }
  const url = SITE + '/classified/' + j.id;
  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.wrap}>
      {j.image_url ? <Image source={{ uri: j.image_url }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 12 }} contentFit="contain" transition={200} accessibilityLabel={j.title} /> : null}
      <View style={styles.head}>
        <View style={{ flex: 1 }}><Kicker>{[jobPlace(j), localDate(j.created_at, { month: 'long', day: 'numeric', year: 'numeric' })].filter(Boolean).join(' · ')}</Kicker></View>
        <BookmarkButton job={j} />
      </View>
      <Text style={[styles.title, { color: c.text }]} selectable>{j.title}</Text>
      <View style={styles.actions}>
        {j.website_url ? <Button label={t('app.job_apply', 'Details and how to apply')} onPress={() => WebBrowser.openBrowserAsync(String(j.website_url))} /> : null}
        {j.contact_email ? <Button kind="secondary" label={t('app.email', 'Email') + ': ' + j.contact_email} onPress={() => Linking.openURL('mailto:' + j.contact_email)} /> : null}
        {j.contact_phone ? <Button kind="secondary" label={t('app.call', 'Call') + ': ' + j.contact_phone} onPress={() => Linking.openURL('tel:' + String(j.contact_phone).replace(/[^+\d]/g, ''))} /> : null}
      </View>
      {paragraphs(j.description).map((p, i) => <Text key={i} style={[styles.para, { color: c.text }]} selectable>{p}</Text>)}
      <Button kind="secondary" label={t('app.share', 'Share')} onPress={() => Share.share({ message: j.title + '\n' + url, url })} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  wrap: { padding: Spacing.lg, gap: Spacing.md, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingBottom: 120 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontFamily: Fonts.headingBold, fontSize: 26, lineHeight: 32 },
  para: { fontFamily: Fonts.body, fontSize: 16.5, lineHeight: 25 },
  actions: { gap: Spacing.sm },
});
