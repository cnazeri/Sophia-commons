// News, YouTube talks and Substack blogs: the same sources as the website's Home and Social Media pages.
import { SITE, supabase } from '@/lib/supabase';

export type NewsItem = { id: string; title: string; excerpt?: string | null; source_name?: string | null; published_at: string };
export type Video = { video_id: string; channel_slug: string; title: string; url?: string | null; thumbnail_url?: string | null; published_at: string; channel?: string };
export type Blog = { url: string; name: string; author: string; desc: string; image: string; latest: { title: string; url: string; date: string } | null };

export async function fetchNews(limit = 5): Promise<NewsItem[]> {
  const { data, error } = await supabase.from('news').select('id,title,excerpt,source_name,published_at,tags')
    .eq('status', 'published').order('published_at', { ascending: false }).limit(limit + 5);
  if (error) throw new Error(error.message);
  // the weekly email is kept as a news row; leave it out of the news list (as on the website)
  return ((data || []) as (NewsItem & { tags?: string[] })[]).filter((n) => !(n.tags || []).includes('weekly-digest')).slice(0, limit);
}

export async function fetchVideos(limit = 12): Promise<Video[]> {
  const [{ data: vids, error }, { data: chans }] = await Promise.all([
    supabase.from('youtube_videos').select('video_id,channel_slug,title,url,thumbnail_url,published_at')
      .not('title', 'ilike', '%#shorts%').order('published_at', { ascending: false }).limit(limit),
    supabase.from('youtube_channels').select('slug,name').eq('active', true),
  ]);
  if (error) throw new Error(error.message);
  const names = new Map((chans || []).map((c: { slug: string; name: string }) => [c.slug, c.name]));
  return ((vids || []) as Video[]).map((v) => ({ ...v, channel: names.get(v.channel_slug) || '' }));
}

export async function fetchBlogs(): Promise<Blog[]> {
  const r = await fetch(SITE + '/api/substack');
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return ((await r.json()).blogs || []) as Blog[];
}

export const PODCASTS: { name: string; meta: string; url: string }[] = [
  { name: 'ASA Official Podcast', meta: 'Spotify / RSS', url: 'https://anthroposophy.org/podcast/' },
  { name: 'Goetheanum Podcast', meta: 'Transistor', url: 'https://goetheanum.transistor.fm/' },
  { name: 'Inner Work Path: Lisa Romero', meta: 'Australia', url: 'https://www.innerworkpath.com/category/podcast/' },
  { name: 'Rudolf Steiner Audio Podcast', meta: 'Podbean', url: 'https://rudolfsteiner.podbean.com/' },
  { name: 'New Thinking Allowed', meta: 'Video', url: 'https://newthinkingallowed.org/rudolf-steiner-anthroposophy/' },
  { name: 'I Think Speech: Hazel Archer-Ginsberg', meta: 'Spotify', url: 'https://open.spotify.com/show/2LfsfjQpa5vCDTnpOsfdX7' },
];

// One shape for a single talk, blog or podcast, so each has its own page and can be saved (owner, 2026-11-22)
export type MediaKind = 'video' | 'blog' | 'podcast';
// url: what the main button opens (the video, the latest blog post, the podcast); home: a blog's front page
export type MediaItem = { kind: MediaKind; id: string; title: string; url: string; home?: string; image?: string | null; meta?: string; body?: string; date?: string | null };

const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
export const mediaKey = (m: { kind: MediaKind; id: string }) => m.kind + ':' + m.id;

export function videoItem(v: Video): MediaItem {
  return { kind: 'video', id: v.video_id, title: v.title, url: v.url || 'https://www.youtube.com/watch?v=' + v.video_id,
    image: v.thumbnail_url || 'https://i.ytimg.com/vi/' + v.video_id + '/hqdefault.jpg', meta: v.channel || '', date: v.published_at };
}
export function blogItem(b: Blog): MediaItem {
  const sub = (b.url.match(/^https?:\/\/([^./]+)\.substack\.com/) || [])[1] || slug(b.name);
  return { kind: 'blog', id: sub, title: b.name, url: b.latest?.url || b.url, home: b.url, image: b.image || null, meta: b.author !== b.name ? b.author : '',
    body: b.latest ? b.latest.title : b.desc, date: b.latest?.date || null };
}
export function podcastItem(p: { name: string; meta: string; url: string }): MediaItem {
  return { kind: 'podcast', id: slug(p.name), title: p.name, url: p.url, meta: p.meta };
}

/** Loads one item for its own page (opened from a list, from Saved, or from a shared link). */
export async function fetchMediaItem(kind: string, id: string): Promise<MediaItem | null> {
  if (kind === 'video') {
    const { data } = await supabase.from('youtube_videos').select('video_id,channel_slug,title,url,thumbnail_url,published_at').eq('video_id', id).maybeSingle();
    if (!data) return null;
    const { data: ch } = await supabase.from('youtube_channels').select('name').eq('slug', (data as Video).channel_slug).maybeSingle();
    return videoItem({ ...(data as Video), channel: (ch as { name: string } | null)?.name || '' });
  }
  if (kind === 'blog') {
    const b = (await fetchBlogs()).map(blogItem).find((x) => x.id === id);
    return b || null;
  }
  if (kind === 'podcast') return PODCASTS.map(podcastItem).find((x) => x.id === id) || null;
  return null;
}
