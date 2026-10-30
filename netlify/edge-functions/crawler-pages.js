// Lean copies of the static pages (home, sections, categories, countries, regions) for search engines and
// AI crawlers; see automation/crawler_view.mjs. Visitors are passed straight through untouched.
import { isCrawler, crawlerView, SECTION_OF_ROUTE, VARY_HEADERS } from '../../automation/crawler_view.mjs';

export default async (request, context) => {
  if (!isCrawler(request.headers.get('user-agent'))) return;   // visitors: the normal page
  const res = await context.next();
  if (res.status !== 200 || !(res.headers.get('content-type') || '').includes('text/html')) return res;
  try {
    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
    const html = crawlerView(await res.text(), SECTION_OF_ROUTE[path] || '');
    const headers = new Headers(res.headers);
    headers.delete('content-length');
    for (const [k, v] of Object.entries(VARY_HEADERS)) headers.set(k, v);
    return new Response(html, { status: 200, headers });
  } catch (err) {
    console.error('crawler-pages', String(err));
    return context.next();
  }
};

export const config = {
  // Literal list (keep in step with SECTION_OF_ROUTE) so Netlify can read it at build time
  path: ['/', '/category/*', '/country/*', '/region/*', '/de/*', '/directory', '/events', '/browse', '/news', '/blog', '/books', '/podcasts',
    '/memorial', '/eldercare', '/about', '/privacy', '/terms'],
};
