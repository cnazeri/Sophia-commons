// One job in a list: title, place, a short description.
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { localDate } from '@/lib/i18n';
import { type Job, jobPlace } from '@/lib/jobs';

export function JobCard({ j }: { j: Job }) {
  const c = useTheme();
  const meta = [jobPlace(j), localDate(j.created_at, { month: 'short', day: 'numeric' })].filter(Boolean).join(' · ');
  const first = (j.description || '').split('\n').map((s) => s.trim()).find((s) => s && !/^english:/i.test(s)) || '';
  return (
    <Pressable onPress={() => router.push({ pathname: '/jobs/[id]', params: { id: j.id } })} accessibilityRole="link"
      accessibilityLabel={j.title + ', ' + jobPlace(j)} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      <View style={[styles.card, { backgroundColor: c.elevated, borderColor: c.border }]}>
        <Text style={[styles.title, { color: c.text }]} numberOfLines={2}>{j.title}</Text>
        {meta ? <Text style={[styles.meta, { color: c.goldText }]} numberOfLines={1}>{meta}</Text> : null}
        {first ? <Text style={[styles.body, { color: c.textSecondary }]} numberOfLines={2}>{first}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.md, borderWidth: 1, borderRadius: Radius.lg, gap: 3 },
  title: { fontFamily: Fonts.bodyBold, fontSize: 15.5, lineHeight: 20 },
  meta: { fontFamily: Fonts.bodySemi, fontSize: 13 },
  body: { fontFamily: Fonts.body, fontSize: 14, lineHeight: 19 },
});
