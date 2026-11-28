// Data for the Home redesign phase 2 (owner, 2026-11-25, after the website's home2.js): new places in the directory,
// the latest weekly newsletter, the newsletter sign-up, the latest talk per channel, the coming festival and the
// memorial days of the week.
import { type Video } from '@/lib/media';
import { supabase } from '@/lib/supabase';
import { type YearDay, upcomingYearDays } from '@/lib/year';

const DAY_MS = 864e5;
export const NEW_PLACES_MAX = 3;   // three, like This week (owner, 2026-11-25)
export const TALKS_MAX = 4;
const FEST_AHEAD_DAYS = 21;
const REMEMBER_DAYS = 7;

export type NewPlace = { id: string; organization_name: string; location?: string | null; country?: string | null; photo_url: string };
export type NewPlaces = { count: number; places: NewPlace[] };

/** Approved listings added in the last 7 days that have a picture (logos, marked #contain, left out), as h2DrawNewPlaces.
 *  `count` is every new listing with a picture, logos included, as the website's heading. */
export async function fetchNewPlaces(): Promise<NewPlaces> {
  const since = new Date(Date.now() - 7 * DAY_MS).toISOString();
  const { data, error } = await supabase.from('directory_entries').select('id,organization_name,location,country,photo_url,created_at')
    .eq('status', 'approved').not('photo_url', 'is', null).gte('created_at', since).order('created_at', { ascending: false }).limit(40);
  if (error) throw new Error(error.message);
  const rows = (data || []) as NewPlace[];
  return { count: rows.length, places: rows.filter((x) => !/#contain$/.test(x.photo_url)).slice(0, NEW_PLACES_MAX) };
}

export type Digest = { id: string; title: string; excerpt?: string | null; published_at: string };

/** The latest weekly newsletter issue (a news row tagged weekly-digest), as h2DrawNewsletter */
export async function fetchLatestDigest(): Promise<Digest | null> {
  const { data, error } = await supabase.from('news').select('id,title,excerpt,published_at').eq('status', 'published')
    .contains('tags', ['weekly-digest']).order('published_at', { ascending: false }).limit(1);
  if (error) throw new Error(error.message);
  return ((data || [])[0] as Digest | undefined) || null;
}

export type SubscribeResult = 'sent' | 'saved_later' | 'invalid' | 'failed';
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Signs up for the weekly newsletter through the website's `newsletter` function (double opt-in: it emails a link) */
export async function subscribeNewsletter(email: string): Promise<SubscribeResult> {
  const clean = email.trim().toLowerCase();
  if (!EMAIL_RE.test(clean)) return 'invalid';
  const { error } = await supabase.functions.invoke('newsletter', { body: { action: 'subscribe', email: clean, source: 'home' } });
  if (!error) return 'sent';
  // The function answers 4xx/5xx with { error: code }; read it to tell the cases apart
  const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
  const body = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => ({} as { error?: string })) : {};
  if (body.error === 'invalid_email') return 'invalid';
  if (body.error === 'email_not_configured' || body.error === 'send_failed') return 'saved_later';
  return 'failed';
}

/** The newest talk from each channel, up to `max`, as h2DrawTalks (videos come newest first) */
export function latestPerChannel(videos: Video[], max = TALKS_MAX): Video[] {
  const seen = new Set<string>();
  return videos.filter((v) => {
    if (!v.thumbnail_url || seen.has(v.channel_slug)) return false;
    seen.add(v.channel_slug);
    return true;
  }).slice(0, max);
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
/** Whole days from today to `d` (0 = today) */
export const daysUntil = (d: Date, now = new Date()) => Math.round((startOfDay(d) - startOfDay(now)) / DAY_MS);

/** The next festival with a picture within three weeks, as h2Festival */
export function comingFestival(now = new Date()): YearDay | null {
  return upcomingYearDays(60, now).find((d) => d.kind === 'festival' && d.img?.src && daysUntil(d.date, now) <= FEST_AHEAD_DAYS) || null;
}

/** The next memorial day within a week, as h2Remember */
export function comingMemorial(now = new Date()): YearDay | null {
  return upcomingYearDays(60, now).find((d) => d.kind === 'memorial' && daysUntil(d.date, now) <= REMEMBER_DAYS) || null;
}

export type Remembered = { name: string; initials: string; years: string | null };

/** The name without "Remembering" or the "(65 yrs)" ending, its initials and the years, as h2RememberCard */
export function rememberParts(title: string): Remembered {
  const raw = title.replace(/^(in memoriam|remembering|death of|died)[:\s]*/i, '');
  const yrs = /\((\d+)\s*yrs?\)/i.exec(raw);
  const name = raw.replace(/\s*\([^)]*\)\s*$/, '').trim();
  const words = name.split(',')[0].split(/\s+/).filter(Boolean);
  const initials = words.length ? (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase() : '';
  return { name, initials, years: yrs ? yrs[1] : null };
}

/** The Advent Sunday number (1 to 4) from a festival title, or 0 */
export function adventSunday(title: string): number {
  const m = /advent sunday (\d)/i.exec(title);
  return m ? Number(m[1]) : 0;
}
