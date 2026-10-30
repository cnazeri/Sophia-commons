// Sophia Commons MCP server (Model Context Protocol, Streamable HTTP, stateless; owner, 2026-10-29).
// Lets AI assistants search the directory and events at https://sophiacommons.org/mcp.
// Read-only: every query goes through the public REST API with the publishable key, so it sees only
// what any visitor sees. Emails and phone numbers are never returned.
// Served by netlify/edge-functions/mcp.js; plain JS so Node tests can load it too.
import { SITE, kmBetween } from './seo_html.mjs';
import { categoryLabel } from './agent_data.mjs';

export const SERVER_VERSION = '1.0.0';
const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const CATEGORY_CODES = ['waldorf', 'biodynamic', 'christian_community', 'camphill', 'community', 'eurythmy', 'medicine', 'societies', 'eldercare', 'online', 'social_media', 'science'];
const CATEGORY_HELP = 'waldorf = Waldorf/Steiner schools and kindergartens; biodynamic = biodynamic and Demeter farms; christian_community = The Christian Community congregations; '
  + 'camphill = Camphill communities; community = other intentional communities; eurythmy = eurythmy and the arts; medicine = anthroposophic medicine; '
  + 'societies = Anthroposophical Society branches and study groups; eldercare = care homes; online = online resources; social_media = groups and channels; science = Goethean science';

const LISTING_COLS = 'id,organization_name,description,category,address,city,region,country,website_url,latitude,longitude,is_verified,updated_at';
const EVENT_COLS = 'id,title,description,start_date,end_date,is_all_day,location_name,city,region,country,is_online,online_url,organizer_name,organizer_url,ticket_url,is_free,event_type,status';

const INSTRUCTIONS = 'Sophia Commons (sophiacommons.org) is a free directory of anthroposophical life worldwide: about 4,500 Waldorf schools, biodynamic farms, '
  + 'Camphill communities, Christian Community congregations, clinics, eurythmy schools and study groups in about 80 countries, plus upcoming events. '
  + 'Use search_directory to find places by name, topic, category, country or city, find_nearby for places near coordinates, get_listing for details, '
  + 'and upcoming_events for conferences, courses and talks. Countries are stored as USA and UK for the United States and United Kingdom. '
  + 'Always give the user the Sophia Commons page (url) for each result.';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const limitProp = (def, max) => ({ type: 'integer', minimum: 1, maximum: max, default: def, description: `How many results to return (default ${def}, max ${max})` });

export const TOOLS = [
  {
    name: 'search_directory', title: 'Search the directory',
    description: 'Search Sophia Commons for anthroposophical organizations: Waldorf schools, biodynamic farms, Camphill communities, The Christian Community, clinics, eurythmy, study groups and more. Combine a free-text query with category, country and city filters.',
    inputSchema: { type: 'object', properties: {
      query: { type: 'string', description: 'Words to look for in the name or description, e.g. "kindergarten", "Demeter dairy", "Goetheanum"' },
      category: { type: 'string', enum: CATEGORY_CODES, description: CATEGORY_HELP },
      country: { type: 'string', description: 'Country name in English, e.g. "Germany", "United States", "New Zealand"' },
      city: { type: 'string', description: 'City or town name' },
      limit: limitProp(20, 50),
    } },
    annotations: READ_ONLY,
  },
  {
    name: 'find_nearby', title: 'Find places nearby',
    description: 'Find anthroposophical organizations closest to a point, sorted by distance. Use the latitude and longitude of a town or address.',
    inputSchema: { type: 'object', required: ['latitude', 'longitude'], properties: {
      latitude: { type: 'number', minimum: -90, maximum: 90 },
      longitude: { type: 'number', minimum: -180, maximum: 180 },
      radius_km: { type: 'number', minimum: 1, maximum: 500, default: 50, description: 'Search radius in kilometres (default 50, max 500)' },
      category: { type: 'string', enum: CATEGORY_CODES, description: CATEGORY_HELP },
      limit: limitProp(15, 50),
    } },
    annotations: READ_ONLY,
  },
  {
    name: 'get_listing', title: 'Get one listing',
    description: 'Full public details of one directory listing by its id (from search_directory or find_nearby).',
    inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string', description: 'The listing id (a UUID)' } } },
    annotations: READ_ONLY,
  },
  {
    name: 'upcoming_events', title: 'Upcoming events',
    description: 'Upcoming anthroposophical events listed on Sophia Commons: conferences, courses, talks, festivals, workshops and online study groups, soonest first.',
    inputSchema: { type: 'object', properties: {
      query: { type: 'string', description: 'Words to look for in the title, description or organizer' },
      country: { type: 'string', description: 'Country name in English' },
      online_only: { type: 'boolean', description: 'Only online events' },
      days_ahead: { type: 'integer', minimum: 1, maximum: 365, default: 90, description: 'How far ahead to look (default 90 days)' },
      limit: limitProp(20, 50),
    } },
    annotations: READ_ONLY,
  },
];

// ── Input cleaning ──
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// PostgREST filter syntax uses , ( ) * : and quotes; keep only letters, digits, spaces and a few safe marks
const clean = (s, max = 80) => String(s ?? '').normalize('NFC').replace(/[^\p{L}\p{N}\s'.&-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const intIn = (v, def, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };
const COUNTRY_ALIASES = { 'united states': 'USA', 'united states of america': 'USA', us: 'USA', 'u.s.': 'USA', 'u.s.a.': 'USA', america: 'USA',
  'united kingdom': 'UK', 'great britain': 'UK', britain: 'UK', england: 'UK', scotland: 'UK', wales: 'UK', 'northern ireland': 'UK' };
export const countryCode = c => { const k = clean(c, 60).toLowerCase(); return k ? (COUNTRY_ALIASES[k] || clean(c, 60)) : ''; };
const enc = encodeURIComponent;

class ToolError extends Error {}

// ── Result shapes (no email or phone) ──
const shortText = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length <= n ? s : s.slice(0, n - 3).replace(/\s+\S*$/, '') + '...'; };
const httpUrl = u => (u && /^https?:\/\//.test(u) ? u : null);
function listingOut(e, full = false) {
  return {
    id: e.id, name: e.organization_name, category: e.category, category_label: categoryLabel(e.category),
    city: e.city || null, ...(full ? { address: e.address || null, region: e.region || null } : {}), country: e.country || null,
    website: httpUrl(e.website_url), url: `${SITE}/listing/${e.id}`, verified: !!e.is_verified,
    description: full ? (e.description || null) : (shortText(e.description, 220) || null),
    ...(full && e.latitude != null ? { latitude: Number(e.latitude), longitude: Number(e.longitude) } : {}),
  };
}
function eventOut(ev) {
  return {
    id: ev.id, title: ev.title, start: ev.start_date, end: ev.end_date || null, all_day: !!ev.is_all_day,
    online: !!ev.is_online, place: ev.is_online ? (ev.location_name || 'Online') : [ev.location_name, ev.city, ev.country].filter(Boolean).join(', ') || null,
    organizer: ev.organizer_name || null, free: ev.is_free ? true : null, cancelled: ev.status === 'cancelled' || undefined,
    registration: httpUrl(ev.ticket_url) || httpUrl(ev.online_url) || httpUrl(ev.organizer_url),
    url: `${SITE}/event/${ev.id}`, description: shortText(ev.description, 300) || null,
  };
}

// ── Tools ──
async function searchDirectory(db, rest, a) {
  const limit = intIn(a.limit, 20, 1, 50);
  let q = `directory_entries?select=${LISTING_COLS}&status=eq.approved&order=is_verified.desc,organization_name.asc&limit=${limit}`;
  if (a.category) {
    if (!CATEGORY_CODES.includes(a.category)) throw new ToolError(`Unknown category "${a.category}". Use one of: ${CATEGORY_CODES.join(', ')}.`);
    q += `&category=eq.${a.category}`;
  }
  const country = countryCode(a.country), city = clean(a.city, 60), words = clean(a.query);
  if (country) q += `&country=ilike.${enc(country)}`;
  if (city) q += `&or=(city.ilike.*${enc(city)}*,location.ilike.*${enc(city)}*)`;
  if (!words && !country && !city && !a.category) throw new ToolError('Give at least one of query, category, country or city.');
  let rows = words ? await rest(db, q + `&search_vector=wfts(english).${enc(words)}`) : await rest(db, q);
  // Names in other languages are not always stemmed well: fall back to a plain name match
  if (words && !rows.length) rows = await rest(db, q + `&organization_name=ilike.*${enc(words)}*`);
  return { count: rows.length, results: rows.map(e => listingOut(e)) };
}

async function findNearby(db, rest, a) {
  const lat = Number(a.latitude), lng = Number(a.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new ToolError('latitude and longitude must be valid coordinates.');
  const radius = Math.min(500, Math.max(1, Number(a.radius_km) || 50)), limit = intIn(a.limit, 15, 1, 50);
  const dLat = radius / 111, dLng = radius / (111 * Math.max(0.1, Math.cos(lat * Math.PI / 180)));
  let q = `directory_entries?select=${LISTING_COLS}&status=eq.approved&latitude=gte.${lat - dLat}&latitude=lte.${lat + dLat}`
    + `&longitude=gte.${lng - dLng}&longitude=lte.${lng + dLng}&limit=1000`;
  if (a.category) {
    if (!CATEGORY_CODES.includes(a.category)) throw new ToolError(`Unknown category "${a.category}". Use one of: ${CATEGORY_CODES.join(', ')}.`);
    q += `&category=eq.${a.category}`;
  }
  const here = { latitude: lat, longitude: lng };
  const rows = (await rest(db, q))
    .map(e => ({ e, km: kmBetween(here, { latitude: Number(e.latitude), longitude: Number(e.longitude) }) }))
    .filter(x => x.km <= radius).sort((x, y) => x.km - y.km).slice(0, limit);
  return { count: rows.length, radius_km: radius, results: rows.map(x => ({ ...listingOut(x.e), distance_km: Math.round(x.km * 10) / 10 })) };
}

async function getListing(db, rest, a) {
  const id = String(a.id || '').trim();
  if (!UUID.test(id)) throw new ToolError('id must be a listing id (UUID) from search_directory or find_nearby.');
  const [e] = await rest(db, `directory_entries?select=${LISTING_COLS},tags,photo_url,facebook_url&status=eq.approved&id=eq.${id}`);
  if (!e) throw new ToolError('No listing with that id.');
  return { ...listingOut(e, true), tags: e.tags || [], facebook: httpUrl(e.facebook_url), photo: httpUrl(e.photo_url) };
}

async function upcomingEvents(db, rest, a) {
  const limit = intIn(a.limit, 20, 1, 50), days = intIn(a.days_ahead, 90, 1, 365);
  const now = new Date(), until = new Date(now.getTime() + days * 864e5).toISOString();
  let q = `events?select=${EVENT_COLS}&status=in.(upcoming,cancelled)&start_date=lte.${until}`
    + `&or=(end_date.gte.${now.toISOString()},start_date.gte.${now.toISOString().slice(0, 10)})&order=start_date.asc&limit=${limit}`;
  const country = countryCode(a.country), words = clean(a.query);
  if (country) q += `&country=ilike.${enc(country)}`;
  if (a.online_only === true) q += '&is_online=is.true';
  if (words) q += `&search_vector=wfts(english).${enc(words)}`;
  const rows = await rest(db, q);
  return { count: rows.length, results: rows.map(eventOut) };
}

const HANDLERS = { search_directory: searchDirectory, find_nearby: findNearby, get_listing: getListing, upcoming_events: upcomingEvents };

// ── JSON-RPC ──
const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

export async function handleMessage(msg, db, rest) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return rpcError(msg && msg.id, -32600, 'Invalid request');
  const isNotification = !('id' in msg);
  const { id, method, params = {} } = msg;
  if (isNotification) return null;   // notifications/initialized, notifications/cancelled: nothing to answer
  switch (method) {
    case 'initialize': {
      const asked = params.protocolVersion;
      return { jsonrpc: '2.0', id, result: {
        protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'sophia-commons', title: 'Sophia Commons', version: SERVER_VERSION, websiteUrl: SITE },
        instructions: INSTRUCTIONS,
      } };
    }
    case 'ping': return { jsonrpc: '2.0', id, result: {} };
    case 'tools/list': return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
    case 'tools/call': {
      const handler = HANDLERS[params.name];
      if (!handler) return rpcError(id, -32602, `Unknown tool: ${params.name}`);
      try {
        const data = await handler(db, rest, params.arguments || {});
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data } };
      } catch (err) {
        const text = err instanceof ToolError ? err.message : 'Sophia Commons could not be reached just now. Please try again in a minute.';
        if (!(err instanceof ToolError)) console.error('mcp tool', params.name, String(err));
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], isError: true } };
      }
    }
    case 'resources/list': return { jsonrpc: '2.0', id, result: { resources: [] } };
    case 'prompts/list': return { jsonrpc: '2.0', id, result: { prompts: [] } };
    default: return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

// ── HTTP (Streamable HTTP transport without sessions or server-sent events) ──
export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const MAX_BODY = 64 * 1024;

export async function handleHttp(request, getDb, rest) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Max-Age': '86400' } });
  if (request.method === 'GET') {
    return new Response('Sophia Commons MCP server. Connect an MCP client to this URL (Streamable HTTP, POST). Tools: search_directory, find_nearby, get_listing, upcoming_events.\n',
      { status: 405, headers: { ...CORS, Allow: 'POST, OPTIONS', 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  if (request.method === 'DELETE') return new Response(null, { status: 405, headers: { ...CORS, Allow: 'POST, OPTIONS' } });
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { ...CORS, Allow: 'POST, OPTIONS' } });

  const raw = await request.text();
  if (raw.length > MAX_BODY) return json(rpcError(null, -32600, 'Request too large'), 413);
  let body;
  try { body = JSON.parse(raw); } catch { return json(rpcError(null, -32700, 'Parse error'), 400); }
  const batch = Array.isArray(body);
  const msgs = batch ? body : [body];
  if (!msgs.length || msgs.length > 20) return json(rpcError(null, -32600, 'Invalid request'), 400);

  const needsDb = msgs.some(m => m && m.method === 'tools/call');
  const db = needsDb ? await getDb() : null;
  const replies = (await Promise.all(msgs.map(m => handleMessage(m, db, rest)))).filter(Boolean);
  if (!replies.length) return new Response(null, { status: 202, headers: CORS });
  return json(batch ? replies : replies[0]);
}
