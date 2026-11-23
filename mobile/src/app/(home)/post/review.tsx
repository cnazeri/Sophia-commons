// Owner only: jobs members posted, waiting for review. Approve puts a job on the Jobs page; Decline takes it away.
// (Events, places and community posts are reviewed on the website's Admin page, as before.)
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { Button } from '@/components/button';
import { Body, Card, H2, Kicker, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { type PendingJob, isAdmin, pendingJobs, reviewJob } from '@/lib/post';

export default function ReviewJobs() {
  const { session } = useAuth();
  const admin = isAdmin(session);
  const [rows, setRows] = useState<PendingJob[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { if (admin) pendingJobs().then(setRows).catch((e: Error) => setError(e.message)); }, [admin]);

  if (!admin) return <Screen underHeader><Body muted>{t('app.admin_only', 'This page is for the site editor.')}</Body></Screen>;

  const act = async (j: PendingJob, approve: boolean) => {
    try {
      await reviewJob(j.id, approve);
      setRows((r) => (r || []).filter((x) => x.id !== j.id));
    } catch (e) { Alert.alert((e as Error).message); }
  };

  return (
    <Screen title={t('app.review_jobs', 'Review jobs')} underHeader>
      {error ? <Body muted>{error}</Body> : null}
      {rows && !rows.length ? <Body muted>{t('app.review_none', 'Nothing waiting. New job posts will show here.')}</Body> : null}
      {(rows || []).map((j) => (
        <Card key={j.id} style={{ gap: 8 }}>
          {j.image_url ? <Image source={{ uri: j.image_url }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 12 }} contentFit="contain" accessibilityLabel={j.title} /> : null}
          <Kicker>{new Date(j.created_at).toLocaleDateString()} {[j.location, j.region, j.country].filter(Boolean).join(', ')}</Kicker>
          <H2>{j.title}</H2>
          <Body>{j.description}</Body>
          <Body muted>{[j.website_url, j.contact_email, j.contact_phone].filter(Boolean).join('  |  ')}</Body>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}><Button label={t('app.approve', 'Approve')} onPress={() => act(j, true)} /></View>
            <View style={{ flex: 1 }}><Button kind="danger" label={t('app.decline', 'Decline')} onPress={() => act(j, false)} /></View>
          </View>
        </Card>
      ))}
    </Screen>
  );
}
