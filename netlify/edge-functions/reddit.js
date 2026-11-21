// /api/reddit: the newest posts of r/Anthroposophy for the home page's "From the community" card
// (owner, 2026-10-31). Reddit refuses frequent anonymous reads (HTTP 429), so this reads its public feed on
// the server and the CDN keeps the answer for an hour: about 24 reads a day, whatever the traffic.
// Only titles, authors, dates, links and Reddit's small preview pictures are shown; the posts stay on Reddit.
const SUB = 'Anthroposophy';
const FEED = `https://www.reddit.com/r/${SUB}/new/.rss`;
const SHOW = 3;   // owner, 2026-10-31

const plain = s => String(s || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
  .replace(/\s*\u2014\s*/g, ', ').replace(/\u2013/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
  .replace(/&#?\w+;/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (xml, name) => (xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`)) || [])[1] || '';

// Reddit's own picture for a post: the feed's preview thumbnail, else the first Reddit-hosted image in the
// post body (photo and gallery posts sometimes only have it there). Empty when the post has no picture.
function picture(entry) {
  const unescape = u => u.replace(/&amp;/g, '&').replace(/&#38;/g, '&');
  const thumb = (entry.match(/<media:thumbnail[^>]*url="([^"]+)"/) || [])[1];
  if (thumb) return unescape(thumb);
  const body = unescape(tag(entry, 'content')).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
  const img = (body.match(/<img[^>]*src="(https:\/\/(?:i|preview|external-preview)\.redd\.it\/[^"]+)"/) || [])[1];
  return img ? unescape(img) : '';
}

function posts(xml) {
  return xml.split('<entry>').slice(1).map(e => ({
    title: plain(tag(e, 'title')),
    url: (e.match(/<link[^>]*href="([^"]+)"/) || [])[1] || '',
    author: plain(tag(tag(e, 'author'), 'name')).replace(/^\/?u\//, ''),
    date: plain(tag(e, 'published') || tag(e, 'updated')),
    // Reddit's own preview picture for the post (photo or link preview), when it has one
    image: picture(e),
  })).filter(p => p.title && /^https:\/\/www\.reddit\.com\/r\//.test(p.url)).slice(0, SHOW);
}

// Official API with an app key (owner, 2026-11-21): Reddit now refuses most anonymous reads of the feed
// (404/403/429), so when REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET are set (Netlify environment variables),
// the posts come from oauth.reddit.com with an app-only token. Without them, the public feed is tried as before.
const UA = 'web:org.sophiacommons:1.0 (by /u/SophiaCommons)';
async function apiPosts() {
  const id = Netlify.env.get('REDDIT_CLIENT_ID'), secret = Netlify.env.get('REDDIT_CLIENT_SECRET');
  if (!id || !secret) return null;
  const tok = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST', body: 'grant_type=client_credentials',
    headers: { Authorization: 'Basic ' + btoa(`${id}:${secret}`), 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
  });
  if (!tok.ok) throw new Error(`reddit token HTTP ${tok.status}`);
  const { access_token } = await tok.json();
  const r = await fetch(`https://oauth.reddit.com/r/${SUB}/new?limit=10&raw_json=1`,
    { headers: { Authorization: `Bearer ${access_token}`, 'User-Agent': UA } });
  if (!r.ok) throw new Error(`reddit api HTTP ${r.status}`);
  const kids = ((await r.json()).data || {}).children || [];
  return kids.map(k => k.data || {}).filter(d => d.title && !d.stickied && !d.over_18).map(d => {
    const prev = (((d.preview || {}).images || [])[0] || {}).resolutions || [];
    const small = prev.find(x => x.width >= 108) || prev[0];
    const thumb = /^https:\/\//.test(d.thumbnail || '') ? d.thumbnail : '';
    return {
      title: plain(d.title),
      url: 'https://www.reddit.com' + (d.permalink || ''),
      author: d.author || '',
      date: new Date((d.created_utc || 0) * 1000).toISOString(),
      image: small ? small.url : thumb,
    };
  }).filter(p => /^https:\/\/www\.reddit\.com\/r\//.test(p.url)).slice(0, SHOW);
}

export default async () => {
  try {
    let list = null;
    try { list = await apiPosts(); } catch (e) { list = null; }   // key missing or refused: try the feed
    if (!list || !list.length) {
      const r = await fetch(FEED, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SophiaCommons/1.0; +https://sophiacommons.org)' } });
      if (!r.ok) throw new Error(`reddit HTTP ${r.status}`);
      list = posts(await r.text());
    }
    if (!list.length) throw new Error('no posts');
    return new Response(JSON.stringify({ subreddit: SUB, url: `https://www.reddit.com/r/${SUB}/`, posts: list }), { headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=900',
      // an hour fresh; if Reddit refuses a refresh, keep serving the last good list for up to a day
      'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=3600, stale-while-revalidate=86400',
    } });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Reddit could not be reached.' }), {
      status: 502, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }
};

export const config = { path: '/api/reddit', cache: 'manual' };
