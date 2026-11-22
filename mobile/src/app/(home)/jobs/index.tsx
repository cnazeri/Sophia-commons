// All jobs: search by title, town or country. Same listings as the website's Jobs page.
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, TextInput, View } from 'react-native';

import { JobCard } from '@/components/job-card';
import { Body } from '@/components/ui';
import { Fonts, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/lib/i18n';
import { fetchJobs, type Job } from '@/lib/jobs';

export default function JobsScreen() {
  const c = useTheme();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Job[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      fetchJobs(q)
        .then((r) => { if (alive) { setRows(r); setError(false); } })
        .catch(() => { if (alive) { setRows([]); setError(true); } });
    }, q ? 300 : 0);
    return () => { alive = false; clearTimeout(timer); };
  }, [q]);

  return (
    <FlatList
      style={{ backgroundColor: c.background }}
      data={rows || []}
      keyExtractor={(j) => j.id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View style={styles.head}>
          <TextInput value={q} onChangeText={setQ} placeholder={t('app.jobs_search', 'Job, town or country')}
            placeholderTextColor={c.textMuted} returnKeyType="search" clearButtonMode="while-editing" autoCorrect={false}
            accessibilityLabel={t('app.jobs_search', 'Job, town or country')}
            style={[styles.search, { backgroundColor: c.elevated, borderColor: c.border, color: c.text }]} />
          {!rows ? <ActivityIndicator style={{ marginTop: 40 }} color={c.goldText} /> : null}
        </View>
      }
      renderItem={({ item }) => <View style={styles.item}><JobCard j={item} /></View>}
      ListEmptyComponent={rows ? (
        <Body muted style={{ paddingVertical: Spacing.lg }}>
          {error ? t('app.jobs_error', 'Could not load jobs. Try again in a moment.') : t('app.no_results', 'Nothing found. Try another word or category.')}
        </Body>
      ) : undefined}
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: Spacing.lg, paddingBottom: 120, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  head: { gap: Spacing.md, paddingVertical: Spacing.md },
  search: { minHeight: 48, borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 18, fontFamily: Fonts.body, fontSize: 16 },
  item: { paddingBottom: Spacing.sm },
});
