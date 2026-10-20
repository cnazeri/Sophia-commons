// Shared by automation/prerender.mjs (Node, at deploy) and netlify/edge-functions/listing-seo.mjs
// (Deno, per request). Turns the app shell (index.html) into a page with its own <title>,
// description, canonical, Open Graph tags, a crawlable summary (#prerender, removed by the app on
// load) and JSON-LD. Plain JS with no imports so both runtimes can load it.

export const SITE = 'https://sophiacommons.org';

export const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const attr = esc;

// Route definitions (keep in step with catMeta / REGIONS in sophia_commons_v9.js and the sitemap)
export const CATEGORIES = [
  ['waldorf-education', 'Waldorf & Education', ['waldorf'], 'Waldorf and Steiner schools, kindergartens, teacher training and resources for educators worldwide.'],
  ['biodynamic-agriculture', 'Biodynamic Agriculture', ['biodynamic'], 'Biodynamic and Demeter farms, associations, training and research in the tradition of Rudolf Steiner.'],
  ['arts-eurythmy', 'Arts & Eurythmy', ['eurythmy'], 'Eurythmy schools, ensembles and trainings, speech, music and the arts rooted in anthroposophy.'],
  ['anthroposophic-medicine', 'Anthroposophic Medicine', ['medicine'], 'Anthroposophic clinics and hospitals, physicians associations, pharmacies, therapies and research.'],
  ['community-camphill', 'Community & Camphill', ['camphill', 'community'], 'Camphill communities, curative education, social therapy, intentional communities and initiatives.'],
  ['the-christian-community', 'The Christian Community', ['christian_community'], 'Congregations and centers of The Christian Community (Die Christengemeinschaft), the Movement for Religious Renewal, worldwide with addresses.'],
  ['societies-organizations', 'Societies & Organizations', ['societies'], 'Anthroposophical Society branches, national societies and membership organizations.'],
  ['groups-circles', 'Groups & Circles', ['societies'], 'Study groups, reading circles and local branch meetings in the anthroposophical tradition.'],
  ['esoteric-studies', 'Esoteric Studies', ['societies', 'online'], 'Study groups, courses and resources for the study of Rudolf Steiner\'s spiritual science.'],
  ['science-technology', 'Science & Technology', ['science'], 'Goethean science, research and moral technology from an anthroposophical perspective.'],
  ['online-resources', 'Online Resources', ['online'], 'Websites, archives, publishers, podcasts and online courses for the anthroposophical community.'],
  ['social-media', 'Social Media', ['social_media'], 'Anthroposophical groups and channels on social media.'],
];

// Columns a listing page needs (public, anon-readable; email deliberately left out of static HTML)
export const LISTING_COLUMNS = 'id,organization_name,description,category,address,city,region,location,country,website_url,facebook_url,phone,tags,photo_url,latitude,longitude,is_verified,updated_at';

export function place(e) { return [e.city || e.location, e.country].filter(Boolean).join(', '); }

export function entryList(entries) {
  return '<ul>' + entries.map(e => `<li><a href="/listing/${attr(e.id)}">${esc(e.organization_name)}</a>${place(e) ? ' (' + esc(place(e)) + ')' : ''}${e.website_url && /^https?:\/\//.test(e.website_url) ? ` <a href="${attr(e.website_url)}" rel="nofollow noopener">website</a>` : ''}</li>`).join('') + '</ul>';
}

export function applySeo(template, { route, title, desc, bodyHtml = '', ld = null, ldId = 'prerender-jsonld', image = '', robots = '', h1 = '' }) {
  const url = SITE + route;
  let h = template;
  const set = (re, val) => { h = h.replace(re, () => val); };
  set(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  set(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${attr(desc)}">`);
  set(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${attr(url)}">`);
  set(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${attr(url)}">`);
  set(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${attr(title)}">`);
  set(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${attr(desc)}">`);
  set(/<meta name="twitter:url" content="[^"]*">/, `<meta name="twitter:url" content="${attr(url)}">`);
  set(/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${attr(title)}">`);
  set(/<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${attr(desc)}">`);
  if (robots) set(/<meta name="robots" content="[^"]*">/, `<meta name="robots" content="${attr(robots)}">`);
  if (image) {
    set(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${attr(image)}">`);
    set(/<meta name="twitter:image" content="[^"]*">/, `<meta name="twitter:image" content="${attr(image)}">`);
  }
  // The home page's JSON-LD blocks describe the home page: its FAQ and nav breadcrumb do not belong on
  // other pages, and the catalog only on /directory. WebSite + Organization stay everywhere.
  h = h.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>\n?/g, (m, body) =>
    /"@type": ?"(FAQPage|BreadcrumbList)"/.test(body) || (/"@type": ?"DataCatalog"/.test(body) && route !== '/directory') ? '' : m);
  // One H1 per page: the summary below carries it, so the home page's hidden H1 becomes a paragraph.
  h = h.replace(/<h1 class="sr-only"([^>]*)>([^<]*)<\/h1>/, '<p class="sr-only"$1>$2</p>');
  // The app's own JSON-LD for detail pages uses id="detail-jsonld" and replaces this one on load.
  const ldTag = ld ? `\n<script type="application/ld+json" id="${ldId}">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` : '';
  const block = `<div id="prerender" class="prerender-summary"><h1>${esc(h1 || title.replace(/ \| Sophia Commons.*$/, ''))}</h1><p>${esc(desc)}</p>${bodyHtml}</div>${ldTag}\n`;
  if (!h.includes('<footer')) throw new Error('template has no <footer>');
  return h.replace('<footer', () => block + '<footer');
}

function shorten(t, n) {
  t = String(t || '').replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : t.slice(0, n - 3).replace(/\s+\S*$/, '') + '...';
}

export function categoryOf(e) {
  if (e.category === 'eldercare') return ['/eldercare', 'Eldercare'];
  const c = CATEGORIES.find(([, , cats]) => cats.includes(e.category));
  return c ? ['/category/' + c[0], c[1]] : ['/directory', 'Directory'];
}

// schema.org type from the category and the name (Google reads School, Preschool, MedicalClinic ...
// better than a generic LocalBusiness). Plain word checks in the main languages of the directory.
const KINDER = /kinder ?garten|kindergarden|preschool|pre-school|nursery|playgroup|spielgruppe|barnehage|förskola|forskole|jardin d'enfants|jard[ií]n de infan|kleuter|детский сад/i;
const SCHOOL = /school|schule|skole|skola|[ée]cole|escuela|escola|colegio|scuola|liceo|iskola|škola|schoul|gakuen|campus|szkoła|школа|academy|college|lyceum|gymnas/i;
const ASSOC = /association|verband|society|gesellschaft|federation|network|council|vereniging|förening/i;
const ENSEMBLE = /ensemble|b[üu]hne|stage|company|compagnie|theater|theatre/i;
const CLINIC = /klinik|clinic|hospital|krankenhaus|spital|ziekenhuis|sjukhus|praxis|practice|centre m[ée]dical|medical cent/i;
const PHARMACY = /apotheke|pharmacy|pharmacie|farmacia/i;
export function schemaTypeOf(e) {
  const name = e.organization_name || '', n = [name, ...(Array.isArray(e.tags) ? e.tags : [])].join(' ');
  switch (e.category) {
    case 'waldorf': return SCHOOL.test(name) ? 'School' : KINDER.test(n) ? 'Preschool' : SCHOOL.test(n) ? 'School' : 'EducationalOrganization';
    case 'medicine': return ASSOC.test(name) ? 'MedicalOrganization' : PHARMACY.test(n) ? 'Pharmacy' : /hospital|krankenhaus|spital|ziekenhuis|sjukhus/i.test(n) ? 'Hospital' : CLINIC.test(n) ? 'MedicalClinic' : 'MedicalOrganization';
    case 'christian_community': return 'Church';
    case 'eurythmy': return ENSEMBLE.test(name) ? 'PerformingGroup' : 'EducationalOrganization';
    case 'biodynamic': case 'eldercare': case 'camphill': case 'community': return 'LocalBusiness';
    default: return 'Organization';
  }
}

// Search snippet: the listing's own text, then what the page offers, so even a one-line listing
// gets a useful 120-158 character description. Only mentions what is really on the page.
function listingDesc(about, { catLabel, where, addr, phone, website, facebook, nearbyN, relatedN, country }) {
  const lead = about || `${catLabel}${where ? ' in ' + where : ''}.`;
  if (lead.length >= 120) return shorten(lead, 158);
  const has = [addr ? 'address' : '', phone ? 'phone' : '', website ? 'website' : '', facebook ? 'Facebook page' : ''].filter(Boolean);
  const list = has.length > 1 ? has.slice(0, -1).join(', ') + ' and ' + has[has.length - 1] : has[0] || 'details';
  const more = nearbyN ? `, plus ${nearbyN} nearby place${nearbyN > 1 ? 's' : ''} within 60 km` : relatedN ? `, plus more ${catLabel.toLowerCase()}${country ? ' in ' + country : ''}` : '';
  const tail = `${list[0].toUpperCase() + list.slice(1)} on Sophia Commons${more}.`;
  return shorten((/[.!?]$/.test(lead) ? lead : lead + '.') + ' ' + tail, 158);
}

// Everything applySeo needs for /listing/<id>. `related` = a few other listings to link to.
export function listingPage(e, related = [], nearby = []) {
  const [catUrl, catLabel] = categoryOf(e);
  const where = place(e);
  const name = e.organization_name || 'Listing';
  const about = String(e.description || '').replace(/\s+/g, ' ').trim();
  const website = e.website_url && /^https?:\/\//.test(e.website_url) ? e.website_url : '';
  const facebook = e.facebook_url && /^https:\/\/(www\.|m\.)?facebook\.com\//i.test(e.facebook_url) ? e.facebook_url : '';
  const image = e.photo_url && /^https:\/\//.test(e.photo_url) ? e.photo_url.split('#')[0] : '';
  const tags = Array.isArray(e.tags) ? e.tags.filter(Boolean) : [];
  const addr = [e.address, e.region, e.country].filter(Boolean).join(', ');
  const desc = listingDesc(about, { catLabel, where, addr: e.address, phone: e.phone, website, facebook, nearbyN: nearby.length, relatedN: related.length, country: e.country });

  const facts = [
    `<li>Category: <a href="${catUrl}">${esc(catLabel)}</a></li>`,
    addr ? `<li>Address: ${esc(addr)}</li>` : (where ? `<li>Location: ${esc(where)}</li>` : ''),
    website ? `<li>Website: <a href="${attr(website)}" rel="nofollow noopener">${esc(website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a></li>` : '',
    e.phone ? `<li>Phone: ${esc(e.phone)}</li>` : '',
    facebook ? `<li>Facebook: <a href="${attr(facebook)}" rel="nofollow noopener">${esc(facebook.replace(/^https:\/\/(www\.|m\.)?facebook\.com\//i, '').replace(/\/$/, '') || 'page')}</a></li>` : '',
    tags.length ? `<li>Topics: ${tags.map(esc).join(', ')}</li>` : '',
    `<li>${e.is_verified ? 'Details checked by the Sophia Commons team' : 'Listed in the Sophia Commons directory'}${e.updated_at ? ', last updated ' + esc(String(e.updated_at).slice(0, 10)) : ''}</li>`,
  ].join('');
  const bodyHtml = (about.length > desc.length ? `<p>${esc(about)}</p>` : '')
    + `<ul>${facts}</ul>`
    + (related.length ? `<h2>More ${esc(catLabel)}${e.country ? ' in ' + esc(e.country) : ''}</h2>` + entryList(related) : '')
    + nearbyHtml(e, nearby)
    + placeLinks(e, related.length);

  const route = '/listing/' + e.id;
  const ld = {
    '@context': 'https://schema.org',
    '@type': schemaTypeOf(e),
    name,
    url: SITE + route,
    ...(about ? { description: shorten(about, 300) } : {}),
    ...(website || facebook ? { sameAs: [website, facebook].filter(Boolean) } : {}),
    ...(image ? { image } : {}),
    ...(e.phone ? { telephone: e.phone } : {}),
    ...(addr || where ? { address: { '@type': 'PostalAddress', ...(e.address ? { streetAddress: e.address } : {}), ...(e.city || e.location ? { addressLocality: e.city || e.location } : {}), ...(e.region ? { addressRegion: e.region } : {}), ...(e.country ? { addressCountry: e.country } : {}) } } : {}),
    ...(e.latitude && e.longitude ? { geo: { '@type': 'GeoCoordinates', latitude: Number(e.latitude), longitude: Number(e.longitude) } } : {}),
  };

  return { route, title: `${name}${e.city || e.location ? ', ' + (e.city || e.location) : ''} | Sophia Commons`, desc, bodyHtml, ld, ldId: 'detail-jsonld', image };
}

// ── Events and news (/event/<id>, /article/<id>) ──
export const EVENT_COLUMNS = 'id,title,description,start_date,end_date,is_all_day,location_name,address,city,region,country,is_online,online_url,organizer_name,organizer_url,image_url,ticket_url,ticket_price,is_free,event_type,status,updated_at';
export const NEWS_COLUMNS = 'id,title,excerpt,body,source_name,source_url,tags,published_at,updated_at,status';

// Event dates are stored in UTC. Show the day in a zone near the event, so an evening talk in
// California or a morning one in Europe is not shown on the wrong day.
const TZ_BY_COUNTRY = { USA: 'America/Chicago', 'United States': 'America/Chicago', US: 'America/Chicago', Canada: 'America/Toronto',
  Mexico: 'America/Mexico_City', Brazil: 'America/Sao_Paulo', Argentina: 'America/Argentina/Buenos_Aires', Australia: 'Australia/Sydney',
  'New Zealand': 'Pacific/Auckland', Japan: 'Asia/Tokyo', India: 'Asia/Kolkata', 'South Africa': 'Africa/Johannesburg', UK: 'Europe/London',
  'United Kingdom': 'Europe/London', Ireland: 'Europe/Dublin' };
function eventDay(iso, country, withYear = true) {
  const tz = TZ_BY_COUNTRY[country] || (country ? 'Europe/Berlin' : 'UTC');
  try { return new Date(iso).toLocaleDateString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) }); }
  catch (e) { return String(iso).slice(0, 10); }
}
const httpUrl = u => (u && /^https?:\/\//.test(u) ? u : '');

// Everything applySeo needs for /event/<id>. `others` = a few upcoming events to link to.
export function eventPage(ev, others = []) {
  const name = ev.title || 'Event';
  const when = eventDay(ev.start_date, ev.country) + (ev.end_date && String(ev.end_date).slice(0, 10) !== String(ev.start_date).slice(0, 10) ? ' to ' + eventDay(ev.end_date, ev.country) : '');
  const where = ev.is_online ? 'Online' + (ev.location_name && !/online|zoom/i.test(ev.location_name) ? ' (' + ev.location_name + ')' : '') : [ev.location_name, ev.city, ev.country].filter(Boolean).join(', ');
  const about = String(ev.description || '').replace(/\s+/g, ' ').trim();
  const fallback = `${when}${where ? ', ' + where : ''}.${ev.organizer_name ? ' Organized by ' + ev.organizer_name + '.' : ''} Details and add-to-calendar on Sophia Commons.`;
  const desc = shorten(about ? `${eventDay(ev.start_date, ev.country, false)}${where ? ', ' + where : ''}: ${about}` : fallback, 158);
  const image = ev.image_url && /^https:\/\//.test(ev.image_url) ? ev.image_url : '';
  const ticket = httpUrl(ev.ticket_url), online = httpUrl(ev.online_url), orgUrl = httpUrl(ev.organizer_url);
  const cancelled = ev.status === 'cancelled';
  const facts = [
    `<li>When: ${esc(when)}</li>`,
    where ? `<li>Where: ${esc(where)}${ev.address && !ev.is_online ? ', ' + esc(ev.address) : ''}</li>` : '',
    ev.organizer_name ? `<li>Organizer: ${orgUrl ? `<a href="${attr(orgUrl)}" rel="nofollow noopener">${esc(ev.organizer_name)}</a>` : esc(ev.organizer_name)}</li>` : '',
    ev.is_free ? '<li>Admission: free</li>' : (ev.ticket_price ? `<li>Price: ${esc(ev.ticket_price)}</li>` : ''),
    ticket ? `<li><a href="${attr(ticket)}" rel="nofollow noopener">Tickets and registration</a></li>` : '',
    cancelled ? '<li>This event has been cancelled.</li>' : '',
  ].join('');
  const bodyHtml = (about ? `<p>${esc(about)}</p>` : '') + `<ul>${facts}</ul>`
    + (others.length ? '<h2>More upcoming events</h2><ul>' + others.map(o => `<li>${esc(eventDay(o.start_date, o.country, false))}: <a href="/event/${attr(o.id)}">${esc(o.title)}</a></li>`).join('') + '</ul>' : '')
    + '<p><a href="/events">All events and the calendar</a></p>';

  const route = '/event/' + ev.id;
  const location = ev.is_online
    ? { '@type': 'VirtualLocation', url: online || SITE + route }
    : { '@type': 'Place', name: ev.location_name || ev.city || name,
        address: { '@type': 'PostalAddress', ...(ev.address ? { streetAddress: ev.address } : {}), ...(ev.city ? { addressLocality: ev.city } : {}), ...(ev.region ? { addressRegion: ev.region } : {}), ...(ev.country ? { addressCountry: ev.country } : {}) } };
  const ld = {
    '@context': 'https://schema.org', '@type': 'Event', name, url: SITE + route,
    startDate: ev.start_date, ...(ev.end_date ? { endDate: ev.end_date } : {}),
    eventStatus: cancelled ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
    eventAttendanceMode: ev.is_online ? 'https://schema.org/OnlineEventAttendanceMode' : 'https://schema.org/OfflineEventAttendanceMode',
    location,
    ...(about ? { description: shorten(about, 500) } : {}),
    ...(image ? { image: [image] } : {}),
    ...(ev.organizer_name ? { organizer: { '@type': 'Organization', name: ev.organizer_name, ...(orgUrl ? { url: orgUrl } : {}) } } : {}),
    ...(ev.is_free || ticket ? { offers: { '@type': 'Offer', url: ticket || SITE + route, ...(ev.is_free ? { price: 0, priceCurrency: 'USD' } : {}), availability: 'https://schema.org/InStock' } } : {}),
  };
  const city = ev.is_online ? 'Online' : (ev.city || ev.country || '');
  return { route, title: `${name} | ${eventDay(ev.start_date, ev.country, false)}${city ? ', ' + city : ''} | Sophia Commons`, desc, bodyHtml, ld, ldId: 'detail-jsonld', image, h1: name };
}

// Everything applySeo needs for /article/<id>. Roundup items summarize another site's article, so
// they get their own title but stay out of search results (noindex, follow) and out of the sitemap.
export function articlePage(n) {
  const name = n.title || 'News';
  const text = String(n.excerpt || n.body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const src = httpUrl(n.source_url);
  const roundup = Array.isArray(n.tags) && n.tags.includes('roundup');
  const desc = shorten(text || `${name}${n.source_name ? ', from ' + n.source_name : ''}.`, 158);
  const bodyHtml = (text ? `<p>${esc(shorten(text, 600))}</p>` : '')
    + (src ? `<p>Source: <a href="${attr(src)}" rel="nofollow noopener">${esc(n.source_name || src)}</a></p>` : '')
    + '<p><a href="/news">More news</a></p>';
  const route = '/article/' + n.id;
  const ld = { '@context': 'https://schema.org', '@type': 'NewsArticle', headline: shorten(name, 110), url: SITE + route,
    ...(n.published_at ? { datePublished: n.published_at } : {}), ...(n.updated_at ? { dateModified: n.updated_at } : {}),
    ...(src ? { isBasedOn: src } : {}), publisher: { '@type': 'Organization', name: 'Sophia Commons', url: SITE } };
  return { route, title: `${name} | Sophia Commons`, desc, bodyHtml, ld, ldId: 'detail-jsonld', robots: roundup ? 'noindex, follow' : '' };
}

// ── Country and category-in-country pages (/country/<slug>, /category/<cat>/<country>) ──
// Keep COUNTRY_ALIAS and PLACE_CATS in step with PLACE_CATS / _placeCountry() in sophia_commons_v9.js.
export const COUNTRY_LABEL = { USA: 'United States', UK: 'United Kingdom' };
export const NOT_COUNTRIES = ['Online', 'International'];
export const countryLabel = c => COUNTRY_LABEL[c] || c;
export const slugify = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
export const countrySlug = c => slugify(countryLabel(c));
const WITH_THE = new Set(['United States', 'United Kingdom', 'Netherlands', 'Czech Republic', 'Philippines', 'Dominican Republic', 'United Arab Emirates']);
export const countryIn = c => (WITH_THE.has(countryLabel(c)) ? 'the ' : '') + countryLabel(c);   // "in the Netherlands"
export const MIN_COUNTRY = 3;   // listings needed for a country page
export const MIN_COMBO = 5;     // listings needed for a category-in-country page
// [category slug, page label, directory categories, short name, counted noun]
export const PLACE_CATS = [
  ['waldorf-education', 'Waldorf & Steiner Schools', ['waldorf'], 'Waldorf Schools', 'Waldorf schools and kindergartens'],
  ['biodynamic-agriculture', 'Biodynamic & Demeter Farms', ['biodynamic'], 'Biodynamic Farms', 'biodynamic farms and initiatives'],
  ['the-christian-community', 'The Christian Community', ['christian_community'], 'Christian Community', 'Christian Community congregations'],
  ['community-camphill', 'Camphill & Social Therapy', ['camphill', 'community'], 'Camphill', 'Camphill and social therapy places'],
  ['anthroposophic-medicine', 'Anthroposophic Medicine', ['medicine'], 'Anthroposophic Medicine', 'doctors, clinics and therapists'],
  ['arts-eurythmy', 'Eurythmy & the Arts', ['eurythmy'], 'Eurythmy', 'eurythmy and arts initiatives'],
  ['societies-organizations', 'Anthroposophical Societies & Branches', ['societies'], 'Anthroposophical Society', 'societies, branches and groups'],
  ['science-technology', 'Goethean Science & Technology', ['science'], 'Goethean Science', 'science initiatives'],
  ['online-resources', 'Anthroposophical Resources', ['online'], 'Resources', 'publishers and other resources'],
];
export const placeCatOf = dirCat => PLACE_CATS.find(p => p[2].includes(dirCat)) || null;
export const fmtN = n => Number(n).toLocaleString('en-US');

export function breadcrumbLd(items) {
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, route], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE + route })) };
}

// Links from a listing up to its country page and category-in-country page. `sameCatCount` is how
// many other listings share its category and country (the edge function asks for up to 8), so
// >= MIN_COMBO - 1 means the category-in-country page exists and >= MIN_COUNTRY - 1 the country page.
export function placeLinks(e, sameCatCount) {
  if (!e.country || NOT_COUNTRIES.includes(e.country) || sameCatCount < MIN_COUNTRY - 1) return '';
  const L = countryIn(e.country), pc = placeCatOf(e.category), links = [];
  if (pc && sameCatCount >= MIN_COMBO - 1) links.push(`<a href="/category/${pc[0]}/${countrySlug(e.country)}">${esc(pc[1])} in ${esc(L)}</a>`);
  links.push(`<a href="/country/${countrySlug(e.country)}">Everything in ${esc(L)}</a>`);
  return `<p>${links.join(' &middot; ')}</p>`;
}

// Nearby listings of any kind (within about 60 km), nearest first, with the distance.
export function kmBetween(a, b) {
  const r = Math.PI / 180, dLat = (b.latitude - a.latitude) * r, dLng = (b.longitude - a.longitude) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * r) * Math.cos(b.latitude * r) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
export function nearbyHtml(e, nearby) {
  if (!nearby.length) return '';
  const near = e.city || e.location || e.organization_name;
  return `<h2>Nearby${near ? ': around ' + esc(near) : ''}</h2><ul>` + nearby.map(n => {
    const km = n._km < 1 ? 'under 1 km' : Math.round(n._km) + ' km';
    return `<li><a href="/listing/${attr(n.id)}">${esc(n.organization_name)}</a> (${esc([n.city || n.location, categoryOf(n)[1]].filter(Boolean).join(', '))}, ${km})</li>`;
  }).join('') + '</ul>';
}
