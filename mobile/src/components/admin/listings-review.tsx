// Admin > Listings: places suggested for the directory (website: Admin > Pending Listings).
import { AdminScreen } from '@/components/admin/admin-ui';
import { ReviewCard } from '@/components/admin/review-card';
import { askThen, ReviewFrame, sourcePill } from '@/components/admin/review-frame';
import { useReview } from '@/components/admin/use-review';
import { useAuth } from '@/lib/auth';
import { whenSubmitted } from '@/lib/admin';
import { approveListing, loadListings, rejectListing } from '@/lib/admin-review';
import { t } from '@/lib/i18n';
import { webUrl } from '@/lib/post';

export function ListingsReview() {
  const { session } = useAuth();
  const list = useReview(loadListings);
  return (
    <AdminScreen title={t('app.admin_k_listings', 'Listings')} intro={t('app.admin_listings_intro', 'Places suggested for the directory. Approve adds the place to the directory and the map.')}
      refreshing={list.refreshing} onRefresh={list.refresh}>
      <ReviewFrame list={list} empty={t('admin.no_pending_listings', 'No pending listings.')} render={(d) => (
        <ReviewCard key={d.id} kicker={whenSubmitted(d.submitted_at || d.created_at)} title={d.name}
          pills={[...(d.category ? [d.category] : []), ...sourcePill(d.source)]}
          fields={[
            { label: t('app.admin_f_location', 'Location'), value: d.location },
            { label: t('app.admin_f_website', 'Website'), value: d.url, url: d.url ? webUrl(d.url) || null : null },
            { label: t('app.admin_f_email', 'Email'), value: d.contact_email },
          ]}
          image={d.photo_url} imageLabel={d.name} body={d.description}
          actions={[
            { label: t('app.approve', 'Approve'), kind: 'primary',
              onPress: () => list.act(d, () => approveListing(d.id, session), t('app.admin_done_listing', 'Approved. The place is in the directory now.')) },
            { label: t('app.decline', 'Decline'), kind: 'danger', onPress: () => askThen(t('admin.confirm_reject_listing', 'Reject this listing?'), t('app.decline', 'Decline'),
              () => list.act(d, () => rejectListing(d.id), t('app.admin_done_declined', 'Declined.'))) },
          ]} />
      )} />
    </AdminScreen>
  );
}
