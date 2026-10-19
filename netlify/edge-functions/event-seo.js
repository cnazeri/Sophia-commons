// /event/<id>: serve the app shell with that event's own title, description, canonical, Open Graph
// tags, crawlable summary and Event JSON-LD (date, place, organizer), so search engines see one real
// page per event instead of a copy of the home page. Fails open, like listing-seo.js.
import { applySeo, eventPage, EVENT_COLUMNS } from '../../automation/seo_html.mjs';
import { rest, seoResponse } from '../../automation/edge_db.mjs';

export default (request, context) => seoResponse(request, context, 'event-seo', async (db, id) => {
  const [ev] = await rest(db, `events?select=${EVENT_COLUMNS}&id=eq.${id}&status=not.in.(pending,rejected)`);
  if (!ev) return null;
  const others = await rest(db, `events?select=id,title,start_date,country&status=eq.upcoming&id=neq.${id}`
    + `&start_date=gte.${new Date().toISOString().slice(0, 10)}&order=start_date.asc&limit=6`).catch(() => []);
  return html => applySeo(html, eventPage(ev, others));
});

export const config = { path: '/event/*', cache: 'manual' };
