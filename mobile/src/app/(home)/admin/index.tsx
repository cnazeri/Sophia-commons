// Admin (editor only, owner 2026-11-25): what is waiting, counted as on the website's Admin page. Opened from Post and
// from Settings (the same screen is mounted at /saved/admin, so it opens in whichever tab it was tapped in).
import { router, useFocusEffect, usePathname } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';

import { AdminScreen, Banner } from '@/components/admin/admin-ui';
import { AllCaughtUp, KindGrid, WebsiteRow } from '@/components/admin/overview';
import { SectionHead } from '@/components/redesign';
import { Body, Screen } from '@/components/ui';
import { ADMIN_URL, type Counts, type KindDef, isAdmin, kindDefs, pendingCounts } from '@/lib/admin';
import { useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';

export default function AdminHome() {
  const { session } = useAuth();
  const admin = isAdmin(session);
  const base = usePathname().startsWith('/saved') ? '/saved/admin' : '/admin';
  const [counts, setCounts] = useState<Counts>({});
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (pulled: boolean) => {
    if (pulled) setRefreshing(true);
    const n = await pendingCounts();
    setCounts(n);
    setError(Object.values(n).every((x) => x === null) ? t('app.admin_err_offline', 'No connection. Check the internet and try again.') : '');
    setRefreshing(false);
  }, []);
  // Counted again each time the screen comes back into view (after reviewing a list)
  useFocusEffect(useCallback(() => { if (admin) load(false); }, [admin, load]));

  if (!admin) return <Screen underHeader><Body muted>{t('app.admin_only', 'This page is for the site editor.')}</Body></Screen>;

  const defs = kindDefs();
  const known = defs.every((d) => typeof counts[d.kind] === 'number');
  const allZero = known && defs.every((d) => counts[d.kind] === 0);
  const open = (d: KindDef) => {
    if (d.inApp) router.push((base + '/' + d.kind) as never);
    else WebBrowser.openBrowserAsync(ADMIN_URL);
  };

  return (
    <AdminScreen title={t('app.admin_title', 'Admin')} refreshing={refreshing} onRefresh={() => load(true)}>
      <Banner text={error} onClose={() => setError('')} />
      <SectionHead title={t('app.admin_waiting_for_you', 'Waiting for you')} />
      {allZero ? <AllCaughtUp /> : null}
      <KindGrid defs={defs} counts={counts} onOpen={open} />
      <SectionHead title={t('app.admin_on_website_head', 'On the website')} />
      <WebsiteRow onPress={() => WebBrowser.openBrowserAsync(ADMIN_URL)} />
    </AdminScreen>
  );
}
