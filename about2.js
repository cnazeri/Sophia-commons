// About, redesign (owner, 2026-11-25: "update the about page", _mockups/site2 #about): under the title, live numbers
// (places, countries, upcoming events, languages) and three cards (what is here, add or correct a listing, for
// developers and AI), then the existing detailed text. Uses globals: _sb, sbReady, calEvents, t, esc, _localDay,
// showSubmitForm.

var ABOUT_LANGS = 4, ABOUT_PAGE = 1000, ABOUT_MAX_PAGES = 10;
var _aboutCounts = null;   // fetched once per visit

function aboutIco(path) {
  return '<svg class="ico" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' + path + '</svg>';
}
var ABOUT_ICON = {
  place: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2"/><path d="m15 9-1.9 4.1L9 15l1.9-4.1z"/>',
  pen: '<path d="M4 20l4-1 10.5-10.5a2.1 2.1 0 0 0-3-3L5 16z"/><path d="M14 6.5l3 3"/>',
  web: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.1 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.1-3.6-8.5s1.2-6.2 3.6-8.5z"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="m4.5 7 7.5 6 7.5-6"/>'
};

// Places and countries from the directory (paged: the database returns at most 1000 rows per request)
async function aboutLoadCounts() {
  if (_aboutCounts || !sbReady()) return _aboutCounts;
  var countries = {}, places = 0;
  for (var page = 0; page < ABOUT_MAX_PAGES; page++) {
    var r = await _sb.from('directory_entries').select('country').eq('status', 'approved')
      .range(page * ABOUT_PAGE, page * ABOUT_PAGE + ABOUT_PAGE - 1);
    if (r.error) throw r.error;
    (r.data || []).forEach(function (x) { places++; if (x.country) countries[String(x.country).trim().toLowerCase()] = 1; });
    if (!r.data || r.data.length < ABOUT_PAGE) break;
  }
  _aboutCounts = { places: places, countries: Object.keys(countries).length };
  return _aboutCounts;
}

function aboutUpcoming() {
  var today = _localDay(new Date());
  return (window.calEvents || []).filter(function (e) {
    return e.id && e.cat !== 'memorial' && e.cat !== 'festival' && (e.end || e.date) >= today;
  }).length;
}

function aboutStat(n, label) {
  return '<div class="ab-stat"><b>' + (n == null ? '&nbsp;' : esc(Number(n).toLocaleString())) + '</b><span>' + esc(label) + '</span></div>';
}

function aboutDraw(counts) {
  var box = document.getElementById('about-top');
  if (!box) return;
  var c = counts || {};
  box.innerHTML = '<div class="ab-stats">'
      + aboutStat(c.places, t('about3.places', 'places')) + aboutStat(c.countries, t('about3.countries', 'countries'))
      + aboutStat(aboutUpcoming(), t('about3.events', 'upcoming events')) + aboutStat(ABOUT_LANGS, t('about3.languages', 'languages'))
    + '</div><div class="ab-cards">'
    + '<div class="ab-card"><span class="ab-ic ab-green">' + aboutIco(ABOUT_ICON.place) + '</span><h3>' + esc(t('about3.here_h', 'What is here')) + '</h3><p>' + esc(t('about3.here_p', '')) + '</p></div>'
    + '<div class="ab-card"><span class="ab-ic ab-orange">' + aboutIco(ABOUT_ICON.pen) + '</span><h3>' + esc(t('about3.add_h', 'Add or correct a listing')) + '</h3><p>' + esc(t('about3.add_p', '')) + '</p>'
      + '<button type="button" class="ab-btn" onclick="showSubmitForm()">+ ' + esc(t('about3.add_btn', 'Add a place')) + '</button></div>'
    + '<div class="ab-card"><span class="ab-ic ab-blue">' + aboutIco(ABOUT_ICON.web) + '</span><h3>' + esc(t('about3.dev_h', 'For developers and AI')) + '</h3><p>' + esc(t('about3.dev_p', '')) + '</p>'
      + '<a class="ab-link" href="#ai-apps" onclick="document.getElementById(\'ai-apps\').scrollIntoView();return false;">' + esc(t('about3.dev_ai', 'Use it in Claude or ChatGPT')) + ' &rarr;</a> <a class="ab-link" href="/data/directory.json">' + esc(t('about3.dev_link', 'How to use the data')) + ' &rarr;</a></div>'
    + '</div>' + (typeof scAiBlock === 'function' ? scAiBlock('ai-about') : '') + '<p class="ab-contact"><a class="ab-btn ab-gold" href="mailto:hello@sophiacommons.org">' + aboutIco(ABOUT_ICON.mail) + esc(t('about3.contact', 'Contact us')) + '</a></p>';
}

function renderAbout() {
  aboutDraw(_aboutCounts);
  aboutLoadCounts().then(aboutDraw).catch(function (e) { console.warn('About counts failed:', e); });
}

// Draw when the About page opens and again after a language change
(function () {
  if (typeof window.showSec === 'function') {
    var orig = window.showSec;
    window.showSec = function (id) {
      var out = orig.apply(this, arguments);
      if (id === 'about') { try { renderAbout(); } catch (e) { console.warn('About failed:', e); } }
      return out;
    };
  }
  var again = function () { var s = document.getElementById('sec-about'); if (s && s.classList.contains('active')) renderAbout(); };
  window.addEventListener('i18n-ready', again);
  if (typeof window.rerenderForLang === 'function') {
    var origLang = window.rerenderForLang;
    window.rerenderForLang = function () { var out = origLang.apply(this, arguments); again(); return out; };
  }
  var start = function () { again(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
