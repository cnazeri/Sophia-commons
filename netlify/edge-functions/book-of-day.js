// /api/book-of-the-day: one in-stock book a day from the Anthroposophy section of the Rudolf Steiner
// Bookstore (owner, 2026-10-24). Their store API cannot be read from a visitor's browser (no CORS
// allow-origin), so this reads it on the server and the CDN keeps the answer until midnight UTC.
const STORE = 'https://rudolfsteinerbookstore.com/wp-json/wc/store/v1/products';
const CATEGORY = 6356;   // product-category/anthroposophy
const PER_PAGE = 10;

const plain = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&#8217;|&rsquo;/g, "'").replace(/&#8216;|&lsquo;/g, "'").replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
  .replace(/&#8211;|&ndash;/g, '-').replace(/&#8212;|&mdash;/g, ', ').replace(/&#?\w+;/g, ' ').replace(/\s+/g, ' ').trim();
const short = (s, n) => (s.length <= n ? s : s.slice(0, n - 3).replace(/\s+\S*$/, '') + '...');

async function page(n) {
  const r = await fetch(`${STORE}?category=${CATEGORY}&stock_status=instock&per_page=${PER_PAGE}&page=${n}&orderby=date&order=desc`,
    { headers: { 'User-Agent': 'SophiaCommons/1.0 (+https://sophiacommons.org)' } });
  if (!r.ok) throw new Error(`store HTTP ${r.status}`);
  return { items: await r.json(), pages: Number(r.headers.get('x-wp-totalpages')) || 1 };
}

export default async () => {
  const day = Math.floor(Date.now() / 864e5);
  const untilMidnight = 86400 - Math.floor(Date.now() / 1000) % 86400;
  try {
    const first = await page(1);
    // A different page each day, then the first book on it that has a cover and a description
    const pick = first.pages > 1 ? await page(1 + (day * 7) % first.pages) : first;
    const pool = pick.items.filter(p => p.images && p.images.length && plain(p.short_description || p.description).length > 40);
    const p = pool.length ? pool[day % pool.length] : pick.items[0];
    if (!p) throw new Error('no books');
    const minor = p.prices && p.prices.currency_minor_unit != null ? p.prices.currency_minor_unit : 2;
    const book = {
      name: plain(p.name),
      url: p.permalink,
      image: (p.images[0] && (p.images[0].thumbnail || p.images[0].src)) || null,
      price: p.prices && p.prices.price ? `${(p.prices.currency_prefix || '$').trim()}${(Number(p.prices.price) / 10 ** minor).toFixed(minor)}` : null,
      section: plain((p.categories && p.categories[0] && p.categories[0].name) || 'Anthroposophy'),
      // Many descriptions open with the book's own title ("A Way of Seeing: Perception, ..."); drop that
      blurb: short(plain(p.short_description || p.description).replace(new RegExp('^' + plain(p.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[:\\s]*', 'i'), ''), 280),
    };
    return new Response(JSON.stringify(book), { headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Netlify-CDN-Cache-Control': `public, durable, s-maxage=${untilMidnight}`,
    } });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'The bookstore could not be reached.' }), {
      status: 502, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }
};

export const config = { path: '/api/book-of-the-day', cache: 'manual' };
