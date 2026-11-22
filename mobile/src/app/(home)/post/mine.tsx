// My posts: the member's job posts with their status and end date. Jobs last 90 days; with 14 days or less left (or
// once ended) a Renew button gives another 90 days from today. A reminder email goes out 7 days before the end.
import { useCallback, useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { AuthForm } from '@/components/auth-form';
import { Button } from '@/components/button';
import { Body, Card, H2, Kicker, Screen } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { localDate, t } from '@/lib/i18n';
import { type MyJob, jobState, myJobs, renewJob } from '@/lib/post';

const day = { day: 'numeric', month: 'long', year: 'numeric' } as const;

export default function MyPosts() {
  const c = useTheme();
  const { session } = useAuth();
  const [rows, setRows] = useState<MyJob[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const load = useCallback(() => {
    if (session) myJobs(session).then(setRows).catch((e: Error) => setError(e.message));
  }, [session]);
  useEffect(load, [load]);

  if (!session) {
    return (
      <Screen title={t('app.my_posts', 'My posts')} underHeader>
        <Body muted>{t('app.post_sign_in', 'Sign in or create a free account to post. It is the same account as on sophiacommons.org.')}</Body>
        <AuthForm chatIntro={false} />
      </Screen>
    );
  }

  const renew = async (j: MyJob) => {
    setBusy(j.id);
    try {
      const until = await renewJob(j.id);
      setRows((r) => (r || []).map((x) => (x.id === j.id ? { ...x, expires_at: until } : x)));
      Alert.alert(t('app.renewed', 'Renewed'), t('app.renewed_until', 'Your job post now stays up until {date}.').replace('{date}', localDate(until, day)));
    } catch (e) { Alert.alert((e as Error).message); } finally { setBusy(''); }
  };

  return (
    <Screen title={t('app.my_posts', 'My posts')} underHeader>
      <Body muted>{t('app.my_posts_intro', 'Job posts stay up for 90 days. In the last two weeks you can renew a post for another 90 days, and we email you a reminder a week before it ends.')}</Body>
      {error ? <Body muted>{error}</Body> : null}
      {rows && !rows.length ? <Body muted>{t('app.my_posts_none', 'You have not posted a job yet.')}</Body> : null}
      {(rows || []).map((j) => {
        const st = jobState(j);
        const ends = j.expires_at ? localDate(j.expires_at, day) : '';
        const line = {
          review: t('app.job_st_review', 'Waiting for review'),
          live: t('app.job_st_live', 'Live until {date}').replace('{date}', ends),
          ending: t('app.job_st_ending', 'Ends in {n} days, on {date}').replace('{n}', String(st.daysLeft)).replace('{date}', ends),
          ended: t('app.job_st_ended', 'Ended on {date}').replace('{date}', ends),
          declined: t('app.job_st_declined', 'Not shown'),
        }[st.key];
        const canRenew = st.key === 'ending' || st.key === 'ended';
        return (
          <Card key={j.id} style={{ gap: 6 }}>
            <Kicker style={{ color: st.key === 'ending' || st.key === 'ended' ? '#B3261E' : c.goldText }}>{line}</Kicker>
            <H2>{j.title}</H2>
            {[j.location, j.region].filter(Boolean).length ? <Body muted>{[j.location, j.region].filter(Boolean).join(', ')}</Body> : null}
            {canRenew ? (
              <View style={{ marginTop: 4 }}>
                <Button label={busy === j.id ? t('app.sending', 'Sending...') : t('app.renew_90', 'Renew for 90 days')} onPress={() => renew(j)} disabled={busy === j.id} />
              </View>
            ) : null}
          </Card>
        );
      })}
    </Screen>
  );
}
