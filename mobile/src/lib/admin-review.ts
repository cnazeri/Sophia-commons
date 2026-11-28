// What Approve and Decline do in the app's Admin area: the same table writes as the website's Admin page
// (sophia_commons_v9.js), function by function. Jobs live in lib/post.ts (pendingJobs, reviewJob = adminReviewJob).
// Each write asks for the changed row back, so a write that row security silently skips shows as an error.
import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

const fail = (m: string) => { throw new Error(m); };
const NOTHING = 'NOTHING_CHANGED';

/* ---------- Listings (loadAdminListings, adminApproveListing, adminRejectListing) ---------- */

export type PendingListing = { id: string; name: string; category: string | null; location: string | null; url: string | null;
  contact_email: string | null; description: string | null; status: string | null; source: string | null;
  submitted_at: string | null; created_at: string | null; photo_url?: string | null };

export async function loadListings(): Promise<PendingListing[]> {
  const { data, error } = await supabase.from('listings_pending').select('*').or('status.is.null,status.eq.pending')
    .order('submitted_at', { ascending: false });
  if (error) fail(error.message);
  return (data || []) as PendingListing[];
}

// _categorySlug on the website: the submission form's label to the directory's short category
const CAT_META: Record<string, string> = {
  'waldorf & education': 'waldorf', 'biodynamic agriculture': 'biodynamic', 'esoteric studies': 'societies', 'arts & eurythmy': 'eurythmy',
  'anthroposophic medicine': 'medicine', 'the christian community': 'christian_community', 'community & camphill': 'camphill',
  'groups & circles': 'societies', 'science & technology': 'science', 'online resources': 'online', 'societies & organizations': 'societies',
  'eldercare': 'eldercare', 'podcasts & media': 'online', 'social media': 'social_media',
};
const CAT_FALLBACK: Record<string, string> = {
  'waldorf & education': 'waldorf', 'biodynamic agriculture': 'biodynamic', 'esoteric studies': 'societies', 'arts & eurythmy': 'eurythmy',
  'anthroposophic medicine': 'medicine', 'community & camphill': 'camphill', 'eldercare': 'eldercare', 'online resources': 'online',
  'social media': 'social_media', 'groups & circles': 'community', 'christian community': 'community', 'podcasts & media': 'online',
};
export function categorySlug(label: string | null): string {
  const k = String(label || '').toLowerCase().trim();
  return CAT_META[k] || CAT_FALLBACK[k] || k || 'community';
}

// _geocodePlace on the website: town-level coordinates, or null for online groups and places too vague to pin
async function geocodePlace(place: string | null, category: string | null): Promise<{ lat: number; lng: number } | null> {
  const p = String(place || '').trim();
  if (!p || /online|social/i.test(category || '') || /\b(online|virtual|facebook|international|worldwide)\b/i.test(p)) return null;
  try {
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=' + encodeURIComponent(p));
    const j = (await r.json()) as { lat: string; lon: string; addresstype?: string }[];
    if (!j?.length || /^(continent|country|state|region|province)$/.test(j[0].addresstype || '')) return null;
    return { lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon) };
  } catch {
    return null;   // the daily job retries anything this misses
  }
}

/** Adds the place to directory_entries (approved), then marks the queue row approved and links it. Returns a warning if only the first step worked. */
export async function approveListing(id: string, s: Session | null): Promise<string | void> {
  if (!s) fail('not authorized');   // the new entry needs the editor's user id
  const { data, error } = await supabase.from('listings_pending').select('*').eq('id', id).single();
  if (error || !data) fail(error?.message || NOTHING);
  const d = data as PendingListing;
  const entry: Record<string, unknown> = {
    organization_name: d.name, category: categorySlug(d.category), location: d.location || null, website_url: d.url || null,
    description: d.description || null, email: d.contact_email || null, status: 'approved', user_id: s?.user.id,
  };
  const pin = await geocodePlace(d.location, d.category);
  if (pin) { entry.latitude = pin.lat; entry.longitude = pin.lng; }
  const ins = await supabase.from('directory_entries').insert(entry).select('id').single();
  if (ins.error) fail(ins.error.message);
  const upd = await supabase.from('listings_pending').update({ status: 'approved', directory_entry_id: ins.data?.id ?? null }).eq('id', id);
  if (upd.error) return 'QUEUE:' + upd.error.message;
}

/** Removes a linked directory entry if there is one, then marks the queue row rejected */
export async function rejectListing(id: string): Promise<void> {
  const { data: pending } = await supabase.from('listings_pending').select('directory_entry_id').eq('id', id).single();
  const linked = (pending as { directory_entry_id?: string | null } | null)?.directory_entry_id;
  if (linked) {
    const del = await supabase.from('directory_entries').delete().eq('id', linked);
    if (del.error) fail(del.error.message);
  }
  const rej = await supabase.from('listings_pending').update({ status: 'rejected' }).eq('id', id).select('id');
  if (rej.error) fail(rej.error.message);
  if (!rej.data?.length) fail(NOTHING);
}

/* ---------- Events (loadAdminEvents, adminApproveEvent, adminRejectEvent) ---------- */

export type ReviewEvent = { id: string; title: string; event_type: string | null; start_date: string | null; location_name: string | null;
  organizer_name: string | null; image_url: string | null; description: string | null; status: string | null; source: string | null; created_at: string | null };

/** Member events already live (or private), not looked at yet. Events that have ended clear themselves first, as on the website. */
export async function loadEvents(): Promise<ReviewEvent[]> {
  const now = new Date().toISOString();
  await supabase.from('events').update({ needs_review: false }).eq('needs_review', true)
    .or('end_date.lt.' + now + ',and(end_date.is.null,start_date.lt.' + now + ')');
  const { data, error } = await supabase.from('events').select('*').eq('needs_review', true).neq('status', 'cancelled')
    .order('created_at', { ascending: false });
  if (error) fail(error.message);
  return (data || []) as ReviewEvent[];
}

/** Accept: marks it seen. A private ('pending') event stays private. */
export async function acceptEvent(id: string): Promise<void> {
  const r = await supabase.from('events').update({ needs_review: false }).eq('id', id).select('id');
  if (r.error) fail(r.error.message);
  if (!r.data?.length) fail(NOTHING);
}

/** Take down: 'cancelled' hides it from the public calendar */
export async function takeDownEvent(id: string): Promise<void> {
  const r = await supabase.from('events').update({ status: 'cancelled', needs_review: false }).eq('id', id).select('id');
  if (r.error) fail(r.error.message);
  if (!r.data?.length) fail(NOTHING);
}

/* ---------- Memorials (loadAdminMemorials, adminApproveMemorial, adminRejectMemorial) ---------- */

export type PendingMemorial = { id: string; name: string; years: string | null; location: string | null; contact_email: string | null;
  photo_url: string | null; bio: string | null; created_at: string | null };

export async function loadMemorials(): Promise<PendingMemorial[]> {
  const { data, error } = await supabase.from('memorials_pending').select('*').eq('status', 'pending').order('created_at', { ascending: false });
  if (error) fail(error.message);
  return (data || []) as PendingMemorial[];
}

/** Copies it into memorials (approved), then deletes the queue row. Returns a warning if only the first step worked. */
export async function approveMemorial(id: string): Promise<string | void> {
  const { data, error } = await supabase.from('memorials_pending').select('*').eq('id', id).single();
  if (error || !data) fail(error?.message || NOTHING);
  const m = data as PendingMemorial;
  const ins = await supabase.from('memorials').insert({ name: m.name, years: m.years, location: m.location, bio: m.bio, photo_url: m.photo_url, status: 'approved' });
  if (ins.error) fail(ins.error.message);
  const del = await supabase.from('memorials_pending').delete().eq('id', id);
  if (del.error) return 'QUEUE:' + del.error.message;
}

/** Deletes the uploaded photo (if any) from storage, then the queue row */
export async function rejectMemorial(id: string): Promise<void> {
  const { data } = await supabase.from('memorials_pending').select('photo_url').eq('id', id).single();
  const url = (data as { photo_url?: string | null } | null)?.photo_url;
  const path = url ? url.split('/memorial-photos/')[1] : '';
  if (path) await supabase.storage.from('memorial-photos').remove([decodeURIComponent(path)]);
  const del = await supabase.from('memorials_pending').delete().eq('id', id).select('id');
  if (del.error) fail(del.error.message);
  if (!del.data?.length) fail(NOTHING);
}

/* ---------- Reports (loadAdminReports, updateReportStatus, dismissReport) ---------- */

export type ReportStatus = 'pending' | 'reviewed' | 'resolved';
export type Report = { id: string; item_type: string; item_id: string; reason: string | null; details: string | null; status: ReportStatus | null; created_at: string };

export async function loadReports(status: ReportStatus): Promise<Report[]> {
  const { data, error } = await supabase.from('reports').select('*').eq('status', status).order('created_at', { ascending: false });
  if (error) fail(error.message);
  return (data || []) as Report[];
}

/** Mark reviewed, Resolve, and Dismiss (Dismiss = resolved, after a confirm) */
export async function setReportStatus(id: string, status: ReportStatus): Promise<void> {
  const r = await supabase.from('reports').update({ status }).eq('id', id).select('id');
  if (r.error) fail(r.error.message);
  if (!r.data?.length) fail(NOTHING);
}
