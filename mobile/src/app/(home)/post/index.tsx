// Post: share an event, suggest a place, post a job, or write a community post. Opened from the Post button on
// Home, Events and Directory.
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { type Href, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Body, Screen } from '@/components/ui';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { isAdmin, pendingCounts } from '@/lib/admin';

type Choice = { href: Href; icon: keyof typeof MaterialIcons.glyphMap; title: string; desc: string; account: boolean };

export default function PostScreen() {
  const c = useTheme();
  const { session } = useAuth();
  const admin = isAdmin(session);
  const [waiting, setWaiting] = useState<number | null>(null);
  useEffect(() => {
    if (admin) pendingCounts().then((n) => setWaiting(Object.values(n).reduce<number>((a, x) => a + (x || 0), 0))).catch(() => setWaiting(null));
  }, [admin]);

  const choices: Choice[] = [
    { href: '/post/event', icon: 'event', title: t('app.post_event', 'Share an event'),
      desc: t('app.post_event_desc', 'A talk, course, festival, study group or conference, in person or online. It goes on the calendar right away.'), account: true },
    { href: '/post/place', icon: 'place', title: t('app.post_place', 'Suggest a place'),
      desc: t('app.post_place_desc', 'A school, farm, group, clinic or initiative missing from the directory. We check it before it appears.'), account: false },
    { href: '/post/job', icon: 'work', title: t('app.post_job', 'Post a job'),
      desc: t('app.post_job_desc', 'A job, training place or volunteer role. It appears after a quick review.'), account: true },
    { href: '/post/community', icon: 'edit-note', title: t('app.post_community', 'Write a community post'),
      desc: t('app.post_community_desc', 'News, a reflection, a question or an offer for the community. It appears after the editor reviews it.'), account: true },
  ];

  return (
    <Screen title={t('app.post_title', 'Post to Sophia Commons')} underHeader>
      <Body muted>{t('app.post_intro', 'Everything you post is shared with the whole community on the app and sophiacommons.org.')}</Body>
      {choices.map((ch) => (
        <Pressable key={ch.title} onPress={() => router.push(ch.href)} accessibilityRole="button" accessibilityLabel={ch.title + '. ' + ch.desc}
          style={({ pressed }) => [styles.card, { backgroundColor: c.elevated, borderColor: c.border, opacity: pressed ? 0.85 : 1 }]}>
          <View style={[styles.icon, { backgroundColor: c.surface }]}><MaterialIcons name={ch.icon} size={26} color={c.goldText} /></View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.title, { color: c.text }]}>{ch.title}</Text>
            <Text style={[styles.desc, { color: c.textSecondary }]}>{ch.desc}</Text>
            <Text style={[styles.note, { color: c.textMuted }]}>
              {ch.account ? t('app.post_needs_account', 'Free account needed') : t('app.post_no_account', 'No account needed')}
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={24} color={c.textMuted} />
        </Pressable>
      ))}
      {session ? <Button kind="secondary" onPress={() => router.push('/post/mine')} label={t('app.my_posts', 'My posts')} /> : null}
      {admin ? (
        <Button kind="secondary" onPress={() => router.push('/admin')}
          label={t('app.admin_title', 'Admin') + (waiting ? ` (${t('app.admin_n_waiting', '{n} waiting', { n: waiting })})` : '')} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.lg },
  icon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: Fonts.bodyBold, fontSize: 17 },
  desc: { fontFamily: Fonts.body, fontSize: 14, lineHeight: 20 },
  note: { fontFamily: Fonts.bodySemi, fontSize: 12, marginTop: 2 },
});
