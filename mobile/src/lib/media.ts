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

export const PODCASTS = [
  { name: 'ASA Official Podcast', meta: 'Spotify / RSS', url: 'https://anthroposophy.org/podcast/' },
  { name: 'Goetheanum Podcast', meta: 'Transistor', url: 'https://goetheanum.transistor.fm/' },
  { name: 'Inner Work Path: Lisa Romero', meta: 'Australia', url: 'https://www.innerworkpath.com/category/podcast/' },
  { name: 'Rudolf Steiner Audio Podcast', meta: 'Podbean', url: 'https://rudolfsteiner.podbean.com/' },
  { name: 'New Thinking Allowed', meta: 'Video', url: 'https://newthinkingallowed.org/rudolf-steiner-anthroposophy/' },
  { name: 'I Think Speech: Hazel Archer-Ginsberg', meta: 'Spotify', url: 'https://open.spotify.com/show/2LfsfjQpa5vCDTnpOsfdX7' },
];
