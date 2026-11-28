// Admin > Jobs: jobs members posted (saved as drafts). Approve puts a job on the Jobs page for 90 days; Decline sets it expired.
// Same writes as the website's adminReviewJob (lib/post.ts reviewJob).
import { AdminScreen } from '@/components/admin/admin-ui';
import { ReviewCard } from '@/components/admin/review-card';
import { askThen, ReviewFrame, sourcePill } from '@/components/admin/review-frame';
import { useReview } from '@/components/admin/use-review';
import { whenSubmitted } from '@/lib/admin';
import { t } from '@/lib/i18n';
import { pendingJobs, reviewJob, webUrl } from '@/lib/post';

export function JobsReview() {
  const list = useReview(pendingJobs);
  return (
    <AdminScreen title={t('app.admin_k_jobs', 'Jobs')} intro={t('app.admin_jobs_intro', 'Jobs members posted. Approve puts a job on the Jobs page for 90 days.')}
      refreshing={list.refreshing} onRefresh={list.refresh}>
      <ReviewFrame list={list} empty={t('app.review_none', 'Nothing waiting. New job posts will show here.')} render={(j) => (
        <ReviewCard key={j.id} kicker={whenSubmitted(j.created_at)} title={j.title} pills={sourcePill(j.source)}
          fields={[
            { label: t('app.admin_f_location', 'Location'), value: [j.location, j.region, j.country].filter(Boolean).join(', ') },
            { label: t('app.admin_f_website', 'Website'), value: j.website_url, url: j.website_url ? webUrl(j.website_url) || null : null },
            { label: t('app.admin_f_email', 'Email'), value: j.contact_email },
            { label: t('app.admin_f_phone', 'Phone'), value: j.contact_phone },
          ]}
          image={j.image_url} imageLabel={j.title} body={j.description}
          actions={[
            { label: t('app.approve', 'Approve'), kind: 'primary', onPress: () => list.act(j, () => reviewJob(j.id, true), t('app.admin_done_job', 'Approved. The job is on the Jobs page for 90 days.')) },
            { label: t('app.decline', 'Decline'), kind: 'danger', onPress: () => askThen(t('app.admin_confirm_job', 'Decline this job? It will not appear on the Jobs page.'), t('app.decline', 'Decline'),
              () => list.act(j, () => reviewJob(j.id, false), t('app.admin_done_declined', 'Declined.'))) },
          ]} />
      )} />
    </AdminScreen>
  );
}
