// Admin > one kind: the review list for listings, events, jobs, memorials or reports. Other kinds are reviewed on the
// website, so this page only points there.
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { EventsReview } from '@/components/admin/events-review';
import { JobsReview } from '@/components/admin/jobs-review';
import { ListingsReview } from '@/components/admin/listings-review';
import { MemorialsReview } from '@/components/admin/memorials-review';
import { ReportsReview } from '@/components/admin/reports-review';
import { Button } from '@/components/button';
import { Body, Screen } from '@/components/ui';
import { ADMIN_URL, isAdmin, isAppKind } from '@/lib/admin';
import { useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';

const SCREENS = { listings: ListingsReview, events: EventsReview, jobs: JobsReview, memorials: MemorialsReview, reports: ReportsReview };

export default function AdminKind() {
  const { session } = useAuth();
  const { kind } = useLocalSearchParams<{ kind: string }>();
  if (!isAdmin(session)) return <Screen underHeader><Body muted>{t('app.admin_only', 'This page is for the site editor.')}</Body></Screen>;
  if (kind && isAppKind(kind)) {
    const Review = SCREENS[kind];
    return <Review />;
  }
  return (
    <Screen underHeader>
      <Body muted>{t('app.admin_website_only', 'This is reviewed on the website.')}</Body>
      <Button label={t('app.admin_more_title', 'Open the website Admin')} onPress={() => WebBrowser.openBrowserAsync(ADMIN_URL)} />
    </Screen>
  );
}
