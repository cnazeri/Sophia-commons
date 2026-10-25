// /api/book-of-the-week: one in-stock book a week from the Anthroposophy section of the Rudolf Steiner
// Bookstore (owner, 2026-10-24; weekly instead of daily from the same day, and the same book all week). Their store API cannot be read
// from a visitor's browser (no CORS allow-origin), so this reads it on the server and the CDN keeps the
// answer until the week turns over (Monday 00:00 UTC).
const STORE = 'https://rudolfsteinerbookstore.com/wp-json/wc/store/v1/products';
const CATEGORY = 6356;   // product-category/anthroposophy
const PER_PAGE = 10;

const plain = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&#8217;|&rsquo;/g, "'").replace(/&#8216;|&lsquo;/g, "'").replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
  .replace(/&#8211;|&ndash;/g, '-').replace(/&#8212;|&mdash;/g, ', ').replace(/\s*\u2014\s*/g, ', ').replace(/\u2013/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/&#?\w+;/g, ' ').replace(/\s+/g, ' ').trim();
const short = (s, n) => (s.length <= n ? s : s.slice(0, n - 3).replace(/\s+\S*$/, '') + '...');

// Only books listed before this week began, oldest first: new arrivals during the week can't
// shift the list, so the same book shows all week even after a deploy clears the cache (owner, 2026-10-24).
async function page(n, before) {
  const r = await fetch(`${STORE}?category=${CATEGORY}&before=${before}&per_page=${PER_PAGE}&page=${n}&orderby=date&order=asc`,
    { headers: { 'User-Agent': 'SophiaCommons/1.0 (+https://sophiacommons.org)' } });
  if (!r.ok) throw new Error(`store HTTP ${r.status}`);
  return { items: await r.json(), pages: Number(r.headers.get('x-wp-totalpages')) || 1 };
}

// Up to n books from slot `start` on (wrapping) that are in stock with a cover and a description
function chooseN(items, start, n) {
  const ok = p => p.is_in_stock !== false && p.images && p.images.length && plain(p.short_description || p.description).length > 40;
  const out = [];
  for (let i = 0; i < items.length && out.length < n; i++) {
    const p = items[(start + i) % items.length];
    if (ok(p)) out.push(p);
  }
  return out;
}

function toBook(p) {
  const minor = p.prices && p.prices.currency_minor_unit != null ? p.prices.currency_minor_unit : 2;
  return {
    name: plain(p.name),
    url: p.permalink,
    image: (p.images[0] && (p.images[0].thumbnail || p.images[0].src)) || null,
    price: p.prices && p.prices.price ? `${(p.prices.currency_prefix || '$').trim()}${(Number(p.prices.price) / 10 ** minor).toFixed(minor)}` : null,
    section: plain((p.categories && p.categories[0] && p.categories[0].name) || 'Anthroposophy'),
    // Many descriptions open with the book's own title and a colon ("A Way of Seeing: Perception, ..."); drop that
    blurb: short(plain(p.short_description || p.description).replace(new RegExp('^' + plain(p.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:\\s*', 'i'), ''), 280),
  };
}

// The week's recommendations: the first one is shown automatically when the owner hasn't picked
// (Admin > Book of the week stores picks in the book_picks table; owner, 2026-10-24).
const RECOMMENDATIONS = 5;
async function recommendations(week) {
  const before = new Date((week * 7 - 3) * 864e5).toISOString().slice(0, 19);   // that Monday 00:00 UTC
  const first = await page(1, before);
  const pick = first.pages > 1 ? await page(1 + (week * 7) % first.pages, before) : first;
  return chooseN(pick.items, week % Math.max(pick.items.length, 1), RECOMMENDATIONS).map(toBook);
}

export default async (req) => {
  // Day 0 of the epoch was a Thursday; +3 makes each week start on Monday
  const week = Math.floor((Math.floor(Date.now() / 864e5) + 3) / 7);
  const untilNextWeek = 7 * 86400 - (Math.floor(Date.now() / 1000) + 3 * 86400) % (7 * 86400);
  const q = new URL(req.url).searchParams;
  try {
    // ?options=1 (Admin): this week's recommendations; &week=next for the coming week
    if (q.get('options')) {
      const books = await recommendations(week + (q.get('week') === 'next' ? 1 : 0));
      return new Response(JSON.stringify({ books }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
    const [book] = await recommendations(week);
    if (!book) throw new Error('no books');
    return new Response(JSON.stringify(book), { headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Netlify-CDN-Cache-Control': `public, durable, s-maxage=${untilNextWeek}`,
      'Netlify-Vary': 'query=options|week',
    } });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'The bookstore could not be reached.' }), {
      status: 502, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }
};

export const config = { path: ['/api/book-of-the-week', '/api/book-of-the-day'], cache: 'manual' };
