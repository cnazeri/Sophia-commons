// The editor's Admin area in the app (owner, 2026-11-25). What is waiting is counted exactly as the website's
// ADMIN_PENDING (sophia_commons_v9.js): the same tables and filters. Listings, events, jobs, memorials and reports are
// reviewed in the app; the other kinds open the website's Admin page.
import { Alert, Platform } from 'react-native';

import type { IconName } from '@/components/icon';
import { getLang, t } from '@/lib/i18n';
import { SITE, supabase } from '@/lib/supabase';

export { isAdmin } from '@/lib/post';

export const ADMIN_URL = SITE + '/admin';

export type AdminKind = 'listings' | 'events' | 'jobs' | 'memorials' | 'reports' | 'claims' | 'digest' | 'newsq' | 'outreach' | 'ytsugg';
export type AppKind = 'listings' | 'events' | 'jobs' | 'memorials' | 'reports';

type Query = ReturnType<ReturnType<typeof supabase.from>['select']>;
export type KindDef = { kind: AdminKind; inApp: boolean; icon: IconName; title: string; table: string; q: (x: Query) => Query };

/** The ten kinds, in the website's order, with the same count queries */
export function kindDefs(): KindDef[] {
  return [
    { kind: 'listings', inApp: true, icon: 'directory', title: t('app.admin_k_listings', 'Listings'),
      table: 'listings_pending', q: (x) => x.or('status.is.null,status.eq.pending') },
    { kind: 'events', inApp: true, icon: 'events', title: t('app.admin_k_events', 'Events'),
      table: 'events', q: (x) => x.eq('needs_review', true).neq('status', 'cancelled') },
    { kind: 'jobs', inApp: true, icon: 'briefcase', title: t('app.admin_k_jobs', 'Jobs'),
      table: 'listings', q: (x) => x.eq('status', 'draft').eq('category_id', 11) },
    { kind: 'memorials', inApp: true, icon: 'memorial', title: t('app.admin_k_memorials', 'Memorials'),
      table: 'memorials_pending', q: (x) => x.eq('status', 'pending') },
    { kind: 'reports', inApp: true, icon: 'flag', title: t('app.admin_k_reports', 'Reports'),
      table: 'reports', q: (x) => x.eq('status', 'pending') },
    { kind: 'claims', inApp: false, icon: 'shield', title: t('app.admin_k_claims', 'Listing claims'),
      table: 'listing_claims', q: (x) => x.eq('status', 'pending') },
    { kind: 'digest', inApp: false, icon: 'mail', title: t('app.admin_k_digest', 'Weekly digest'),
      table: 'news', q: (x) => x.eq('status', 'pending').contains('tags', ['weekly-digest']) },
    { kind: 'newsq', inApp: false, icon: 'resources', title: t('app.admin_k_newsq', 'News queue'),
      table: 'news', q: (x) => x.eq('status', 'pending').contains('tags', ['roundup']) },
    { kind: 'outreach', inApp: false, icon: 'share', title: t('app.admin_k_outreach', 'Outreach'),
      table: 'outreach_queue', q: (x) => x.eq('status', 'queued') },
    { kind: 'ytsugg', inApp: false, icon: 'play', title: t('app.admin_k_ytsugg', 'YouTube suggestions'),
      table: 'youtube_channels_pending', q: (x) => x.eq('status', 'pending') },
  ];
}

export const isAppKind = (k: string): k is AppKind => ['listings', 'events', 'jobs', 'memorials', 'reports'].includes(k);

export type Counts = Partial<Record<AdminKind, number | null>>;

/** How many of each kind are waiting. A count that fails is null (the website shows 0 then; here it shows as unknown). */
export async function pendingCounts(): Promise<Counts> {
  const defs = kindDefs();
  const nums = await Promise.all(defs.map(async (d) => {
    try {
      const r = await d.q(supabase.from(d.table).select('id', { count: 'exact', head: true }));
      return r.error ? null : r.count || 0;
    } catch { return null; }
  }));
  return Object.fromEntries(defs.map((d, i) => [d.kind, nums[i]])) as Counts;
}

/** A database or network error in plain words */
export function plainError(e: unknown): string {
  const m = (e instanceof Error ? e.message : String(e || '')).trim();
  if (m === 'NOTHING_CHANGED') return t('app.admin_err_nothing', 'Nothing changed. Someone may have handled it already, or the editor account is not signed in. Pull down to refresh.');
  if (/network|failed to fetch|fetch failed|timed? ?out|offline/i.test(m)) return t('app.admin_err_offline', 'No connection. Check the internet and try again.');
  if (/row-level security|permission denied|42501|jwt|not authori[sz]ed/i.test(m)) {
    return t('app.admin_err_denied', 'The database did not allow this. Sign out, then sign in again with the editor account.');
  }
  return t('app.admin_err_other', 'That did not work: {msg}', { msg: m || '?' });
}

/** Ask before a step that removes something. Resolves true when the editor confirms. */
export function confirmAsk(title: string, message: string, ok: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    const ask = (globalThis as { confirm?: (m: string) => boolean }).confirm;
    return Promise.resolve(ask ? ask(title + '\n\n' + message) : true);
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: t('app.cancel', 'Cancel'), style: 'cancel', onPress: () => resolve(false) },
      { text: ok, style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

/** "Nov 25, 2026, 9:14 AM" in the phone's language, as the website's admin cards show it */
export function whenSubmitted(iso?: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(getLang(), { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso.slice(0, 10); }
}
