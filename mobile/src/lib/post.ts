// Posting from the app. Each kind goes where the website sends it, under the same review rules:
//   place      -> listings_pending   (no account; the owner approves in Admin > Pending Listings)
//   event      -> event-save function (account; listed at once, the owner reviews it in Admin > Events)
//   job        -> listings, category 11 (account; saved as 'draft' by the database until the owner approves it)
//   community  -> blog_posts         (account; 'pending' until the owner publishes it in Admin > Blog)
import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

const JOBS_CAT_ID = 11;
export const isAdmin = (s: Session | null) => s?.user?.app_metadata?.role === 'admin';
export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
// "example.org" -> "https://example.org"; empty stays empty; anything else that is not a web address -> null
export function webUrl(v: string): string | null {
  const s = v.trim();
  if (!s) return '';
  const u = /^https?:\/\//i.test(s) ? s : 'https://' + s;
  return /^https?:\/\/[^\s/]+\.[^\s]{2,}$/i.test(u) ? u : null;
}

export type PlaceIn = { name: string; category: string; url: string; location: string; description: string; email: string };
export async function postPlace(p: PlaceIn): Promise<void> {
  const { error } = await supabase.from('listings_pending').insert({
    name: p.name.slice(0, 200), category: p.category, url: p.url || null, location: p.location.slice(0, 200) || null,
    description: p.description.slice(0, 5000) || null, contact_email: p.email || null, status: 'pending', source: 'app',
  });
  if (error) throw new Error(error.message);
}

export type EventIn = {
  title: string; event_type: string; description: string; start_date: string; start_time: string; end_date: string; end_time: string;
  is_all_day: boolean; attendance: 'place' | 'online' | 'both'; online_url: string; location_name: string; address: string;
  city: string; region: string; country: string; organizer_name: string; organizer_url: string; price_text: string;
};
export type EventOut = { status: string; id: string; link: string };
export async function postEvent(e: EventIn, s: Session): Promise<EventOut> {
  const online = e.attendance !== 'place', inPlace = e.attendance !== 'online';
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const event = {
    ...e, timezone: tz, repeat: 'none', repeat_count: 1, is_online: online, online_url: online ? e.online_url : '',
    location_name: inPlace ? e.location_name : '', address: inPlace ? e.address : '', city: inPlace ? e.city : '',
    region: inPlace ? e.region : '', country: inPlace ? e.country : '', directory_entry_id: '', donation_url: '',
    signup_enabled: false, signup_questions: [], signup_capacity: '', signup_close_hours: '', is_public: true,
  };
  const { data, error } = await supabase.functions.invoke('event-save', {
    body: { event, source: 'app' }, headers: { Authorization: `Bearer ${s.access_token}` },
  });
  // On a refusal the function says why (for example "Please give the start date"); show that to the member
  let out = data as { ok?: boolean; status?: string; events?: { id: string; event: string }[]; error?: string; msg?: string } | null;
  if (error) {
    const ctx = (error as { context?: Response }).context;
    out = ctx ? await ctx.json().catch(() => null) : null;
  }
  if (!out?.ok) throw new Error(out?.error || out?.msg || 'The event could not be saved. Please try again.');
  const first = (out.events || [])[0];
  return { status: out.status || 'upcoming', id: first?.id || '', link: first?.event || '' };
}

export type JobIn = { title: string; description: string; location: string; region: string; country: string; url: string; email: string; phone: string };
export async function postJob(j: JobIn, s: Session): Promise<void> {
  const { error } = await supabase.from('listings').insert({
    user_id: s.user.id, category_id: JOBS_CAT_ID, listing_type: 'offering', status: 'draft',
    title: j.title.slice(0, 200), description: j.description.slice(0, 10000), location: j.location || null, region: j.region || null,
    country: j.country || null, website_url: j.url || null, contact_email: j.email || null, contact_phone: j.phone || null, tags: ['member'], source: 'app',
  });
  if (error) throw new Error(error.message);
}

export type CommunityIn = { title: string; body: string; tags: string };
const slugify = (title: string) => {
  const base = title.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'post';
  return base + '-' + Math.random().toString(36).slice(2, 8); // unique without asking the server
};
export async function postCommunity(p: CommunityIn, author: string): Promise<void> {
  const tags = p.tags.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean).slice(0, 8);
  const { error } = await supabase.from('blog_posts').insert({
    author_name: author.slice(0, 80) || 'Member', title: p.title.slice(0, 200), slug: slugify(p.title),
    body: p.body.slice(0, 60000), tags, source: 'app',
  });
  if (error) throw new Error(error.message);
}

// Owner only: jobs waiting for review, and approve or decline them
export type PendingJob = { id: string; title: string; description: string; location: string | null; region: string | null; country: string | null;
  website_url: string | null; contact_email: string | null; contact_phone: string | null; created_at: string };
export async function pendingJobs(): Promise<PendingJob[]> {
  const { data, error } = await supabase.from('listings')
    .select('id,title,description,location,region,country,website_url,contact_email,contact_phone,created_at')
    .eq('status', 'draft').eq('category_id', JOBS_CAT_ID).order('created_at', { ascending: true }).limit(100);
  if (error) throw new Error(error.message);
  return (data || []) as PendingJob[];
}
export async function reviewJob(id: string, approve: boolean): Promise<void> {
  // Approved jobs stay up 90 days from approval (same as Admin > Pending Jobs on the website)
  const patch = approve ? { status: 'active', expires_at: new Date(Date.now() + 90 * 864e5).toISOString() } : { status: 'expired' };
  const { error } = await supabase.from('listings').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

// Published community posts (newest first), for the Home screen and the reader
export type CommunityPost = { id: string; slug: string; title: string; author_name: string; excerpt: string | null; body: string; published_at: string | null };
export async function fetchCommunityPosts(limit = 20): Promise<CommunityPost[]> {
  const { data, error } = await supabase.from('blog_posts').select('id,slug,title,author_name,excerpt,body,published_at')
    .eq('status', 'published').order('published_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data || []) as CommunityPost[];
}
export async function fetchCommunityPost(slug: string): Promise<CommunityPost | null> {
  const { data, error } = await supabase.from('blog_posts').select('id,slug,title,author_name,excerpt,body,published_at')
    .eq('slug', slug).eq('status', 'published').maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CommunityPost) || null;
}

// The member's own job posts (newest first), for Post > My posts. Jobs last 90 days; the member renews them there.
export type MyJob = { id: string; title: string; status: string; expires_at: string | null; created_at: string; location: string | null; region: string | null };
export const RENEW_WINDOW_DAYS = 14;
export async function myJobs(s: Session): Promise<MyJob[]> {
  const { data, error } = await supabase.from('listings').select('id,title,status,expires_at,created_at,location,region')
    .eq('user_id', s.user.id).eq('category_id', JOBS_CAT_ID).order('created_at', { ascending: false }).limit(50);
  if (error) throw new Error(error.message);
  return (data || []) as MyJob[];
}
// What a job post's state is, and whether it can be renewed now (14 days or less left, or ended)
export function jobState(j: MyJob): { key: 'review' | 'live' | 'ending' | 'ended' | 'declined'; daysLeft: number } {
  const daysLeft = j.expires_at ? Math.ceil((Date.parse(j.expires_at) - Date.now()) / 864e5) : 0;
  if (j.status === 'draft') return { key: 'review', daysLeft };
  if (j.status !== 'active') return { key: 'declined', daysLeft };
  if (daysLeft <= 0) return { key: 'ended', daysLeft };
  return { key: daysLeft <= RENEW_WINDOW_DAYS ? 'ending' : 'live', daysLeft };
}
// Another 90 days from today (the database never allows more than that)
export async function renewJob(id: string): Promise<string> {
  const until = new Date(Date.now() + 90 * 864e5).toISOString();
  const { data, error } = await supabase.from('listings').update({ expires_at: until }).eq('id', id).select('expires_at').single();
  if (error) throw new Error(error.message);
  return (data as { expires_at: string }).expires_at;
}
