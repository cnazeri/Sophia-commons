// /listing/<id>: serve the app shell with that listing's own title, description, canonical,
// Open Graph tags, crawlable summary and JSON-LD, so search engines see one real page per listing
// instead of 4,000+ copies of the home page. Same markup as the static pages from
// automation/prerender.mjs (both use automation/seo_html.mjs).
// Fails open: any error returns the plain app shell, exactly as before this function existed.
import { applySeo, listingPage, LISTING_COLUMNS } from '../../automation/seo_html.mjs';

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
    headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
    headers.set('Netlify-CDN-Cache-Control', 'public, durable, s-maxage=3600, stale-while-revalidate=86400');
    return new Response(applySeo(html, listingPage(entry, related)), { status: 200, headers });
  } catch (err) {
    console.error('listing-seo', id, String(err));
    return shell.bodyUsed ? context.next() : shell;
  }
};

export const config = { path: '/listing/*', cache: 'manual' };
