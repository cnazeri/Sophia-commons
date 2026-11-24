// Event sign-ups in the app (owner, 2026-11-23): the same rules and server functions as sophiacommons.org/signup/<id>
// (signup.html): open while the organizer has sign-ups on, the event is listed or pending, and before the closing time;
// places left from event_signup_spots(); the sign-up itself goes to the event-signup edge function, which emails a
// confirmation and puts people on the waitlist when the event is full.
import { type EventRow } from '@/lib/events';
import { supabase } from '@/lib/supabase';

export type SignupQuestion = { type?: 'yesno' | 'choice' | 'text'; label: string; options?: string[] };
export type Spots = { count: number; capacity: number | null; left: number | null };
export type SignupResult = { waitlist?: boolean; count?: number; left?: number | null };

export const QUESTION_MAX = 3;
export const PEOPLE_MAX = 20;
const OPEN_STATUSES = ['pending', 'upcoming', 'ongoing'];

/** When sign-ups close: signup_close_hours before the start, or a day after the event when none is set. */
export function signupClosesAt(e: EventRow): number {
  return e.signup_close_hours == null
    ? Date.parse(e.end_date || e.start_date) + 864e5
    : Date.parse(e.start_date) - e.signup_close_hours * 36e5;
}

export function signupOpen(e: EventRow, now = Date.now()): boolean {
  return !!e.signup_enabled && OPEN_STATUSES.includes(e.status || 'upcoming') && now < signupClosesAt(e);
}

export function signupQuestions(e: EventRow): SignupQuestion[] {
  const qs = Array.isArray(e.signup_questions) ? (e.signup_questions as SignupQuestion[]) : [];
  return qs.filter((q) => q && typeof q.label === 'string').slice(0, QUESTION_MAX);
}

export async function fetchSpots(eventId: string): Promise<Spots | null> {
  const { data, error } = await supabase.rpc('event_signup_spots', { p_event: eventId });
  if (error || !data) return null;
  return data as Spots;
}

export const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);

/** Sends one sign-up. Throws with the server's own message (for example "Sign-ups are closed") when it says no. */
export async function sendSignup(body: {
  event_id: string; name: string; email: string; attending: number; note: string; answers: string[];
}): Promise<SignupResult> {
  const { data, error } = await supabase.functions.invoke('event-signup', {
    body: { ...body, attending: String(body.attending), website: '', tz: Intl.DateTimeFormat().resolvedOptions().timeZone },
  });
  if (error) {
    let message = '';
    try { message = (await (error as { context?: Response }).context?.json())?.error || ''; } catch { /* no body */ }
    throw new Error(message);
  }
  return (data || {}) as SignupResult;
}
