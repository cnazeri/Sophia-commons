// Admin > Events: new member events. They are live (or private) already; Accept marks them seen, Take down cancels them.
import * as WebBrowser from 'expo-web-browser';

import { AdminScreen } from '@/components/admin/admin-ui';
import { CardLink, ReviewCard } from '@/components/admin/review-card';
import { askThen, ReviewFrame, sourcePill } from '@/components/admin/review-frame';
import { useReview } from '@/components/admin/use-review';
import { whenSubmitted } from '@/lib/admin';
import { acceptEvent, loadEvents, takeDownEvent } from '@/lib/admin-review';
import { localDate, t } from '@/lib/i18n';
import { SITE } from '@/lib/supabase';

export function EventsReview() {
  const list = useReview(loadEvents);
  return (
    <AdminScreen title={t('app.admin_k_events', 'Events')} intro={t('app.admin_events_intro', 'New events from members. They are on the calendar already: Accept keeps them, Take down removes them.')}
      refreshing={list.refreshing} onRefresh={list.refresh}>
      <ReviewFrame list={list} empty={t('admin.no_pending_events', 'No pending events.')} render={(d) => (
        <ReviewCard key={d.id} kicker={whenSubmitted(d.created_at)} title={d.title}
          pills={[...(d.event_type ? [d.event_type] : []), ...sourcePill(d.source)]}
          fields={[
            { label: t('app.admin_f_date', 'Date'), value: d.start_date ? localDate(d.start_date, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }) : null },
            { label: t('app.admin_f_location', 'Location'), value: d.location_name },
            { label: t('app.admin_f_organizer', 'Organizer'), value: d.organizer_name },
            { label: t('app.admin_f_picture', 'Picture'), value: d.image_url ? null : t('admin.event_no_picture', 'No picture yet') },
          ]}
          image={d.image_url ? d.image_url.split('#')[0] : null} imageLabel={d.title} body={d.description}
          extra={<CardLink label={d.status === 'pending' ? t('admin.event_private', 'Private (link only): open the page') : t('admin.event_live', 'Live now: open the page')}
            onPress={() => WebBrowser.openBrowserAsync(SITE + '/event/' + d.id)} />}
          actions={[
            { label: t('admin.event_seen', 'Accept'), kind: 'primary', onPress: () => list.act(d, () => acceptEvent(d.id), t('app.admin_done_event', 'Accepted.')) },
            { label: t('admin.event_take_down', 'Take down'), kind: 'danger', onPress: () => askThen(
              t('app.admin_confirm_takedown', 'Take this event down? It disappears from the calendar.'), t('admin.event_take_down', 'Take down'),
              () => list.act(d, () => takeDownEvent(d.id), t('app.admin_done_takedown', 'Taken down. It is off the calendar.'))) },
          ]} />
      )} />
    </AdminScreen>
  );
}
