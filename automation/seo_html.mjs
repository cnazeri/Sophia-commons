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
export const LISTING_COLUMNS = 'id,organization_name,description,category,address,city,region,location,country,website_url,phone,tags,photo_url,latitude,longitude,is_verified,updated_at';

export function place(e) { return [e.city || e.location, e.country].filter(Boolean).join(', '); }

export function entryList(entries) {
  return '<ul>' + entries.map(e => `<li><a href="/listing/${attr(e.id)}">${esc(e.organization_name)}</a>${place(e) ? ' (' + esc(place(e)) + ')' : ''}${e.website_url && /^https?:\/\//.test(e.website_url) ? ` <a href="${attr(e.website_url)}" rel="nofollow noopener">website</a>` : ''}</li>`).join('') + '</ul>';
}

export function applySeo(template, { route, title, desc, bodyHtml = '', ld = null, ldId = 'prerender-jsonld', image = '' }) {
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
  if (image) {
    set(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${attr(image)}">`);
    set(/<meta name="twitter:image" content="[^"]*">/, `<meta name="twitter:image" content="${attr(image)}">`);
  }
  // One H1 per page: the summary below carries it, so the home page's hidden H1 becomes a paragraph.
  h = h.replace(/<h1 class="sr-only"([^>]*)>([^<]*)<\/h1>/, '<p class="sr-only"$1>$2</p>');
  // The app's own JSON-LD for detail pages uses id="detail-jsonld" and replaces this one on load.
  const ldTag = ld ? `\n<script type="application/ld+json" id="${ldId}">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` : '';
  const block = `<div id="prerender" class="prerender-summary"><h1>${esc(title.replace(/ \| Sophia Commons.*$/, ''))}</h1><p>${esc(desc)}</p>${bodyHtml}</div>${ldTag}\n`;
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

// Everything applySeo needs for /listing/<id>. `related` = a few other listings to link to.
export function listingPage(e, related = []) {
  const [catUrl, catLabel] = categoryOf(e);
  const where = place(e);
  const name = e.organization_name || 'Listing';
  const about = String(e.description || '').replace(/\s+/g, ' ').trim();
  const fallback = `${catLabel}${where ? ' in ' + where : ''}. Address, website and details in the Sophia Commons directory.`;
  const desc = shorten(about || fallback, 158);
  const website = e.website_url && /^https?:\/\//.test(e.website_url) ? e.website_url : '';
  const image = e.photo_url && /^https:\/\//.test(e.photo_url) ? e.photo_url.split('#')[0] : '';
  const tags = Array.isArray(e.tags) ? e.tags.filter(Boolean) : [];
  const addr = [e.address, e.region, e.country].filter(Boolean).join(', ');

  const facts = [
    `<li>Category: <a href="${catUrl}">${esc(catLabel)}</a></li>`,
    addr ? `<li>Address: ${esc(addr)}</li>` : (where ? `<li>Location: ${esc(where)}</li>` : ''),
    website ? `<li>Website: <a href="${attr(website)}" rel="nofollow noopener">${esc(website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a></li>` : '',
    tags.length ? `<li>Topics: ${tags.map(esc).join(', ')}</li>` : '',
  ].join('');
  const bodyHtml = (about.length > desc.length ? `<p>${esc(about)}</p>` : '')
    + `<ul>${facts}</ul>`
    + (related.length ? `<h2>More ${esc(catLabel)}${e.country ? ' in ' + esc(e.country) : ''}</h2>` + entryList(related) : '');

  const route = '/listing/' + e.id;
  const ld = {
    '@context': 'https://schema.org',
    '@type': e.is_verified ? 'Organization' : 'LocalBusiness',
    name,
    url: SITE + route,
    ...(about ? { description: shorten(about, 300) } : {}),
    ...(website ? { sameAs: [website] } : {}),
    ...(image ? { image } : {}),
    ...(e.phone ? { telephone: e.phone } : {}),
    ...(addr || where ? { address: { '@type': 'PostalAddress', ...(e.address ? { streetAddress: e.address } : {}), ...(e.city || e.location ? { addressLocality: e.city || e.location } : {}), ...(e.region ? { addressRegion: e.region } : {}), ...(e.country ? { addressCountry: e.country } : {}) } } : {}),
    ...(e.latitude && e.longitude ? { geo: { '@type': 'GeoCoordinates', latitude: Number(e.latitude), longitude: Number(e.longitude) } } : {}),
  };

  return { route, title: `${name}${e.city || e.location ? ', ' + (e.city || e.location) : ''} | Sophia Commons`, desc, bodyHtml, ld, ldId: 'detail-jsonld', image };
}
