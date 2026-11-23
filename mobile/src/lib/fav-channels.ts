// Favorite YouTube channels for signed-in members (owner, 2026-11-23): the same list as on sophiacommons.org
// (table favorite_channels, each member sees only their own). Favorites' talks show first in Talks, and the
// channels are listed in Settings > Saved.
import { useEffect, useSyncExternalStore } from 'react';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

const EMPTY: Set<string> = new Set();
let favs: Set<string> = EMPTY;
let loadedFor: string | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

async function load(userId: string | null): Promise<void> {
  if (!userId) { favs = EMPTY; loadedFor = null; emit(); return; }
  if (loadedFor === userId) return;
  loadedFor = userId;
  const { data, error } = await supabase.from('favorite_channels').select('channel_slug');
  if (error) { loadedFor = null; return; }
  favs = new Set((data || []).map((r: { channel_slug: string }) => r.channel_slug));
  emit();
}

/** The signed-in member's favorite channel slugs (empty when signed out). */
export function useFavChannels(): { favs: Set<string>; userId: string | null } {
  const { session } = useAuth();
  const userId = session?.user?.id || null;
  useEffect(() => { load(userId).catch(() => {}); }, [userId]);
  const s = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => favs, () => favs);
  return { favs: userId ? s : EMPTY, userId };
}

/** Adds or removes a favorite; returns true when it is now a favorite. Throws if the database refuses. */
export async function toggleFavChannel(slug: string, userId: string): Promise<boolean> {
  const on = favs.has(slug);
  const { error } = on
    ? await supabase.from('favorite_channels').delete().eq('channel_slug', slug)
    : await supabase.from('favorite_channels').insert({ user_id: userId, channel_slug: slug });
  if (error && !/duplicate/i.test(error.message)) throw new Error(error.message);
  const next = new Set(favs);
  if (on) next.delete(slug); else next.add(slug);
  favs = next;
  emit();
  return !on;
}

export type FavChannel = { slug: string; name: string; url: string; language?: string | null };

/** Name and link of each favorite channel, for Settings > Saved. */
export async function fetchFavChannelRows(slugs: string[]): Promise<FavChannel[]> {
  if (!slugs.length) return [];
  const { data, error } = await supabase.from('youtube_channels').select('slug,name,url,language').in('slug', slugs);
  if (error) throw new Error(error.message);
  return ((data || []) as FavChannel[]).sort((a, b) => a.name.localeCompare(b.name));
}
