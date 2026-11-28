// Sophia Commons MCP server (Model Context Protocol, Streamable HTTP, stateless; owner, 2026-10-29).
// Lets AI assistants search the directory and events at https://sophiacommons.org/mcp.
// Read-only: every query goes through the public REST API with the publishable key, so it sees only
// what any visitor sees. Emails and phone numbers are never returned.
// Served by netlify/edge-functions/mcp.js; plain JS so Node tests can load it too.
import { SITE, kmBetween, listingPath } from './seo_html.mjs';
import { categoryLabel } from './agent_data.mjs';

export const SERVER_VERSION = '1.2.0';
const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const CATEGORY_CODES = ['waldorf', 'biodynamic', 'christian_community', 'camphill', 'community', 'eurythmy', 'medicine', 'societies', 'eldercare', 'online', 'social_media', 'science'];
const CATEGORY_HELP = 'waldorf = Waldorf/Steiner schools and kindergartens; biodynamic = biodynamic and Demeter farms; christian_community = The Christian Community congregations; '
  + 'camphill = Camphill communities; community = other intentional communities; eurythmy = eurythmy and the arts; medicine = anthroposophic medicine; '
  + 'societies = Anthroposophical Society branches and study groups; eldercare = care homes; online = online resources; social_media = groups and channels; science = Goethean science';

const LISTING_COLS = 'id,slug,organization_name,description,category,address,city,region,country,website_url,latitude,longitude,is_verified,updated_at';
const EVENT_COLS = 'id,title,title_en,lang,description,start_date,end_date,is_all_day,location_name,city,region,country,is_online,online_url,organizer_name,organizer_url,ticket_url,is_free,event_type,status';

const INSTRUCTIONS = 'Sophia Commons (sophiacommons.org) is a free directory of anthroposophical life worldwide: about 4,800 Waldorf schools and kindergartens, '
  + 'biodynamic farms, Camphill communities, Christian Community congregations, clinics, eurythmy schools and study groups in about 80 countries, '
  + 'plus upcoming events, talks and videos, and an index of Rudolf Steiner\'s books, lectures and free audio recordings. '
  + 'Use search_directory to find places by name, topic, category, country or city, find_nearby for places near coordinates, get_listing for details, '
  + 'upcoming_events for conferences, courses and talks, find_steiner_works for Steiner\'s books, lectures and audio, steiner_on_this_day for lectures given on a calendar day, and find_videos for recorded talks. '
  + 'If the user writes in German, pass language "de" to the Steiner tools and find_videos. '
  + 'Each place and event has a save link: opening it saves the item to the user\'s free Sophia Commons account (they sign in on the site). Events also have an add_to_calendar link. '
  + 'Countries are stored as USA and UK for the United States and United Kingdom. '
  + 'Always give the user the Sophia Commons page (url) for each result, and the read or listen link for Steiner\'s works.';

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
    name: 'find_steiner_works', title: "Find Rudolf Steiner's works",
    description: "Find Rudolf Steiner's books, lectures and free audio recordings by topic, title, GA (Collected Works) number or year. "
      + 'Returns links to read them on rsarchive.org, listen on rudolfsteineraudio.com, buy them, and the Sophia Commons books page. Texts are not included.',
    inputSchema: { type: 'object', properties: {
      query: { type: 'string', description: 'Topic or title words, e.g. "karma", "bees", "Philosophy of Freedom", "Christmas"' },
      ga: { type: 'string', description: 'GA / CW volume number, e.g. "4", "233", "277d"' },
      year: { type: 'integer', minimum: 1880, maximum: 1925, description: 'Only lectures given in this year' },
      language: { type: 'string', enum: ['en', 'de'], description: 'de = give the original German text link first (for German speakers)' },
      limit: limitProp(10, 30),
    } },
    annotations: READ_ONLY,
  },
  {
    name: 'steiner_on_this_day', title: 'Steiner on this day',
    description: 'Lectures Rudolf Steiner gave on a given calendar day, across all years (1880s to 1925). Good for "on this day" posts, '
      + 'festivals (e.g. 12-25 for Christmas lectures) and anniversaries. Defaults to today.',
    inputSchema: { type: 'object', properties: {
      date: { type: 'string', description: 'Month and day as MM-DD (e.g. "12-25"), or a full date YYYY-MM-DD (only month and day are used). Default: today' },
      language: { type: 'string', enum: ['en', 'de'], description: 'de = German text link first' },
      limit: limitProp(15, 50),
    } },
    annotations: READ_ONLY,
  },
  {
    name: 'find_videos', title: 'Find talks and videos',
    description: 'Find recorded talks, lectures, readings of Steiner and films about anthroposophy, Waldorf education, biodynamics, eurythmy and more, '
      + 'from the YouTube channels Sophia Commons follows (about 200 channels in several languages). Also returns matching channels.',
    inputSchema: { type: 'object', required: ['query'], properties: {
      query: { type: 'string', description: 'Topic words, e.g. "etheric body", "biodynamic preparations", "Waldorf kindergarten"' },
      language: { type: 'string', enum: ['en', 'de', 'fr', 'es', 'pt', 'nl', 'ru'], description: 'Only videos in this language' },
      limit: limitProp(10, 30),
    } },
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
// Opening a save link on the site saves the item (after sign-in if needed; saved.js)
const saveUrl = url => url + '?save=1';
// Google Calendar "add event" link. Timed events without an end get one hour.
const gcalStamp = iso => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
export function calendarLink(ev, pageUrl) {
  if (!ev.start_date || Number.isNaN(Date.parse(ev.start_date))) return null;
  let dates;
  if (ev.is_all_day) {
    const first = ev.start_date.slice(0, 10);
    const last = new Date(Date.parse((ev.end_date || ev.start_date).slice(0, 10) + 'T00:00:00Z') + 864e5).toISOString().slice(0, 10);
    dates = first.replace(/-/g, '') + '/' + last.replace(/-/g, '');
  } else {
    const end = ev.end_date && Date.parse(ev.end_date) > Date.parse(ev.start_date) ? ev.end_date : new Date(Date.parse(ev.start_date) + 36e5).toISOString();
    dates = gcalStamp(ev.start_date) + '/' + gcalStamp(end);
  }
  const where = ev.is_online ? (httpUrl(ev.online_url) || 'Online') : [ev.location_name, ev.city, ev.country].filter(Boolean).join(', ');
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + enc(ev.title || 'Event') + '&dates=' + dates
    + '&details=' + enc('Details: ' + pageUrl) + (where ? '&location=' + enc(where) : '');
}

function listingOut(e, full = false) {
  return {
    id: e.id, name: e.organization_name, category: e.category, category_label: categoryLabel(e.category),
    city: e.city || null, ...(full ? { address: e.address || null, region: e.region || null } : {}), country: e.country || null,
    website: httpUrl(e.website_url), url: SITE + listingPath(e), save: saveUrl(SITE + listingPath(e)), verified: !!e.is_verified,
    description: full ? (e.description || null) : (shortText(e.description, 220) || null),
    ...(full && e.latitude != null ? { latitude: Number(e.latitude), longitude: Number(e.longitude) } : {}),
  };
}
function eventOut(ev) {
  const page = `${SITE}/event/${ev.id}`;
  return {
    id: ev.id, title: ev.title, title_en: ev.title_en && ev.title_en !== ev.title ? ev.title_en : undefined, language: ev.lang || undefined,
    save: saveUrl(page), add_to_calendar: calendarLink(ev, page), start: ev.start_date, end: ev.end_date || null, all_day: !!ev.is_all_day,
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

// ── Steiner's works: books (database), lectures (steiner_lectures.json from rsarchive.org),
//    audio (steiner_audio.json from rudolfsteineraudio.com). Links only, never texts. ──
const AUDIO_BASE = 'https://rudolfsteineraudio.com/';
// Lower case with accents removed, so "Michaël" matches "Michael"
const fold = s => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const wordsOf = q => fold(clean(q)).split(' ').filter(w => w.length > 1);
// Each word must start a word in the text ("bee" finds "Bees" but not "Maccabees")
const escRe = w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasAll = (hay, words) => { const h = ' ' + fold(hay); return words.every(w => new RegExp('[^\\p{L}\\p{N}]' + escRe(w), 'u').test(h)); };
const gaNorm = v => { const m = String(v ?? '').trim().match(/^(?:ga|cw)?\s*0*(\d{1,3}[a-z]?)$/i); return m ? m[1].toLowerCase() : ''; };

async function findSteinerWorks(db, rest, a, ctx) {
  const limit = intIn(a.limit, 10, 1, 30), words = wordsOf(a.query), ga = gaNorm(a.ga);
  const year = a.year == null || a.year === '' ? null : intIn(a.year, null, 1880, 1925);
  if (a.ga != null && a.ga !== '' && !ga) throw new ToolError('ga must be a volume number like "4", "233" or "277d".');
  if (!words.length && !ga && !year) throw new ToolError('Give at least one of query, ga or year.');

  const [lectureFile, audioFile] = await Promise.all([ctx.loadJson('steiner_lectures.json'), ctx.loadJson('steiner_audio.json')]);
  // A volume's page on rsarchive, from the lecture index, for books whose own row has no read link
  const volumeUrl = gaNumber => {
    const g = gaNorm(gaNumber);
    if (!g) return null;
    const hit = (lectureFile?.items || []).find(l => fold(l.ga) === g && l.bu);
    return hit ? hit.bu.replace(/(\/(?:Lectures|Books)\/GA[^/]+\/).*$/, '$1') : null;
  };
  let books = [];
  if (!year) {
    let q = `steiner_books?select=ga_number,title,archive_url,steinerbooks_url,amazon_url&order=ga_number.asc&limit=${limit}`;
    if (ga) q += `&ga_number=eq.${enc('GA ' + ga)}`;
    for (const w of words) q += `&title=ilike.*${enc(w)}*`;
    books = (await rest(db, q)).map(b => ({
      ga: b.ga_number, title: b.title, read: httpUrl(b.archive_url) || volumeUrl(b.ga_number), buy: httpUrl(b.steinerbooks_url) || httpUrl(b.amazon_url),
    }));
  }

  // Title matches first, then lectures tagged with a topic the query names ("karma" also finds
  // "Karmic Relationships" and reincarnation lectures whose titles never say karma)
  const items = (lectureFile?.items || []).filter(l => (!ga || fold(l.ga) === ga) && (!year || String(l.d).startsWith(String(year))));
  const byTitle = items.filter(l => hasAll(`${l.t} ${l.b} ${l.c}`, words));
  const { ids, covered } = topicMatch(lectureFile?.topics, words);
  const rest_ = words.filter(w => !covered.has(w));
  const seen = new Set(byTitle);
  const byTopic = ids.size ? items.filter(l => !seen.has(l) && (l.k || []).some(k => ids.has(k)) && hasAll(`${l.t} ${l.b} ${l.c}`, rest_)) : [];
  const lectures = byTitle.concat(byTopic).slice(0, limit).map(l => lectureOut(l, a.language));
  const audio = year ? [] : (audioFile?.items || []).filter(i => (!ga || fold(i.cw) === ga) && hasAll(i.t, words))
    .slice(0, limit).map(i => ({ title: i.t, ga: i.cw || null, listen: AUDIO_BASE + i.u, read_by: 'Dale Brunsvold' }));

  const library = new URL(`${SITE}/library`);
  if (a.query) library.searchParams.set('q', clean(a.query));
  if (ga) library.searchParams.set('ga', ga);
  if (year) library.searchParams.set('year', String(year));
  return {
    books, lectures, audio,
    topics: [...ids].map(id => lectureFile.topics[id].label),
    more: { library: library.toString(), books_page: `${SITE}/resources`, archive: 'https://rsarchive.org/', audio_library: AUDIO_BASE },
    note: 'Texts and recordings stay on their own sites; follow the links to read or listen.',
  };
}

// Which topics the query names, and which query words that used up. A topic word matches when the query
// has its words in order, each at least as long as the start of the topic word ("reincarnation", "bees").
export function topicMatch(topics, words) {
  const ids = new Set(), covered = new Set();
  if (!topics || !words.length) return { ids, covered };
  for (const [id, t] of Object.entries(topics)) {
    for (const phrase of t.words || []) {
      const p = fold(phrase).split(/\s+/).filter(Boolean);
      if (!p.length || (p.length === 1 && p[0].length < 3)) continue;
      for (let i = 0; i + p.length <= words.length; i++) {
        if (p.every((pw, j) => { const w = words[i + j]; return w === pw || (w.length >= 4 && (w.startsWith(pw) || pw.startsWith(w))); })) {
          ids.add(id);
          p.forEach((_, j) => covered.add(words[i + j]));
        }
      }
    }
  }
  return { ids, covered };
}

const lectureOut = (l, language) => {
  const english = l.en?.[0]?.u || null;
  return {
    date: l.d, title: l.t, book: l.b || null, place: l.c || null, ga: l.ga || null,
    read: language === 'de' ? (l.de || english) : english, english, german: l.de || null,
    translations: l.en?.length || 0,
  };
};

async function steinerOnThisDay(db, rest, a, ctx) {
  const limit = intIn(a.limit, 15, 1, 50);
  let md;
  if (a.date == null || a.date === '') md = new Date().toISOString().slice(5, 10);
  else {
    const m = String(a.date).trim().match(/^(?:\d{4}-)?(\d{1,2})-(\d{1,2})$/);
    if (!m || +m[1] < 1 || +m[1] > 12 || +m[2] < 1 || +m[2] > 31) throw new ToolError('date must be MM-DD (e.g. "12-25") or YYYY-MM-DD.');
    md = m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
  }
  const file = await ctx.loadJson('steiner_lectures.json');
  if (!file) throw new ToolError('The lecture index is not available just now. Please try again in a minute.');
  const hits = file.items.filter(l => String(l.d).slice(5, 10) === md);
  return {
    day: md, count: hits.length, lectures: hits.slice(0, limit).map(l => lectureOut(l, a.language)),
    more: `${SITE}/library?day=${md}`,
    note: 'Texts stay on rsarchive.org; follow the links to read.',
  };
}

const LANGS = ['en', 'de', 'fr', 'es', 'pt', 'nl', 'ru'];
async function findVideos(db, rest, a) {
  const limit = intIn(a.limit, 10, 1, 30), words = wordsOf(a.query);
  if (!words.length) throw new ToolError('Give a query, e.g. "karma" or "Waldorf kindergarten".');
  const lang = LANGS.includes(a.language) ? a.language : '';
  // Every word must appear in the title, English title or description
  let vq = `youtube_videos?select=video_id,channel_slug,title,title_en,url,published_at,lang&order=published_at.desc&limit=${limit}`;
  for (const w of words) vq += `&or=(title.ilike.*${enc(w)}*,title_en.ilike.*${enc(w)}*,description.ilike.*${enc(w)}*)`;
  if (lang) vq += `&lang=eq.${lang}`;
  let cq = 'youtube_channels?select=slug,name,url,language,description&active=is.true&limit=5';
  for (const w of words) cq += `&or=(name.ilike.*${enc(w)}*,description.ilike.*${enc(w)}*)`;
  const [videos, channels] = await Promise.all([rest(db, vq), rest(db, cq)]);
  const names = {};
  const slugs = [...new Set(videos.map(v => v.channel_slug).filter(s => /^[a-z0-9-]+$/.test(s || '')))];
  if (slugs.length) for (const c of await rest(db, `youtube_channels?select=slug,name&slug=in.(${slugs.join(',')})`)) names[c.slug] = c.name;
  return {
    videos: videos.map(v => ({
      title: v.title, title_en: v.title_en && v.title_en !== v.title ? v.title_en : null, watch: httpUrl(v.url),
      published: v.published_at ? v.published_at.slice(0, 10) : null, language: v.lang || null,
      channel: names[v.channel_slug] || v.channel_slug, channel_page: `${SITE}/channel/${enc(v.channel_slug)}`,
    })),
    channels: channels.map(c => ({ name: c.name, language: c.language || null, description: shortText(c.description, 200) || null,
      youtube: httpUrl(c.url), page: `${SITE}/channel/${enc(c.slug)}` })),
    more: `${SITE}/podcasts`,
  };
}

const HANDLERS = { search_directory: searchDirectory, find_nearby: findNearby, get_listing: getListing, upcoming_events: upcomingEvents,
  find_steiner_works: findSteinerWorks, steiner_on_this_day: steinerOnThisDay, find_videos: findVideos };

// ── Traffic tagging: every link to sophiacommons.org says which assistant sent the visitor.
//    Register the server as /mcp?src=chatgpt in ChatGPT and /mcp?src=claude in Claude. ──
export const SOURCES = ['chatgpt', 'claude'];
export const sourceOf = url => { const s = new URL(url).searchParams.get('src'); return SOURCES.includes(s) ? s : 'mcp'; };
export function tagLinks(value, src) {
  if (typeof value === 'string') {
    if (value !== SITE && !value.startsWith(SITE + '/')) return value;
    const u = new URL(value);
    u.searchParams.set('utm_source', src);
    u.searchParams.set('utm_medium', 'ai_app');
    return u.toString();
  }
  if (Array.isArray(value)) return value.map(v => tagLinks(v, src));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, tagLinks(v, src)]));
  return value;
}

// ── JSON-RPC ──
const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

const NO_FILES = { src: 'mcp', loadJson: async () => null };

// ── Usage log: which tool, which assistant, what was asked (search words only, no IP or user data) ──
export const resultCount = data => {
  if (!data || typeof data !== 'object') return 0;
  if (Number.isFinite(data.count)) return data.count;
  return ['results', 'books', 'lectures', 'audio', 'videos', 'channels'].reduce((n, k) => n + (Array.isArray(data[k]) ? data[k].length : 0), 0) || (data.id ? 1 : 0);
};
export const logRow = (params, src, info) => ({
  tool: String(params.name || '').slice(0, 40), source: src,
  args: JSON.stringify(params.arguments || {}).slice(0, 300),
  result_count: info.count, ms: info.ms, error: info.error || null,
});
async function logCall(ctx, params, info) {
  if (!ctx.log) return;
  try { await ctx.log(logRow(params, ctx.src || 'mcp', info)); } catch (err) { console.error('mcp log', String(err)); }
}

// ── Rate limit per caller address, per edge instance: generous, because ChatGPT and Claude call from shared
//    servers, but it stops one script from hammering the database ──
export const RATE_PER_MINUTE = 240;
const callsByKey = new Map();
export function overLimit(key, n = 1, now = Date.now()) {
  // Forget callers idle for a minute (privacy page: the IP address is kept about a minute, then dropped)
  for (const [k, times] of callsByKey) if (now - times[times.length - 1] >= 60000) callsByKey.delete(k);
  if (callsByKey.size > 5000) callsByKey.clear();
  const recent = (callsByKey.get(key) || []).filter(t => now - t < 60000);
  if (recent.length + n > RATE_PER_MINUTE) { callsByKey.set(key, recent); return true; }
  for (let i = 0; i < n; i++) recent.push(now);
  callsByKey.set(key, recent);
  return false;
}
export const isTracked = key => callsByKey.has(key);
const callerKey = request => request.headers.get('x-nf-client-connection-ip') || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';

export async function handleMessage(msg, db, rest, ctx = NO_FILES) {
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
      const started = Date.now();
      try {
        const data = tagLinks(await handler(db, rest, params.arguments || {}, ctx), ctx.src || 'mcp');
        await logCall(ctx, params, { count: resultCount(data), ms: Date.now() - started });
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data } };
      } catch (err) {
        const text = err instanceof ToolError ? err.message : 'Sophia Commons could not be reached just now. Please try again in a minute.';
        if (!(err instanceof ToolError)) console.error('mcp tool', params.name, String(err));
        await logCall(ctx, params, { count: 0, ms: Date.now() - started, error: err instanceof ToolError ? 'input' : 'server' });
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

export async function handleHttp(request, getDb, rest, loadJson = NO_FILES.loadJson, log = null) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Max-Age': '86400' } });
  if (request.method === 'GET') {
    return new Response('Sophia Commons MCP server. Connect an MCP client to this URL (Streamable HTTP, POST). Tools: search_directory, find_nearby, get_listing, upcoming_events, find_steiner_works, steiner_on_this_day, find_videos.\n',
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

  const toolCalls = msgs.filter(m => m && m.method === 'tools/call').length;
  if (toolCalls && overLimit(callerKey(request), toolCalls)) {
    return json(rpcError(batch ? null : body.id, -32000, 'Too many requests. Please wait a minute and try again.'), 429);
  }
  const db = toolCalls ? await getDb() : null;
  const ctx = { src: sourceOf(request.url), loadJson, log };
  const replies = (await Promise.all(msgs.map(m => handleMessage(m, db, rest, ctx)))).filter(Boolean);
  if (!replies.length) return new Response(null, { status: 202, headers: CORS });
  return json(batch ? replies : replies[0]);
}
