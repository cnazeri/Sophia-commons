// German country and city pages for Germany, Austria and Switzerland (/de/country/..., owner, 2026-10-29).
// About 40% of the directory is in German-speaking countries and Google already shows German searches
// ("Waldorfschule Erftstadt"), so these pages answer them in German. Formal "Sie"; listing names stay as they are.
// Plain JS with no runtime-specific imports, like seo_html.mjs.
import { SITE, esc, attr, PLACE_CATS, placeCatOf } from './seo_html.mjs';

export const DE_COUNTRIES = { Germany: ['Deutschland', 'in Deutschland'], Austria: ['Österreich', 'in Österreich'], Switzerland: ['Schweiz', 'in der Schweiz'] };
export const fmtDe = n => Number(n).toLocaleString('de-DE');

// [label, short, plural noun, singular noun] by PLACE_CATS slug
const CAT_DE = {
  'waldorf-education': ['Waldorfschulen & Waldorfkindergärten', 'Waldorfschulen', 'Waldorfschulen und -kindergärten', 'Waldorfschule oder -kindergarten'],
  'biodynamic-agriculture': ['Demeter- & biodynamische Höfe', 'Demeter-Höfe', 'Demeter- und biodynamische Betriebe', 'Demeter- oder biodynamischer Betrieb'],
  'the-christian-community': ['Die Christengemeinschaft', 'Christengemeinschaft', 'Gemeinden der Christengemeinschaft', 'Gemeinde der Christengemeinschaft'],
  'community-camphill': ['Camphill & Sozialtherapie', 'Camphill', 'Camphill- und sozialtherapeutische Einrichtungen', 'Camphill- oder sozialtherapeutische Einrichtung'],
  'anthroposophic-medicine': ['Anthroposophische Medizin', 'Anthroposophische Medizin', 'Arztpraxen, Kliniken und Therapien', 'Arztpraxis, Klinik oder Therapie'],
  'arts-eurythmy': ['Eurythmie & Kunst', 'Eurythmie', 'Eurythmie- und Kunstinitiativen', 'Eurythmie- oder Kunstinitiative'],
  'societies-organizations': ['Anthroposophische Gesellschaft & Zweige', 'Zweige', 'Gesellschaften, Zweige und Arbeitsgruppen', 'Gesellschaft, Zweig oder Arbeitsgruppe'],
  'science-technology': ['Goetheanistische Naturwissenschaft', 'Forschung', 'Forschungsinitiativen', 'Forschungsinitiative'],
  'online-resources': ['Anthroposophische Angebote', 'Angebote', 'Verlage und weitere Angebote', 'Verlag oder weiteres Angebot'],
};
const de = pc => CAT_DE[pc[0]] || [pc[1], pc[3], pc[4], pc[4]];
const countDe = (n, pc) => `${fmtDe(n)} ${n === 1 ? de(pc)[3] : de(pc)[2]}`;

export const partsOf = list => PLACE_CATS.map(pc => ({ pc, sub: list.filter(e => pc[2].includes(e.category)) })).filter(x => x.sub.length)
  .sort((a, b) => b.sub.length - a.sub.length);

export function entryListDe(entries) {
  return '<ul>' + entries.map(e => `<li><a href="/listing/${attr(e.id)}">${esc(e.organization_name)}</a>${e.city ? ' (' + esc(e.city) + ')' : ''}`
    + `${e.website_url && /^https?:\/\//.test(e.website_url) ? ` <a href="${attr(e.website_url)}" rel="nofollow noopener">Website</a>` : ''}</li>`).join('') + '</ul>';
}

export function placeFaqDe(list, where, moreLink) {
  const parts = partsOf(list);
  const names = l => { const n = l.slice(0, 3).map(e => e.organization_name); return n.length < l.length ? n.join(', ') + ' und weitere' : n.length > 1 ? n.slice(0, -1).join(', ') + ' und ' + n[n.length - 1] : n[0]; };
  const Q = { 'waldorf-education': `Gibt es Waldorfschulen ${where}?`, 'biodynamic-agriculture': `Gibt es Demeter-Höfe ${where}?`,
    'the-christian-community': `Gibt es eine Gemeinde der Christengemeinschaft ${where}?`, 'community-camphill': `Gibt es Camphill-Einrichtungen ${where}?`,
    'anthroposophic-medicine': `Wo finde ich anthroposophische Medizin ${where}?`, 'arts-eurythmy': `Wo finde ich Eurythmie ${where}?`,
    'societies-organizations': `Gibt es einen anthroposophischen Zweig oder eine Arbeitsgruppe ${where}?` };
  const qa = [[`Welche anthroposophischen Einrichtungen gibt es ${where}?`,
    `Sophia Commons listet ${fmtDe(list.length)} ${list.length === 1 ? 'Eintrag' : 'Einträge'} ${where}: ` + parts.map(x => countDe(x.sub.length, x.pc)).join(', ') + '.']];
  for (const x of parts.slice(0, 4)) if (Q[x.pc[0]]) qa.push([Q[x.pc[0]], `Ja. Sophia Commons listet ${countDe(x.sub.length, x.pc)} ${where}, darunter ${names(x.sub)}.`]);
  qa.push(['Wie finde ich die nächstgelegene Einrichtung?', `Öffnen Sie ${moreLink} auf Sophia Commons und sortieren Sie mit "Nächste finden" alle Einträge nach Entfernung, oder nutzen Sie die Karte. Jeder Eintrag nennt Adresse und Website.`]);
  return {
    html: '<div class="place-faq"><h2>Fragen und Antworten</h2>' + qa.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('') + '</div>',
    ld: { '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: 'de', mainEntity: qa.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
  };
}

// Title, description and body for /de/country/<slug>
export function countryPageDe(country, list, cities, enRoute, comboRoutes = {}) {
  const [name, inName] = DE_COUNTRIES[country];
  const parts = partsOf(list), other = list.filter(e => !placeCatOf(e.category));
  const title = `Anthroposophie ${inName}: ${parts.slice(0, 2).map(x => de(x.pc)[1]).join(', ')} und mehr | Sophia Commons`;
  const desc = `${fmtDe(list.length)} anthroposophische Einträge ${inName}: ` + parts.slice(0, 3).map(x => countDe(x.sub.length, x.pc)).join(', ') + '. Adressen, Websites und Karte.';
  const faq = placeFaqDe(list, inName, 'die Länderseite');
  const body = (cities.length ? '<h2>Städte</h2><p>' + cities.map(c => `<a href="${c.deRoute}">${esc(c.city)}</a> (${c.list.length})`).join(', ') + '</p>' : '')
    + parts.map(x => `<h2>${esc(de(x.pc)[0])} ${esc(inName)} (${fmtDe(x.sub.length)})</h2>` + entryListDe(x.sub.slice(0, 40))
      + (comboRoutes[x.pc[0]] ? `<p><a href="${comboRoutes[x.pc[0]]}">Alle ${fmtDe(x.sub.length)} ${esc(de(x.pc)[2])} ${esc(inName)}</a></p>`
        : x.sub.length > 40 ? `<p>und ${fmtDe(x.sub.length - 40)} weitere im <a href="${enRoute}">vollständigen Verzeichnis</a>.</p>` : '')).join('')
    + (other.length ? `<h2>Weitere Einträge ${esc(inName)}</h2>` + entryListDe(other) : '')
    + faq.html + `<p><a href="${enRoute}">English version</a> &middot; <a href="/directory">Verzeichnis und Weltkarte</a></p>`;
  return { title, desc, body, faq, h1: `Anthroposophie ${inName}` };
}

// Title, description and body for /de/country/<slug>/<city>
export function cityPageDe(country, city, list, siblings, deCountryRoute, enRoute) {
  const [name, inName] = DE_COUNTRIES[country];
  const parts = partsOf(list), other = list.filter(e => !placeCatOf(e.category));
  const title = `${parts.slice(0, 2).map(x => de(x.pc)[1]).join(', ') || 'Anthroposophie'} & mehr in ${city} | Sophia Commons`;
  const desc = `${fmtDe(list.length)} anthroposophische Einträge in ${city}, ${name}: ` + parts.slice(0, 3).map(x => countDe(x.sub.length, x.pc)).join(', ') + '. Adressen, Websites und Karte.';
  const faq = placeFaqDe(list, 'in ' + city, `die Seite für ${name}`);
  const body = parts.map(x => `<h2>${esc(de(x.pc)[0])} in ${esc(city)}</h2>` + entryListDe(x.sub)).join('')
    + (other.length ? `<h2>Weitere Einträge in ${esc(city)}</h2>` + entryListDe(other) : '')
    + faq.html
    + (siblings.length ? `<h2>Weitere Städte ${esc(inName)}</h2><p>` + siblings.map(c => `<a href="${c.deRoute}">${esc(c.city)}</a> (${c.list.length})`).join(', ') + '</p>' : '')
    + `<p><a href="${deCountryRoute}">Alles ${esc(inName)}</a> &middot; <a href="${enRoute}">English version</a> &middot; <a href="/directory">Verzeichnis und Weltkarte</a></p>`;
  return { title, desc, body, faq, h1: `Anthroposophie in ${city}` };
}

export const hreflang = (enRoute, deRoute) => [['en', SITE + enRoute], ['de', SITE + deRoute], ['x-default', SITE + enRoute]];

// /de/category/<cat>/<country>: e.g. "Waldorfschulen & Waldorfkindergärten in Deutschland"
export function comboPageDe(pc, country, list, cities, siblingCats, enRoute, deCountryRoute) {
  const [name, inName] = DE_COUNTRIES[country];
  const L = de(pc);
  const title = `${L[0]} ${inName} (${fmtDe(list.length)}) | Sophia Commons`;
  const top = cities.slice(0, 3).map(([c]) => c);
  const desc = `${countDe(list.length, pc)} ${inName}${top.length ? ', unter anderem in ' + top.join(', ') : ''}. Adressen, Websites und Karte im kostenlosen Verzeichnis Sophia Commons.`;
  const body = (cities.length ? '<h2>Städte und Orte</h2><p>' + cities.slice(0, 20).map(([c, n]) => `${esc(c)} (${n})`).join(', ') + '</p>' : '')
    + `<h2>Alle ${fmtDe(list.length)} Einträge</h2>` + entryListDe(list)
    + (siblingCats.length ? `<h2>Mehr ${esc(inName)}</h2><ul>` + siblingCats.map(([p, r, n]) => `<li><a href="${r}">${esc(de(p)[0])}</a> (${fmtDe(n)})</li>`).join('') + '</ul>' : '')
    + `<p><a href="${deCountryRoute}">Alles ${esc(inName)}</a> &middot; <a href="${enRoute}">English version</a> &middot; <a href="/directory">Verzeichnis und Weltkarte</a></p>`;
  return { title, desc, body, h1: `${L[0]} ${inName}` };
}
