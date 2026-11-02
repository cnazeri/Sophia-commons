// /event/<id>: serve the app shell with that event's own title, description, canonical, Open Graph
// tags, crawlable summary and Event JSON-LD (date, place, organizer), so search engines see one real
// page per event instead of a copy of the home page. Fails open, like listing-seo.js.
// Pending events (shared by link before approval, 2026-11-01) come from get_event() and are served with
// robots noindex. Before that RPC exists the lookup fails quietly and the page behaves as before.
import { applySeo, eventPage, EVENT_COLUMNS } from '../../automation/seo_html.mjs';
import { rest, seoResponse } from '../../automation/edge_db.mjs';

async function pendingEvent(db, id) {
  try {
    const rows = await rest(db, `rpc/get_event?p_id=${id}&select=${EVENT_COLUMNS}`);
    return rows && rows[0] && rows[0].status === 'pending' ? rows[0] : null;
  } catch (e) { return null; }
}

export default (request, context) => seoResponse(request, context, 'event-seo', async (db, id) => {
  const [listed] = await rest(db, `events?select=${EVENT_COLUMNS}&id=eq.${id}&status=not.in.(pending,rejected)`);
  const ev = listed || await pendingEvent(db, id);
  if (!ev) return null;
  if (ev.status === 'pending') return html => applySeo(html, { ...eventPage(ev, []), robots: 'noindex' });
  const others = await rest(db, `events?select=id,title,start_date,country&status=eq.upcoming&id=neq.${id}`
    + `&start_date=gte.${new Date().toISOString().slice(0, 10)}&order=start_date.asc&limit=6`).catch(() => []);
  return html => applySeo(html, eventPage(ev, others));
});

export const config = { path: '/event/*', cache: 'manual' };
