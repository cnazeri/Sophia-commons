// Sophia Commons prerender: called by deploy.sh after _deploy/ is built.
//   node automation/prerender.mjs _deploy
// Writes a static copy of index.html for each section, category and region route, with its own
// <title>, description, canonical and Open Graph tags plus a crawlable summary (heading, intro and
// real links), and regenerates sitemap.xml with every listing and upcoming event.
// The single-page app still boots from every copy and removes the summary (#prerender) on load.
// Reads only public data with the publishable key from sb-init.js. Never writes anything.
import fs from 'node:fs';
import path from 'node:path';
import { SITE, esc, attr, CATEGORIES, entryList, applySeo, NOT_COUNTRIES, countryLabel, countrySlug, PLACE_CATS, placeCatOf,
  MIN_COUNTRY, MIN_COMBO, fmtN, breadcrumbLd, countryIn, MIN_CITY, citySlug, cityLabel, cityShort, placeFaq, countOf } from './seo_html.mjs';
import { DATA_SELECT, directoryJson, directoryCsv, llmsFull } from './agent_data.mjs';
import { DE_COUNTRIES, countryPageDe, cityPageDe, comboPageDe, hreflang } from './seo_de.mjs';

const OUT = process.argv[2] || '_deploy';
const template = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
const sbInit = fs.readFileSync(path.join(OUT, 'sb-init.js'), 'utf8');
const SB_URL = (sbInit.match(/const SUPABASE_URL = '([^']+)'/) || [])[1];
const SB_KEY = (sbInit.match(/const SUPABASE_ANON_KEY = '([^']+)'/) || [])[1];
if (!SB_URL || !SB_KEY) throw new Error('Supabase URL/key not found in sb-init.js');

async function rest(pathAndQuery, init = {}) {
  const r = await fetch(SB_URL + pathAndQuery, { ...init, headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  if (!r.ok) throw new Error(pathAndQuery + ' -> HTTP ' + r.status);
  return r.json();
}

async function allDirectory() {
  const rows = [];
  for (let from = 0; from < 20000; from += 1000) {
    const page = await rest(`/rest/v1/directory_entries?select=${DATA_SELECT}&status=eq.approved&order=organization_name.asc`, { headers: { Range: `${from}-${from + 999}` } });
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

// Route definitions (CATEGORIES lives in seo_html.mjs; keep REGIONS in step with sophia_commons_v9.js)
const REGIONS = [
  ['north-america', 'North America', ['USA', 'United States', 'Canada', 'Mexico']],
  ['latin-america', 'Latin America', ['Brazil', 'Argentina', 'Chile', 'Colombia', 'Peru', 'Mexico']],
  ['europe', 'Europe', ['Germany', 'Switzerland', 'Austria', 'France', 'Netherlands', 'Norway', 'Sweden', 'Denmark', 'Finland', 'Italy', 'Spain', 'Czech Republic', 'Hungary', 'Romania', 'Estonia', 'Latvia', 'Russia', 'Belgium', 'Portugal', 'Poland', 'Lithuania', 'Luxembourg', 'Slovenia', 'Croatia', 'Georgia']],
  ['uk-ireland', 'UK & Ireland', ['UK', 'United Kingdom', 'Ireland']],
  ['africa', 'Africa', ['South Africa', 'Kenya', 'Tanzania', 'Botswana', 'Egypt', 'Namibia']],
  ['asia', 'Asia', ['India', 'Japan', 'China', 'South Korea', 'Taiwan', 'Thailand', 'Philippines', 'Vietnam', 'Israel', 'Malaysia', 'Indonesia', 'Turkey']],
  ['australia-nz', 'Australia & New Zealand', ['Australia', 'New Zealand']],
  ['international', 'International & Online', ['International', 'Online']],
];
const SECTIONS = [
  ['directory', 'Global Directory', 'The free global directory of anthroposophical organizations: Waldorf schools, biodynamic farms, Camphill, The Christian Community, eurythmy, medicine and more, with a map.'],
  ['events', 'Events & Calendar', 'Upcoming anthroposophical events, conferences, webinars and study groups, plus the festival year: Holy Nights, Easter, Parzival Moon, St. John\'s, Michaelmas and more.'],
  ['browse', 'Browse Categories', 'Browse the Sophia Commons directory by category and region.'],
  ['news', 'News', 'News from the anthroposophical movement worldwide.'],
  ['blog', 'Blog', 'Articles and reflections from the anthroposophical community.'],
  ['books', 'Books & Library', 'Rudolf Steiner\'s works by GA number and the top 50 anthroposophical books, with free online texts.'],
  ['podcasts', 'Social Media', 'Anthroposophical YouTube channels, podcasts and media, refreshed daily.'],
  ['memorial', 'In Memoriam', 'Remembering members of the anthroposophical community.'],
  ['eldercare', 'Eldercare', 'Anthroposophical eldercare, senior living and nursing care.'],
  ['about', 'About', 'Sophia Commons is a free directory and resource hub for the anthroposophical community.'],
];

function itemListLd(name, url, entries) {
  return {
    '@context': 'https://schema.org', '@type': 'CollectionPage', name, url,
    mainEntity: { '@type': 'ItemList', numberOfItems: entries.length,
      itemListElement: entries.slice(0, 500).map((e, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}/listing/${e.id}`, name: e.organization_name })) },
  };
}

function render(route, title, desc, bodyHtml, ld, h1 = '', opts = {}) {
  const h = applySeo(template, { route, title, desc, bodyHtml, ld, h1, ...opts });
  // Write <route>.html, not <route>/index.html: Netlify serves /events from events.html with a 200,
  // while a directory index would 301-redirect /events to /events/ (mismatching canonicals and sitemap).
  const file = path.join(OUT, decodeURIComponent(route.replace(/^\//, '')) + '.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, h);
  return route;
}

const day = s => (s || '').slice(0, 10);

const dir = await allDirectory();
const events = await rest('/rest/v1/rpc/get_upcoming_events', { method: 'POST', body: JSON.stringify({ days_ahead: 365, limit_n: 100 }) }).catch(() => []);
const written = [];

// Countries with enough listings get a page; category-in-country pages need MIN_COMBO listings
const byCountry = new Map();
for (const e of dir) if (e.country && !NOT_COUNTRIES.includes(e.country)) (byCountry.get(e.country) || byCountry.set(e.country, []).get(e.country)).push(e);
const countries = [...byCountry.entries()].filter(([, l]) => l.length >= MIN_COUNTRY).sort((a, b) => b[1].length - a[1].length);
const combos = [];   // { pc, country, list }
for (const [country, list] of countries) for (const pc of PLACE_CATS) {
  const sub = list.filter(e => pc[2].includes(e.category));
  if (sub.length >= MIN_COMBO) combos.push({ pc, country, list: sub });
}
// City pages: cities with at least MIN_CITY listings, inside countries that have a country page
const cityPages = [];   // { country, city, list, route }
for (const [country, list] of countries) {
  const byCity = new Map();
  for (const e of list) if (e.city && e.city.trim()) { const k = citySlug(e.city); if (k) (byCity.get(k) || byCity.set(k, []).get(k)).push(e); }
  for (const [slug, l] of byCity) if (l.length >= MIN_CITY) cityPages.push({ country, city: l[0].city.trim(), list: l, route: `/country/${countrySlug(country)}/${slug}` });
}
const cityRoute = (country, city) => (cityPages.find(c => c.country === country && citySlug(c.city) === citySlug(city)) || {}).route;
const comboRoute = (pc, country) => `/category/${pc[0]}/${countrySlug(country)}`;
const hasCombo = (pc, country) => combos.some(c => c.pc === pc && c.country === country);
const countryLink = c => `<a href="/country/${countrySlug(c)}">${esc(countryLabel(c))}</a>`;
const topCities = (list, n) => {
  const m = new Map();
  for (const e of list) if (e.city) m.set(e.city, (m.get(e.city) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
};
const citiesHtml = list => { const c = topCities(list, 20); return c.length ? `<h2>Cities and towns</h2><p>${c.map(([n, k]) => { const r = cityRoute(list[0].country, n); return r ? `<a href="${r}">${esc(n)}</a> (${k})` : `${esc(n)} (${k})`; }).join(', ')}</p>` : ''; };

for (const [slug, label, cats, desc] of CATEGORIES) {
  const list = dir.filter(e => cats.includes(e.category));
  const pc = PLACE_CATS.find(p => p[0] === slug);
  const mine = pc ? combos.filter(c => c.pc === pc).sort((a, b) => b.list.length - a.list.length) : [];
  const byC = mine.length ? `<h2>${esc(label)} by country</h2><ul>` + mine.map(c => `<li><a href="${comboRoute(pc, c.country)}">${esc(pc[1])} in ${esc(countryIn(c.country))}</a> (${fmtN(c.list.length)})</li>`).join('') + '</ul>' : '';
  written.push(render(`/category/${slug}`, `${label} | Sophia Commons Directory`, desc + ` ${list.length} listings.`, byC + entryList(list), itemListLd(label, `${SITE}/category/${slug}`, list)));
}
for (const [slug, label, regionCountries] of REGIONS) {
  const list = dir.filter(e => regionCountries.includes(e.country));
  const desc = `Anthroposophical schools, farms, clinics, congregations, communities and resources in ${label}: ${list.length} listings.`;
  const inRegion = countries.filter(([c]) => regionCountries.includes(c));
  const byC = inRegion.length ? '<h2>Countries</h2><ul>' + inRegion.map(([c, l]) => `<li>${countryLink(c)} (${fmtN(l.length)})</li>`).join('') + '</ul>' : '';
  written.push(render(`/region/${slug}`, `${label} | Sophia Commons Directory`, desc, byC + entryList(list), itemListLd(label, `${SITE}/region/${slug}`, list)));
}

// /country/<slug>: everything in one country, by category, with links to the category-in-country pages
for (const [country, list] of countries) {
  const L = countryLabel(country), Lin = countryIn(country), route = `/country/${countrySlug(country)}`;
  const parts = PLACE_CATS.map(pc => ({ pc, sub: list.filter(e => pc[2].includes(e.category)) })).filter(x => x.sub.length).sort((a, b) => b.sub.length - a.sub.length);
  const other = list.filter(e => !placeCatOf(e.category));
  const short = parts.slice(0, 2).map(x => x.pc[3]);
  const title = `Anthroposophy in ${Lin}${short.length ? ': ' + short.join(', ') + ' and More' : ''} | Sophia Commons`;
  const desc = `${fmtN(list.length)} anthroposophical listings in ${Lin}: ` + parts.slice(0, 3).map(x => countOf(x.sub.length, x.pc)).join(', ') + '. Addresses, websites and a map.';
  let body = '<h2>By category</h2><ul>' + parts.map(x => `<li>${hasCombo(x.pc, country) ? `<a href="${comboRoute(x.pc, country)}">${esc(x.pc[1])} in ${esc(Lin)}</a>` : `<a href="/category/${x.pc[0]}">${esc(x.pc[1])}</a>`}: ${fmtN(x.sub.length)}</li>`).join('') + '</ul>'
    + citiesHtml(list);
  for (const x of parts) {
    const big = hasCombo(x.pc, country) && x.sub.length > 25;
    body += `<h2>${esc(x.pc[1])} in ${esc(Lin)}</h2>` + entryList(big ? x.sub.slice(0, 20) : x.sub)
      + (big ? `<p><a href="${comboRoute(x.pc, country)}">All ${fmtN(x.sub.length)} ${esc(x.pc[1])} in ${esc(Lin)}</a></p>` : '');
  }
  if (other.length) body += `<h2>More in ${esc(Lin)}</h2>` + entryList(other);
  const faq = placeFaq(list, Lin, 'the country page');
  body += faq.html + '<p><a href="/directory">The world directory and map</a></p>';
  written.push(render(route, title, desc, body, [itemListLd(`Anthroposophy in ${Lin}`, SITE + route, list), breadcrumbLd([['Home', '/'], ['Directory', '/directory'], [L, route]]), faq.ld], `Anthroposophy in ${Lin}`,
    DE_COUNTRIES[country] ? { alternates: hreflang(route, '/de' + route) } : {}));
}

// /category/<cat>/<country>: e.g. Waldorf & Steiner Schools in Germany
for (const { pc, country, list } of combos) {
  const L = countryLabel(country), Lin = countryIn(country), route = comboRoute(pc, country);
  const cities = topCities(list, 3).map(([n]) => n);
  const title = `${pc[1]} in ${Lin} (${fmtN(list.length)}) | Sophia Commons`;
  const desc = `${fmtN(list.length)} ${pc[4]} in ${Lin}${cities.length ? ', including ' + cities.join(', ') : ''}. Addresses, websites and a map in the free Sophia Commons directory.`;
  const siblings = combos.filter(c => c.pc === pc && c.country !== country).sort((a, b) => b.list.length - a.list.length);
  const body = citiesHtml(list) + `<h2>All ${fmtN(list.length)} listings</h2>` + entryList(list)
    + (siblings.length ? `<h2>${esc(pc[1])} in other countries</h2><ul>` + siblings.map(c => `<li><a href="${comboRoute(pc, c.country)}">${esc(countryLabel(c.country))}</a> (${fmtN(c.list.length)})</li>`).join('') + '</ul>' : '')
    + `<p><a href="/category/${pc[0]}">${esc(pc[1])} worldwide</a> &middot; <a href="/country/${countrySlug(country)}">Everything in ${esc(Lin)}</a></p>`;
  written.push(render(route, title, desc, body, [itemListLd(`${pc[1]} in ${Lin}`, SITE + route, list), breadcrumbLd([['Home', '/'], [pc[1], `/category/${pc[0]}`], [L, route]])], `${pc[1]} in ${Lin}`,
    DE_COUNTRIES[country] ? { alternates: hreflang(route, '/de' + route) } : {}));
}
// /country/<country>/<city>: e.g. Anthroposophy in Portland, Oregon
for (const { country, city, list, route } of cityPages) {
  const L = countryLabel(country), Lin = countryIn(country), where = cityLabel(city, list);
  const parts = PLACE_CATS.map(pc => ({ pc, sub: list.filter(e => pc[2].includes(e.category)) })).filter(x => x.sub.length).sort((a, b) => b.sub.length - a.sub.length);
  const other = list.filter(e => !placeCatOf(e.category));
  const title = `${parts.slice(0, 2).map(x => x.pc[3]).join(', ') || 'Anthroposophy'} & More in ${where} | Sophia Commons`;
  const desc = `${fmtN(list.length)} anthroposophical places in ${where}, ${L}: ` + parts.slice(0, 3).map(x => countOf(x.sub.length, x.pc)).join(', ') + '. Addresses, websites and a map.';
  const near = cityPages.filter(c => c.country === country && c.route !== route).sort((a, b) => b.list.length - a.list.length).slice(0, 12);
  const faq = placeFaq(list, cityShort(city) === city ? where : `${cityShort(city)}`, 'the ' + esc(L) + ' page');
  let body = parts.map(x => `<h2>${esc(x.pc[1])} in ${esc(cityShort(city))}</h2>` + entryList(x.sub)).join('') + (other.length ? `<h2>More in ${esc(cityShort(city))}</h2>` + entryList(other) : '')
    + faq.html
    + (near.length ? `<h2>Other cities in ${esc(Lin)}</h2><p>` + near.map(c => `<a href="${c.route}">${esc(cityShort(c.city))}</a> (${c.list.length})`).join(', ') + '</p>' : '')
    + `<p><a href="/country/${countrySlug(country)}">Everything in ${esc(Lin)}</a> &middot; <a href="/directory">The world directory and map</a></p>`;
  written.push(render(route, title, desc, body, [itemListLd(`Anthroposophy in ${where}`, SITE + route, list),
    breadcrumbLd([['Home', '/'], [L, `/country/${countrySlug(country)}`], [cityShort(city), route]]), faq.ld], `Anthroposophy in ${where}`,
    DE_COUNTRIES[country] ? { alternates: hreflang(route, '/de' + route) } : {}));
}

// German versions for Germany, Austria and Switzerland (/de/country/..., automation/seo_de.mjs)
for (const [country, list] of countries) {
  if (!DE_COUNTRIES[country]) continue;
  const enRoute = `/country/${countrySlug(country)}`, deRoute = '/de' + enRoute;
  const cities = cityPages.filter(c => c.country === country).sort((a, b) => b.list.length - a.list.length).map(c => ({ ...c, deRoute: '/de' + c.route }));
  const pg = countryPageDe(country, list, cities, enRoute, Object.fromEntries(combos.filter(c => c.country === country).map(c => [c.pc[0], '/de' + comboRoute(c.pc, country)])));
  written.push(render(deRoute, pg.title, pg.desc, pg.body, [itemListLd(pg.h1, SITE + deRoute, list), pg.faq.ld], pg.h1, { lang: 'de', alternates: hreflang(enRoute, deRoute) }));
  const myCombos = combos.filter(c => c.country === country).sort((a, b) => b.list.length - a.list.length);
  for (const { pc, list: sub } of myCombos) {
    const en = comboRoute(pc, country), deR = '/de' + en;
    const sibs = myCombos.filter(c => c.pc !== pc).map(c => [c.pc, '/de' + comboRoute(c.pc, country), c.list.length]);
    const cp = comboPageDe(pc, country, sub, topCities(sub, 20), sibs, en, deRoute);
    written.push(render(deR, cp.title, cp.desc, cp.body, [itemListLd(cp.h1, SITE + deR, sub)], cp.h1, { lang: 'de', alternates: hreflang(en, deR) }));
  }
  for (const c of cities) {
    const sib = cities.filter(x => x !== c).slice(0, 12);
    const cp = cityPageDe(country, c.city, c.list, sib, deRoute, c.route);
    written.push(render(c.deRoute, cp.title, cp.desc, cp.body, [itemListLd(cp.h1, SITE + c.deRoute, c.list), cp.faq.ld], cp.h1, { lang: 'de', alternates: hreflang(c.route, c.deRoute) }));
  }
}
for (const [slug, label, desc] of SECTIONS) {
  let body = '';
  if (slug === 'directory' || slug === 'browse') {
    body = '<h2>Categories</h2><ul>' + CATEGORIES.map(([s, l, c]) => `<li><a href="/category/${s}">${esc(l)}</a> (${dir.filter(e => c.includes(e.category)).length})</li>`).join('') + '</ul>'
      + '<h2>Regions</h2><ul>' + REGIONS.map(([s, l]) => `<li><a href="/region/${s}">${esc(l)}</a></li>`).join('') + '</ul>'
      + '<h2>Countries</h2><ul>' + countries.map(([c, l]) => `<li>${countryLink(c)} (${fmtN(l.length)})</li>`).join('') + '</ul>';
  } else if (slug === 'events') {
    body = '<h2>Upcoming events</h2><ul>' + events.map(ev => `<li>${esc(day(ev.start_date))}: <a href="/event/${attr(ev.id)}">${esc(ev.title)}</a>${ev.organizer_name ? ' (' + esc(ev.organizer_name) + ')' : ''}${ev.is_online ? ', online' : ev.city ? ', ' + esc([ev.city, ev.country].filter(Boolean).join(', ')) : ''}</li>`).join('') + '</ul>';
  } else if (slug === 'eldercare') {
    body = entryList(dir.filter(e => e.category === 'eldercare'));
  }
  const evLd = slug === 'events' && events.length ? {
    '@context': 'https://schema.org', '@type': 'ItemList', name: 'Upcoming anthroposophical events',
    itemListElement: events.slice(0, 100).map((ev, i) => ({ '@type': 'ListItem', position: i + 1, item: {
      '@type': 'Event', name: ev.title, startDate: ev.start_date, ...(ev.end_date ? { endDate: ev.end_date } : {}),
      url: `${SITE}/event/${ev.id}`, eventAttendanceMode: ev.is_online ? 'https://schema.org/OnlineEventAttendanceMode' : 'https://schema.org/OfflineEventAttendanceMode',
      location: ev.is_online ? { '@type': 'VirtualLocation', url: ev.online_url || `${SITE}/event/${ev.id}` } : { '@type': 'Place', name: ev.location_name || ev.city || 'See event page', address: [ev.city, ev.country].filter(Boolean).join(', ') || undefined },
      ...(ev.organizer_name ? { organizer: { '@type': 'Organization', name: ev.organizer_name } } : {}),
      ...(ev.image_url ? { image: ev.image_url } : {}),
    } })),
  } : null;
  written.push(render(`/${slug}`, `${label} | Sophia Commons`, desc, body, evLd));
}

// Sitemap: sections, categories, regions, every listing and upcoming event
const urls = [{ loc: SITE + '/', pri: '1.0' }]
  .concat(written.map(r => ({ loc: SITE + r })))
  .concat([{ loc: SITE + '/privacy' }, { loc: SITE + '/terms' }, { loc: SITE + '/region/verified' }])
  .concat(dir.map(e => ({ loc: `${SITE}/listing/${e.id}`, lastmod: day(e.updated_at) })))
  .concat(events.map(ev => ({ loc: `${SITE}/event/${ev.id}` })));
const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
  + urls.map(u => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n') + '\n</urlset>\n';
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), xml);

// Open data for AI tools: the directory as JSON, CSV and one Markdown file, and fresh counts in llms.txt
const generated = new Date().toISOString();
fs.mkdirSync(path.join(OUT, 'data'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'data', 'directory.json'), directoryJson(dir, generated));
fs.writeFileSync(path.join(OUT, 'data', 'directory.csv'), directoryCsv(dir));
fs.writeFileSync(path.join(OUT, 'llms-full.txt'), llmsFull(dir, generated));
const nCountries = new Set(dir.map(e => e.country).filter(c => c && !NOT_COUNTRIES.includes(c))).size;
const llmsFile = path.join(OUT, 'llms.txt');
if (fs.existsSync(llmsFile)) fs.writeFileSync(llmsFile, fs.readFileSync(llmsFile, 'utf8')
  .replace(/over [\d,]+ organizations in \d+ countries/g, `over ${fmtN(Math.floor(dir.length / 100) * 100)} organizations in ${nCountries} countries`));

// Home: write the featured event banner into index.html so it shows with the first paint (it was
// the largest element on phones and only appeared after the script and an events request).
// The app replaces this with the live list as soon as it loads.
// First banner = the soonest event starting today or later, same as the app's slider (owner, 2026-10-24)
const laDay = iso => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
const todayLA = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
const feat = events.filter(ev => laDay(ev.start_date) >= todayLA).sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
if (feat) {
  const short = (t, n) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length <= n ? t : t.slice(0, n - 3).replace(/\s+\S*$/, '') + '...'; };
  const img = feat.image_url && feat.image_url.includes('/storage/v1/object/public/')
    ? feat.image_url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/') + '?width=200&quality=72&resize=contain' : feat.image_url;
  const when = new Date(feat.start_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' });
  const join = feat.online_url ? `<a class="feat-ev-join" href="${attr(feat.online_url)}" target="_blank" rel="noopener">${/zoom\./i.test(feat.online_url) ? 'Join on Zoom' : 'Join online'}</a>` : '';
  const banner = `<div class="feat-ev" data-id="${attr(feat.id)}">`
    + (img ? `<img class="feat-ev-img" src="${attr(img)}" alt="" width="96" height="116" fetchpriority="high">` : '')
    + `<div class="feat-ev-body"><div class="etag">${feat.featured ? 'Featured event' : laDay(feat.start_date) === todayLA ? 'Today' : 'Coming up'}</div><h5 aria-level="3"><a href="/event/${attr(feat.id)}">${esc(feat.title)}</a></h5>`
    + `<div class="emeta">${esc(when)}</div>` + (feat.description ? `<p class="feat-ev-desc">${esc(short(feat.description, 160))}</p>` : '') + join + '</div></div>';
  const homeFile = path.join(OUT, 'index.html');
  const home = fs.readFileSync(homeFile, 'utf8');
  const placeholder = /(<div class="listblock-body" id="home-upcoming"[^>]*>)\s*<div class="empty-note">[^<]*<\/div>/;
  if (placeholder.test(home)) fs.writeFileSync(homeFile, home.replace(placeholder, (m, open) => open + featFrame(banner) + homeGrid(feat)));
}

// The slider frame is written too, so the app adds slides beside the banner instead of moving it
// (a moved element repaints, and phones then count the banner as a late largest paint).
function featFrame(banner) {
  return '<div class="feat-slider" role="region" aria-roledescription="carousel" aria-label="Featured events">'
    + '<div class="feat-view"><div class="feat-track">' + banner + '</div></div></div>';
}

// Same markup as renderHomeUpcoming() in the app, so the live redraw does not move the page.
function homeGrid(feat) {
  const tz = 'America/Los_Angeles';
  const dayOf = iso => new Date(iso).toLocaleDateString('en-CA', { timeZone: tz });
  const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });
  const rest = events.filter(ev => ev !== feat && dayOf(ev.end_date || ev.start_date) >= today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const now = rest.filter(ev => dayOf(ev.start_date) < today).slice(0, 4);
  const fmt = (iso, o) => new Date(iso).toLocaleDateString('en-US', { timeZone: tz, ...o });
  const row = ev => {
    const multi = ev.end_date && dayOf(ev.end_date) !== dayOf(ev.start_date);
    const time = multi ? fmt(ev.start_date, { month: 'short', day: 'numeric' }) + ' - ' + fmt(ev.end_date, { month: 'short', day: 'numeric' })
      : ev.is_all_day ? '' : new Date(ev.start_date).toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
    const loc = [ev.city, ev.country].filter(Boolean).join(', ') || (ev.is_online ? (ev.location_name || 'Online') : '');
    const cat = ev.event_type === 'first_class' ? 'first class (blue card)' : String(ev.category_name || ev.event_type || 'community').toLowerCase();
    const meta = [time, loc, ev.organizer_name].filter(x => x && String(x).trim()).map(esc).join(' &middot; ');
    return '<div class="evrow"><div class="evdate"><div class="mo">' + esc(fmt(ev.start_date, { month: 'short' })) + '</div><div class="dy">' + fmt(ev.start_date, { day: 'numeric' }) + '</div></div>'
      + '<div class="evinfo"><div class="etag">' + esc(cat.charAt(0).toUpperCase() + cat.slice(1)) + '</div><h5 aria-level="3"><a href="/event/' + attr(ev.id) + '">' + esc(ev.title) + '</a></h5>'
      + (meta ? '<div class="emeta">' + meta + '</div>' : '') + '</div></div>';
  };
  // Only "Happening now" under the featured event (no "Coming up" list), same as the app
  return now.length
    ? '<div class="home-ev-grid only-now"><div class="home-ev-col"><h4 class="home-ev-sub" aria-level="3"><span class="live-dot" aria-hidden="true"></span>Happening now</h4>'
      + '<div class="home-ev-rows">' + now.map(row).join('') + '</div></div></div>'
    : '';
}

console.log(`prerender: ${countries.length} country pages, ${combos.length} category-in-country pages, ${cityPages.length} city pages`);
console.log(`prerender: ${written.length} pages, sitemap ${urls.length} URLs (${dir.length} listings, ${events.length} events)`);
