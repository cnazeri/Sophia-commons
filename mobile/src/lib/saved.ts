// Saved events, places, news articles and talks/blogs/podcasts. Members only (owner, 2026-11-23): saving needs a
// signed-in account, and the list is the same one the member sees on sophiacommons.org (saved_items for events,
// places and articles; saved_media for talks, blogs and podcasts). A copy stays on the phone so saved items open
// without a connection. Saves made on the phone before this change move into the account at the first sign-in.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { track } from '@/lib/analytics';
import { type Listing, fetchListing } from '@/lib/directory';
import { type EventRow, fetchEvent } from '@/lib/events';
import { fetchJob, type Job } from '@/lib/jobs';
import { type MediaItem, mediaKey } from '@/lib/media';
import { type Article, fetchArticle } from '@/lib/news';
import { cancelReminder, remindEvent } from '@/lib/reminders';
import { maybeAskForReview } from '@/lib/review';
import { supabase } from '@/lib/supabase';

const KEY = 'sc_saved_v1';
const OWNER_KEY = 'sc_saved_owner';   // the account the phone copy belongs to ('' = saved before sign-in)
export type Saved = { events: Record<string, EventRow>; listings: Record<string, Listing>; news: Record<string, Article>; jobs: Record<string, Job>; media: Record<string, MediaItem> };
const EMPTY: Saved = { events: {}, listings: {}, news: {}, jobs: {}, media: {} };
let state: Saved = EMPTY;
let userId: string | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const persist = () => AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

const loaded = AsyncStorage.getItem(KEY).then((raw) => {
  if (raw) { try { state = { ...EMPTY, ...JSON.parse(raw) }; emit(); } catch { /* keep empty */ } }
}).catch(() => {});

export function useSaved(): Saved {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state, () => state);
}

// ── Account sync ──
type Row = { item_type: string; item_id: string };
const TYPE = { events: 'event', listings: 'directory', news: 'news', jobs: 'listing' } as const;   // jobs are 'listing' rows, as on the website

async function upload(uid: string) {
  const items: (Row & { user_id: string })[] = [];
  (Object.keys(TYPE) as (keyof typeof TYPE)[]).forEach((k) => Object.keys(state[k]).filter(isUuid)
    .forEach((id) => items.push({ user_id: uid, item_type: TYPE[k], item_id: id })));
  if (items.length) await supabase.from('saved_items').upsert(items, { onConflict: 'user_id,item_type,item_id', ignoreDuplicates: true });
  const media = Object.values(state.media || {}).map((m) => ({ user_id: uid, kind: m.kind, item_id: m.id, data: m }));
  if (media.length) await supabase.from('saved_media').upsert(media, { onConflict: 'user_id,kind,item_id', ignoreDuplicates: true });
}

async function pull() {
  const [{ data: rows, error }, { data: media, error: mErr }] = await Promise.all([
    supabase.from('saved_items').select('item_type, item_id'),
    supabase.from('saved_media').select('kind, item_id, data'),
  ]);
  if (error) throw new Error(error.message);
  const next: Saved = { events: {}, listings: {}, news: {}, jobs: {}, media: mErr ? state.media : {} };
  const jobs: Promise<void>[] = [];
  for (const r of (rows || []) as Row[]) {
    if (r.item_type === 'event') {
      if (state.events[r.item_id]) next.events[r.item_id] = state.events[r.item_id];
      else jobs.push(fetchEvent(r.item_id).then((e) => { if (e) next.events[e.id] = e; }).catch(() => {}));
    } else if (r.item_type === 'directory') {
      if (state.listings[r.item_id]) next.listings[r.item_id] = state.listings[r.item_id];
      else jobs.push(fetchListing(r.item_id).then((l) => { if (l) next.listings[l.id] = l; }).catch(() => {}));
    } else if (r.item_type === 'news') {
      if (state.news[r.item_id]) next.news[r.item_id] = state.news[r.item_id];
      else jobs.push(fetchArticle(r.item_id).then((a) => { next.news[a.id] = a; }).catch(() => {}));
    } else if (r.item_type === 'listing') {
      if ((state.jobs || {})[r.item_id]) next.jobs[r.item_id] = state.jobs[r.item_id];
      else jobs.push(fetchJob(r.item_id).then((j) => { if (j) next.jobs[j.id] = j; }).catch(() => {}));
    }
  }
  for (const m of (media || []) as { kind: string; item_id: string; data: MediaItem }[]) {
    // Books are saved on the website only; the app shows talks, blogs and podcasts
    if (m.data && m.data.id && ['video', 'blog', 'podcast'].includes(m.kind)) next.media[mediaKey(m.data)] = m.data;
  }
  await Promise.all(jobs);
  // Events saved on the website get the same phone reminders as events saved here
  const fresh = Object.values(next.events).filter((e) => !state.events[e.id]);
  state = next; persist(); emit();
  for (const e of fresh) remindEvent(e).catch(() => {});
}

/** Called when the signed-in account changes. Signed out: the phone copy is cleared. */
async function onAccount(uid: string | null) {
  await loaded;
  if (uid === userId) return;
  userId = uid;
  if (!uid) {
    const old = Object.values(state.events);
    state = EMPTY; persist(); emit();
    for (const e of old) cancelReminder(e).catch(() => {});
    await AsyncStorage.removeItem(OWNER_KEY).catch(() => {});
    return;
  }
  try {
    const owner = await AsyncStorage.getItem(OWNER_KEY);
    if (!owner) await upload(uid);              // saved before sign-in: keep them, now in the account
    await AsyncStorage.setItem(OWNER_KEY, uid);
    await pull();
  } catch { /* offline: the phone copy stays until the next sign-in or app start */ }
}

supabase.auth.getSession().then(({ data }) => onAccount(data.session?.user?.id || null)).catch(() => {});
supabase.auth.onAuthStateChange((_e, s) => { onAccount(s?.user?.id || null); });

/** Reloads the list from the account (e.g. after saving on the website). */
export function refreshSaved() { if (userId) pull().catch(() => {}); }

// ── Saving (signed-in members only) ──
/** A save is a happy moment: count it, and maybe show the store's rating card (see review.ts). */
function onSaved(kind: string, on: boolean) {
  if (!on) return;
  track('item_saved', { kind });
  maybeAskForReview('save');
}

async function setRow(type: string, id: string, on: boolean) {
  if (!userId) throw new Error('signed out');
  if (!isUuid(id)) return;
  const r = on
    ? await supabase.from('saved_items').upsert({ user_id: userId, item_type: type, item_id: id }, { onConflict: 'user_id,item_type,item_id', ignoreDuplicates: true })
    : await supabase.from('saved_items').delete().eq('item_type', type).eq('item_id', id);
  if (r.error) throw new Error(r.error.message);
}

function toggleIn<K extends 'events' | 'listings' | 'news' | 'jobs'>(k: K, id: string, item: Saved[K][string]): boolean {
  const map = { ...(state[k] || {}) } as Record<string, Saved[K][string]>;
  const on = !map[id];
  if (on) map[id] = item; else delete map[id];
  state = { ...state, [k]: map }; persist(); emit();
  return on;
}

/** Each returns the new state (true = saved). Throws when signed out or the account could not be updated;
 *  the change on the phone is undone in that case. */
export async function toggleEvent(e: EventRow): Promise<boolean> {
  if (!userId) throw new Error('signed out');
  const on = toggleIn('events', e.id, e);
  try { await setRow('event', e.id, on); } catch (err) { toggleIn('events', e.id, e); throw err; }
  onSaved('event', on);
  return on;
}
export async function toggleListing(l: Listing): Promise<boolean> {
  if (!userId) throw new Error('signed out');
  const on = toggleIn('listings', l.id, l);
  try { await setRow('directory', l.id, on); } catch (err) { toggleIn('listings', l.id, l); throw err; }
  onSaved('place', on);
  return on;
}
export async function toggleNews(a: Article): Promise<boolean> {
  if (!userId) throw new Error('signed out');
  const on = toggleIn('news', a.id, a);
  try { await setRow('news', a.id, on); } catch (err) { toggleIn('news', a.id, a); throw err; }
  onSaved('article', on);
  return on;
}
export async function toggleJob(j: Job): Promise<boolean> {
  if (!userId) throw new Error('signed out');
  const on = toggleIn('jobs', j.id, j);
  try { await setRow('listing', j.id, on); } catch (err) { toggleIn('jobs', j.id, j); throw err; }
  onSaved('job', on);
  return on;
}
export async function toggleMedia(m: MediaItem): Promise<boolean> {
  if (!userId) throw new Error('signed out');
  const k = mediaKey(m);
  const flip = () => {
    const media = { ...(state.media || {}) };
    const on = !media[k];
    if (on) media[k] = m; else delete media[k];
    state = { ...state, media }; persist(); emit();
    return on;
  };
  const on = flip();
  const r = on
    ? await supabase.from('saved_media').upsert({ user_id: userId, kind: m.kind, item_id: m.id, data: m }, { onConflict: 'user_id,kind,item_id' })
    : await supabase.from('saved_media').delete().eq('kind', m.kind).eq('item_id', m.id);
  if (r.error) { flip(); throw new Error(r.error.message); }
  onSaved(m.kind, on);
  return on;
}
