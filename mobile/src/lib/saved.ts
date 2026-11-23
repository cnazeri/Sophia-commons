// Saved events, places, news articles and talks/blogs/podcasts, kept on the phone so they open without a connection.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import type { Listing } from '@/lib/directory';
import { type MediaItem, mediaKey } from '@/lib/media';
import type { EventRow } from '@/lib/events';
import type { Article } from '@/lib/news';

const KEY = 'sc_saved_v1';
export type Saved = { events: Record<string, EventRow>; listings: Record<string, Listing>; news: Record<string, Article>; media: Record<string, MediaItem> };
let state: Saved = { events: {}, listings: {}, news: {}, media: {} };
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

AsyncStorage.getItem(KEY).then((raw) => { if (raw) { try { state = { events: {}, listings: {}, news: {}, media: {}, ...JSON.parse(raw) }; emit(); } catch { /* keep empty */ } } }).catch(() => {});
const persist = () => AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});

export function useSaved(): Saved {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state);
}
export function toggleEvent(e: EventRow): boolean {
  const events = { ...state.events };
  const on = !events[e.id];
  if (on) events[e.id] = e; else delete events[e.id];
  state = { ...state, events }; persist(); emit();
  return on;
}
export function toggleListing(l: Listing): boolean {
  const listings = { ...state.listings };
  const on = !listings[l.id];
  if (on) listings[l.id] = l; else delete listings[l.id];
  state = { ...state, listings }; persist(); emit();
  return on;
}
export function toggleNews(a: Article): boolean {
  const news = { ...state.news };
  const on = !news[a.id];
  if (on) news[a.id] = a; else delete news[a.id];
  state = { ...state, news }; persist(); emit();
  return on;
}
export function toggleMedia(m: MediaItem): boolean {
  const media = { ...(state.media || {}) };
  const k = mediaKey(m), on = !media[k];
  if (on) media[k] = m; else delete media[k];
  state = { ...state, media }; persist(); emit();
  return on;
}
