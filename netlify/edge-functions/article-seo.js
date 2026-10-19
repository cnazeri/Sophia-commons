// /article/<id>: serve the app shell with that news item's own title, description, canonical and
// NewsArticle JSON-LD. Roundup items (summaries of other sites' articles) are marked noindex, follow.
// Fails open, like listing-seo.js.
import { applySeo, articlePage, NEWS_COLUMNS } from '../../automation/seo_html.mjs';
import { rest, seoResponse } from '../../automation/edge_db.mjs';

export default (request, context) => seoResponse(request, context, 'article-seo', async (db, id) => {
  const [n] = await rest(db, `news?select=${NEWS_COLUMNS}&id=eq.${id}&status=eq.published`);
  return n ? html => applySeo(html, articlePage(n)) : null;
});

export const config = { path: '/article/*', cache: 'manual' };
