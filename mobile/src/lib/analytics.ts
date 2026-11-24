// Anonymous usage analytics with PostHog (owner, 2026-11-23): Android and iPhone, on by default, no names, emails or
// account ids are sent (identify() is never called), no session replay. Settings > Privacy has a switch to turn it off;
// PostHog keeps that choice on the phone. Nothing is sent from development builds.
// The project token is public (like the Supabase anon key): it can only send events, not read them.
// The PostHog project lives on the US cloud, so the host must stay us.i.posthog.com.
import { useSegments } from 'expo-router';
import PostHog from 'posthog-react-native';
import { useEffect, useSyncExternalStore } from 'react';

const TOKEN = 'phc_D2ATR3T6H3855RxHGQQfyX2M625EaBGJoBuFWC54VqZs';
const HOST = 'https://us.i.posthog.com';

export const posthog = new PostHog(TOKEN, {
  host: HOST,
  disabled: __DEV__,
  personProfiles: 'identified_only',   // anonymous events only; no person profiles are created
  preloadFeatureFlags: false,          // no feature flags in the app
  captureAppLifecycleEvents: true,     // Application Installed / Opened / Backgrounded
});

/** The named events the app sends. Keep this list short and add to it on purpose. */
export type AppEvent =
  | 'search'
  | 'near_me'
  | 'item_saved'
  | 'calendar_added'
  | 'shared'
  | 'post_submitted'
  | 'signed_in'
  | 'signed_up'
  | 'event_signup'
  | 'review_prompt_shown'
  | 'feedback_sent'
  | 'store_page_opened';

type Props = Record<string, string | number | boolean | null>;

/** Sends one event. Never throws: analytics must not break the app. */
export function track(event: AppEvent, props?: Props) {
  try { posthog.capture(event, props); } catch { /* ignore */ }
}

/** Sends a screen view each time the route changes (Expo Router is not tracked automatically). The route pattern is
 *  sent ('/events/[id]'), never the id itself, so reports group by screen and no one's reading list is recorded. */
export function useScreenTracking() {
  const segments = useSegments();
  const screen = '/' + segments.filter((s) => !s.startsWith('(')).join('/');
  useEffect(() => {
    try { posthog.screen(screen); } catch { /* ignore */ }
  }, [screen]);
}

/** Counts a search once the member stops typing for 2 seconds (3+ letters). The search words are not sent. */
const searchTimers: Record<string, ReturnType<typeof setTimeout>> = {};
export function trackSearch(where: string, query: string) {
  clearTimeout(searchTimers[where]);
  if (query.trim().length < 3) return;
  searchTimers[where] = setTimeout(() => track('search', { where }), 2000);
}

// ── The Settings > Privacy switch ──
const subs = new Set<() => void>();
const sharing = () => !posthog.optedOut;
// The saved choice loads from the phone's storage after start-up; tell the switch once it has
posthog.ready().then(() => subs.forEach((f) => f())).catch(() => {});

export function useAnalyticsSharing(): boolean {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, sharing);
}

export async function setAnalyticsSharing(on: boolean) {
  if (on) await posthog.optIn(); else await posthog.optOut();
  subs.forEach((f) => f());
}
