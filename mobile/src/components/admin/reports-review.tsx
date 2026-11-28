// Admin > Reports: posts members flagged (website: Admin > Reports). Waiting reports can be marked reviewed, resolved
// or dismissed (dismiss = resolved, after a confirm); reviewed ones can be resolved.
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';

import { AdminScreen } from '@/components/admin/admin-ui';
import { type Action, CardLink, ReviewCard } from '@/components/admin/review-card';
import { askThen, ReviewFrame } from '@/components/admin/review-frame';
import { type ReviewList, useReview } from '@/components/admin/use-review';
import { Chips } from '@/components/chips';
import { whenSubmitted } from '@/lib/admin';
import { type Report, loadReports, setReportStatus } from '@/lib/admin-review';
import { t } from '@/lib/i18n';

type Filter = 'pending' | 'reviewed';

const TYPE_LABELS: Record<string, [string, string]> = {
  event: ['app.admin_type_event', 'Event'], blog_post: ['app.admin_type_post', 'Community post'], listing: ['app.admin_type_listing', 'Listing'],
  directory: ['app.admin_type_listing', 'Listing'], news: ['app.admin_type_news', 'News'], chat_message: ['app.admin_type_chat', 'Chat message'],
  channel_review: ['app.admin_type_review', 'Channel review'],
};
const typeLabel = (k: string) => (TYPE_LABELS[k] ? t(TYPE_LABELS[k][0], TYPE_LABELS[k][1]) : k);

// Where "View item" can go from the app: an event opens in the app; otherwise the link the report carries, if any
function viewItem(r: Report): (() => void) | null {
  if (r.item_type === 'event') return () => router.push({ pathname: '/events/[id]', params: { id: r.item_id } });
  const url = /https?:\/\/\S+/.exec(r.details || '')?.[0];
  return url ? () => { WebBrowser.openBrowserAsync(url); } : null;
}

function actionsFor(r: Report, list: ReviewList<Report>): Action[] {
  const set = (s: 'reviewed' | 'resolved') => () => list.act(r, () => setReportStatus(r.id, s), t('app.admin_done_report', 'Report updated.'));
  const resolve: Action = { label: t('app.admin_resolve', 'Resolve'), kind: r.status === 'reviewed' ? 'primary' : 'secondary', onPress: set('resolved') };
  if (r.status === 'reviewed') return [resolve];
  return [
    { label: t('app.admin_mark_reviewed', 'Mark reviewed'), kind: 'primary', onPress: set('reviewed') },
    resolve,
    { label: t('app.admin_dismiss', 'Dismiss'), kind: 'danger', onPress: () => askThen(
      t('app.admin_confirm_dismiss', 'Dismiss this report? It will be marked as resolved.'), t('app.admin_dismiss', 'Dismiss'), set('resolved')) },
  ];
}

export function ReportsReview() {
  const [filter, setFilter] = useState<Filter>('pending');
  const load = useCallback(() => loadReports(filter), [filter]);
  const list = useReview(load);
  return (
    <AdminScreen title={t('app.admin_k_reports', 'Reports')} intro={t('app.admin_reports_intro', 'Posts members flagged. Please look at each within 24 hours.')}
      refreshing={list.refreshing} onRefresh={list.refresh}>
      <ReviewFrame list={list} empty={filter === 'pending' ? t('app.admin_reports_none', 'No reports waiting.') : t('app.admin_reports_none_reviewed', 'No reviewed reports.')}
        top={<Chips<Filter> value={filter} onChange={setFilter}
          items={[{ key: 'pending', label: t('app.admin_waiting', 'Waiting') }, { key: 'reviewed', label: t('app.admin_reviewed', 'Reviewed') }]} />}
        render={(r) => {
          const view = viewItem(r);
          return (
            <ReviewCard key={r.id} kicker={whenSubmitted(r.created_at)} title={typeLabel(r.item_type)}
              pills={[r.status === 'reviewed' ? t('app.admin_reviewed', 'Reviewed') : t('app.admin_waiting', 'Waiting')]}
              fields={[{ label: t('app.admin_f_reason', 'Reason'), value: r.reason }]} body={r.details}
              extra={view ? <CardLink label={t('app.admin_view_item', 'View the item')} onPress={view} /> : null}
              actions={actionsFor(r, list)} />
          );
        }} />
    </AdminScreen>
  );
}
