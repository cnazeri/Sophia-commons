// Admin > Memorials: In Memoriam entries sent in by members (website: Admin > Pending Memorials).
import { AdminScreen } from '@/components/admin/admin-ui';
import { ReviewCard } from '@/components/admin/review-card';
import { askThen, ReviewFrame } from '@/components/admin/review-frame';
import { useReview } from '@/components/admin/use-review';
import { whenSubmitted } from '@/lib/admin';
import { approveMemorial, loadMemorials, rejectMemorial } from '@/lib/admin-review';
import { t } from '@/lib/i18n';

export function MemorialsReview() {
  const list = useReview(loadMemorials);
  return (
    <AdminScreen title={t('app.admin_k_memorials', 'Memorials')} intro={t('app.admin_memorials_intro', 'Remembrances sent in for the In Memoriam page.')}
      refreshing={list.refreshing} onRefresh={list.refresh}>
      <ReviewFrame list={list} empty={t('admin.no_pending_memorials', 'No pending memorials.')} render={(d) => (
        <ReviewCard key={d.id} kicker={whenSubmitted(d.created_at)} title={d.name} pills={[t('home2.in_memoriam', 'In Memoriam')]}
          fields={[
            { label: t('app.admin_f_years', 'Years'), value: d.years },
            { label: t('app.admin_f_location', 'Location'), value: d.location },
            { label: t('app.admin_f_email', 'Email'), value: d.contact_email },
          ]}
          image={d.photo_url} imageLabel={d.name} body={d.bio}
          actions={[
            { label: t('app.approve', 'Approve'), kind: 'primary', onPress: () => list.act(d, () => approveMemorial(d.id), t('app.admin_done_memorial', 'Approved. It is on the In Memoriam page now.')) },
            { label: t('app.decline', 'Decline'), kind: 'danger', onPress: () => askThen(t('admin.confirm_reject_memorial', 'Reject this memorial?'), t('app.decline', 'Decline'),
              () => list.act(d, () => rejectMemorial(d.id), t('app.admin_done_declined', 'Declined.'))) },
          ]} />
      )} />
    </AdminScreen>
  );
}
