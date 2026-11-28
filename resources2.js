// ══════════════════════════════════════════
//  Resources page, built out (owner, 2026-11-27: "the resources page needs to be built out a little more"),
//  after the mockup: a page heading with the numbers, "Start here" cards, jump links to every section, and a
//  search with kind filters over the online resources (shown as cards). The lists themselves stay in index.html.
//  Uses globals from sophia_commons_v9.js: esc, escJs, t, showSec.
// ══════════════════════════════════════════

var RS_KINDS = [
  ['listen', 'Listen', /podcast|audio|radio|recording|youtube|video/i],
  ['courses', 'Courses', /course|training|webinar|seminar|academy|lesson|study program|workshop/i],
  ['magazines', 'Magazines and blogs', /magazine|journal|newsletter|blog|quarterly|news\b/i],
  ['publishers', 'Publishers and shops', /\bpress\b|publish|bookshop|bookstore|bookseller|\bshop\b|verlag/i],
  ['study', 'Study and reference', /./]];
var RS_JUMPS = [
  ['resources-list', 'Online resources'], ['top50-books', 'Top 50 books'], ['philosophy-of-freedom', 'The Philosophy of Freedom'],
  ['res2-written', 'Complete works (GA 1 to 28)'], ['res2-cycles', 'Lecture cycles'], ['steiner-audio', 'Free audio'], ['res2-buy', 'Where to buy']];
var _rs = { kind: 'all', q: '', built: false };

function _rsT(k, f) { return typeof t === 'function' ? t('res2.' + k, f) : f; }
function _rsRows() { return [].slice.call(document.querySelectorAll('#resources-list .res-row')); }
var RS_FIXED = { 'Sophia Commons Steiner Library': 'study', 'Index to the Complete Works of Rudolf Steiner': 'study', 'Rudolf Steiner Archive': 'study' };
function _rsKindOf(row) {
  var a = row.querySelector('.ltitle'), title = a ? a.textContent.trim() : '', d = row.querySelector('.res-desc');
  if (RS_FIXED[title]) return RS_FIXED[title];
  var texts = [title, d ? d.textContent : ''];
  for (var j = 0; j < texts.length; j++)
    for (var i = 0; i < RS_KINDS.length - 1; i++) if (RS_KINDS[i][2].test(texts[j])) return RS_KINDS[i][0];
  return 'study';
}
function _rsKindName(k) {
  for (var i = 0; i < RS_KINDS.length; i++) if (RS_KINDS[i][0] === k) return _rsT('kind_' + k, RS_KINDS[i][1]);
  return k;
}

// Ids for the blocks that have none, found by their heading text
function _rsTagBlocks() {
  var sec = document.getElementById('sec-books');
  [].forEach.call(sec.querySelectorAll('.listblock, .trendblock'), function (b) {
    var h = b.querySelector('h3'); if (!h || b.id) return;
    if (/GA 1/.test(h.textContent)) b.id = 'res2-written';
    else if (h.getAttribute('data-i18n') === 'books.where_to_buy') b.id = 'res2-buy';
  });
  [].forEach.call(sec.querySelectorAll('.seclabel'), function (l) { if (/Lecture Cycles/i.test(l.textContent) && !l.id) l.id = 'res2-cycles'; });
}

function _rsHead() {
  var n = _rsRows().length;
  var stat = function (b, s) { return '<div class="rs-stat"><b>' + esc(b) + '</b><span>' + esc(s) + '</span></div>'; };
  var card = function (icon, title, text, onclick, href) {
    return '<a class="rs-card" href="' + esc(href || '#') + '"' + (onclick ? ' onclick="' + onclick + ';return false;"' : (href && href.charAt(0) !== '/' ? ' target="_blank" rel="noopener"' : '')) + '>'
      + '<span class="rs-ic" aria-hidden="true">' + icon + '</span><span><b>' + esc(title) + '</b><span>' + esc(text) + '</span></span></a>';
  };
  var svg = function (d) { return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>'; };
  return '<div class="rs-top"><div class="rs-intro"><h1 class="rs-title">' + esc(_rsT('title', 'Resources')) + '</h1>'
    + '<p class="rs-sub">' + esc(_rsT('sub', 'Rudolf Steiner\'s books and lectures, free reading and listening, and the best of anthroposophy online, chosen and checked by hand.')) + '</p></div>'
    + '<div class="rs-stats">' + stat('6,800', _rsT('stat_lectures', 'lectures to search')) + stat('271', _rsT('stat_audio', 'free recordings'))
    + stat('28', _rsT('stat_works', 'written works')) + stat(String(n), _rsT('stat_online', 'online resources')) + '</div></div>'
    + '<h2 class="rs-h2">' + esc(_rsT('start', 'Start here')) + '</h2><div class="rs-cards">'
    + card(svg('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>'), _rsT('c_library', 'Steiner Library'), _rsT('c_library_t', 'Search 6,800 lectures by word, topic, year or GA volume.'), '', '/library')
    + card(svg('<path d="M4 6.5c3-1.3 5.7-1.3 8 .5 2.3-1.8 5-1.8 8-.5V19c-3-1.3-5.7-1.3-8 .5-2.3-1.8-5-1.8-8-.5z"/><path d="M12 7v12.5"/>'), _rsT('c_read', 'Read Steiner free'), _rsT('c_read_t', 'Books, lectures and articles in English at the Rudolf Steiner Archive.'), '', 'https://rsarchive.org/')
    + card(svg('<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3.5" y="14" width="4" height="6" rx="1.5"/><rect x="16.5" y="14" width="4" height="6" rx="1.5"/>'), _rsT('c_audio', 'Listen free'), _rsT('c_audio_t', '271 recordings of Steiner\'s books and lecture cycles.'), "rsJump('steiner-audio')")
    + card(svg('<path d="M12 3.5 14.4 9l5.6.4-4.3 3.6 1.4 5.5L12 15.5l-5.1 3 1.4-5.5L4 9.4 9.6 9z"/>'), _rsT('c_freedom', 'The Philosophy of Freedom'), _rsT('c_freedom_t', 'Every edition and translation, many free to download.'), "rsJump('philosophy-of-freedom')")
    + '</div>'
    + '<nav class="rs-jump" aria-label="' + esc(_rsT('on_page', 'On this page')) + '">' + RS_JUMPS.map(function (j) {
        return '<a href="#' + esc(j[0]) + '" onclick="rsJump(\'' + escJs(j[0]) + '\');return false;">' + esc(_rsT('j_' + j[0].replace(/-/g, '_'), j[1])) + '</a>'; }).join('') + '</nav>';
}

function _rsTools() {
  var counts = { all: 0 };
  _rsRows().forEach(function (r) { var k = r.getAttribute('data-kind'); counts[k] = (counts[k] || 0) + 1; counts.all++; });
  var chip = function (k, label) {
    return '<button type="button" class="rs-chip' + (_rs.kind === k ? ' on' : '') + '" aria-pressed="' + (_rs.kind === k) + '" onclick="rsKind(\'' + k + '\')">' + esc(label) + ' <span>' + (counts[k] || 0) + '</span></button>';
  };
  return '<div class="rs-tools"><label class="rs-search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>'
    + '<input id="res2-q" type="search" placeholder="' + esc(_rsT('search_ph', 'Search the online resources')) + '" aria-label="' + esc(_rsT('search_ph', 'Search the online resources')) + '" oninput="rsSearch(this.value)" value="' + esc(_rs.q) + '"></label>'
    + '<div class="rs-chips">' + chip('all', _rsT('all', 'All')) + RS_KINDS.map(function (k) { return chip(k[0], _rsKindName(k[0])); }).join('') + '</div>'
    + '<p id="res2-found" class="res2-found" role="status"></p></div>';
}

// Search and kind filter: any filter shows matching rows from the whole list, including the folded part
function _rsApply() {
  var q = _rs.q.trim().toLowerCase(), on = !!q || _rs.kind !== 'all', shown = 0;
  var more = document.getElementById('res-more'), btn = document.querySelector('#resources-list .more-toggle');
  _rsRows().forEach(function (r) {
    var ok = (!q || r.textContent.toLowerCase().indexOf(q) !== -1) && (_rs.kind === 'all' || r.getAttribute('data-kind') === _rs.kind);
    r.classList.toggle('rs-hide', on && !ok);
    if (ok) shown++;
  });
  if (more) {
    if (on) { more.dataset.rsWas = more.dataset.rsWas || (more.hidden ? '1' : '0'); more.hidden = false; }
    else if (more.dataset.rsWas) { more.hidden = more.dataset.rsWas === '1'; delete more.dataset.rsWas; }
  }
  if (btn) btn.hidden = on;
  var f = document.getElementById('res2-found');
  if (f) f.textContent = on ? (shown ? _rsT('found', '{n} found').replace('{n}', shown) : _rsT('none', 'Nothing found. Try another word.')) : '';
}
function rsSearch(v) { _rs.q = v || ''; _rsApply(); }
function rsKind(k) {
  _rs.kind = k;
  [].forEach.call(document.querySelectorAll('.rs-chip'), function (b) { var on = b.getAttribute('onclick').indexOf("'" + k + "'") !== -1; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  _rsApply();
}

// Jump to a section, opening the "More books and lists" fold first when the section is inside it
function rsJump(id) {
  var el = document.getElementById(id); if (!el) return;
  var det = el.closest('details'); if (det && !det.open) det.open = true;
  el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

function resourcesBuild() {
  var sec = document.getElementById('sec-books'), list = document.getElementById('resources-list');
  if (!sec || !list) return;
  _rsTagBlocks();
  _rsRows().forEach(function (r) {
    if (r.getAttribute('data-kind')) return;
    var k = _rsKindOf(r); r.setAttribute('data-kind', k);
    r.insertAdjacentHTML('beforeend', '<span class="rs-tag">' + esc(_rsKindName(k)) + '</span>');
  });
  var top = document.getElementById('res2-head');
  if (!top) { top = document.createElement('div'); top.id = 'res2-head'; sec.insertBefore(top, sec.firstChild); }
  top.innerHTML = _rsHead();
  var tools = document.getElementById('res2-tools-box');
  if (!tools) { tools = document.createElement('div'); tools.id = 'res2-tools-box'; var body = list.querySelector('.listblock-body'); body.insertBefore(tools, body.firstChild); }
  tools.innerHTML = _rsTools();
  sec.classList.add('rs-on');
  _rsApply();
}

(function () {
  var _show = window.showSec;
  if (typeof _show === 'function') window.showSec = function (id) { var r = _show.apply(this, arguments); if (id === 'books') resourcesBuild(); return r; };
  var _rl = window.rerenderForLang;
  if (typeof _rl === 'function') window.rerenderForLang = function () {
    var r = _rl.apply(this, arguments);
    [].forEach.call(document.querySelectorAll('#resources-list .rs-tag'), function (x) { x.textContent = _rsKindName(x.parentNode.getAttribute('data-kind')); });
    var s = document.getElementById('sec-books'); if (s && s.classList.contains('active')) resourcesBuild();
    return r;
  };
  // Opened straight at /books: the section may already be showing
  document.addEventListener('DOMContentLoaded', function () { var s = document.getElementById('sec-books'); if (s && s.classList.contains('active')) resourcesBuild(); });
  window.addEventListener('load', function () { var s = document.getElementById('sec-books'); if (s && s.classList.contains('active')) resourcesBuild(); });
})();
