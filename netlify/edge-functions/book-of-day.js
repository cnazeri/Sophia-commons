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

// The first book from slot `start` on (wrapping) that is in stock with a cover and a description
function choose(items, start) {
  const ok = p => p.is_in_stock !== false && p.images && p.images.length && plain(p.short_description || p.description).length > 40;
  for (let i = 0; i < items.length; i++) {
    const p = items[(start + i) % items.length];
    if (ok(p)) return p;
  }
  return null;
}

export default async () => {
  // Day 0 of the epoch was a Thursday; +3 makes each week start on Monday
  const week = Math.floor((Math.floor(Date.now() / 864e5) + 3) / 7);
  const untilNextWeek = 7 * 86400 - (Math.floor(Date.now() / 1000) + 3 * 86400) % (7 * 86400);
  try {
    const before = new Date((week * 7 - 3) * 864e5).toISOString().slice(0, 19);   // this Monday 00:00 UTC
    const first = await page(1, before);
    const pick = first.pages > 1 ? await page(1 + (week * 7) % first.pages, before) : first;
    const p = choose(pick.items, week % Math.max(pick.items.length, 1));
    if (!p) throw new Error('no books');
    const minor = p.prices && p.prices.currency_minor_unit != null ? p.prices.currency_minor_unit : 2;
    const book = {
      name: plain(p.name),
      url: p.permalink,
      image: (p.images[0] && (p.images[0].thumbnail || p.images[0].src)) || null,
      price: p.prices && p.prices.price ? `${(p.prices.currency_prefix || '$').trim()}${(Number(p.prices.price) / 10 ** minor).toFixed(minor)}` : null,
      section: plain((p.categories && p.categories[0] && p.categories[0].name) || 'Anthroposophy'),
      // Many descriptions open with the book's own title and a colon ("A Way of Seeing: Perception, ..."); drop that
      blurb: short(plain(p.short_description || p.description).replace(new RegExp('^' + plain(p.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:\\s*', 'i'), ''), 280),
    };
    return new Response(JSON.stringify(book), { headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Netlify-CDN-Cache-Control': `public, durable, s-maxage=${untilNextWeek}`,
    } });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'The bookstore could not be reached.' }), {
      status: 502, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }
};

export const config = { path: ['/api/book-of-the-week', '/api/book-of-the-day'], cache: 'manual' };
