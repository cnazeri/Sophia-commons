// /events.ics (calendar subscription) and /feed.xml (RSS of news and blog posts), read live from the
// public data so calendar apps, feed readers and AI agents always get the current list (owner, 2026-10-29).
import { EVENT_COLUMNS, NEWS_COLUMNS } from '../../automation/seo_html.mjs';
import { supabase, rest } from '../../automation/edge_db.mjs';
import { calendarIcs, newsRss } from '../../automation/feeds.mjs';

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=900',
  'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=1800, stale-while-revalidate=86400',
};

export default async (request) => {
  const path = new URL(request.url).pathname;
  try {
    const db = await supabase(new URL(request.url).origin);
    if (path === '/events.ics') {
      // Upcoming events plus the last 30 days, so a subscribed calendar keeps recent ones
      const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
      const events = await rest(db, `events?select=${EVENT_COLUMNS}&status=in.(upcoming,past,cancelled)&start_date=gte.${since}&order=start_date.asc&limit=500`);
      return new Response(calendarIcs(events), { headers: { ...HEADERS, 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="sophia-commons-events.ics"' } });
    }
    const [news, posts] = await Promise.all([
      rest(db, `news?select=${NEWS_COLUMNS}&status=eq.published&order=published_at.desc.nullslast&limit=40`),
      rest(db, 'blog_posts?select=id,title,slug,excerpt,body,author_name,published_at,created_at&status=eq.published&order=published_at.desc.nullslast&limit=20').catch(() => []),
    ]);
    return new Response(newsRss(news, posts), { headers: { ...HEADERS, 'Content-Type': 'application/rss+xml; charset=utf-8' } });
  } catch (err) {
    console.error('feeds', path, String(err));
    return new Response('The feed is temporarily unavailable. Please try again shortly.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '300' } });
  }
};

export const config = { path: ['/events.ics', '/feed.xml'], cache: 'manual' };
