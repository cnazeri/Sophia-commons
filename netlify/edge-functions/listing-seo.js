// /listing/<id>: serve the app shell with that listing's own title, description, canonical,
// Open Graph tags, crawlable summary and JSON-LD, so search engines see one real page per listing
// instead of 4,000+ copies of the home page. Same markup as the static pages from
// automation/prerender.mjs (both use automation/seo_html.mjs).
// Fails open: any error returns the plain app shell, exactly as before this function existed.
import { applySeo, listingPage, LISTING_COLUMNS, kmBetween } from '../../automation/seo_html.mjs';
import { isCrawler, crawlerView, VARY_HEADERS } from '../../automation/crawler_view.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let sb = null; // { url, key } read once per instance from the deployed sb-init.js (public key only)

async function supabase(origin) {
  if (sb) return sb;
  const js = await (await fetch(origin + '/sb-init.js')).text();
  const url = (js.match(/const SUPABASE_URL = '([^']+)'/) || [])[1];
  const key = (js.match(/const SUPABASE_ANON_KEY = '([^']+)'/) || [])[1];
  if (!url || !key) throw new Error('Supabase URL/key not found in sb-init.js');
  return (sb = { url, key });
}

async function rest({ url, key }, q) {
  const r = await fetch(url + '/rest/v1/' + q, { headers: { apikey: key, Authorization: 'Bearer ' + key } });
  if (!r.ok) throw new Error(q + ' -> HTTP ' + r.status);
  return r.json();
}

export default async (request, context) => {
  const id = decodeURIComponent(new URL(request.url).pathname.split('/')[2] || '');
  const shell = await context.next();
  if (!UUID.test(id) || shell.status !== 200 || !(shell.headers.get('content-type') || '').includes('text/html')) return shell;
  try {
    const db = await supabase(new URL(request.url).origin);
    const [entry] = await rest(db, `directory_entries?select=${LISTING_COLUMNS}&id=eq.${id}&status=eq.approved`);
    const html = await shell.text();
    const headers = new Headers(shell.headers);
    headers.delete('content-length');
    if (!entry) return new Response(html, { status: 404, headers });

    let related = [];
    if (entry.category && entry.country) {
      related = await rest(db, `directory_entries?select=id,organization_name,city,location,country,website_url&status=eq.approved`
        + `&category=eq.${encodeURIComponent(entry.category)}&country=eq.${encodeURIComponent(entry.country)}&id=neq.${id}&order=organization_name.asc&limit=8`).catch(() => []);
    }
    // Nearby: anything within about 60 km (box query, then exact distance), not already listed above
    let nearby = [];
    const lat = Number(entry.latitude), lng = Number(entry.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng)) {
      const dLng = Math.min(3, 0.6 / Math.max(0.2, Math.cos(lat * Math.PI / 180)));
      const box = await rest(db, `directory_entries?select=id,organization_name,city,location,country,category,latitude,longitude&status=eq.approved&id=neq.${id}`
        + `&latitude=gte.${lat - 0.55}&latitude=lte.${lat + 0.55}&longitude=gte.${lng - dLng}&longitude=lte.${lng + dLng}&limit=300`).catch(() => []);
      const seen = new Set(related.map(r => r.id));
      nearby = box.filter(n => !seen.has(n.id))
        .map(n => ({ ...n, _km: kmBetween({ latitude: lat, longitude: lng }, { latitude: Number(n.latitude), longitude: Number(n.longitude) }) }))
        .filter(n => n._km <= 60).sort((a, b) => a._km - b._km).slice(0, 8);
    }
    headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
    headers.set('Netlify-CDN-Cache-Control', 'public, durable, s-maxage=3600, stale-while-revalidate=86400');
    for (const [k, v] of Object.entries(VARY_HEADERS)) headers.set(k, v);
    const page = applySeo(html, listingPage(entry, related, nearby));
    // Search engines and AI crawlers get the lean copy (automation/crawler_view.mjs)
    return new Response(isCrawler(request.headers.get('user-agent')) ? crawlerView(page) : page, { status: 200, headers });
  } catch (err) {
    console.error('listing-seo', id, String(err));
    return shell.bodyUsed ? context.next() : shell;
  }
};

export const config = { path: '/listing/*', cache: 'manual' };
