// Sophia Commons prerender: called by deploy.sh after _deploy/ is built.
//   node automation/prerender.mjs _deploy
// Writes a static copy of index.html for each section, category and region route, with its own
// <title>, description, canonical and Open Graph tags plus a crawlable summary (heading, intro and
// real links), and regenerates sitemap.xml with every listing and upcoming event.
// The single-page app still boots from every copy and removes the summary (#prerender) on load.
// Reads only public data with the publishable key from sb-init.js. Never writes anything.
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2] || '_deploy';
const SITE = 'https://sophiacommons.org';
const template = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
const sbInit = fs.readFileSync(path.join(OUT, 'sb-init.js'), 'utf8');
const SB_URL = (sbInit.match(/const SUPABASE_URL = '([^']+)'/) || [])[1];
const SB_KEY = (sbInit.match(/const SUPABASE_ANON_KEY = '([^']+)'/) || [])[1];
if (!SB_URL || !SB_KEY) throw new Error('Supabase URL/key not found in sb-init.js');

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const attr = esc;

async function rest(pathAndQuery, init = {}) {
  const r = await fetch(SB_URL + pathAndQuery, { ...init, headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  if (!r.ok) throw new Error(pathAndQuery + ' -> HTTP ' + r.status);
  return r.json();
}

async function allDirectory() {
  const rows = [];
  for (let from = 0; from < 20000; from += 1000) {
    const page = await rest('/rest/v1/directory_entries?select=id,organization_name,description,category,city,country,website_url,is_verified,updated_at&status=eq.approved&order=organization_name.asc', { headers: { Range: `${from}-${from + 999}` } });
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

// Route definitions (keep in step with catMeta / REGIONS in sophia_commons_v9.js and the sitemap)
const CATEGORIES = [
  ['waldorf-education', 'Waldorf & Education', ['waldorf'], 'Waldorf and Steiner schools, kindergartens, teacher training and resources for educators worldwide.'],
  ['biodynamic-agriculture', 'Biodynamic Agriculture', ['biodynamic'], 'Biodynamic and Demeter farms, associations, training and research in the tradition of Rudolf Steiner.'],
  ['arts-eurythmy', 'Arts & Eurythmy', ['eurythmy'], 'Eurythmy schools, ensembles and trainings, speech, music and the arts rooted in anthroposophy.'],
  ['anthroposophic-medicine', 'Anthroposophic Medicine', ['medicine'], 'Anthroposophic clinics and hospitals, physicians associations, pharmacies, therapies and research.'],
  ['community-camphill', 'Community & Camphill', ['camphill', 'community'], 'Camphill communities, curative education, social therapy, intentional communities and initiatives.'],
  ['the-christian-community', 'The Christian Community', ['christian_community'], 'Congregations and centers of The Christian Community (Die Christengemeinschaft), the Movement for Religious Renewal, worldwide with addresses.'],
  ['societies-organizations', 'Societies & Organizations', ['societies'], 'Anthroposophical Society branches, national societies and membership organizations.'],
  ['groups-circles', 'Groups & Circles', ['societies'], 'Study groups, reading circles and local branch meetings in the anthroposophical tradition.'],
  ['esoteric-studies', 'Esoteric Studies', ['societies', 'online'], 'Study groups, courses and resources for the study of Rudolf Steiner\'s spiritual science.'],
  ['online-resources', 'Online Resources', ['online'], 'Websites, archives, publishers, podcasts and online courses for the anthroposophical community.'],
  ['social-media', 'Social Media', ['social_media'], 'Anthroposophical groups and channels on social media.'],
];
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
  ['books', 'Books & Library', 'Rudolf Steiner\'s works by GA number and the top 50 anthroposophical books, with free online texts.'],
  ['podcasts', 'Podcasts & Media', 'Anthroposophical YouTube channels, podcasts and media, refreshed daily.'],
  ['memorial', 'In Memoriam', 'Remembering members of the anthroposophical community.'],
  ['eldercare', 'Eldercare', 'Anthroposophical eldercare, senior living and nursing care.'],
  ['about', 'About', 'Sophia Commons is a free directory and resource hub for the anthroposophical community.'],
];

function place(e) { return [e.city, e.country].filter(Boolean).join(', '); }

function entryList(entries) {
  return '<ul>' + entries.map(e => `<li><a href="/listing/${attr(e.id)}">${esc(e.organization_name)}</a>${place(e) ? ' (' + esc(place(e)) + ')' : ''}${e.website_url && /^https?:\/\//.test(e.website_url) ? ` <a href="${attr(e.website_url)}" rel="nofollow noopener">website</a>` : ''}</li>`).join('') + '</ul>';
}

function itemListLd(name, url, entries) {
  return {
    '@context': 'https://schema.org', '@type': 'CollectionPage', name, url,
    mainEntity: { '@type': 'ItemList', numberOfItems: entries.length,
      itemListElement: entries.slice(0, 500).map((e, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}/listing/${e.id}`, name: e.organization_name })) },
  };
}

function render(route, title, desc, bodyHtml, ld) {
  const url = SITE + route;
  let h = template;
  const set = (re, val) => { h = h.replace(re, val); };
  set(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  set(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${attr(desc)}">`);
  set(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${attr(url)}">`);
  set(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${attr(url)}">`);
  set(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${attr(title)}">`);
  set(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${attr(desc)}">`);
  set(/<meta name="twitter:url" content="[^"]*">/, `<meta name="twitter:url" content="${attr(url)}">`);
  set(/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${attr(title)}">`);
  set(/<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${attr(desc)}">`);
  const ldTag = ld ? `\n<script type="application/ld+json" id="prerender-jsonld">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` : '';
  const block = `<div id="prerender" class="prerender-summary"><h1>${esc(title.replace(/ \| Sophia Commons.*$/, ''))}</h1><p>${esc(desc)}</p>${bodyHtml}</div>${ldTag}\n`;
  if (!h.includes('<footer')) throw new Error('template has no <footer>');
  h = h.replace('<footer', block + '<footer');
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

for (const [slug, label, cats, desc] of CATEGORIES) {
  const list = dir.filter(e => cats.includes(e.category));
  written.push(render(`/category/${slug}`, `${label} | Sophia Commons Directory`, desc + ` ${list.length} listings.`, entryList(list), itemListLd(label, `${SITE}/category/${slug}`, list)));
}
for (const [slug, label, countries] of REGIONS) {
  const list = dir.filter(e => countries.includes(e.country));
  const desc = `Anthroposophical schools, farms, clinics, congregations, communities and resources in ${label}: ${list.length} listings.`;
  written.push(render(`/region/${slug}`, `${label} | Sophia Commons Directory`, desc, entryList(list), itemListLd(label, `${SITE}/region/${slug}`, list)));
}
for (const [slug, label, desc] of SECTIONS) {
  let body = '';
  if (slug === 'directory' || slug === 'browse') {
    body = '<h2>Categories</h2><ul>' + CATEGORIES.map(([s, l, c]) => `<li><a href="/category/${s}">${esc(l)}</a> (${dir.filter(e => c.includes(e.category)).length})</li>`).join('') + '</ul>'
      + '<h2>Regions</h2><ul>' + REGIONS.map(([s, l]) => `<li><a href="/region/${s}">${esc(l)}</a></li>`).join('') + '</ul>';
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

// Home: write the featured event banner into index.html so it shows with the first paint (it was
// the largest element on phones and only appeared after the script and an events request).
// The app replaces this with the live list as soon as it loads.
const feat = events.find(ev => ev.featured);
if (feat) {
  const short = (t, n) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length <= n ? t : t.slice(0, n - 3).replace(/\s+\S*$/, '') + '...'; };
  const img = feat.image_url && feat.image_url.includes('/storage/v1/object/public/')
    ? feat.image_url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/') + '?width=200&quality=72&resize=contain' : feat.image_url;
  const when = new Date(feat.start_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' });
  const join = feat.online_url ? `<a class="feat-ev-join" href="${attr(feat.online_url)}" target="_blank" rel="noopener">${/zoom\./i.test(feat.online_url) ? 'Join on Zoom' : 'Join online'}</a>` : '';
  const banner = `<div class="feat-ev" data-id="${attr(feat.id)}">`
    + (img ? `<img class="feat-ev-img" src="${attr(img)}" alt="" width="96" height="116" fetchpriority="high">` : '')
    + `<div class="feat-ev-body"><div class="etag">Featured event</div><h5><a href="/event/${attr(feat.id)}">${esc(feat.title)}</a></h5>`
    + `<div class="emeta">${esc(when)}</div>` + (feat.description ? `<p class="feat-ev-desc">${esc(short(feat.description, 160))}</p>` : '') + join + '</div></div>';
  const homeFile = path.join(OUT, 'index.html');
  const home = fs.readFileSync(homeFile, 'utf8');
  const placeholder = /(<div class="listblock-body" id="home-upcoming"[^>]*>)\s*<div class="empty-note">[^<]*<\/div>/;
  if (placeholder.test(home)) fs.writeFileSync(homeFile, home.replace(placeholder, (m, open) => open + banner));
}

console.log(`prerender: ${written.length} pages, sitemap ${urls.length} URLs (${dir.length} listings, ${events.length} events)`);
