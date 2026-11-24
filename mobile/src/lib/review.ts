// Asking for a store review (owner, 2026-11-23). The native Google Play / App Store card appears on its own after a
// happy moment (saving something, adding an event to the calendar), only once the app has been opened on 3 different
// days, and at most once every 4 months. Nothing is asked before the card: both stores forbid "Do you like the app?"
// questions in front of it. Feedback has its own screen (Settings > Send feedback), never linked to the card.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import { Linking, Platform } from 'react-native';

import { track } from '@/lib/analytics';

const KEY = 'sc_review_v1';
const MIN_DAYS = 3;
const GAP_MS = 120 * 24 * 60 * 60 * 1000;   // about 4 months
const PLAY_ID = 'org.sophiacommons.app';

type ReviewState = { days: string[]; askedAt: number };
const EMPTY: ReviewState = { days: [], askedAt: 0 };

async function read(): Promise<ReviewState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY;
  } catch { return EMPTY; }
}
const write = (s: ReviewState) => AsyncStorage.setItem(KEY, JSON.stringify(s)).catch(() => {});
const today = () => new Date().toISOString().slice(0, 10);

/** Call once per app start: remembers the day (only the first few are kept, that is all the rule needs). */
export async function noteAppOpened(): Promise<void> {
  const s = await read();
  const d = today();
  if (s.days.includes(d) || s.days.length >= MIN_DAYS) return;
  await write({ ...s, days: [...s.days, d] });
}

/** Call after a happy moment. Shows the store's own rating card when the rules above allow it. */
let asking = false;   // two quick saves must not both ask
export async function maybeAskForReview(trigger: string): Promise<void> {
  if (asking) return;
  asking = true;
  try {
    const s = await read();
    if (s.days.length < MIN_DAYS || Date.now() - s.askedAt < GAP_MS) return;
    if (!(await StoreReview.isAvailableAsync())) return;
    await write({ ...(await read()), askedAt: Date.now() });   // the store decides whether the card really appears
    await StoreReview.requestReview();
    track('review_prompt_shown', { trigger });
  } catch { /* never interrupt the user over this */ } finally { asking = false; }
}

/** Settings > Rate Sophia Commons: opens the store page (a button must not call the review card, per Google). */
export function storePageUrl(): string | null {
  if (Platform.OS === 'android') return `https://play.google.com/store/apps/details?id=${PLAY_ID}`;
  const url = StoreReview.storeUrl();   // from ios.appStoreUrl in app.json, once the App Store listing exists
  return url ? url + (url.includes('?') ? '&' : '?') + 'action=write-review' : null;
}

export async function openStorePage(): Promise<void> {
  const url = storePageUrl();
  if (!url) return;
  if (Platform.OS === 'android') {
    // The Play Store app if it is installed, the website otherwise
    try { await Linking.openURL(`market://details?id=${PLAY_ID}`); } catch { await Linking.openURL(url); }
  } else {
    await Linking.openURL(url);
  }
  track('store_page_opened');
}
