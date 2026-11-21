// /api/substack: the featured Substack blogs on the Social Media page, each with its latest post
// (owner, 2026-11-21). Reads each blog's public RSS feed on the server; the CDN keeps the answer for an hour.
// Only names, short descriptions, the latest post's title, link and date are shown; the posts stay on Substack.
// Add a blog: one line in BLOGS (the "name"/"author" override the feed when the feed's own title is generic).
const BLOGS = [
  { sub: 'hazelarcherginsberg', author: 'Hazel Archer-Ginsberg', pin: 1 },   // always first (owner, 2026-11-21)
  { sub: 'eveliennijeboer', author: 'Evelien Nijeboer' },
  { sub: 'gillianepetrie', author: 'Gillian E. Petrie', name: 'Gillian E. Petrie', desc: 'Essays by Gillian E. Petrie.' },
  { sub: 'anthroposophist' },
  { sub: 'jpibiodynamics', author: 'Josephine Porter Institute' },
  { sub: 'waldorfways' },
];

const plain = s => String(s || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
  .replace(/\s*—\s*/g, ', ').replace(/–/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/^~+/, '').replace(/&#?\w+;/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (xml, name) => (xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`)) || [])[1] || '';

async function blog(b) {
  const home = `https://${b.sub}.substack.com/`;
  const base = { pin: b.pin || 0, url: home, name: b.name || b.sub, author: b.author || '', desc: b.desc || '', image: '', latest: null };
  try {
    const r = await fetch(home + 'feed', { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SophiaCommons/1.0; +https://sophiacommons.org)' } });
    if (!r.ok) return base;
    const xml = await r.text();
    const head = xml.split('<item>')[0], item = (xml.split('<item>')[1] || '');
    const img = plain(tag(tag(head, 'image'), 'url'));
    const link = plain(tag(item, 'link'));
    return {
      ...base,
      name: b.name || plain(tag(head, 'title')) || b.sub,
      desc: b.desc || plain(tag(head, 'description')).slice(0, 220),
      image: /^https:\/\/substackcdn\.com\//.test(img) ? img : '',
      latest: item && /^https:\/\/[a-z0-9-]+\.substack\.com\//.test(link)
        ? { title: plain(tag(item, 'title')), url: link, date: new Date(plain(tag(item, 'pubDate'))).toISOString() } : null,
    };
  } catch (e) {
    return base;
  }
}

export default async () => {
  const blogs = await Promise.all(BLOGS.map(blog));
  // pinned blogs first (Cognitive Ritual), then the newest post first
  blogs.sort((a, b) => (b.pin - a.pin) || (b.latest ? Date.parse(b.latest.date) : 0) - (a.latest ? Date.parse(a.latest.date) : 0));
  return new Response(JSON.stringify({ blogs }), { headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=900',
    'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=3600, stale-while-revalidate=86400',
  } });
};

export const config = { path: '/api/substack', cache: 'manual' };
