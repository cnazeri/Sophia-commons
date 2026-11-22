// Events from the same database as the website's calendar.
import { getLang } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

export type EventRow = {
  id: string;
  title: string;
  title_en?: string | null;
  description?: string | null;
  description_en?: string | null;
  event_type?: string | null;
  start_date: string;
  end_date?: string | null;
  is_all_day?: boolean | null;
  location_name?: string | null;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  is_online?: boolean | null;
  online_url?: string | null;
  organizer_name?: string | null;
  organizer_url?: string | null;
  ticket_url?: string | null;
  ticket_price?: string | null;
  price_text?: string | null;
  is_free?: boolean | null;
  image_url?: string | null;
  featured?: boolean | null;
  timezone?: string | null;
  lang?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  lat?: number | null;
  lng?: number | null;
};

// Upcoming events, same list as the website's calendar (featured and soonest first is left to the screen)
export async function fetchUpcoming(): Promise<EventRow[]> {
  const { data, error } = await supabase.rpc('get_upcoming_events', { days_ahead: 365, limit_n: 400 });
  if (error) throw new Error(error.message);
  // Leave out what is already over today (no end time: assume two hours)
  const now = Date.now();
  return ((data || []) as EventRow[]).filter((e) => (e.end_date ? Date.parse(e.end_date) : Date.parse(e.start_date) + 2 * 3600e3) > now);
}

export async function fetchEvent(id: string): Promise<EventRow | null> {
  const { data, error } = await supabase.from('events').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as EventRow | null;
}

// Non-English events show their English translation to English readers (as on the website)
export function eventTitle(e: EventRow) {
  return getLang() === 'en' && e.title_en ? e.title_en : e.title;
}
export function eventDescription(e: EventRow) {
  return getLang() === 'en' && e.description_en ? e.description_en : e.description || '';
}

export function isOnline(e: EventRow) { return !!e.is_online; }

export function eventPlace(e: EventRow): string {
  if (e.is_online && !e.city) return '';
  return [e.city, e.region, e.country].filter(Boolean).join(', ');
}

// Small image served by the database's image service (much lighter than the original upload)
export function sizedImage(url: string | null | undefined, width: number): string | null {
  if (!url) return null;
  if (url.includes('/storage/v1/object/public/')) {
    return url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/') + (url.includes('?') ? '&' : '?') + 'width=' + width + '&quality=72&resize=contain';
  }
  return url;
}

export type EventFilter = 'all' | 'online' | 'in_person' | 'festival';
export function matches(e: EventRow, f: EventFilter) {
  if (f === 'online') return !!e.is_online;
  if (f === 'in_person') return !e.is_online;
  if (f === 'festival') return e.event_type === 'festival';
  return true;
}
