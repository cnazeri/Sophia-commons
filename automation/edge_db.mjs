// Shared by the event and article SEO edge functions: read the public Supabase URL and key from the
// deployed sb-init.js (public key only, same as the browser) and run a REST query.
let sb = null;

export async function supabase(origin) {
  if (sb) return sb;
  const js = await (await fetch(origin + '/sb-init.js')).text();
  const url = (js.match(/const SUPABASE_URL = '([^']+)'/) || [])[1];
  const key = (js.match(/const SUPABASE_ANON_KEY = '([^']+)'/) || [])[1];
  if (!url || !key) throw new Error('Supabase URL/key not found in sb-init.js');
  return (sb = { url, key });
}

export async function rest({ url, key }, q) {
  const r = await fetch(url + '/rest/v1/' + q, { headers: { apikey: key, Authorization: 'Bearer ' + key } });
  if (!r.ok) throw new Error(q + ' -> HTTP ' + r.status);
  return r.json();
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Serve the app shell with the page's own SEO tags; fall back to the plain shell on any error.
export async function seoResponse(request, context, name, build) {
  const id = decodeURIComponent(new URL(request.url).pathname.split('/')[2] || '');
  const shell = await context.next();
  if (!UUID.test(id) || shell.status !== 200 || !(shell.headers.get('content-type') || '').includes('text/html')) return shell;
  try {
    const db = await supabase(new URL(request.url).origin);
    const html = await shell.text();
    const headers = new Headers(shell.headers);
    headers.delete('content-length');
    const page = await build(db, id);
    if (!page) return new Response(html, { status: 404, headers });
    headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
    headers.set('Netlify-CDN-Cache-Control', 'public, durable, s-maxage=3600, stale-while-revalidate=86400');
    return new Response(page(html), { status: 200, headers });
  } catch (err) {
    console.error(name, id, String(err));
    return shell.bodyUsed ? context.next() : shell;
  }
}
