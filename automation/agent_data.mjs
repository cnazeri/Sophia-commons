// Open data files for AI tools and developers, written by prerender.mjs at each deploy (owner, 2026-10-29):
//   /data/directory.json, /data/directory.csv and /llms-full.txt
// Public fields only: no email addresses or phone numbers.
import { SITE, NOT_COUNTRIES } from './seo_html.mjs';

// Plain label for each directory category (seo_html's categoryOf picks a page, which is not always the
// best name: 'online' would read "Esoteric Studies").
export const CATEGORY_LABEL = {
  waldorf: 'Waldorf & Steiner education', biodynamic: 'Biodynamic agriculture', christian_community: 'The Christian Community',
  camphill: 'Camphill', community: 'Intentional community', eurythmy: 'Eurythmy & the arts', medicine: 'Anthroposophic medicine',
  societies: 'Anthroposophical societies & study groups', eldercare: 'Eldercare', online: 'Online resources', social_media: 'Social media',
  science: 'Science & research',
};
export const categoryLabel = c => CATEGORY_LABEL[c] || 'Other';

export const DATA_SELECT = 'id,organization_name,description,category,address,city,region,country,website_url,latitude,longitude,is_verified,updated_at';
const FIELDS = ['id', 'name', 'category', 'category_label', 'description', 'address', 'city', 'region', 'country', 'latitude', 'longitude', 'website', 'url', 'verified', 'updated'];

const httpUrl = u => (u && /^https?:\/\//.test(u) ? u : null);
const oneLine = s => String(s || '').replace(/\s+/g, ' ').trim();
// Email addresses sometimes appear inside descriptions; the data files leave them out
const noEmail = s => s.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '(email on their website)');
const countCountries = rows => new Set(rows.map(r => r.country).filter(c => c && !NOT_COUNTRIES.includes(c))).size;
const num = v => (v == null || v === '' ? null : Number(v));

export function dataRow(e) {
  return {
    id: e.id, name: oneLine(e.organization_name), category: e.category, category_label: categoryLabel(e.category),
    description: noEmail(oneLine(e.description)) || null, address: oneLine(e.address) || null, city: e.city || null, region: e.region || null,
    country: e.country || null, latitude: num(e.latitude), longitude: num(e.longitude), website: httpUrl(e.website_url),
    url: `${SITE}/listing/${e.id}`, verified: !!e.is_verified, updated: e.updated_at ? String(e.updated_at).slice(0, 10) : null,
  };
}

export function directoryJson(dir, generated = new Date().toISOString()) {
  const rows = dir.map(dataRow);
  return JSON.stringify({
    name: 'Sophia Commons directory',
    description: 'Anthroposophical organizations worldwide: Waldorf schools, biodynamic farms, Camphill communities, The Christian Community, clinics, eurythmy, societies and more.',
    source: SITE, generated, count: rows.length, countries: countCountries(rows),
    attribution: 'Please credit Sophia Commons and link to each listing\'s url.', terms: `${SITE}/terms`,
    contact: 'hello@sophiacommons.org', fields: FIELDS, entries: rows,
  });
}

const csvCell = v => { const s = v == null ? '' : String(v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export function directoryCsv(dir) {
  return [FIELDS.join(','), ...dir.map(dataRow).map(r => FIELDS.map(f => csvCell(r[f])).join(','))].join('\r\n') + '\r\n';
}

// The whole directory as Markdown for language models: by category, then country, one line per listing
export function llmsFull(dir, generated = new Date().toISOString()) {
  const rows = dir.map(dataRow);
  const countries = countCountries(rows);
  const short = s => (!s ? '' : s.length <= 160 ? s : s.slice(0, 157).replace(/\s+\S*$/, '') + '...');
  const byCat = new Map();
  for (const r of rows) (byCat.get(r.category_label) || byCat.set(r.category_label, []).get(r.category_label)).push(r);
  let out = `# Sophia Commons: the full directory\n\n> ${rows.length.toLocaleString('en-US')} anthroposophical organizations in ${countries} countries, from ${SITE}. `
    + `Generated ${generated.slice(0, 10)}. Each line links to the listing's page on Sophia Commons, which has the address, map and website.\n\n`
    + `Also available: [JSON](${SITE}/data/directory.json), [CSV](${SITE}/data/directory.csv), [events calendar](${SITE}/events.ics), [news feed](${SITE}/feed.xml) `
    + `and an MCP server for AI assistants at ${SITE}/mcp. Please credit Sophia Commons when you use this data.\n`;
  for (const [label, list] of [...byCat.entries()].sort((a, b) => b[1].length - a[1].length)) {
    out += `\n## ${label} (${list.length.toLocaleString('en-US')})\n`;
    const byCountry = new Map();
    for (const r of list) { const c = r.country || 'Other'; (byCountry.get(c) || byCountry.set(c, []).get(c)).push(r); }
    for (const [country, l] of [...byCountry.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))) {
      out += `\n### ${country}\n\n` + l.sort((a, b) => a.name.localeCompare(b.name))
        .map(r => `- [${r.name.replace(/[[\]]/g, '')}](${r.url})${r.city ? ', ' + r.city : ''}${r.description ? ': ' + short(r.description) : ''}`).join('\n') + '\n';
    }
  }
  return out;
}
