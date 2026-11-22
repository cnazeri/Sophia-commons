// News articles shown inside the app. Every article opened is kept on the phone (the last 60), and the latest
// news list is kept too, so both open without a connection. Bookmarked articles live in saved.ts and never expire.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/lib/supabase';

export type Article = {
  id: string; title: string; body?: string | null; excerpt?: string | null;
  source_name?: string | null; source_url?: string | null; published_at: string;
};

const READ_KEY = 'sc_articles_v1';
const LIST_KEY = 'sc_news_list_v1';
const KEEP = 60;
const FIELDS = 'id,title,body,excerpt,source_name,source_url,published_at,tags';

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try { const raw = await AsyncStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
}
const writeJson = (key: string, v: unknown) => AsyncStorage.setItem(key, JSON.stringify(v)).catch(() => {});

async function remember(items: Article[]) {
  const all = await readJson<Record<string, Article & { _at?: number }>>(READ_KEY, {});
  const now = Date.now();
  items.forEach((a, i) => { all[a.id] = { ...a, _at: now - i }; });
  const kept = Object.values(all).sort((x, y) => (y._at || 0) - (x._at || 0)).slice(0, KEEP);
  writeJson(READ_KEY, Object.fromEntries(kept.map((x) => [x.id, x])));
}

/** The kept copy of an article, if it was opened or bookmarked before. */
export async function keptArticle(id: string): Promise<Article | null> {
  const all = await readJson<Record<string, Article>>(READ_KEY, {});
  return all[id] || null;
}

/** Fetches the article and keeps a copy; falls back to the kept copy when offline. */
export async function fetchArticle(id: string): Promise<Article> {
  try {
    const { data, error } = await supabase.from('news').select(FIELDS).eq('id', id).eq('status', 'published').maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('not found');
    const a = data as Article;
    remember([a]);
    return a;
  } catch (err) {
    const kept = await keptArticle(id);
    if (kept) return kept;
    throw err;
  }
}

/** Latest news, without the weekly email. Falls back to the last list seen when offline. */
export async function fetchNewsList(limit = 5): Promise<Article[]> {
  try {
    const { data, error } = await supabase.from('news').select(FIELDS).eq('status', 'published')
      .order('published_at', { ascending: false }).limit(limit + 5);
    if (error) throw new Error(error.message);
    const list = ((data || []) as (Article & { tags?: string[] })[])
      .filter((n) => !(n.tags || []).includes('weekly-digest')).slice(0, limit);
    writeJson(LIST_KEY, list);
    remember(list);
    return list;
  } catch (err) {
    const kept = await readJson<Article[]>(LIST_KEY, []);
    if (kept.length) return kept.slice(0, limit);
    throw err;
  }
}

/** Splits the stored plain text into paragraphs. */
export const paragraphs = (body?: string | null) => (body || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
