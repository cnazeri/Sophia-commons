// ══════════════════════════════════════════
//  SOPHIA COMMONS v9 - Frontend Application
//  Backend: Supabase (see /backend/README.md)
// ══════════════════════════════════════════

let signedIn = false, username = '';
let previousSection = 'home';
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function sbReady() { return typeof _sb !== 'undefined' && _sb !== null; }

function captureCurrentSection(excludeId) {
  var activeSec = document.querySelector('.pagesec.active');
  if (activeSec && activeSec.id !== 'sec-' + excludeId) {
    previousSection = activeSec.id.replace('sec-', '');
  }
}

// ══════════════════════════════════════════
//  DETAIL VIEW SYSTEM
//  Rich individual pages for every listing,
//  event, news article, and directory entry.
// ══════════════════════════════════════════

// Record how deep we are in in-app history, so the on-page Back button can use the real
// browser history (keeps Back/Forward and the URL in sync) without ever leaving the site.
(function() {
  var origPush = history.pushState.bind(history);
  history.pushState = function(state, title, url) {
    var depth = (history.state && history.state.depth) || 0;
    var st = Object.assign({}, state || {}, { depth: depth + 1 });
    return origPush(st, title, url);
  };
})();

function goBack() {
  if (history.state && history.state.depth > 0) { history.back(); return; }
  showSec(previousSection || 'home');
}

// Show a detail page by type and Supabase ID
async function showDetail(type, id, skipPush) {
  captureCurrentSection('detail');

  var container = document.getElementById('detail-content');
  container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">' + t('detail.loading') + '</div>';
  showSec('detail', true);

  // Push SEO-friendly detail URL
  if (!skipPush) {
    var detailPaths = { directory: '/listing/', event: '/event/', news: '/article/', listing: '/classified/' };
    var prefix = detailPaths[type];
    if (prefix) {
      var path = prefix + id;
      if (window.location.pathname !== path) {
        history.pushState({ type: 'detail', detailType: type, detailId: id }, '', path);
      }
    }
  }

  if (!sbReady()) {
    container.innerHTML = renderOfflineDetail(type, id);
    return;
  }

  try {
    if (type === 'directory') {
      var { data, error } = await _sb.from('directory_entries')
        .select('*').eq('id', id).single();
      if (error || !data) { container.innerHTML = renderNotFound(); return; }
      container.innerHTML = renderDirectoryDetail(data);
      updateSEOMeta(data.organization_name + ' | Sophia Commons', (data.description || '').substring(0, 160), '/listing/' + id);
      _injectDirectorySEO(data);
      loadRelatedDirectory(data.category, data.id);
      loadComments('directory', id);
      _trackView('directory', id);
    } else if (type === 'event') {
      var { data, error } = await _sb.from('events')
        .select('*').eq('id', id).single();
      if (error || !data) { container.innerHTML = renderNotFound(); return; }
      container.innerHTML = renderEventDetail(data);
      updateSEOMeta(data.title + ' | Sophia Commons Events', (data.description || '').substring(0, 160), '/event/' + id);
      _injectEventSEO(data);
      loadRelatedEvents(data.category_id, data.id);
      loadComments('event', id);
      _trackView('event', id);
    } else if (type === 'news') {
      var { data, error } = await _sb.from('news')
        .select('*').eq('id', id).single();
      if (error || !data) { container.innerHTML = renderNotFound(); return; }
      container.innerHTML = renderNewsDetail(data);
      updateSEOMeta(data.title + ' | Sophia Commons News', (data.excerpt || data.body || '').substring(0, 160), '/article/' + id);
      _injectNewsSEO(data);
      loadComments('news', id);
      _trackView('news', id);
    } else if (type === 'listing') {
      var { data, error } = await _sb.from('listings')
        .select('*, profiles(username), categories(name,slug)')
        .eq('id', id).single();
      if (error || !data) { container.innerHTML = renderNotFound(); return; }
      container.innerHTML = renderListingDetail(data);
      updateSEOMeta(data.title + ' | Sophia Commons Marketplace', (data.description || '').substring(0, 160), '/classified/' + id);
      _injectListingSEO(data);
      loadComments('listing', id);
      _trackView('listing', id);
    } else {
      container.innerHTML = renderNotFound();
    }
  } catch(e) {
    console.warn('Detail load error:', e);
    container.innerHTML = renderNotFound();
  }
}

// Show a detail page from static data (no Supabase ID needed)
function showStaticDetail(data) {
  captureCurrentSection('detail');
  var container = document.getElementById('detail-content');
  container.innerHTML = renderStaticDetail(data);
  showSec('detail');
}

// ── RENDERERS ──

function renderDirectoryDetail(d) {
  var badges = '';
  if (d.is_verified) badges += '<span class="detail-badge verified">' + t('detail.verified') + '</span>';
  if ((d.badges || []).indexOf('featured') !== -1) badges += '<span class="detail-badge highlight">' + esc(t('dir.highlighted', 'Highlighted')) + '</span>';
  if (d.category) badges += '<span class="detail-badge category">' + esc(d.category) + '</span>';

  var meta = '';
  if (d.address) meta += '<span>&#128205; ' + esc(d.address) + ', ' + esc(d.location || '') + '</span>';
  else if (d.location) meta += '<span>&#128205; ' + esc(d.location) + '</span>';
  if (d.country) meta += '<span>&#127758; ' + esc(d.country) + '</span>';
  if (d.phone) meta += '<span>&#9742; ' + esc(d.phone) + '</span>';

  var tags = '';
  if (d.tags && d.tags.length) {
    tags = '<div style="margin-top:12px;">' + d.tags.map(function(tg) {
      return '<a class="dir-tag" href="#" onclick="filterByTag(\'' + escJs(tg) + '\');return false;">' + esc(tg) + '</a>';
    }).join('') + '</div>';
  }

  var actions = '';
  if (d.website_url) actions += '<a class="btn-primary-detail" href="' + escUrl(d.website_url) + '" target="_blank">' + t('detail.visit_website') + ' &#8599;</a>';
  if (d.email) actions += '<a class="btn-secondary-detail" href="mailto:' + esc(d.email) + '">' + t('detail.contact') + ' &#9993;</a>';
  if (d.phone) actions += '<a class="btn-secondary-detail" href="tel:' + esc(d.phone) + '">' + t('detail.call') + ' &#9742;</a>';

  var pic = d.photo_url ? '<figure class="detail-pic' + (d.photo_url.indexOf('#contain') !== -1 ? ' is-logo' : '') + '"><img src="' + escUrl(_imgSized(d.photo_url.split('#')[0], 720)) + '" alt="' + esc(d.organization_name) + '" loading="lazy">'
    + (d.photo_credit
        // Wikimedia Commons photos: "Author, License, via Wikimedia Commons|<file page>"
        ? '<figcaption>' + esc(t('dir.photo', 'Photo')) + ': <a href="' + escUrl(d.photo_credit.split('|')[1] || '') + '" target="_blank" rel="noopener">' + esc(d.photo_credit.split('|')[0]) + '</a></figcaption>'
        : (d.website_url ? '<figcaption>' + esc(t('dir.pic_credit', 'Image from')) + ' <a href="' + escUrl(d.website_url) + '" target="_blank" rel="noopener">' + esc(d.website_url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '')) + '</a></figcaption>' : '')) + '</figure>' : '';
  return '<div class="detail-hero">'
    + pic
    + badges
    + '<h1>' + esc(d.organization_name) + '</h1>'
    + '<div class="detail-meta">' + meta + '</div>'
    + '<div class="detail-body">' + esc(d.description || t('detail.no_description')) + '</div>'
    + tags
    + '<div class="detail-actions">' + actions + '</div>'
    + '</div>'
    + '<div class="detail-sidebar"><h4>' + t('detail.quick_facts') + '</h4>'
    + '<p><strong>' + t('detail.category') + ':</strong> ' + esc(d.category || t('common.general')) + '</p>'
    + (d.address ? '<p><strong>' + t('detail.address') + ':</strong> ' + esc(d.address) + '</p>' : '')
    + (d.location ? '<p><strong>' + t('detail.location') + ':</strong> ' + esc(d.location) + '</p>' : '')
    + (d.country ? '<p><strong>' + t('detail.country') + ':</strong> ' + esc(d.country) + '</p>' : '')
    + (d.phone ? '<p><strong>' + t('detail.phone') + ':</strong> <a href="tel:' + esc(d.phone) + '">' + esc(d.phone) + '</a></p>' : '')
    + (d.email ? '<p><strong>' + t('detail.email') + ':</strong> <a href="mailto:' + esc(d.email) + '">' + esc(d.email) + '</a></p>' : '')
    + (d.website_url ? '<p><strong>' + t('detail.website') + ':</strong> <a href="' + escUrl(d.website_url) + '" target="_blank">' + esc(d.website_url.replace('https://','').replace('http://','')) + '</a></p>' : '')
    + '<p><strong>' + t('detail.status') + ':</strong> ' + (d.is_verified ? '<span style="color:var(--sage);font-weight:700;">&#10003; ' + t('detail.verified') + '</span>' : t('detail.listed')) + '</p>'
    + (signedIn ? '<button class="btn-report" onclick="openReportModal(\'directory\',\'' + d.id + '\')">' + t('report.flag_btn') + '</button>' : '')
    + (typeof claimBoxHtml === 'function' ? claimBoxHtml(d) : '')
    + '</div>'
    + renderCommentsSection('directory', d.id)
    + '<div id="related-listings"></div>';
}

// ── Add an event to Google, Outlook or Apple calendars ──
var _calEventStore = {};
function _calRange(ev) {
  var start = new Date(ev.start_date);
  var end = ev.end_date ? new Date(ev.end_date) : new Date(start.getTime() + 90 * 60000);   // no end time: assume 90 minutes
  if (ev.is_all_day) {
    var s0 = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
    var e0 = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()) + 86400000); // end date is exclusive
    return { start: s0, end: e0, allDay: true };
  }
  if (end <= start) end = new Date(start.getTime() + 90 * 60000);
  return { start: start, end: end, allDay: false };
}
function _calStamp(d, allDay) {
  var iso = d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return allDay ? iso.slice(0, 8) : iso;            // 20261108 or 20261108T170000Z
}
function _calWhere(ev) {
  var place = [ev.location_name, ev.address, ev.city, ev.country].filter(Boolean).join(', ');
  return place || (ev.online_url || '');
}
function _calDetails(ev) {
  var parts = [String(ev.description || '').slice(0, 1500)];
  if (ev.online_url) parts.push('Join: ' + ev.online_url);
  if (ev.ticket_url) parts.push('Sign up / tickets: ' + ev.ticket_url);
  parts.push('Sophia Commons: https://sophiacommons.org/event/' + ev.id);
  return parts.filter(Boolean).join('\n\n');
}
function calendarLinks(ev) {
  var r = _calRange(ev), q = encodeURIComponent;
  var google = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + q(ev.title)
    + '&dates=' + _calStamp(r.start, r.allDay) + '/' + _calStamp(r.end, r.allDay)
    + '&details=' + q(_calDetails(ev)) + '&location=' + q(_calWhere(ev));
  var msParams = 'subject=' + q(ev.title) + '&body=' + q(_calDetails(ev)) + '&location=' + q(_calWhere(ev))
    + (r.allDay
      ? '&startdt=' + r.start.toISOString().slice(0, 10) + '&enddt=' + r.end.toISOString().slice(0, 10) + '&allday=true'
      : '&startdt=' + q(r.start.toISOString()) + '&enddt=' + q(r.end.toISOString()));
  return {
    google: google,
    outlook: 'https://outlook.live.com/calendar/0/action/compose?path=%2Fcalendar%2Faction%2Fcompose&rru=addevent&' + msParams,
    office: 'https://outlook.office.com/calendar/0/action/compose?path=%2Fcalendar%2Faction%2Fcompose&rru=addevent&' + msParams
  };
}
function _icsText(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1'); }
function _icsFold(line) {
  var out = [], l = line;
  while (l.length > 74) { out.push(l.slice(0, 74)); l = ' ' + l.slice(74); }
  out.push(l);
  return out.join('\r\n');
}
function downloadEventIcs(id) {
  var ev = _calEventStore[id];
  if (!ev) return;
  var r = _calRange(ev);
  var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Sophia Commons//Events//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    'UID:' + ev.id + '@sophiacommons.org', 'DTSTAMP:' + _calStamp(new Date(), false),
    (r.allDay ? 'DTSTART;VALUE=DATE:' : 'DTSTART:') + _calStamp(r.start, r.allDay),
    (r.allDay ? 'DTEND;VALUE=DATE:' : 'DTEND:') + _calStamp(r.end, r.allDay),
    'SUMMARY:' + _icsText(ev.title), 'DESCRIPTION:' + _icsText(_calDetails(ev)), 'LOCATION:' + _icsText(_calWhere(ev)),
    'URL:https://sophiacommons.org/event/' + ev.id, 'END:VEVENT', 'END:VCALENDAR'];
  var blob = new Blob([lines.map(_icsFold).join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = String(ev.title || 'event').replace(/[^\w\- ]+/g, '').trim().slice(0, 60).replace(/\s+/g, '-') + '.ics';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function() { URL.revokeObjectURL(a.href); }, 2000);
}
function _calButtonsHtml(ev) {
  _calEventStore[ev.id] = ev;
  var L = calendarLinks(ev);
  return '<div class="cal-add"><span class="cal-add-label">' + t('event_detail.add_to_calendar', 'Add to calendar') + ':</span>'
    + '<a href="' + escUrl(L.google) + '" target="_blank" rel="noopener">Google</a>'
    + '<a href="' + escUrl(L.outlook) + '" target="_blank" rel="noopener">Outlook.com</a>'
    + '<a href="' + escUrl(L.office) + '" target="_blank" rel="noopener">Microsoft 365</a>'
    + '<a href="#" onclick="downloadEventIcs(\'' + esc(ev.id) + '\');return false;">' + t('event_detail.apple_ics', 'Apple / other (.ics)') + '</a></div>';
}

function renderEventDetail(ev) {
  var d = new Date(ev.start_date);
  var endStr = ev.end_date ? localDate(ev.end_date, {weekday:'long', month:'long', day:'numeric', year:'numeric'}) : '';
  var dateStr = localDate(ev.start_date, {weekday:'long', month:'long', day:'numeric', year:'numeric'});
  var timeStr = ev.is_all_day ? t('event_detail.all_day') : d.toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit'});
  // same-day end time: "09:00 AM - 12:30 PM"
  if (!ev.is_all_day && ev.end_date && _localDay(ev.end_date) === _localDay(ev.start_date)) {
    timeStr += ' - ' + new Date(ev.end_date).toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit'});
  }
  var typeLabel = ev.event_type === 'first_class' ? t('firstclass.tag', 'Blue card admission') : String(ev.event_type || '').replace(/_/g, ' ');

  var badges = '';
  if (ev.featured) badges += '<span class="detail-badge category">' + t('event_detail.featured') + '</span>';
  if (ev.event_type) badges += '<span class="detail-badge type">' + esc(typeLabel) + '</span>';
  if (ev.is_free) badges += '<span class="detail-badge free">' + t('event_detail.free') + '</span>';
  if (ev.is_online) badges += '<span class="detail-badge type">' + t('event_detail.online') + '</span>';

  var meta = '';
  meta += '<span>&#128197; ' + esc(dateStr) + '</span>';
  if (endStr && endStr !== dateStr) meta += '<span>to ' + esc(endStr) + '</span>';
  meta += '<span>&#128336; ' + esc(timeStr) + '</span>';
  if (ev.city) meta += '<span>&#128205; ' + esc(ev.city) + (ev.country ? ', ' + esc(ev.country) : '') + '</span>';
  if (ev.organizer_name) meta += '<span>&#127915; ' + esc(ev.organizer_name) + '</span>';

  var actions = '';
  // Sign-up forms (Google Forms etc.) are not ticket shops
  var isForm = /forms\.gle|docs\.google\.com\/forms|forms\.office\.com|typeform|jotform/i.test(ev.ticket_url || '');
  if (ev.ticket_url) actions += '<a class="btn-primary-detail" href="' + escUrl(ev.ticket_url) + '" target="_blank" rel="noopener">' + (isForm ? t('event_detail.sign_up', 'Sign up to attend') : t('event_detail.get_tickets')) + ' &#8599;</a>';
  if (ev.online_url) actions += '<a class="btn-primary-detail" href="' + escUrl(ev.online_url) + '" target="_blank">' + t('event_detail.join_online') + ' &#8599;</a>';
  if (ev.organizer_url) actions += '<a class="btn-secondary-detail" href="' + escUrl(ev.organizer_url) + '" target="_blank">' + t('event_detail.organizer_website') + '</a>';

  return '<div class="detail-hero">'
    + badges
    + '<h1>' + esc(ev.title) + '</h1>'
    + '<div class="detail-meta">' + meta + '</div>'
    + '<div class="detail-body" style="white-space:pre-line;">' + esc(ev.description || '') + '</div>'
    + (ev.ticket_price ? '<p style="font-size:14px;color:var(--gold-text);font-weight:700;margin-bottom:12px;">' + t('event_detail.ticket_price').replace('${price}', ev.ticket_price) + '</p>' : '')
    + '<div class="detail-actions">' + actions + '</div>'
    + _calButtonsHtml(ev)
    + '</div>'
    + '<div class="detail-sidebar"><h4>' + t('event_detail.title') + '</h4>'
    + '<p><strong>' + t('event_detail.date') + ':</strong> ' + esc(dateStr) + '</p>'
    + '<p><strong>' + t('event_detail.time') + ':</strong> ' + esc(timeStr) + '</p>'
    + (ev.location_name ? '<p><strong>' + t('event_detail.venue') + ':</strong> ' + esc(ev.location_name) + '</p>' : '')
    + (ev.city ? '<p><strong>' + t('event_detail.city') + ':</strong> ' + esc(ev.city) + '</p>' : '')
    + (ev.organizer_name ? '<p><strong>' + t('event_detail.organizer') + ':</strong> ' + esc(ev.organizer_name) + '</p>' : '')
    + (signedIn ? '<button class="btn-report" onclick="openReportModal(\'event\',\'' + ev.id + '\')">' + t('report.flag_btn') + '</button>' : '')
    + '</div>'
    + renderCommentsSection('event', ev.id)
    + '<div id="related-listings"></div>';
}

// Minimal allow-list HTML sanitizer (used for the generated weekly digest, which is stored as HTML
// and was shown as raw tags because the body was escaped). Strips every attribute except safe hrefs.
function _sanitizeHtml(html) {
  var doc = new DOMParser().parseFromString('<div>' + String(html || '') + '</div>', 'text/html');
  var root = doc.body.firstChild;
  var ALLOWED = { H2:1, H3:1, H4:1, P:1, UL:1, OL:1, LI:1, A:1, STRONG:1, EM:1, B:1, I:1, BR:1, SPAN:1, DIV:1 };
  var PATHS = { directory: '/listing/', event: '/event/', news: '/article/', listing: '/classified/' };
  (function walk(node) {
    Array.prototype.slice.call(node.childNodes).forEach(function(ch) {
      if (ch.nodeType === 3) return;
      if (ch.nodeType !== 1 || !ALLOWED[ch.tagName]) {
        if (ch.nodeType === 1 && !/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED)$/.test(ch.tagName)) {
          ch.replaceWith(doc.createTextNode(ch.textContent));
        } else { ch.remove(); }
        return;
      }
      var href = ch.tagName === 'A' ? (ch.getAttribute('href') || '') : '';
      var oc = ch.getAttribute('onclick') || '';
      Array.prototype.slice.call(ch.attributes).forEach(function(a) { ch.removeAttribute(a.name); });
      if (ch.tagName === 'A') {
        var m = oc.match(/showDetail\('(\w+)',\s*'([\w-]+)'\)/);
        if (m && PATHS[m[1]]) href = PATHS[m[1]] + m[2];
        ch.setAttribute('href', href.charAt(0) === '/' && href.charAt(1) !== '/' ? href : safeUrl(href));
        if (/^https?:/.test(href) && href.indexOf(location.origin) !== 0) { ch.setAttribute('target', '_blank'); ch.setAttribute('rel', 'noopener'); }
      }
      walk(ch);
    });
  })(root);
  return root.innerHTML;
}

// In-app links rendered as real hrefs (/event/<id> etc.) open inside the SPA without a reload.
document.addEventListener('click', function(e) {
  var a = e.target.closest && e.target.closest('.detail-body a[href^="/"]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  var path = a.getAttribute('href');
  history.pushState({ type: 'route' }, '', path);
  routeFromPath(path);
});

function renderNewsDetail(n) {
  var pubDate = n.published_at ? localDate(n.published_at, {month:'long', day:'numeric', year:'numeric'}) : '';

  var badges = '';
  if (n.featured) badges += '<span class="detail-badge category">' + t('news_detail.featured') + '</span>';
  if (n.tags && n.tags.length) {
    n.tags.forEach(function(t) { badges += '<span class="detail-badge type">' + esc(t) + '</span>'; });
  }

  var meta = '';
  if (pubDate) meta += '<span>&#128197; ' + esc(pubDate) + '</span>';
  if (n.source_name) meta += '<span>&#128240; ' + esc(n.source_name) + '</span>';

  var actions = '';
  if (n.source_url) actions += '<a class="btn-primary-detail" href="' + escUrl(n.source_url) + '" target="_blank">' + t('news_detail.read_at_source') + ' &#8599;</a>';

  return '<div class="detail-hero">'
    + badges
    + '<h1>' + esc(n.title) + '</h1>'
    + '<div class="detail-meta">' + meta + '</div>'
    + '<div class="detail-body">' + ((n.tags || []).indexOf('weekly-digest') >= 0 && n.body ? _sanitizeHtml(n.body) : esc(n.body || n.excerpt || '')) + '</div>'
    + '<div class="detail-actions">' + actions + (signedIn ? '<button class="btn-report" onclick="openReportModal(\'news\',\'' + n.id + '\')">' + t('report.flag_btn') + '</button>' : '') + '</div>'
    + '</div>'
    + renderCommentsSection('news', n.id);
}

function renderStaticDetail(d) {
  var badges = '';
  if (d.verified) badges += '<span class="detail-badge verified">' + t('detail.verified') + '</span>';
  if (d.category) badges += '<span class="detail-badge category">' + esc(d.category) + '</span>';

  var meta = '';
  if (d.location) meta += '<span>&#128205; ' + esc(d.location) + '</span>';

  var actions = '';
  if (d.url) actions += '<a class="btn-primary-detail" href="' + escUrl(d.url) + '" target="_blank">' + t('detail.visit_website') + ' &#8599;</a>';
  if (d.amazon) actions += '<a class="btn-secondary-detail" href="' + escUrl(d.amazon) + '" target="_blank">' + t('detail.buy_on_amazon') + '</a>';

  return '<div class="detail-hero">'
    + badges
    + '<h1>' + esc(d.title) + '</h1>'
    + '<div class="detail-meta">' + meta + '</div>'
    + '<div class="detail-body">' + (d.description || '') + '</div>'
    + '<div class="detail-actions">' + actions + '</div>'
    + '</div>';
}

function renderNotFound() {
  return '<div style="text-align:center;padding:60px 20px;">'
    + '<div style="font-size:3rem;margin-bottom:12px;">&#128214;</div>'
    + '<h2 style="font-family:Lora,serif;font-size:1.3rem;color:var(--text-primary);margin-bottom:8px;">' + t('detail.not_found_title') + '</h2>'
    + '<p style="color:var(--text-muted);font-size:14px;margin-bottom:20px;">' + t('detail.not_found_desc') + '</p>'
    + '<a href="#" onclick="goBack();return false;" style="color:var(--gold-text);font-weight:600;">&larr; ' + t('detail.go_back') + '</a>'
    + '</div>';
}

function renderOfflineDetail() {
  return '<div style="text-align:center;padding:60px 20px;">'
    + '<h2 style="font-family:Lora,serif;font-size:1.3rem;color:var(--text-primary);margin-bottom:8px;">' + t('detail.offline_title') + '</h2>'
    + '<p style="color:var(--text-muted);font-size:14px;margin-bottom:20px;">' + t('detail.offline_desc') + '</p>'
    + '<a href="#" onclick="goBack();return false;" style="color:var(--gold-text);font-weight:600;">&larr; ' + t('detail.go_back') + '</a>'
    + '</div>';
}

// ── SEO STRUCTURED DATA ──

function _injectJsonLd(data) {
  var existing = document.getElementById('detail-jsonld');
  if (existing) existing.remove();
  var script = document.createElement('script');
  script.type = 'application/ld+json';
  script.id = 'detail-jsonld';
  script.textContent = JSON.stringify(data);
  document.head.appendChild(script);
}

function _injectDirectorySEO(d) {
  _injectJsonLd({
    '@context': 'https://schema.org',
    '@type': d.is_verified ? 'Organization' : 'LocalBusiness',
    'name': d.organization_name,
    'description': (d.description || '').substring(0, 300),
    'url': d.website_url || ('https://sophiacommons.org/listing/' + d.id),
    'address': d.address || d.location ? {
      '@type': 'PostalAddress',
      'streetAddress': d.address || '',
      'addressLocality': d.location || '',
      'addressCountry': d.country || ''
    } : undefined,
    'telephone': d.phone || undefined,
    'email': d.email || undefined
  });
}

function _injectEventSEO(ev) {
  var loc = {};
  if (ev.is_online) {
    loc = { '@type': 'VirtualLocation', 'url': ev.online_url || '' };
  } else {
    loc = { '@type': 'Place', 'name': ev.location_name || ev.city || '', 'address': { '@type': 'PostalAddress', 'addressLocality': ev.city || '', 'addressCountry': ev.country || '' } };
  }
  _injectJsonLd({
    '@context': 'https://schema.org',
    '@type': 'Event',
    'name': ev.title,
    'description': (ev.description || '').substring(0, 300),
    'startDate': ev.start_date,
    'endDate': ev.end_date || undefined,
    'eventStatus': 'https://schema.org/EventScheduled',
    'eventAttendanceMode': ev.is_online ? 'https://schema.org/OnlineEventAttendanceMode' : 'https://schema.org/OfflineEventAttendanceMode',
    'location': loc,
    'organizer': ev.organizer_name ? { '@type': 'Organization', 'name': ev.organizer_name, 'url': ev.organizer_url || undefined } : undefined,
    'isAccessibleForFree': ev.is_free || false,
    'offers': ev.ticket_url ? { '@type': 'Offer', 'url': ev.ticket_url, 'price': ev.ticket_price || '0', 'priceCurrency': 'USD' } : undefined
  });
}

function _injectNewsSEO(n) {
  _injectJsonLd({
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    'headline': n.title,
    'description': (n.excerpt || n.body || '').substring(0, 300),
    'datePublished': n.published_at || n.created_at,
    'author': n.source_name ? { '@type': 'Organization', 'name': n.source_name } : { '@type': 'Organization', 'name': 'Sophia Commons' },
    'publisher': { '@type': 'Organization', 'name': 'Sophia Commons', 'url': 'https://sophiacommons.org' },
    'mainEntityOfPage': 'https://sophiacommons.org/article/' + n.id
  });
}

function _injectListingSEO(d) {
  _injectJsonLd({
    '@context': 'https://schema.org',
    '@type': 'Product',
    'name': d.title,
    'description': (d.description || '').substring(0, 300),
    'offers': {
      '@type': 'Offer',
      'price': d.price || '0',
      'priceCurrency': 'USD',
      'availability': d.status === 'active' ? 'https://schema.org/InStock' : 'https://schema.org/Discontinued',
      'validThrough': d.expires_at || undefined
    }
  });
}

// ── RELATED ITEMS ──

async function loadRelatedDirectory(category, excludeId) {
  if (!sbReady()) return;
  try {
    var { data } = await _sb.from('directory_entries')
      .select('id, organization_name, description, category, location, is_verified, tags')
      .eq('status', 'approved')
      .eq('category', category)
      .neq('id', excludeId)
      .limit(4);
    if (!data || data.length === 0) return;
    var el = document.getElementById('related-listings');
    if (!el) return;
    el.innerHTML = '<h4 style="font-family:Lora,serif;font-size:14px;font-weight:700;margin-bottom:12px;">' + t('detail.related_in').replace('{category}', esc(category)) + '</h4>'
      + '<div class="detail-related">'
      + data.map(function(r) {
        return '<div class="detail-related-card" onclick="showDetail(\'directory\',\'' + r.id + '\')">'
          + '<h5>' + esc(r.organization_name) + (r.is_verified ? ' <span style="color:var(--sage);">&#10003;</span>' : '') + '</h5>'
          + '<p>' + esc((r.description || '').substring(0, 100)) + (r.description && r.description.length > 100 ? '...' : '') + '</p>'
          + '<p style="color:var(--gold-text);font-size:11px;margin-top:4px;">' + esc(r.location || '') + '</p>'
          + '</div>';
      }).join('')
      + '</div>';
  } catch(e) {}
}

async function loadRelatedEvents(categoryId, excludeId) {
  if (!sbReady()) return;
  try {
    var { data } = await _sb.from('events')
      .select('id, title, start_date, city, country')
      .in('status', ['upcoming', 'ongoing'])
      .neq('id', excludeId)
      .order('start_date')
      .limit(4);
    if (!data || data.length === 0) return;
    var el = document.getElementById('related-listings');
    if (!el) return;
    el.innerHTML = '<h4 style="font-family:Lora,serif;font-size:14px;font-weight:700;margin-bottom:12px;">' + t('event_detail.more_upcoming') + '</h4>'
      + '<div class="detail-related">'
      + data.map(function(r) {
        var d = new Date(r.start_date);
        return '<div class="detail-related-card" onclick="showDetail(\'event\',\'' + r.id + '\')">'
          + '<h5>' + esc(r.title) + '</h5>'
          + '<p>' + localDate(r.start_date, {month:'short', day:'numeric'}) + ' - ' + esc(r.city || '') + '</p>'
          + '</div>';
      }).join('')
      + '</div>';
  } catch(e) {}
}

// ══════════════════════════════════════════
//  CATEGORY PAGES
//  Each category gets its own full page with
//  directory entries, events, news, and actions.
// ══════════════════════════════════════════

const catMeta = {
  'waldorf & education':     { dirCat: 'waldorf',    desc: 'Waldorf and Steiner schools, teacher training institutes, homeschool resources, curriculum materials, and professional development for educators worldwide.' },
  'biodynamic agriculture':  { dirCat: 'biodynamic', desc: 'Demeter-certified biodynamic farms, CSA programs, apprenticeships, seed suppliers, training courses, and agricultural research in the tradition of Rudolf Steiner.' },
  'esoteric studies':        { dirCat: ['societies', 'online'],          desc: 'Study groups, lecture cycles, meditation practices, courses in spiritual science, and resources for the independent study of Rudolf Steiner\'s work.' },
  'arts & eurythmy':         { dirCat: 'eurythmy',   desc: 'Eurythmy schools and performances, visual arts, music, speech formation, drama, and artistic practices rooted in anthroposophical principles.' },
  'anthroposophic medicine': { dirCat: 'medicine',    desc: 'Anthroposophic physicians, clinics, hospitals, therapeutic eurythmy, art therapy, Weleda and WALA remedies, and nurse training programs.' },
  'the christian community':  { dirCat: 'christian_community', label: 'The Christian Community', desc: 'Congregations and centers of The Christian Community (Die Christengemeinschaft), the Movement for Religious Renewal founded in 1922 with the help of Rudolf Steiner: Sunday services, sacraments, festivals and study.' },
  'community & camphill':    { dirCat: ['camphill', 'community'],    desc: 'Camphill communities, intentional living, co-worker positions, volunteer programs, and inclusive communities for people with disabilities.' },
  'free & sharing':          { dirCat: null,          desc: 'Free items, giveaways, seed exchanges, skill shares, tool lending, and community barter within the anthroposophical world.' },
  'marketplace':             { dirCat: null,          desc: 'Buy, sell, and trade anthroposophical books, biodynamic products, handcrafts, musical instruments, art, and educational materials.' },
  'housing & room rent':     { dirCat: null,          desc: 'Rooms, apartments, and community housing near Waldorf schools, Camphill communities, and biodynamic farms. Land for intentional communities.' },
  'jobs & volunteering':     { dirCat: null,          desc: 'Waldorf teaching positions, biodynamic farm apprenticeships, Camphill co-worker roles, administrative jobs, and volunteer opportunities across the movement.' },
  'groups & circles':        { dirCat: 'societies',          desc: 'Study circles, meditation groups, reading groups, local branch meetings, youth groups, and working groups in the anthroposophical tradition.' },
  'science & technology':    { dirCat: 'science', desc: 'Goethean science, research and the question of a moral, human-centered technology, from an anthroposophical perspective.' },
  'online resources':        { dirCat: 'online',      desc: 'Websites, archives, podcasts, video channels, online courses, and digital tools for the anthroposophical community.' },
  'societies & organizations': { dirCat: 'societies', desc: 'National and international anthroposophical societies, branches, federations, and membership organizations.' },
  'eldercare':                 { dirCat: 'eldercare', desc: 'Anthroposophical senior living, nursing care, Camphill elder programs and support for the later years of life.' },
  'podcasts & media':          { dirCat: 'online', desc: 'Podcasts, video channels, archives and publications from the anthroposophical world.' },
  'social media':              { dirCat: 'social_media', desc: 'Facebook groups, YouTube channels, X/Twitter accounts, Instagram pages, Discord communities, and other social media for the anthroposophical movement.' }
};

// Category URL slugs: plain ASCII ("waldorf-education"). Old "%26" slugs still resolve.
function _catSlug(name) {
  return String(name || '').toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function _catKeyFromName(name) {
  var k = String(name || '').toLowerCase();
  if (catMeta[k]) return k;
  var slug = _catSlug(k);
  for (var key in catMeta) { if (_catSlug(key) === slug) return key; }
  return k;
}

function showCategory(name, skipPush, opts) {
  name = _catKeyFromName(name);
  opts = opts || {};
  captureCurrentSection('category');

  var key = name.toLowerCase();
  var meta = catMeta[key] || {};
  var displayName = meta.label || (name.charAt(0).toUpperCase() + name.slice(1));

  document.getElementById('cat-page-label').textContent = displayName;
  var catI18nKey = 'catmeta.' + key.replace(/[^a-z]/g, '_') + '_desc';
  document.getElementById('cat-page-desc').textContent = t(catI18nKey) !== catI18nKey ? t(catI18nKey) : (meta.desc || t('catpage.default_browse_desc'));
  document.getElementById('cat-page-content').innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">' + t('common.loading') + '</div>';
  showSec('category', true);
  // Canonical uses the same slug as the pushed URL and the sitemap (/category/waldorf-education)
  updateSEOMeta(displayName + ' | Sophia Commons Directory', meta.desc || t('catpage.default_seo_desc'), '/category/' + _catSlug(key));

  // Push SEO-friendly category URL
  if (!skipPush) {
    var slug = _catSlug(key);
    var path = '/category/' + slug + (opts.q ? '?q=' + encodeURIComponent(opts.q) : '');
    if (window.location.pathname + window.location.search !== path) {
      history.pushState({ type: 'category', name: name, q: opts.q || '' }, '', path);
    }
  }

  loadCategoryPage(key, meta.dirCat, opts);
}

// ── School of Spiritual Science, First Class (blue card holders) ──
// Opens Groups & Circles and scrolls to the Blue Card Holders section once it has rendered
function showBlueCard() {
  showCategory('Groups & Circles');
  _scrollToFirstClass();
}
function _scrollToFirstClass() {
  var tries = 0;
  (function wait() {
    var el = document.getElementById('first-class');
    if (el) {
      // keep the section clear of the sticky header
      var hdr = 0;
      document.querySelectorAll('#site-header').forEach(function(h) {
        var cs = getComputedStyle(h);
        if (cs.position === 'sticky' || cs.position === 'fixed') hdr = Math.max(hdr, h.getBoundingClientRect().bottom);
      });
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - hdr - 12, behavior: 'smooth' });
      return;
    }
    if (++tries < 50) setTimeout(wait, 100);
  })();
}
// A shared link to /category/groups-circles#first-class lands on the section
if (location.hash === '#first-class') window.addEventListener('load', _scrollToFirstClass);

async function _firstClassBlock() {
  var evs = [];
  if (sbReady()) {
    try {
      var r = await _sb.from('events').select('id, title, start_date, end_date, location_name, city, region, country, is_online, organizer_name')
        .eq('event_type', 'first_class').in('status', ['upcoming', 'ongoing'])
        .gte('start_date', new Date(Date.now() - 864e5).toISOString()).order('start_date').limit(20);
      evs = r.data || [];
    } catch (e) { console.warn('first class events unavailable', e); }
  }
  var rows = evs.map(function (ev) {
    var where = ev.is_online ? t('common.online', 'Online') : [ev.location_name, ev.city, ev.region].filter(Boolean).join(', ');
    var time = localDate(ev.start_date, { weekday: 'short', month: 'short', day: 'numeric' }) + ', '
      + new Date(ev.start_date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      + (ev.end_date ? ' - ' + new Date(ev.end_date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '');
    var d = new Date(ev.start_date);
    return '<div class="evrow"><div class="evdate"><div class="mo">' + esc(localDate(ev.start_date, { month: 'short' })) + '</div><div class="dy">' + d.getDate() + '</div></div>'
      + '<div class="evinfo"><div class="etag">' + esc(t('firstclass.tag', 'Blue card admission')) + '</div>'
      + '<h5><a href="/event/' + esc(ev.id) + '" onclick="showDetail(\'event\',\'' + escJs(ev.id) + '\');return false;">' + esc(ev.title) + '</a></h5>'
      + '<div class="emeta">' + esc(time) + (where ? ' &middot; ' + esc(where) : '') + '</div></div></div>';
  }).join('');
  return '<div class="listblock fc-block" id="first-class" style="margin-bottom:16px;">'
    + '<div class="listblock-head"><h3>' + esc(t('firstclass.heading2', 'Blue Card Holders')) + '</h3><span class="fc-badge">' + esc(t('firstclass.badge2', 'School of Spiritual Science, First Class')) + '</span></div>'
    + '<div class="listblock-body"><p class="fc-intro">' + esc(t('firstclass.intro2', 'Class lessons and Class gatherings for members of the School of Spiritual Science. Admission requires the blue card. Mantric content is not published here; see each gathering for how to sign up.')) + '</p>'
    + (rows || '<div class="empty-note">' + esc(t('firstclass.none', 'No upcoming Class gatherings are listed yet.')) + '</div>')
    + '<div class="fc-add"><a href="/events" onclick="showSec(\'events\');showEventForm();return false;">+ ' + esc(t('firstclass.add', 'Add a Class gathering')) + '</a></div>'
    + '</div></div>';
}

async function loadCategoryPage(catKey, dirCat, opts) {
  opts = opts || {};
  var container = document.getElementById('cat-page-content');
  var html = '';

  // ── 1. Directory Entries (with an in-page filter box) ──
  var dirEntries = [];
  if (sbReady() && dirCat) {
    try {
      var q0 = _sb.from('directory_entries')
        .select('id, organization_name, description, website_url, location, country, is_verified, address, phone, email, tags, category, city, latitude, longitude, badges, photo_url')
        .eq('status', 'approved');
      q0 = Array.isArray(dirCat) ? q0.in('category', dirCat) : q0.eq('category', dirCat);
      var { data } = await q0.order('is_verified', { ascending: false }).order('organization_name').limit(500);
      if (data) dirEntries = data;
    } catch(e) {}
  }

  // Groups: the School of Spiritual Science, First Class (blue card holders) gets its own section first
  if (catKey === 'groups & circles') html += await _firstClassBlock();

  // Highlighted listings (badges contains 'featured') get a box at the top of their category
  html += _highlightBlock(dirEntries.filter(function(d) { return (d.badges || []).indexOf('featured') !== -1; }));

  if (dirEntries.length > 0) {
    html += _dirListShell(dirEntries, opts.q || '');
  }

  // ── 2. Related Events ──
  var events = [];
  if (sbReady()) {
    try {
      var { data } = await _sb.from('events')
        .select('id, title, description, start_date, city, country, organizer_name, is_free, event_type')
        .in('status', ['upcoming', 'ongoing']).order('start_date').limit(30);
      if (data) {
        var keywords = catKey.split(/[\s&,]+/).filter(function(w) { return w.length > 3; });
        data.forEach(function(ev) {
          var text = (ev.title + ' ' + (ev.description || '') + ' ' + (ev.organizer_name || '')).toLowerCase();
          if (keywords.some(function(kw) { return text.includes(kw); })) {
            events.push(ev);
          }
        });
      }
    } catch(e) {}
  }

  if (events.length > 0) {
    html += '<div class="listblock" style="margin-bottom:16px;">';
    html += '<div class="listblock-head"><h3>' + t('catpage.upcoming_events_heading') + '</h3><span style="font-size:10.5px;color:var(--text-muted);">' + events.length + ' events</span></div>';
    html += '<div class="listblock-body">';
    events.forEach(function(ev) {
      var d = new Date(ev.start_date);
      var loc = [ev.city, ev.country].filter(Boolean).join(', ');
      html += '<div class="evrow" style="cursor:pointer;" onclick="showDetail(\'event\',\'' + ev.id + '\')">'
        + '<div class="evdate"><div class="mo">' + MONTHS_SHORT[d.getMonth()] + '</div><div class="dy">' + d.getDate() + '</div></div>'
        + '<div class="evinfo">'
        + '<div class="etag">' + esc(ev.event_type || '') + (ev.is_free ? ' &middot; ' + t('common.free') : '') + '</div>'
        + '<h5>' + esc(ev.title) + '</h5>'
        + '<div class="emeta">' + esc(loc) + (ev.organizer_name ? ' &middot; ' + esc(ev.organizer_name) : '') + '</div>'
        + '</div></div>';
    });
    html += '</div></div>';
  }

  // ── 3. Related News ──
  var news = [];
  if (sbReady()) {
    try {
      var { data } = await _sb.from('news')
        .select('id, title, excerpt, source_name, published_at, tags')
        .eq('status', 'published').order('published_at', { ascending: false }).limit(20);
      if (data) {
        var keywords = catKey.split(/[\s&,]+/).filter(function(w) { return w.length > 3; });
        data.forEach(function(n) {
          var text = (n.title + ' ' + (n.excerpt || '') + ' ' + (n.tags || []).join(' ')).toLowerCase();
          if (keywords.some(function(kw) { return text.includes(kw); })) {
            news.push(n);
          }
        });
      }
    } catch(e) {}
  }

  if (news.length > 0) {
    html += '<div class="listblock" style="margin-bottom:16px;">';
    html += '<div class="listblock-head"><h3>' + t('catpage.related_news_heading') + '</h3></div>';
    html += '<div class="listblock-body">';
    news.forEach(function(n) {
      var ago = timeAgo(n.published_at);
      html += '<div class="lrow" style="cursor:pointer;" onclick="showDetail(\'news\',\'' + n.id + '\')">'
        + '<a class="ltitle" href="#" onclick="return false;">' + esc(n.title) + '</a>'
        + '<span class="lmeta">' + esc(n.source_name || '') + ' &middot; ' + ago + '</span>'
        + '</div>';
    });
    html += '</div></div>';
  }

  // ── 4. Empty state ──
  if (dirEntries.length === 0 && events.length === 0 && news.length === 0) {
    html += '<div style="text-align:center;padding:48px 20px;background:var(--surface);border:1px solid var(--border);border-radius:12px;">'
      + '<div style="font-size:2.5rem;margin-bottom:12px;">&#128218;</div>'
      + '<h3 style="font-family:Lora,serif;font-size:1.1rem;color:var(--text-primary);margin-bottom:8px;">' + t('catpage.empty_title') + '</h3>'
      + '<p style="color:var(--text-muted);font-size:13px;max-width:400px;margin:0 auto 16px;line-height:1.6;">' + t('catpage.empty_desc') + '</p>'
      + '</div>';
  }

  // ── 5. Submit CTA ──
  html += '<div style="text-align:center;margin-top:20px;padding:20px;background:var(--surface);border:1px solid var(--border);border-radius:12px;">'
    + '<p style="font-size:14px;color:var(--text-secondary);margin-bottom:12px;">' + t('catpage.submit_cta') + '</p>'
    + '<button onclick="showSubmitForm()" style="padding:11px 28px;background:var(--gold);color:var(--on-gold);border:none;border-radius:50px;font-family:Nunito Sans,sans-serif;font-size:14px;font-weight:600;cursor:pointer;">' + t('catpage.submit_btn') + '</button>'
    + '</div>';

  container.innerHTML = html;
  if (dirEntries.length > 0) { window._catGroupByCategory = Array.isArray(dirCat); window._catEntries = dirEntries; _applyCatFilter(opts.q || ''); }
}

// ── Directory list with filter (category, region and verified pages) ──
function _highlightBlock(list) {
  if (!list.length) return '';
  return '<div class="listblock hl-block" style="margin-bottom:16px;"><div class="listblock-head"><h3>' + esc(t('dir.highlighted', 'Highlighted')) + '</h3></div><div class="listblock-body">'
    + list.map(function (d) {
      return '<div class="hl-item">' + (d.photo_url ? _dirThumbHtml(d, 320) : '') + '<h4><a href="/listing/' + esc(d.id) + '" onclick="showDetail(\'directory\',\'' + escJs(d.id) + '\');return false;">' + esc(d.organization_name) + '</a></h4>'
        + (d.description ? '<p>' + esc(_shortText(d.description, 260)) + '</p>' : '')
        + (d.website_url ? '<a class="hl-visit" href="' + escUrl(d.website_url) + '" target="_blank" rel="noopener">' + esc(t('dir.visit', 'Visit')) + ' ' + esc(d.website_url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '')) + ' &#8599;</a>' : '')
        + '</div>';
    }).join('') + '</div></div>';
}

function _dirListShell(entries, q) {
  window._catNear = null;   // a new list starts unsorted
  // Most common tags in this set become one-tap filter chips
  var tc = {};
  entries.forEach(function(d) { (d.tags || []).forEach(function(tg) { tc[tg] = (tc[tg] || 0) + 1; }); });
  var chips = Object.keys(tc).filter(function(k) { return tc[k] >= 2 && tc[k] < entries.length; })
    .sort(function(a, b) { return tc[b] - tc[a]; }).slice(0, 8);
  return '<div class="listblock dir-filter-block" style="margin-bottom:16px;">'
    + '<div class="listblock-head"><h3>' + t('catpage.organizations_heading') + '</h3><span class="dir-count" id="cat-count"></span></div>'
    + '<div class="dir-filter">'
    +   '<input type="search" id="cat-filter" aria-label="' + esc(t('dir.filter_aria', 'Filter these listings')) + '" placeholder="' + esc(t('dir.filter_placeholder', 'Filter {count} listings by name, place or topic').replace('{count}', entries.length)) + '" value="' + esc(q) + '" oninput="_applyCatFilter(this.value)">'
    +   '<div class="dir-near" role="search">'
    +     '<label for="cat-near" class="sr-only">' + esc(t('dir.near_label', 'Town or postcode')) + '</label>'
    +     '<input type="text" id="cat-near" autocomplete="postal-code" placeholder="' + esc(t('dir.near_placeholder', 'Town or postcode, to sort by distance')) + '" onkeydown="if(event.key===\'Enter\'){_catNearSearch(this.value);}">'
    +     '<button type="button" class="dir-near-btn" onclick="_catNearSearch(document.getElementById(\'cat-near\').value)">' + esc(t('dir.near_btn', 'Find nearest')) + '</button>'
    +     '<button type="button" class="dir-near-btn dir-near-geo" onclick="_catNearGeo()">' + esc(t('dir.near_geo', 'Use my location')) + '</button>'
    +   '</div>'
    +   '<div id="cat-near-status" class="dir-near-status" role="status"></div>'
    +   (chips.length ? '<div class="dir-chips">' + chips.map(function(c) { return '<button type="button" class="dir-chip" onclick="_setCatFilter(\'' + escJs(c) + '\')">' + esc(c) + '</button>'; }).join('') + '</div>' : '')
    + '</div>'
    + '<div class="listblock-body" id="cat-entries"></div></div>';
}

// ── Find near me (category and region pages) ──
function _distKm(lat1, lng1, lat2, lng2) {
  var R = 6371, toR = Math.PI / 180;
  var dLat = (lat2 - lat1) * toR, dLng = (lng2 - lng1) * toR;
  var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(h));
}
function _fmtDist(km) {
  var miles = /^en-(US|GB)$/.test(navigator.language || '');
  var v = miles ? km * 0.621371 : km;
  return (v < 10 ? v.toFixed(1) : Math.round(v)) + (miles ? ' mi' : ' km');
}
function _catNearSet(lat, lng, label) {
  window._catNear = { lat: lat, lng: lng, label: label };
  var st = document.getElementById('cat-near-status');
  if (st) st.innerHTML = esc(t('dir.near_sorted', 'Sorted by distance from {place}.').replace('{place}', label))
    + ' <button type="button" class="dir-near-clear" onclick="_catNearClear()">' + esc(t('dir.near_clear', 'Clear')) + '</button>';
  var f = document.getElementById('cat-filter');
  if (f) f.value = '';
  _applyCatFilter('');
}
function _catNearClear() {
  window._catNear = null;
  var st = document.getElementById('cat-near-status'); if (st) st.textContent = '';
  var n = document.getElementById('cat-near'); if (n) n.value = '';
  var f = document.getElementById('cat-filter'); _applyCatFilter(f ? f.value : '');
}
var _nearLastCall = 0;
async function _catNearSearch(place) {
  place = String(place || '').trim();
  var st = document.getElementById('cat-near-status');
  if (!place) { if (st) st.textContent = t('dir.near_need', 'Type a town or postcode first.'); return; }
  if (Date.now() - _nearLastCall < 1100) return;   // OpenStreetMap asks for at most 1 lookup per second
  _nearLastCall = Date.now();
  if (st) st.textContent = t('dir.near_looking', 'Looking up {place}...').replace('{place}', place);
  try {
    var r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(place), { headers: { 'Accept-Language': (document.documentElement.lang || 'en') } });
    var j = await r.json();
    if (!j || !j.length) { if (st) st.textContent = t('dir.near_notfound', 'Could not find "{place}". Try a town name or a postcode with the country.').replace('{place}', place); return; }
    _catNearSet(parseFloat(j[0].lat), parseFloat(j[0].lon), j[0].display_name.split(',').slice(0, 2).join(','));
  } catch (e) {
    if (st) st.textContent = t('dir.near_error', 'The place lookup is not available right now. Please try again.');
  }
}
function _catNearGeo() {
  var st = document.getElementById('cat-near-status');
  if (!navigator.geolocation) { if (st) st.textContent = t('dir.geo_unsupported', 'Your browser cannot share its location. Type a town instead.'); return; }
  if (st) st.textContent = t('dir.geo_asking', 'Asking your browser for your location...');
  navigator.geolocation.getCurrentPosition(function(pos) {
    _catNearSet(pos.coords.latitude, pos.coords.longitude, t('dir.your_location', 'your location'));
  }, function() {
    if (st) st.textContent = t('dir.geo_denied', 'Location was not shared. Type a town or postcode instead.');
  }, { timeout: 10000, maximumAge: 600000 });
}

function _setCatFilter(v) {
  var inp = document.getElementById('cat-filter');
  if (inp) { inp.value = (inp.value.trim().toLowerCase() === v.toLowerCase()) ? '' : v; _applyCatFilter(inp.value); inp.focus(); }
}

var _catFilterTimer = null;
// Listing picture: the organization's own share image (stored in listing-photos). '#contain' marks a
// logo, shown whole on white instead of cropped. Listings without one get a lettered placeholder.
function _dirThumbHtml(d, width) {
  var url = d.photo_url || '';
  if (url) {
    var logo = url.indexOf('#contain') !== -1;
    return '<img class="dir-thumb' + (logo ? ' is-logo' : '') + '" src="' + escUrl(_imgSized(url.split('#')[0], width || 160)) + '" alt="" loading="lazy" decoding="async" width="72" height="72">';
  }
  var letter = String(d.organization_name || '?').replace(/^(the|die|der|la|le|les|el|a)\s+/i, '').charAt(0).toUpperCase();
  return '<span class="dir-thumb ph" aria-hidden="true">' + esc(letter) + '</span>';
}

function _applyCatFilter(q) {
  var entries = window._catEntries || [];
  var box = document.getElementById('cat-entries');
  if (!box) return;
  q = String(q || '').trim().toLowerCase();
  var words = q.split(/\s+/).filter(Boolean);
  var list = !words.length ? entries : entries.filter(function(d) {
    var hay = [d.organization_name, d.description, d.location, d.country, (d.tags || []).join(' ')].join(' ').toLowerCase();
    return words.every(function(w) { return hay.indexOf(w) !== -1; });
  });
  var note = '';
  if (words.length && !list.length) {
    note = '<div class="empty-note">' + esc(t('dir.no_match_honest', 'No listings match "{q}".').replace('{q}', q))
      + ' <button type="button" class="dir-near-btn" onclick="_catNearSearch(\'' + escJs(q) + '\')">' + esc(t('dir.nearest_to', 'Show the nearest to {q}').replace('{q}', q)) + '</button>'
      + ' <button type="button" class="dir-near-btn" onclick="_setCatFilter(\'' + escJs(q) + '\')">' + esc(t('dir.see_all', 'See all {count}').replace('{count}', entries.length)) + '</button></div>';
    box.innerHTML = note;
    var cnt0 = document.getElementById('cat-count');
    if (cnt0) cnt0.textContent = t('dir.count_some', '{shown} of {count} listings').replace('{shown}', 0).replace('{count}', entries.length);
    return;
  }
  var near = window._catNear;
  if (near) {
    list = list.map(function(d) {
      var km = (d.latitude != null && d.longitude != null) ? _distKm(near.lat, near.lng, d.latitude, d.longitude) : null;
      return Object.assign({}, d, { _km: km });
    }).sort(function(a, b) { return (a._km == null) - (b._km == null) || (a._km || 0) - (b._km || 0); });
  }
  var cnt = document.getElementById('cat-count');
  if (cnt) cnt.textContent = list.length === entries.length
    ? t('dir.count_all', '{count} listings').replace('{count}', entries.length)
    : t('dir.count_some', '{shown} of {count} listings').replace('{shown}', list.length).replace('{count}', entries.length);
  document.querySelectorAll('.dir-chip').forEach(function(b) { b.classList.toggle('active', !!q && b.textContent.toLowerCase() === q); });
  var groupByCat = window._catGroupByCategory && !near;
  var html = note;
  var lastCat = null;
  list.forEach(function(d) {
    if (groupByCat && d.category !== lastCat) {
      lastCat = d.category;
      html += '<div class="dir-group-head">' + esc(_catLabel(d.category)) + '</div>';
    }
    var v = d.is_verified ? '<span class="dir-verified" title="Verified">&#10003;</span>' : '';
    var loc = [d.location, d.country].filter(Boolean).join(', ');
    if (d._km != null) loc = _fmtDist(d._km) + (loc ? ' · ' + loc : '');
    html += '<div class="dir-row">' + _dirThumbHtml(d) + '<div class="dir-row-body">'
      + '<div class="dir-row-main">' + v
      + '<a class="ltitle" href="/listing/' + esc(d.id) + '" onclick="showDetail(\'directory\',\'' + escJs(d.id) + '\');return false;">' + esc(d.organization_name) + '</a>'
      + (loc ? '<span class="lmeta">' + esc(loc) + '</span>' : '') + '</div>'
      + (d.description ? '<div class="dir-row-desc">' + esc(d.description.substring(0, 170)) + (d.description.length > 170 ? '...' : '') + '</div>' : '')
      + '</div></div>';
  });
  box.innerHTML = html;
  // Keep the URL in sync with the filter (no new history entries while typing)
  clearTimeout(_catFilterTimer);
  _catFilterTimer = setTimeout(function() {
    if (!/^\/(category|region)\//.test(location.pathname)) return;
    var url = location.pathname + (q ? '?q=' + encodeURIComponent(q) : '');
    if (url !== location.pathname + location.search) history.replaceState(Object.assign({}, history.state || {}, { q: q }), '', url);
  }, 400);
}

function _catLabel(slug) {
  var m = { waldorf: 'Waldorf & Education', biodynamic: 'Biodynamic Agriculture', eurythmy: 'Arts & Eurythmy', medicine: 'Anthroposophic Medicine',
    camphill: 'Camphill', community: 'Community', eldercare: 'Eldercare', online: 'Online Resources', social_media: 'Social Media', societies: 'Societies & Branches' };
  return m[slug] || slug;
}

// ── REGION & VERIFIED PAGES (sidebar "region" and "status" links used to run a text search) ──
var REGIONS = {
  'north-america': { label: 'North America', countries: ['USA', 'United States', 'Canada', 'Mexico'] },
  'latin-america': { label: 'Latin America', countries: ['Brazil', 'Argentina', 'Chile', 'Colombia', 'Peru', 'Mexico'] },
  'europe':        { label: 'Europe', countries: ['Germany', 'Switzerland', 'Austria', 'France', 'Netherlands', 'Norway', 'Sweden', 'Denmark', 'Finland', 'Italy', 'Spain', 'Czech Republic', 'Hungary', 'Romania', 'Estonia', 'Latvia', 'Russia', 'Belgium', 'Portugal', 'Poland', 'Lithuania', 'Luxembourg', 'Slovenia', 'Croatia', 'Georgia'] },
  'uk-ireland':    { label: 'UK & Ireland', countries: ['UK', 'United Kingdom', 'Ireland'] },
  'africa':        { label: 'Africa', countries: ['South Africa', 'Kenya', 'Tanzania', 'Botswana', 'Egypt', 'Namibia'] },
  'asia':          { label: 'Asia', countries: ['India', 'Japan', 'China', 'South Korea', 'Taiwan', 'Thailand', 'Philippines', 'Vietnam', 'Israel', 'Malaysia', 'Indonesia', 'Turkey'] },
  'australia-nz':  { label: 'Australia & New Zealand', countries: ['Australia', 'New Zealand'] },
  'international': { label: 'International & Online', countries: ['International', 'Online'] },
  'verified':      { label: 'Verified organizations', verified: true }
};

async function showRegion(key, skipPush, opts) {
  opts = opts || {};
  var r = REGIONS[key];
  if (!r) { showSec('directory', skipPush); return; }
  captureCurrentSection('category');
  var rLabel = t('region.' + key.replace(/-/g, '_'), r.label);
  document.getElementById('cat-page-label').textContent = rLabel;
  document.getElementById('cat-page-desc').textContent = r.verified
    ? t('region.verified_desc', 'Organizations whose details have been checked by the Sophia Commons team.')
    : t('region.desc', 'Anthroposophical schools, farms, clinics, communities and resources in {region}.').replace('{region}', rLabel);
  var container = document.getElementById('cat-page-content');
  container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">' + t('common.loading') + '</div>';
  showSec('category', true);
  var path = '/region/' + key + (opts.q ? '?q=' + encodeURIComponent(opts.q) : '');
  updateSEOMeta(rLabel + ' | Sophia Commons Directory', document.getElementById('cat-page-desc').textContent, '/region/' + key);
  if (!skipPush && location.pathname + location.search !== path) history.pushState({ type: 'region', key: key, q: opts.q || '' }, '', path);
  if (!sbReady()) { container.innerHTML = '<div class="empty-note">The directory is offline right now. Please try again shortly.</div>'; return; }
  try {
    var q = _sb.from('directory_entries')
      .select('id, organization_name, description, location, country, is_verified, tags, category, city, latitude, longitude, photo_url')
      .eq('status', 'approved');
    q = r.verified ? q.eq('is_verified', true) : q.in('country', r.countries);
    var res = await q.order('category').order('organization_name').limit(1000);
    var list = res.data || [];
    if (!list.length) {
      container.innerHTML = '<div class="empty-note">' + esc(t('region.empty', 'No listings here yet.')) + ' <a href="#" onclick="showSubmitForm();return false;">' + esc(t('region.add_first', 'Add the first one')) + '</a></div>';
      return;
    }
    window._catGroupByCategory = true;
    window._catEntries = list;
    container.innerHTML = _dirListShell(list, opts.q || '');
    _applyCatFilter(opts.q || '');
  } catch (e) {
    container.innerHTML = '<div class="empty-note">Could not load this region. Please try again.</div>';
  }
}

// ── ELDERCARE: real directory listings instead of placeholder names ──
var _eldercareLoaded = false;
async function loadEldercareLive() {
  if (_eldercareLoaded || !sbReady()) return;
  var box = document.getElementById('eldercare-live');
  if (!box) return;
  try {
    var res = await _sb.from('directory_entries')
      .select('id, organization_name, description, location, country, is_verified, tags, photo_url')
      .eq('status', 'approved').eq('category', 'eldercare').order('country').order('organization_name').limit(500);
    var list = res.data || [];
    if (!list.length) return;
    _eldercareLoaded = true;
    var byCountry = {};
    list.forEach(function(d) { var c = d.country || 'Other'; (byCountry[c] = byCountry[c] || []).push(d); });
    var html = '<div class="catgrid" style="margin-bottom:20px;">';
    Object.keys(byCountry).sort(function(a, b) { return byCountry[b].length - byCountry[a].length; }).forEach(function(c) {
      html += '<div class="catblock"><div class="catblock-head"><h3>' + esc(c) + '</h3><span class="alllink">' + byCountry[c].length + '</span></div><ul>'
        + byCountry[c].map(function(d) {
          return '<li><a href="/listing/' + esc(d.id) + '" onclick="showDetail(\'directory\',\'' + escJs(d.id) + '\');return false;">' + esc(d.organization_name) + (d.is_verified ? '<sup>&#10003;</sup>' : '') + '</a>'
            + (d.location ? ' <span class="lmeta">' + esc(d.location) + '</span>' : '') + '</li>';
        }).join('') + '</ul></div>';
    });
    html += '</div>';
    box.innerHTML = html;
    var cur = document.getElementById('eldercare-curated');
    if (cur) cur.style.display = 'none';
    var lbl = document.getElementById('eldercare-seclabel');
    if (lbl) lbl.innerHTML = esc(t('eldercare.label', 'Eldercare')) + ' &nbsp;&middot;&nbsp; ' + esc(t('eldercare.count_live', '{count} listings in {countries} countries').replace('{count}', list.length).replace('{countries}', Object.keys(byCountry).length));
  } catch (e) {}
}

// ── WIRE PLACEHOLDER LINKS ──
// About 150 links on Home / Browse / Eldercare pointed at "#" and either jumped to the Browse
// page or ran a free-text search for the link's words. Each now opens its parent category,
// pre-filtered to that topic, with a real, shareable URL.
var SUBCAT_QUERY = {
  'schools directory': '', 'center for anthroposophy': 'center for anthroposophy',
  'teacher training programs': 'teacher training', 'teacher training': 'teacher training',
  'curriculum resources': 'curriculum', 'tutoring & homeschool': 'homeschool', 'tutoring services': 'tutoring',
  'homeschool support': 'homeschool', 'csa farm shares': 'csa', 'farm apprenticeships': 'apprentice',
  'demeter-certified farms': 'demeter', 'demeter farms': 'demeter', 'seed suppliers': 'seed',
  'training programs': 'training', 'eurythmy training programs': 'training', 'eurythmy training': 'training',
  'performance companies': 'stage', 'classes & workshops': 'workshop', 'artistic commissions': 'art',
  'commissions': 'art', 'speech formation': 'speech', 'clinics & hospitals': 'clinic', 'practitioners directory': '',
  'practitioners': '', 'weleda products': 'weleda', 'wala remedies': 'wala', 'therapeutic eurythmy': 'therapeutic',
  'camphill communities': '', 'co-worker positions': 'co-worker', 'intentional communities': 'intentional',
  'volunteer opportunities': 'volunteer', 'study groups & circles': 'study', 'online courses': 'course',
  'reading circles': 'reading', 'lectures & seminars': 'lecture', 'meditation groups': 'meditation',
  'local branches': 'branch', 'seminars & retreats': 'seminar', 'youth groups': 'youth'
};
var HEAD_I18N_TO_CAT = {
  'catmeta.housing_name': 'housing & room rent', 'catmeta.online_name': 'online resources',
  'home.podcasts_media': 'podcasts & media', 'eldercare.senior_living': 'eldercare', 'eldercare.home_care': 'eldercare',
  'eldercare.biography_work': 'eldercare', 'eldercare.therapeutic': 'eldercare', 'eldercare.threshold': 'eldercare',
  'eldercare.training': 'eldercare'
};

function _catNameForBlock(block) {
  var h3 = block.querySelector('.catblock-head h3');
  if (!h3) return null;
  var m = (h3.getAttribute('onclick') || '').match(/showCategory\('([^']+)'/);
  if (m) return m[1];
  return HEAD_I18N_TO_CAT[h3.getAttribute('data-i18n')] || null;
}

function _catPath(name, q) {
  return '/category/' + _catSlug(name) + (q ? '?q=' + encodeURIComponent(q) : '');
}

function _wirePlaceholderLinks() {
  document.querySelectorAll('.catblock').forEach(function(block) {
    var name = _catNameForBlock(block);
    if (!name) return;
    var h3 = block.querySelector('.catblock-head h3');
    if (h3 && !h3.getAttribute('onclick')) {
      h3.style.cursor = 'pointer';
      h3.addEventListener('click', function() { showCategory(name); });
    }
    block.querySelectorAll('a[href="#"]').forEach(function(a) {
      var oc = a.getAttribute('onclick') || '';
      if (!/doSearch\(\)|showSec\('(browse|eldercare)'\)|^return false;?$/.test(oc)) return;
      var text = a.textContent.replace(/[\u2713\u2714\u2192]/g, '').trim().toLowerCase();
      var isAll = /^view all|^\d|^all /.test(text) || !text;
      var q = isAll ? '' : (SUBCAT_QUERY.hasOwnProperty(text) ? SUBCAT_QUERY[text] : text);
      a.removeAttribute('onclick');
      a.setAttribute('href', _catPath(name, q));
      a.addEventListener('click', function(e) {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault(); e.stopPropagation();
        showCategory(name, false, { q: q });
      });
    });
    // Count badges like "312 →" open the category too
    block.querySelectorAll('.catblock-head .alllink').forEach(function(b) {
      b.style.cursor = 'pointer';
      b.addEventListener('click', function(e) { e.stopPropagation(); showCategory(name); });
    });
  });

  // Sidebar region / status links
  var regionMap = { 'sidebar.region_north_america': 'north-america', 'sidebar.region_europe': 'europe',
    'sidebar.region_uk_ireland': 'uk-ireland', 'sidebar.region_australia_nz': 'australia-nz',
    'sidebar.region_international': 'international', 'sidebar.region_latin_america': 'latin-america',
    'sidebar.region_africa': 'africa', 'sidebar.region_asia': 'asia', 'sidebar.status_verified': 'verified' };
  Object.keys(regionMap).forEach(function(k) {
    document.querySelectorAll('[data-i18n="' + k + '"]').forEach(function(a) {
      var key = regionMap[k];
      a.removeAttribute('onclick');
      a.setAttribute('href', '/region/' + key);
      a.addEventListener('click', function(e) { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); showRegion(key); });
    });
  });
  document.querySelectorAll('[data-i18n="sidebar.status_all"]').forEach(function(a) {
    a.removeAttribute('onclick'); a.setAttribute('href', '/directory');
    a.addEventListener('click', function(e) { e.preventDefault(); showSec('directory'); });
  });
}
_wirePlaceholderLinks();

// Classified sections (Free & Sharing, Jobs, Housing, Marketplace) have no posts yet. Say so
// plainly and invite the first post, instead of showing invented counts.
async function _markEmptyClassifieds() {
  if (!sbReady()) return;
  try {
    var r = await _sb.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'active');
    if (r.error || (r.count || 0) > 0) return;
    document.querySelectorAll('.catblock').forEach(function(block) {
      var name = _catNameForBlock(block);
      var meta = name && catMeta[name.toLowerCase()];
      if (!meta || meta.dirCat || block.querySelector('.catblock-empty')) return;
      block.classList.add('is-empty');
      var badge = block.querySelector('.catblock-head .alllink');
      if (badge) { badge.hidden = false; badge.textContent = t('classifieds.new', 'new'); badge.classList.add('badge-new'); }
      block.insertAdjacentHTML('beforeend', '<div class="catblock-empty">' + esc(t('classifieds.no_posts', 'No posts yet.')) + ' <a href="#" onclick="showSubmitForm();return false;">' + esc(t('classifieds.post_first', 'Post the first one')) + '</a></div>');
    });
  } catch (e) {}
}

// Static headlines that only ran an empty search: on the News page they become plain text
// (there is no article to open yet); elsewhere they open the News page.
(function() {
  document.querySelectorAll('a[href="#"][onclick*="doSearch()"]').forEach(function(a) {
    if (a.closest('#leftbar')) return;
    if (a.closest('#sec-news')) {
      var span = document.createElement('span');
      span.className = a.className || 'ltitle';
      span.innerHTML = a.innerHTML;
      a.replaceWith(span);
    } else if (a.closest('.trendblock') || a.closest('.evrow')) {
      a.removeAttribute('onclick'); a.setAttribute('href', '/news');
      a.addEventListener('click', function(e) { e.preventDefault(); showSec('news'); });
    }
  });
})();

// Room message history (simulated, replace with Supabase realtime)
// (Removed: a set of invented sample conversations that were shown as real member messages
// whenever a room was empty.)
const roomHistory = {};

// ── NAVIGATION ──
// Section-to-path mapping for SEO-friendly URLs
const SEC_PATHS = {
  home: '/', news: '/news', events: '/events', browse: '/browse',
  directory: '/directory', books: '/books', podcasts: '/podcasts',
  memorial: '/memorial', eldercare: '/eldercare', blog: '/blog', privacy: '/privacy', terms: '/terms', about: '/about'
};
const PATH_TO_SEC = {};
Object.keys(SEC_PATHS).forEach(function(k) { PATH_TO_SEC[SEC_PATHS[k]] = k; });

function _getSecMeta() {
  return {
    home:      { title: t('meta.title', "Sophia Commons | Anthroposophical Community Directory"), desc: t('meta.og_description', 'The free global directory for the anthroposophical community. Find Waldorf schools, biodynamic farms, Camphill communities, eurythmy, anthroposophic medicine, events, and more.') },
    blog:      { title: t('meta.blog_title', 'Blog | Sophia Commons'), desc: t('meta.blog_desc', 'Articles and reflections from the anthroposophical community.') },
    news:      { title: t('meta.news_title', "News | Sophia Commons"), desc: t('meta.news_desc', 'Latest news from the anthroposophical world - Waldorf education, biodynamic agriculture, eurythmy, Camphill communities, and spiritual science.') },
    events:    { title: t('meta.events_title', "Events & Calendar | Sophia Commons"), desc: t('meta.events_desc', 'Upcoming anthroposophical events, conferences, workshops, study groups, and retreats worldwide.') },
    browse:    { title: t('meta.browse_title', "Browse Categories | Sophia Commons"), desc: t('meta.browse_desc', 'Browse Waldorf schools, biodynamic farms, Camphill communities, eurythmy programs, anthroposophic medicine, and more by category.') },
    directory: { title: t('meta.directory_title', "Global Directory | Sophia Commons"), desc: t('meta.directory_desc', 'Interactive map and directory of 430+ anthroposophical organizations across 30+ countries worldwide.') },
    books:     { title: t('meta.books_title', 'Books & Library | Sophia Commons'), desc: t('meta.books_desc', 'Rudolf Steiner catalog and the top 50 anthroposophical books.') },
    podcasts:  { title: t('meta.podcasts_title', 'Podcasts & Media | Sophia Commons'), desc: t('meta.podcasts_desc', 'Anthroposophical podcasts, YouTube channels, archives and media.') },
    memorial:  { title: t('meta.memorial_title', "In Memoriam | Sophia Commons"), desc: t('meta.memorial_desc', 'Honoring members of the anthroposophical community who have crossed the threshold.') },
    marketplace: { title: t('meta.marketplace_title', "Marketplace | Sophia Commons"), desc: t('meta.marketplace_desc', 'Buy, sell, share and swap within the anthroposophical community: books, crafts, biodynamic goods and more.') },
    about:     { title: 'About | Sophia Commons', desc: 'Sophia Commons is a free, community-maintained directory for the anthroposophical world.' },
    privacy:   { title: 'Privacy | Sophia Commons', desc: 'What Sophia Commons collects, why, and how to have your data corrected or deleted.' },
    terms:     { title: 'Terms of use | Sophia Commons', desc: 'The simple terms for using and contributing to the Sophia Commons directory.' }
  };
}
var SEC_META = null;

function updateSEOMeta(title, desc, path) {
  document.title = title;
  var metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute('content', desc);
  var ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute('content', title);
  var ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogDesc) ogDesc.setAttribute('content', desc);
  var twTitle = document.querySelector('meta[name="twitter:title"]');
  if (twTitle) twTitle.setAttribute('content', title);
  var twDesc = document.querySelector('meta[name="twitter:description"]');
  if (twDesc) twDesc.setAttribute('content', desc);
  var fullUrl = 'https://sophiacommons.org' + (path || '/');
  var canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) canonical.setAttribute('href', fullUrl);
  var ogUrl = document.querySelector('meta[property="og:url"]');
  if (ogUrl) ogUrl.setAttribute('content', fullUrl);
  var twUrl = document.querySelector('meta[name="twitter:url"]');
  if (twUrl) twUrl.setAttribute('content', fullUrl);
}

function showSec(id, skipPush) {
  var oldLd = document.getElementById('detail-jsonld'); if (oldLd) oldLd.remove();
  // News lives inside the combined News & Events page
  var _toNews = (id === 'news');
  if (_toNews) id = 'events';
  if (!document.getElementById('sec-' + id)) id = 'home';
  document.querySelectorAll('.pagesec').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('#mainnav button').forEach(b => b.classList.remove('active'));
  document.getElementById('sec-' + id).classList.add('active');
  const btn = document.getElementById('nav-' + id);
  if (btn) btn.classList.add('active');
  window.scrollTo(0,0);
  if (id === 'directory' && !mapLoaded) loadMap();
  if (id === 'eldercare') loadEldercareLive();
  // Sections that are not built at startup render when first opened (and refresh on later opens)
  if (id === 'events') { renderCalendar(); renderEventList(); renderSeminars(); }
  if (id === 'books' && typeof renderTop50Books === 'function') renderTop50Books();
  if (id === 'podcasts' && typeof renderYouTubeChannels === 'function') renderYouTubeChannels();
  if (id === 'blog' && typeof loadBlogList === 'function') loadBlogList();
  if (id === 'admin') { if (!isAdmin()) { showSec('home'); return; } initAdminPanel(); }
  if (_toNews) setTimeout(function() { var n = document.getElementById('sec-news'); if (n) n.scrollIntoView({ block: 'start' }); }, 50);
  const leftbar = document.getElementById('leftbar');
  const hamburger = document.getElementById('hamburger-btn');
  const ov = document.getElementById('menu-overlay');
  if (leftbar) leftbar.classList.remove('mobile-open');
  if (hamburger) hamburger.classList.remove('active');
  if (ov) ov.classList.remove('active');
  // Update SEO meta
  var secMeta = _getSecMeta();
  var meta = secMeta[id];
  if (meta) updateSEOMeta(meta.title, meta.desc, SEC_PATHS[id] || '/');
  // Push SEO-friendly URL
  if (!skipPush && SEC_PATHS.hasOwnProperty(id)) {
    var path = SEC_PATHS[id];
    if (window.location.pathname !== path) {
      history.pushState({ type: 'section', id: id }, '', path);
    }
  }
}

function handleChat() {
  showSec('chat');
  if (!signedIn) openModal();
}

// ── MOBILE MENU ──
function toggleMobileMenu() {
  var lb = document.getElementById('leftbar');
  var hb = document.getElementById('hamburger-btn');
  var ov = document.getElementById('menu-overlay');
  lb.classList.toggle('mobile-open');
  hb.classList.toggle('active');
  if (ov) ov.classList.toggle('active');
  var expanded = lb.classList.contains('mobile-open');
  hb.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  hb.setAttribute('aria-label', expanded ? t('a11y.close_nav') : t('a11y.open_nav'));
}

// ── STICKY NAV SCROLL ──
var _scrollTicking = false;
window.addEventListener('scroll', () => {
  if (!_scrollTicking) {
    _scrollTicking = true;
    requestAnimationFrame(() => {
      const header = document.getElementById('site-header');
      if (header) header.classList.toggle('scrolled', window.scrollY > 50);
      _scrollTicking = false;
    });
  }
});

// ── SCROLL ANIMATIONS ──
document.addEventListener('DOMContentLoaded', () => {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
  document.querySelectorAll('.reveal').forEach(el => _armReveal(el, observer));
});

// Fade in only boxes that start below the first screen; anything already in view stays as painted.
function _armReveal(el, observer) {
  if (el.classList.contains('visible')) return;
  if (el.getBoundingClientRect().top < window.innerHeight) { el.classList.add('visible'); return; }
  el.classList.add('armed');
  observer.observe(el);
}

// ── SPA ROUTER (SEO-friendly URLs) ──
function routeFromPath(pathname, isPopstate) {
  var p = pathname || '/';
  var skip = true; // never pushState when routing from URL

  // Section routes
  if (PATH_TO_SEC[p]) {
    showSec(PATH_TO_SEC[p], skip);
    return;
  }

  // Category route: /category/:slug
  var catMatch = p.match(/^\/category\/([^\/]+)$/);
  if (catMatch) {
    var catRaw = catMatch[1];
    try { catRaw = decodeURIComponent(catRaw); } catch (e) {}
    var catName = catRaw.replace(/-/g, ' ');
    var qp = new URLSearchParams(window.location.search).get('q') || '';
    showCategory(catName, skip, { q: qp });
    return;
  }

  // Newsletter confirmation / unsubscribe links
  var nlMatch = p.match(/^\/newsletter\/(confirm|unsubscribe)$/);
  if (nlMatch) {
    handleNewsletterLink(nlMatch[1], new URLSearchParams(window.location.search).get('t') || '');
    return;
  }

  // Region route: /region/:key  (also /region/verified)
  var regMatch = p.match(/^\/region\/([a-z-]+)$/);
  if (regMatch) {
    showRegion(regMatch[1], skip, { q: new URLSearchParams(window.location.search).get('q') || '' });
    return;
  }

  // Blog article: /blog/:slug
  var blogMatch = p.match(/^\/blog\/([a-z0-9-]+)$/);
  if (blogMatch && typeof showBlogPost === 'function') { showBlogPost(blogMatch[1], skip); return; }

  // Memorial route: /memorial/:slug
  var memMatch = p.match(/^\/memorial\/([^\/]+)$/);
  if (memMatch) {
    var slug = memMatch[1];
    try { slug = decodeURIComponent(slug); } catch (e) {}
    showMemorialDetail(_memorialNameFromSlug(slug), skip);
    return;
  }

  // Detail routes: /listing/:id, /event/:id, /article/:id, /classified/:id
  var detailMatch = p.match(/^\/(listing|event|article|classified)\/([^\/]+)$/);
  if (detailMatch) {
    var typeMap = { listing: 'directory', event: 'event', article: 'news', classified: 'listing' };
    showDetail(typeMap[detailMatch[1]], detailMatch[2], skip);
    return;
  }

  // Fallback: show home
  showSec('home', skip);
}

// Handle browser back/forward
window.addEventListener('popstate', function(e) {
  if (e.state) {
    if (e.state.type === 'section') {
      showSec(e.state.id, true);
    } else if (e.state.type === 'detail') {
      showDetail(e.state.detailType, e.state.detailId, true);
    } else if (e.state.type === 'blog' && typeof showBlogPost === 'function') {
      showBlogPost(e.state.slug, true);
    } else if (e.state.type === 'memorial') {
      showMemorialDetail(e.state.name, true);
    } else if (e.state.type === 'region') {
      showRegion(e.state.key, true, { q: e.state.q || '' });
    } else if (e.state.type === 'category') {
      showCategory(e.state.name, true, { q: e.state.q || '' });
    } else {
      routeFromPath(window.location.pathname, true);
    }
  } else {
    routeFromPath(window.location.pathname, true);
  }
});

// Route on initial page load
document.addEventListener('DOMContentLoaded', function() {
  // Replace current state so back button works from the initial page
  var p = window.location.pathname;
  if (PATH_TO_SEC[p]) {
    history.replaceState({ type: 'section', id: PATH_TO_SEC[p] }, '', p);
  }
  // Only route if not on root (home is default)
  if (p !== '/') {
    routeFromPath(p, false);
  }
});

// ── MODAL ──
var _modalReturnFocus = null;
function openModal() {
  _modalReturnFocus = document.activeElement;
  document.getElementById('modal-overlay').classList.add('open');
  setTimeout(() => document.getElementById('login-email').focus(), 80);
}
function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  if (_modalReturnFocus && _modalReturnFocus.focus) { try { _modalReturnFocus.focus(); } catch (e) {} }
  _modalReturnFocus = null;
}
// Escape closes any open dialog / popup
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Escape') return;
  var mo = document.getElementById('modal-overlay');
  if (mo && mo.classList.contains('open')) { closeModal(); return; }
  if (document.querySelector('.day-popup')) { closeDayPopup(); return; }
  document.querySelectorAll('.modal-overlay.open, .overlay.open, [id$="-overlay"].open').forEach(function(el) { el.classList.remove('open'); });
  var rm = document.getElementById('report-modal');
  if (rm && rm.style.display && rm.style.display !== 'none') closeReportModal();
  var so = document.getElementById('submit-overlay');
  if (so && so.style.display && so.style.display !== 'none') so.style.display = 'none';
  var lb = document.getElementById('leftbar');
  if (lb && lb.classList.contains('mobile-open')) toggleMobileMenu();
});
// Keep Tab focus inside an open dialog (sign-in, report)
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Tab') return;
  var dlg = null;
  var mo = document.getElementById('modal-overlay');
  if (mo && mo.classList.contains('open')) dlg = document.getElementById('modal-box');
  var rm = document.getElementById('report-modal');
  if (!dlg && rm && rm.style.display && rm.style.display !== 'none') dlg = rm.querySelector('.report-modal-content');
  if (!dlg) dlg = document.querySelector('.day-popup');
  if (!dlg) return;
  var f = Array.prototype.filter.call(dlg.querySelectorAll('a[href], button:not([disabled]), input:not([type="hidden"]), select, textarea'),
    function(el) { return el.offsetParent !== null; });
  if (!f.length) return;
  var first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  else if (!dlg.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
});

// Keyboard access for clickable rows/cards rendered as <div onclick>
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  var el = e.target;
  if (!el || !el.matches || !el.matches('[data-kbd-click]')) return;
  e.preventDefault();
  el.click();
});
function _enhanceClickables(root) {
  (root || document).querySelectorAll('.lrow[onclick], .evrow[onclick], .detail-related-card[onclick], .memorial-card[onclick], .mp-card[onclick], .mc-d.has-event[onclick]').forEach(function(el) {
    if (el.hasAttribute('data-kbd-click')) return;
    el.setAttribute('data-kbd-click', '');
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
  });
}
if (window.MutationObserver) {
  var _kbdPending = false;
  new MutationObserver(function() {
    if (_kbdPending) return; _kbdPending = true;
    requestAnimationFrame(function() { _kbdPending = false; _enhanceClickables(document); });
  }).observe(document.body, { childList: true, subtree: true });
}
document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
});

// ── AUTH ──
let authMode = 'signin';

function toggleAuthMode(e) {
  if (e) e.preventDefault();
  const errEl = document.getElementById('auth-error');
  errEl.style.display = 'none';
  if (authMode === 'signin') {
    authMode = 'signup';
    document.getElementById('modal-title').textContent = t('modal.title_signup');
    document.getElementById('modal-desc').textContent = t('modal.desc_signup');
    document.getElementById('auth-btn').textContent = t('modal.btn_signup');
    document.getElementById('toggle-signup').style.display = 'none';
    document.getElementById('toggle-signin').style.display = 'inline';
  } else {
    authMode = 'signin';
    document.getElementById('modal-title').textContent = t('modal.title_signin');
    document.getElementById('modal-desc').textContent = t('modal.desc_signin');
    document.getElementById('auth-btn').textContent = t('modal.btn_signin');
    document.getElementById('toggle-signup').style.display = 'inline';
    document.getElementById('toggle-signin').style.display = 'none';
  }
}

async function doSignIn() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-pass').value;
  const errEl = document.getElementById('auth-error');
  errEl.style.display = 'none';

  if (!email) { document.getElementById('login-email').focus(); return; }
  if (!password || password.length < 6) {
    errEl.textContent = t('auth.password_min');
    errEl.style.display = 'block';
    return;
  }

  if (!sbReady()) {
    errEl.textContent = t('auth.service_unavailable');
    errEl.style.display = 'block';
    return;
  }

  const btn = document.getElementById('auth-btn');
  btn.disabled = true;
  btn.textContent = authMode === 'signin' ? t('auth.signing_in') : t('auth.creating_account');

  let result;
  if (authMode === 'signup') {
    result = await _sb.auth.signUp({ email, password });
  } else {
    result = await _sb.auth.signInWithPassword({ email, password });
  }

  btn.disabled = false;
  btn.textContent = authMode === 'signin' ? t('modal.btn_signin') : t('modal.btn_signup');

  if (result.error) {
    errEl.textContent = result.error.message;
    errEl.style.display = 'block';
    return;
  }

  // If signup succeeded but no session, auto-sign in
  if (authMode === 'signup' && !result.data.session) {
    result = await _sb.auth.signInWithPassword({ email, password });
    if (result.error) {
      errEl.textContent = result.error.message;
      errEl.style.display = 'block';
      return;
    }
  }

  username = email.split('@')[0];
  signedIn = true;
  closeModal();
  applySignedInState();
}

function applySignedInState() {
  document.getElementById('uname').textContent = username;
  document.getElementById('user-chip').style.display = 'inline';
  document.getElementById('signin-link').style.display = 'none';
  document.getElementById('nav-chat').classList.remove('locked');
  document.getElementById('chat-uname').textContent = username;
  document.getElementById('chat-signedin').classList.add('vis');
  document.getElementById('chat-gate-wrap').style.display = 'none';
  document.getElementById('chat-app').classList.add('vis');
  document.getElementById('chat-input').placeholder = t('chat.input_placeholder').replace('{room}', 'general').replace('{username}', username);
  scrollMsgs();
  updateAdminVisibility();
}

async function doSignOut() {
  if (sbReady()) await _sb.auth.signOut();
  signedIn = false; username = '';
  document.getElementById('user-chip').style.display = 'none';
  document.getElementById('signin-link').style.display = 'inline';
  document.getElementById('nav-chat').classList.add('locked');
  document.getElementById('chat-signedin').classList.remove('vis');
  document.getElementById('chat-gate-wrap').style.display = 'block';
  document.getElementById('chat-app').classList.remove('vis');
  updateAdminVisibility();
  showSec('home');
}

async function doPasswordReset(e) {
  if (e) e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const errEl = document.getElementById('auth-error');
  if (!email || !email.includes('@')) {
    errEl.textContent = t('auth.reset_prompt');
    errEl.style.display = 'block';
    return;
  }
  if (!sbReady()) return;
  await _sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin
  });
  errEl.style.display = 'none';
  document.getElementById('modal-desc').textContent = t('auth.reset_sent');
}

// Auto-restore session on page load
function _applyAuthDetail(detail) {
  if (!detail || signedIn) return;
  username = detail.username;
  signedIn = true;
  applySignedInState();
}
window.addEventListener('supabase-auth-ready', function(e) { _applyAuthDetail(e.detail); });
// The session check in index.html can finish before this (large) script has loaded,
// in which case the event above was missed. Apply the stored session now.
if (window._scAuthDetail) _applyAuthDetail(window._scAuthDetail);

// ── CHAT ──
let currentRoom = 'general';
let chatSubscription = null;
let presenceChannel = null;
let typingTimeout = null;
let typingUsers = {};

function _renderMsg(m, isMine, msgId) {
  var deleteBtn = isMine && msgId && String(msgId).indexOf('tmp-') !== 0 ? '<button class="msg-delete" onclick="deleteMsg(\'' + escJs(msgId) + '\',this)" title="Delete message" aria-label="Delete message">&times;</button>' : '';
  var cls = isMine ? 'msg mine' : 'msg';
  var av = String(m.av || '').replace(/&[a-z#0-9]+;/gi, '').charAt(0) || '?';
  return '<div class="' + cls + '" data-msg-id="' + esc(msgId || '') + '"><div class="av" aria-hidden="true">' + esc(av) + '</div><div class="bub"><div class="bmeta"><span class="nm">' + esc(m.nm) + '</span>' + esc(m.t) + deleteBtn + '</div><div class="btxt">' + esc(m.txt) + '</div></div></div>';
}

async function switchRoom(el, name, desc, count) {
  document.querySelectorAll('.ritem').forEach(r => r.classList.remove('active'));
  el.classList.add('active');
  const b = el.querySelector('.unread'); if (b) b.remove();
  currentRoom = name;
  document.getElementById('room-title').textContent = '# ' + name;
  document.getElementById('room-desc').textContent = desc;
  document.getElementById('chat-input').placeholder = t('chat.input_placeholder').replace('{room}', name).replace('{username}', username);
  const msgs = document.getElementById('messages');
  var typingEl = document.getElementById('typing-indicator');
  if (typingEl) typingEl.textContent = '';
  typingUsers = {};

  let hist = [];
  try {
    const { data, error } = await _sb
      .from('chat_messages')
      .select('*')
      .eq('room', name)
      .order('created_at', { ascending: true })
      .limit(50);
    if (!error && data && data.length > 0) {
      var uid = window._supabaseUser ? window._supabaseUser.id : null;
      hist = data.map(m => ({
        av: (m.username || 'U')[0].toUpperCase(),
        nm: m.username || 'User',
        t: new Date(m.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}),
        txt: m.content,
        id: m.id,
        mine: uid && m.user_id === uid
      }));
    } else {
      hist = (roomHistory[name] || []).map(m => Object.assign({}, m, {id: null, mine: false}));
    }
  } catch(e) {
    hist = (roomHistory[name] || []).map(m => Object.assign({}, m, {id: null, mine: false}));
  }

  msgs.innerHTML = (hist.length ? '' : '<div class="chat-empty">' + esc(t('chat.empty_room', 'No messages here yet. Say hello and start the conversation.')) + '</div>')
    + hist.map(m => _renderMsg(m, m.mine, m.id)).join('')
    + '<div class="msg sys"><div class="av">&middot;</div><div class="bub"><div class="btxt">' + t('chat.you_joined').replace('{room}', name) + '</div></div></div>';
  scrollMsgs();

  // Clean up previous subscriptions
  if (chatSubscription && sbReady()) { _sb.removeChannel(chatSubscription); }
  if (presenceChannel && sbReady()) { _sb.removeChannel(presenceChannel); }
  if (!sbReady()) return;

  // Real-time messages (INSERT + DELETE)
  chatSubscription = _sb
    .channel('room-' + name)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'chat_messages',
      filter: 'room=eq.' + name
    }, (payload) => {
      const m = payload.new;
      if (m.user_id && window._supabaseUser && m.user_id === window._supabaseUser.id) return;
      var msg = {
        av: (m.username || 'U')[0].toUpperCase(),
        nm: m.username || 'User',
        t: new Date(m.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}),
        txt: m.content
      };
      var ce1 = document.querySelector('#messages .chat-empty'); if (ce1) ce1.remove();
      document.getElementById('messages').insertAdjacentHTML('beforeend', _renderMsg(msg, false, m.id));
      scrollMsgs();
    })
    .on('postgres_changes', {
      event: 'DELETE',
      schema: 'public',
      table: 'chat_messages',
      filter: 'room=eq.' + name
    }, (payload) => {
      var el = document.querySelector('[data-msg-id="' + payload.old.id + '"]');
      if (el) el.remove();
    })
    .subscribe();

  // Presence tracking (real online count)
  presenceChannel = _sb.channel('presence-' + name, { config: { presence: { key: username || 'anon' } } });
  presenceChannel.on('presence', { event: 'sync' }, () => {
    var state = presenceChannel.presenceState();
    var onlineCount = Object.keys(state).length;
    document.getElementById('online-ct').textContent = String.fromCharCode(9679) + ' ' + t('chat.online_count').replace('{count}', onlineCount);
  });
  // Typing indicator via broadcast
  presenceChannel.on('broadcast', { event: 'typing' }, (payload) => {
    var who = payload.payload.username;
    if (who === username) return;
    typingUsers[who] = Date.now();
    _updateTypingIndicator();
    setTimeout(function() { delete typingUsers[who]; _updateTypingIndicator(); }, 3000);
  });
  presenceChannel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await presenceChannel.track({ username: username, online_at: new Date().toISOString() });
    }
  });
}

function _updateTypingIndicator() {
  var el = document.getElementById('typing-indicator');
  if (!el) return;
  var names = Object.keys(typingUsers);
  if (names.length === 0) { el.textContent = ''; return; }
  if (names.length === 1) { el.textContent = names[0] + ' ' + t('chat.is_typing'); return; }
  if (names.length === 2) { el.textContent = names[0] + ' ' + t('chat.and') + ' ' + names[1] + ' ' + t('chat.are_typing'); return; }
  el.textContent = t('chat.several_typing');
}

function broadcastTyping() {
  if (!presenceChannel || !username) return;
  if (typingTimeout) clearTimeout(typingTimeout);
  presenceChannel.send({ type: 'broadcast', event: 'typing', payload: { username: username } });
  typingTimeout = setTimeout(function() { typingTimeout = null; }, 2000);
}

async function deleteMsg(msgId, btn) {
  if (!msgId || !sbReady()) return;
  try {
    var res = await _sb.from('chat_messages').delete().eq('id', msgId).select('id');
    if (res.error || !res.data || !res.data.length) {
      alert('This message could not be deleted.');
      return;
    }
    var row = btn.closest('.msg');
    if (row) row.remove();
  } catch(e) { console.warn('Delete failed:', e); }
}

async function sendMsg() {
  const inp = document.getElementById('chat-input');
  const txt = inp.value.trim(); if (!txt) return;
  const msgs = document.getElementById('messages');
  const time = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  var uid = window._supabaseUser ? window._supabaseUser.id : null;

  var tmpId = 'tmp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  var tmpMsg = {av: (username[0] || '?').toUpperCase(), nm: username, t: time, txt: txt};
  var ce0 = msgs.querySelector('.chat-empty'); if (ce0) ce0.remove();
  msgs.insertAdjacentHTML('beforeend', _renderMsg(tmpMsg, true, tmpId));
  inp.value = ''; scrollMsgs();
  var pending = msgs.querySelector('[data-msg-id="' + tmpId + '"]');

  try {
    if (!sbReady()) throw new Error('offline');
    var { data, error } = await _sb.from('chat_messages').insert({
      room: currentRoom,
      username: username,
      user_id: uid,
      content: txt
    }).select().single();
    if (error) throw error;
    // Update this message's placeholder id with the real one (unique per send)
    if (pending && data) {
      pending.setAttribute('data-msg-id', data.id);
      var bm = pending.querySelector('.bmeta');
      if (bm && !bm.querySelector('.msg-delete')) bm.insertAdjacentHTML('beforeend', '<button class="msg-delete" onclick="deleteMsg(\'' + escJs(data.id) + '\',this)" title="Delete message" aria-label="Delete message">&times;</button>');
    }
  } catch(e) {
    console.warn('Chat insert failed:', e);
    if (pending) {
      pending.classList.add('failed');
      var meta = pending.querySelector('.bmeta');
      if (meta) meta.insertAdjacentHTML('beforeend', ' <span class="msg-failed" role="status">not sent</span>');
    }
  }
}
function scrollMsgs() { const m = document.getElementById('messages'); m.scrollTop = m.scrollHeight; }
// Escape text for safe use in HTML content AND attribute values (quotes included).
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/`/g,'&#96;');
}
// Only allow http(s), mailto and tel links; anything else (javascript:, data:) becomes '#'.
function safeUrl(u) {
  if (!u) return '#';
  try {
    var parsed = new URL(String(u).trim(), window.location.origin);
    return /^(https?|mailto|tel):$/.test(parsed.protocol) ? parsed.href : '#';
  } catch (e) { return '#'; }
}
function escUrl(u) { return esc(safeUrl(u)); }
// Escape a value for use inside a single-quoted JS string within an HTML attribute.
function escJs(s) {
  return esc(String(s === null || s === undefined ? '' : s).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\r?\n/g,' '));
}

// ── MEMORIAL SEARCH & DIRECTORY ──
function filterMemorials() {
  const q = document.getElementById('memorial-search').value.trim().toLowerCase();
  const cards = document.querySelectorAll('.memorial-card');
  let visible = 0;
  cards.forEach(card => {
    const name = (card.getAttribute('data-name') || '').toLowerCase();
    const text = card.textContent.toLowerCase();
    if (!q || name.includes(q) || text.includes(q)) {
      card.style.display = '';
      visible++;
    } else {
      card.style.display = 'none';
    }
  });
  document.getElementById('memorial-count').textContent = t('memorial.showing_count').replace('{count}', visible);
}

// ══════════════════════════════════════════
//  MEMORIAL DETAIL PROFILES
// ══════════════════════════════════════════

var MEMORIAL_PROFILES = {
  'Rudolf Steiner': {
    name: 'Rudolf Steiner',
    years: '1861 \u2013 1925',
    born: 'February 27, 1861 \u2014 Kraljevec, Austria-Hungary (now Croatia)',
    died: 'March 30, 1925 \u2014 Dornach, Switzerland',
    photo: 'https://upload.wikimedia.org/wikipedia/commons/f/f5/Steiner_um_1905.jpg',
    summary: 'Founder of anthroposophy, Waldorf education, biodynamic agriculture, and anthroposophic medicine.',
    bio: '<p>Rudolf Joseph Lorenz Steiner was an Austrian philosopher, social reformer, architect, esotericist, and claimed clairvoyant. He gained initial recognition at the end of the nineteenth century as a literary critic and published philosophical works including <em>The Philosophy of Freedom</em> (1894).</p>'
      + '<p>At the beginning of the twentieth century he founded a spiritual movement \u2014 anthroposophy \u2014 with roots in German idealist philosophy and theosophy. He characterized it as a path of knowledge leading from the spiritual in the human being to the spiritual in the universe.</p>'
      + '<p>Steiner\'s work led to innovations in education (Waldorf schools, now numbering over 1,000 worldwide), agriculture (biodynamic farming), medicine (anthroposophic medicine), special education (the Camphill movement), economics (threefold social order), drama, speech, and the movement art of eurythmy.</p>'
      + '<p>He designed 17 buildings, including the First and Second Goetheanum in Dornach, Switzerland, which remains the world center of the anthroposophical movement. His collected works comprise approximately 350 volumes of lectures and 30 written books.</p>',
    contributions: ['Anthroposophy', 'Waldorf Education', 'Biodynamic Agriculture', 'Anthroposophic Medicine', 'Eurythmy', 'Threefold Social Order', 'Goethean Science'],
    works: ['The Philosophy of Freedom (1894)', 'Theosophy (1904)', 'How to Know Higher Worlds (1904)', 'An Outline of Esoteric Science (1910)', 'The Calendar of the Soul (1912)']
  },
  'Marie Steiner-von Sivers': {
    name: 'Marie Steiner-von Sivers',
    years: '1867 \u2013 1948',
    born: 'March 14, 1867 \u2014 W\u0142oc\u0142awek, Congress Poland (Russian Empire)',
    died: 'December 27, 1948 \u2014 Beatenberg, Switzerland',
    photo: 'https://upload.wikimedia.org/wikipedia/commons/e/e8/Marie_Steiner.jpg',
    summary: 'Co-worker of Rudolf Steiner and guardian of his literary estate.',
    bio: '<p>Marie Steiner-von Sivers was born into a Baltic German family. She studied drama and recitation in Paris before meeting Rudolf Steiner in 1900. She became his closest collaborator and they married in 1914.</p>'
      + '<p>Marie played a central role in the development of the Anthroposophical Society. She organized Steiner\'s extensive lecture tours, managed the society\'s publications, and developed speech formation (<em>Sprachgestaltung</em>) and dramatic arts as spiritual disciplines rooted in anthroposophy.</p>'
      + '<p>After Rudolf Steiner\'s death in 1925, Marie devoted herself to preserving and publishing his literary estate, ensuring that his approximately 6,000 lectures and numerous written works would be made available to future generations. She founded the Rudolf Steiner Nachlassverwaltung (Estate Administration).</p>'
      + '<p>Her work in artistic speech and drama laid the foundations for the development of these arts within the anthroposophical movement, influencing Waldorf education and therapeutic practices worldwide.</p>',
    contributions: ['Speech Formation (Sprachgestaltung)', 'Dramatic Arts', 'Steiner Literary Estate Preservation', 'Anthroposophical Society Leadership'],
    works: ['Correspondence and Documents 1901\u20131925 (with Rudolf Steiner)', 'Rudolf Steiner and the Rediscovery of the Mysteries']
  },
  'Ita Wegman': {
    name: 'Ita Wegman',
    years: '1876 \u2013 1943',
    born: 'February 22, 1876 \u2014 Karawang, Dutch East Indies (now Indonesia)',
    died: 'March 4, 1943 \u2014 Arlesheim, Switzerland',
    photo: 'https://upload.wikimedia.org/wikipedia/commons/6/60/Ita_Wegman_1899.jpg',
    summary: 'Co-founder of anthroposophic medicine alongside Rudolf Steiner.',
    bio: '<p>Ita Wegman was born in the Dutch East Indies (present-day Indonesia) to a Dutch colonial family. She studied medicine in Zurich, becoming one of the early women physicians in Switzerland, and obtained her medical degree in 1911.</p>'
      + '<p>She met Rudolf Steiner in 1902 and became deeply involved in anthroposophy. Together with Steiner, she developed anthroposophic medicine \u2014 an integrative approach combining conventional medicine with spiritual insights. They co-authored <em>Fundamentals of Therapy</em> (1925).</p>'
      + '<p>In 1921, she founded the Klinisch-Therapeutisches Institut (Clinical-Therapeutic Institute) in Arlesheim, Switzerland \u2014 the first anthroposophic clinic, which continues today as the Ita Wegman Klinik. She also helped develop curative eurythmy as a therapeutic practice.</p>'
      + '<p>After Steiner\'s death, she served on the Executive Council of the General Anthroposophical Society and continued expanding anthroposophic medicine internationally until her death in 1943.</p>',
    contributions: ['Anthroposophic Medicine', 'Ita Wegman Clinic (Arlesheim)', 'Curative Eurythmy', 'Mistletoe Therapy (Iscador)'],
    works: ['Fundamentals of Therapy (with Rudolf Steiner, 1925)', 'An die Freunde (To the Friends)']
  },
  'Ehrenfried Pfeiffer': {
    name: 'Ehrenfried Pfeiffer',
    years: '1899 \u2013 1961',
    born: 'February 19, 1899 \u2014 Munich, Germany',
    died: 'November 30, 1961 \u2014 Spring Valley, New York, USA',
    photo: null,
    summary: 'Pioneer of biodynamic agriculture in North America.',
    bio: '<p>Ehrenfried Pfeiffer was a soil scientist, author, and leading figure in the biodynamic agriculture movement. As a young man he was personally mentored by Rudolf Steiner, who entrusted him with the practical development of biodynamic farming methods.</p>'
      + '<p>Pfeiffer developed sensitive crystallization methods for evaluating soil and food quality, known as the "Pfeiffer Crystallization Method." This technique uses copper chloride crystallization to assess the vitality and life forces in biological substances.</p>'
      + '<p>He emigrated to the United States in 1933 and established the Threefold Farm in Spring Valley, New York, one of the first biodynamic farms in North America. He also founded a biochemical research laboratory and worked extensively on composting methods.</p>'
      + '<p>His book <em>Bio-Dynamic Farming and Gardening</em> (1938) was instrumental in spreading biodynamic practices throughout the English-speaking world. He trained countless farmers and gardeners in biodynamic methods until his death in 1961.</p>',
    contributions: ['Biodynamic Agriculture in North America', 'Pfeiffer Crystallization Method', 'Threefold Farm', 'Composting Research'],
    works: ['Bio-Dynamic Farming and Gardening (1938)', 'The Earth\'s Face and Human Destiny (1947)', 'Sensitive Crystallization Processes (1936)', 'Soil Fertility, Renewal, and Preservation (1947)']
  },
  'Karl K\u00f6nig': {
    name: 'Karl K\u00f6nig',
    years: '1902 \u2013 1966',
    born: 'September 25, 1902 \u2014 Vienna, Austria',
    died: 'March 27, 1966 \u2014 \u00dcberlingen am Bodensee, Germany',
    photo: null,
    summary: 'Founder of the Camphill movement.',
    bio: '<p>Karl K\u00f6nig was an Austrian pediatrician, educator, and social innovator who founded the Camphill movement \u2014 a worldwide network of intentional communities for people with developmental disabilities.</p>'
      + '<p>Born into a Jewish family in Vienna, K\u00f6nig studied medicine and became interested in curative education through anthroposophy. After the Anschluss in 1938, he fled Austria and eventually settled in Scotland.</p>'
      + '<p>In 1940, he established the first Camphill community at Camphill House near Aberdeen, Scotland, with a group of young Austrian refugees. The community was founded on the principle that every human being, regardless of disability, has inherent dignity and spiritual potential.</p>'
      + '<p>The Camphill movement grew to encompass over 100 communities in more than 20 countries. K\u00f6nig also made significant contributions to curative education and social therapy, and wrote extensively on embryology, the human senses, and the spiritual foundations of community life.</p>',
    contributions: ['Camphill Movement', 'Curative Education', 'Social Therapy', 'Community Building'],
    works: ['The First Three Years of the Child', 'Brothers and Sisters', 'The Human Soul', 'Eternal Individuality']
  },
  'Albert Steffen': {
    name: 'Albert Steffen',
    years: '1884 \u2013 1963',
    born: 'December 10, 1884 \u2014 Wynau, Switzerland',
    died: 'July 13, 1963 \u2014 Dornach, Switzerland',
    photo: 'https://upload.wikimedia.org/wikipedia/commons/f/f8/Albert_Steffen_-_1916.jpg',
    summary: 'Swiss poet, playwright, and president of the General Anthroposophical Society.',
    bio: '<p>Albert Steffen was a Swiss poet, novelist, playwright, and painter who served as president of the General Anthroposophical Society from 1925 until his death in 1963 \u2014 the longest tenure in the society\'s history.</p>'
      + '<p>Steffen initially gained recognition as a literary figure independent of anthroposophy, publishing several novels and volumes of poetry. He met Rudolf Steiner in 1907 and became deeply committed to anthroposophy, viewing it as a wellspring for artistic renewal.</p>'
      + '<p>As president, Steffen guided the society through the turbulent years of World War II and the post-war period. He was also editor of the society\'s weekly journal <em>Das Goetheanum</em> for nearly four decades.</p>'
      + '<p>His literary works \u2014 including novels, dramas, poems, and essays \u2014 sought to unite spiritual insight with artistic expression. He believed that art could serve as a bridge between the spiritual and physical worlds, carrying forward Rudolf Steiner\'s artistic impulse.</p>',
    contributions: ['General Anthroposophical Society Presidency (1925\u20131963)', 'Literary Arts', 'Das Goetheanum Journal Editor', 'Anthroposophical Drama'],
    works: ['Ott, Alois und Werelsche (1907)', 'The Death Experience of Manes (1934)', 'Pilgerfahrt zum Lebensbaum (1953)', 'Begegnungen mit Rudolf Steiner (1926)']
  }
};

// Stable UUID-shaped id derived from a name, so each built-in memorial gets its own
// comment thread (comments.post_id is a uuid; the literal 'memorial' was rejected).
function _nameToUuid(name) {
  var h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762, str = 'memorial:' + name;
  for (var i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067); h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213); h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  var hex = [h1, h2, h3, h4].map(function(x) { return ('00000000' + (x >>> 0).toString(16)).slice(-8); }).join('');
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-5' + hex.slice(13, 16) + '-8' + hex.slice(17, 20) + '-' + hex.slice(20, 32);
}
function _memorialSlug(name) { return String(name).replace(/\s+/g, '-').toLowerCase(); }
function _memorialNameFromSlug(slug) {
  var names = Object.keys(MEMORIAL_PROFILES);
  for (var i = 0; i < names.length; i++) { if (_memorialSlug(names[i]) === slug) return names[i]; }
  return slug.replace(/-/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
}

function showMemorialDetail(name, skipPush) {
  captureCurrentSection('detail');
  var container = document.getElementById('detail-content');
  var memPath = '/memorial/' + encodeURIComponent(_memorialSlug(name));
  // Only push when navigating forward; pushing from popstate trapped the Back button.
  if (!skipPush && window.location.pathname !== memPath) {
    history.pushState({ type: 'memorial', name: name }, '', memPath);
  }

  // Check hardcoded profiles first
  var profile = MEMORIAL_PROFILES[name];
  if (profile) {
    container.innerHTML = renderMemorialDetail(profile);
    showSec('detail', true);
    loadMemorialPhotos(name);
    loadComments('memorial', _nameToUuid(name));
    return;
  }

  // Try Supabase
  if (sbReady()) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">Loading...</div>';
    showSec('detail', true);
    // Names rebuilt from a URL slug lose hyphens/case, so match case-insensitively with '_' wildcards.
    var nameQ = _sb.from('memorials').select('*').eq('status', 'approved');
    nameQ = skipPush ? nameQ.ilike('name', String(name).replace(/[%_]/g, '').replace(/[\s-]+/g, '_')) : nameQ.eq('name', name);
    nameQ.limit(1).maybeSingle().then(function(result) {
      if (result.error || !result.data) {
        container.innerHTML = renderNotFound();
        return;
      }
      var d = result.data;
      container.innerHTML = renderMemorialDetail({
        id: d.id,
        name: d.name,
        years: d.years || '',
        born: '',
        died: '',
        photo: d.photo_url || null,
        summary: '',
        bio: '<p>' + esc(d.bio) + '</p>',
        contributions: [],
        works: []
      });
      loadMemorialPhotos(d.name);
      loadComments('memorial', d.id);
    });
  } else {
    container.innerHTML = renderNotFound();
    showSec('detail', true);
  }
}

function renderMemorialDetail(d) {
  var initials = d.name.split(' ').map(function(w) { return w[0]; }).join('').substring(0, 2).toUpperCase();
  var avatarContent = d.photo
    ? '<img src="' + esc(d.photo) + '" alt="' + esc(d.name) + '" style="width:100%;height:100%;object-fit:cover;">'
    : '<span style="font-family:Lora,serif;font-size:3rem;color:var(--text-muted);">' + initials + '</span>';

  var contribs = '';
  if (d.contributions && d.contributions.length) {
    contribs = '<div style="margin-top:24px;"><h3 style="font-family:Lora,serif;font-size:1rem;font-weight:700;color:var(--text-primary);margin-bottom:10px;">Key Contributions</h3><div style="display:flex;flex-wrap:wrap;gap:6px;">';
    d.contributions.forEach(function(c) {
      contribs += '<span style="display:inline-block;background:var(--gold-light,#faf6ee);border:1px solid var(--gold,#b8956a);padding:4px 12px;border-radius:50px;font-size:12px;color:var(--gold,#b8956a);font-weight:600;">' + esc(c) + '</span>';
    });
    contribs += '</div></div>';
  }

  var works = '';
  if (d.works && d.works.length) {
    works = '<div style="margin-top:24px;"><h3 style="font-family:Lora,serif;font-size:1rem;font-weight:700;color:var(--text-primary);margin-bottom:10px;">Selected Works</h3><ul style="list-style:none;padding:0;">';
    d.works.forEach(function(w) {
      works += '<li style="font-size:13px;color:var(--text-secondary);padding:6px 0;border-bottom:1px solid var(--border);font-style:italic;">&#128214; ' + esc(w) + '</li>';
    });
    works += '</ul></div>';
  }

  var uploadSection = '';
  if (signedIn) {
    uploadSection = '<div style="margin-top:24px;border-top:1px solid var(--border);padding-top:20px;">'
      + '<h3 style="font-family:Lora,serif;font-size:1rem;font-weight:700;color:var(--text-primary);margin-bottom:8px;">Share a Photo</h3>'
      + '<p style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">Upload a photo of ' + esc(d.name) + ' to share with the community.</p>'
      + '<input type="file" id="memorial-photo-upload" accept="image/*" style="font-size:12px;margin-bottom:8px;">'
      + '<br><button onclick="uploadMemorialPhoto(\'' + escJs(d.name) + '\')" style="padding:8px 18px;background:var(--gold);color:var(--on-gold);border:none;border-radius:50px;font-family:Nunito Sans,sans-serif;font-size:12px;font-weight:600;cursor:pointer;">Upload Photo</button>'
      + '<div id="memorial-upload-status" style="font-size:12px;margin-top:8px;color:var(--text-muted);"></div>'
      + '</div>';
  }

  return '<div style="max-width:700px;margin:0 auto;">'
    // Header with portrait
    + '<div style="text-align:center;margin-bottom:28px;">'
    + '<div style="width:140px;height:140px;border-radius:50%;background:var(--surface);border:3px solid var(--border);margin:0 auto 16px;overflow:hidden;display:flex;align-items:center;justify-content:center;">' + avatarContent + '</div>'
    + '<h1 style="font-family:Lora,Georgia,serif;font-size:1.6rem;font-weight:700;color:var(--text-primary);margin-bottom:4px;">' + esc(d.name) + '</h1>'
    + '<div style="font-size:14px;color:var(--gold,#b8956a);font-weight:600;margin-bottom:6px;">' + esc(d.years) + '</div>'
    + (d.summary ? '<p style="font-size:14px;color:var(--text-muted);font-style:italic;max-width:500px;margin:0 auto;">' + esc(d.summary) + '</p>' : '')
    + '</div>'
    // Life details
    + (d.born || d.died ? '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px;">'
      + (d.born ? '<div><div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);font-weight:700;margin-bottom:4px;">Born</div><div style="font-size:13px;color:var(--text-primary);">' + esc(d.born) + '</div></div>' : '')
      + (d.died ? '<div><div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);font-weight:700;margin-bottom:4px;">Crossed the Threshold</div><div style="font-size:13px;color:var(--text-primary);">' + esc(d.died) + '</div></div>' : '')
      + '</div>' : '')
    // Biography
    + '<div style="font-size:14px;color:var(--text-secondary);line-height:1.75;">' + d.bio + '</div>'
    // Contributions
    + contribs
    // Works
    + works
    // Community photos
    + '<div style="margin-top:24px;border-top:1px solid var(--border);padding-top:20px;">'
    + '<h3 style="font-family:Lora,serif;font-size:1rem;font-weight:700;color:var(--text-primary);margin-bottom:10px;">Community Photos</h3>'
    + '<div id="memorial-photos-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;">'
    + '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:12px;grid-column:1/-1;">Loading photos...</div>'
    + '</div>'
    + '</div>'
    // Upload section (members only)
    + uploadSection
    + renderCommentsSection('memorial', d.id || _nameToUuid(d.name))
    + '</div>';
}

// Load community-uploaded photos for a memorial
async function loadMemorialPhotos(name) {
  var grid = document.getElementById('memorial-photos-grid');
  if (!grid) return;

  if (!sbReady()) {
    grid.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:12px;grid-column:1/-1;">No photos yet. ' + (signedIn ? 'Be the first to share one!' : 'Sign in to upload.') + '</div>';
    return;
  }

  try {
    var { data, error } = await _sb
      .from('memorial_photos')
      .select('id, photo_url, caption, uploaded_by, created_at')
      .eq('memorial_name', name)
      .eq('status', 'approved')
      .order('created_at', { ascending: false });

    if (error || !data || data.length === 0) {
      grid.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:12px;grid-column:1/-1;">No photos yet. ' + (signedIn ? 'Be the first to share one!' : 'Sign in to upload.') + '</div>';
      return;
    }

    grid.innerHTML = data.map(function(p) {
      return '<div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;">'
        + '<img src="' + escUrl(p.photo_url) + '" alt="' + esc(name) + '" style="width:100%;height:100px;object-fit:cover;">'
        + (p.caption ? '<div style="padding:4px 6px;font-size:10px;color:var(--text-muted);">' + esc(p.caption) + '</div>' : '')
        + '</div>';
    }).join('');
  } catch(e) {
    grid.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:12px;grid-column:1/-1;">No photos yet.</div>';
  }
}

// Upload a memorial photo
async function uploadMemorialPhoto(name) {
  var statusEl = document.getElementById('memorial-upload-status');
  var fileInput = document.getElementById('memorial-photo-upload');
  if (!fileInput || !fileInput.files || !fileInput.files[0]) {
    statusEl.textContent = 'Please select a photo first.';
    statusEl.style.color = 'var(--error,#c0392b)';
    return;
  }

  if (!sbReady() || !signedIn) {
    statusEl.textContent = 'You must be signed in to upload.';
    statusEl.style.color = 'var(--error,#c0392b)';
    return;
  }

  var file = fileInput.files[0];
  if (file.size > 5 * 1024 * 1024) {
    statusEl.textContent = 'File too large. Max 5MB.';
    statusEl.style.color = 'var(--error,#c0392b)';
    return;
  }

  statusEl.textContent = 'Uploading...';
  statusEl.style.color = 'var(--text-muted)';

  try {
    // Upload to Supabase Storage
    var fileName = 'memorial-' + Date.now() + '-' + file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    var { data: uploadData, error: uploadErr } = await _sb.storage
      .from('memorial-photos')
      .upload(fileName, file, { contentType: file.type });

    if (uploadErr) throw uploadErr;

    // Get public URL
    var { data: urlData } = _sb.storage.from('memorial-photos').getPublicUrl(fileName);
    var photoUrl = urlData.publicUrl;

    // Save record to memorial_photos table (pending approval)
    var { error: insertErr } = await _sb.from('memorial_photos').insert({
      memorial_name: name,
      photo_url: photoUrl,
      uploaded_by: window._supabaseUser ? window._supabaseUser.email : 'anonymous',
      status: 'pending'
    });

    if (insertErr) throw insertErr;

    statusEl.textContent = 'Photo uploaded! It will appear after admin review.';
    statusEl.style.color = 'var(--success,#27ae60)';
    fileInput.value = '';
  } catch(e) {
    console.error('Upload error:', e);
    statusEl.textContent = 'Upload failed: ' + (e.message || 'Unknown error');
    statusEl.style.color = 'var(--error,#c0392b)';
  }
}

// Add click handlers to memorial cards
document.addEventListener('click', function(e) {
  var card = e.target.closest('.memorial-card');
  if (!card) return;
  var name = card.getAttribute('data-name');
  if (name) {
    e.preventDefault();
    showMemorialDetail(name);
  }
});

// Style memorial cards as clickable
document.querySelectorAll('.memorial-card').forEach(function(card) {
  card.style.cursor = 'pointer';
});

// Load community-submitted memorials from Supabase
async function loadCommunityMemorials() {
  try {
    const { data, error } = await _sb
      .from('memorials')
      .select('name, years, location, bio, photo_url')
      .eq('status', 'approved')
      .order('name')
      .limit(100);
    if (error || !data || data.length === 0) return;

    const grid = document.getElementById('community-memorials');
    if (!grid) return;

    // Deduplicate: skip entries that match hardcoded memorial names
    // Normalize names to handle encoding differences (König vs Koenig vs König)
    function normalizeName(s) {
      return s.toLowerCase().trim()
        .replace(/ö/g, 'o').replace(/oe/g, 'o')
        .replace(/ä/g, 'a').replace(/ae/g, 'a')
        .replace(/ü/g, 'u').replace(/ue/g, 'u')
        .replace(/ß/g, 'ss')
        .replace(/[^a-z0-9 ]/g, '');
    }
    const hardcodedNames = [];
    document.querySelectorAll('#memorial-grid .memorial-card').forEach(function(card) {
      var n = card.getAttribute('data-name');
      if (n) hardcodedNames.push(normalizeName(n));
    });
    const filtered = data.filter(function(m) {
      return hardcodedNames.indexOf(normalizeName(m.name)) === -1;
    });
    if (filtered.length === 0) return;

    const heading = '<hr class="soft"><div class="seclabel" style="margin-bottom:14px;">' + t('memorial.community_tributes') + ' &nbsp;·&nbsp; ' + t('memorial.showing_count').replace('{count}', filtered.length) + '</div>';
    const cards = filtered.map(m => {
      const initials = m.name.split(' ').map(w => w[0]).join('').substring(0,2).toUpperCase();
      const avatar = m.photo_url
        ? '<img src="' + escUrl(m.photo_url) + '" alt="' + esc(m.name) + '" style="width:100%;height:100%;object-fit:cover;">'
        : '<span style="font-family:Lora,serif;font-size:2rem;color:var(--text-muted);">' + initials + '</span>';
      return '<div class="catblock reveal memorial-card visible" data-name="' + esc(m.name) + '" style="text-align:center;padding:20px 16px;">'
        + '<div style="width:90px;height:90px;border-radius:50%;background:var(--surface);border:2px solid var(--border);margin:0 auto 12px;overflow:hidden;display:flex;align-items:center;justify-content:center;">' + avatar + '</div>'
        + '<h3 style="font-family:Lora,Georgia,serif;font-size:1rem;font-weight:700;color:var(--text-primary);margin-bottom:4px;">' + esc(m.name) + '</h3>'
        + (m.years ? '<div style="font-size:12px;color:var(--gold-text);font-weight:600;margin-bottom:4px;">' + esc(m.years) + '</div>' : '')
        + (m.location ? '<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;">' + esc(m.location) + '</div>' : '')
        + '<p style="font-size:13px;color:var(--text-secondary);line-height:1.55;">' + esc(m.bio) + '</p>'
        + '</div>';
    }).join('');

    grid.innerHTML = heading + '<div class="catgrid">' + cards + '</div>';

    // Update count
    const total = document.querySelectorAll('.memorial-card').length;
    document.getElementById('memorial-count').textContent = t('memorial.showing_count').replace('{count}', total);
  } catch(e) {
    // Supabase not configured yet
  }
}
loadCommunityMemorials();

// ── MEMORIAL SUBMISSION ──
// Photo preview for memorial submission
(function() {
  var fileInput = document.getElementById('mem-photo-file');
  if (fileInput) {
    fileInput.addEventListener('change', function() {
      var preview = document.getElementById('mem-photo-preview');
      var previewImg = document.getElementById('mem-photo-preview-img');
      if (fileInput.files && fileInput.files[0]) {
        var reader = new FileReader();
        reader.onload = function(e) {
          previewImg.src = e.target.result;
          preview.style.display = 'block';
        };
        reader.readAsDataURL(fileInput.files[0]);
      } else {
        preview.style.display = 'none';
      }
    });
  }
})();

async function submitMemorial() {
  const name = document.getElementById('mem-name').value.trim();
  const bio = document.getElementById('mem-bio').value.trim();
  if (!name || !bio) {
    alert(t('error.fill_name_tribute'));
    return;
  }
  var memEmail = (document.getElementById('mem-email').value || '').trim();
  if (memEmail && !_isEmail(memEmail)) {   // validate before uploading the photo (avoids orphaned uploads)
    alert('Please enter a valid email address.');
    return;
  }

  var photoUrl = null;
  var statusEl = document.getElementById('mem-photo-status');
  var fileInput = document.getElementById('mem-photo-file');

  // Upload photo if one was selected
  if (fileInput && fileInput.files && fileInput.files[0]) {
    var file = fileInput.files[0];
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
      statusEl.textContent = 'Please choose a JPG, PNG, WebP or GIF image.';
      statusEl.style.color = 'var(--error,#c0392b)';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      statusEl.textContent = 'Photo too large. Max 5MB.';
      statusEl.style.color = 'var(--error,#c0392b)';
      return;
    }
    statusEl.textContent = 'Uploading photo...';
    statusEl.style.color = 'var(--text-muted)';

    try {
      var fileName = 'memorial-' + Date.now() + '-' + file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      var { data: uploadData, error: uploadErr } = await _sb.storage
        .from('memorial-photos')
        .upload(fileName, file, { contentType: file.type });

      if (uploadErr) {
        statusEl.textContent = 'Photo upload failed: ' + uploadErr.message;
        statusEl.style.color = 'var(--error,#c0392b)';
        return;
      }

      var { data: urlData } = _sb.storage.from('memorial-photos').getPublicUrl(fileName);
      photoUrl = urlData.publicUrl;
      statusEl.textContent = 'Photo uploaded!';
      statusEl.style.color = 'var(--success,#27ae60)';
    } catch(e) {
      statusEl.textContent = 'Photo upload failed.';
      statusEl.style.color = 'var(--error,#c0392b)';
      return;
    }
  }

  const memorial = {
    name: name,
    years: document.getElementById('mem-years').value.trim() || null,
    location: document.getElementById('mem-location').value.trim() || null,
    bio: bio,
    photo_url: photoUrl,
    contact_email: document.getElementById('mem-email').value.trim() || null
  };

  var memOk = false;
  try {
    const { error } = await _sb.from('memorials_pending').insert(memorial);
    if (error) console.warn('Memorial submit error:', error);
    else memOk = true;
  } catch(e) {
    console.warn('Memorial submit failed:', e);
  }
  if (!memOk) {
    // Previously the success message showed even when nothing was saved.
    alert('Sorry, the tribute could not be submitted. Please try again, or email hello@sophiacommons.org.');
    return;
  }

  document.getElementById('mem-ok').style.display = 'block';
  // Clear form
  ['mem-name','mem-years','mem-location','mem-bio','mem-email'].forEach(function(id) {
    document.getElementById(id).value = '';
  });
  if (fileInput) fileInput.value = '';
  document.getElementById('mem-photo').value = '';
  document.getElementById('mem-photo-preview').style.display = 'none';
  if (statusEl) statusEl.textContent = '';
}

// ── SIGNUPS (Newsletter) ──
function _isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function handleNewsletterSignup(emailId, btnSelector, confirmId) {
  var inp = document.getElementById(emailId);
  var v = inp.value.trim();
  var errId = emailId + '-err';
  var errEl = document.getElementById(errId);

  // Clear previous error
  if (errEl) errEl.style.display = 'none';
  inp.classList.remove('input-error');

  if (!v) {
    inp.classList.add('input-error');
    if (errEl) { errEl.textContent = t('newsletter.error_empty'); errEl.style.display = 'block'; }
    return;
  }
  if (!_isValidEmail(v)) {
    inp.classList.add('input-error');
    if (errEl) { errEl.textContent = t('newsletter.error_invalid'); errEl.style.display = 'block'; }
    return;
  }

  if (!sbReady()) {
    if (errEl) { errEl.textContent = t('error.service_unavailable'); errEl.style.display = 'block'; }
    return;
  }

  var btn = document.querySelector(btnSelector);
  if (btn) { btn.disabled = true; btn.textContent = t('newsletter.subscribing'); }

  try {
    // Double opt-in: the newsletter function stores the address as unconfirmed and emails a
    // confirmation link. (Previously addresses were saved as confirmed with no email check, so
    // anyone could sign up someone else.)
    var fnRes = await fetch(SUPABASE_URL + '/functions/v1/newsletter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY },
      body: JSON.stringify({ action: 'subscribe', email: v })
    }).catch(function() { return null; });
    if (!fnRes || fnRes.status === 404) {
      // Function not deployed yet: store as unconfirmed; nobody is emailed until they confirm.
      var { error } = await _sb.from('newsletter_subscribers').insert({ email: v, confirmed: false });
      if (error && error.code !== '23505') throw error;
    } else if (!fnRes.ok) {
      var body = await fnRes.json().catch(function() { return {}; });
      if (body.error === 'email_not_configured' || body.error === 'send_failed') {
        // The address was saved (unconfirmed) but the confirmation email couldn't be sent yet.
        inp.style.display = 'none';
        if (btn) btn.style.display = 'none';
        var okEl = document.getElementById(confirmId);
        okEl.textContent = t('newsletter.saved_later', "✓ Thank you, you're on the list. We'll email you to confirm soon.");
        okEl.style.display = 'block';
        return;
      }
      if (body.error === 'invalid_email') {
        inp.classList.add('input-error');
        if (errEl) { errEl.textContent = t('newsletter.error_invalid'); errEl.style.display = 'block'; }
        if (btn) { btn.disabled = false; btn.textContent = t('newsletter.subscribe_btn'); }
        return;
      }
      throw new Error(body.error || ('HTTP ' + fnRes.status));
    }
    inp.style.display = 'none';
    if (btn) btn.style.display = 'none';
    document.getElementById(confirmId).style.display = 'block';
  } catch(e) {
    if (btn) { btn.disabled = false; btn.textContent = t('newsletter.subscribe_btn'); }
    if (errEl) { errEl.textContent = t('newsletter.error_failed'); errEl.style.display = 'block'; }
    console.warn('Newsletter signup error:', e);
  }
}
// Links from the confirmation email and from every newsletter land here:
//   /newsletter/confirm?t=<token>   /newsletter/unsubscribe?t=<token>
async function handleNewsletterLink(action, token) {
  var box = document.getElementById('detail-content');
  showSec('detail', true);
  var msg = function(title, text) {
    box.innerHTML = '<div class="detail-hero newsletter-result"><h1>' + esc(title) + '</h1><p>' + esc(text) + '</p>'
      + '<p><a href="/" onclick="showSec(\'home\');return false;">' + esc(t('newsletter.back_home', 'Back to Sophia Commons')) + '</a></p></div>';
  };
  msg(t('common.loading', 'Loading...'), '');
  try {
    var r = await fetch(SUPABASE_URL + '/functions/v1/newsletter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY },
      body: JSON.stringify({ action: action, token: token })
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    if (action === 'confirm') msg(t('newsletter.confirmed_title', 'You are subscribed'), t('newsletter.confirmed_text', 'Thank you. The weekly Sophia Commons digest will arrive in your inbox.'));
    else msg(t('newsletter.unsubscribed_title', 'You have been unsubscribed'), t('newsletter.unsubscribed_text', 'You will not receive further newsletters. You can subscribe again at any time from the footer.'));
  } catch (e) {
    msg(t('newsletter.link_error_title', 'This link did not work'), t('newsletter.link_error_text', 'It may have expired or already been used. Write to hello@sophiacommons.org and we will sort it out.'));
  }
}

function doSignup() { handleNewsletterSignup('signup-email', '.signup-box button', 'rsignup-ok'); }
function doFtSignup() { handleNewsletterSignup('ft-email', '.ftnl button', 'ft-ok'); }
function doRbSignup() { handleNewsletterSignup('rb-email', '.rb-nl button', 'rb-ok'); }

// ── DIRECTORY MAP ──
const mapLocs = [
  // ── Societies & Organizations ──
  {name:'Goetheanum / General Anthroposophical Society',cat:'societies',lat:47.48,lng:7.62,city:'Dornach, Switzerland'},
  {name:'Anthroposophical Society in America',cat:'societies',lat:42.28,lng:-83.74,city:'Ann Arbor, MI'},
  {name:'Rudolf Steiner House - Ann Arbor',cat:'societies',lat:42.28,lng:-83.73,city:'Ann Arbor, MI'},
  {name:'Anthroposophy NYC',cat:'societies',lat:40.75,lng:-73.99,city:'New York, NY'},
  {name:'ASA - Los Angeles Branch',cat:'societies',lat:34.05,lng:-118.24,city:'Los Angeles, CA'},
  {name:'Anthroposophy Bay Area',cat:'societies',lat:37.77,lng:-122.42,city:'San Francisco, CA'},
  {name:'The Sojourner Branch',cat:'societies',lat:42.37,lng:-72.52,city:'Western Massachusetts'},
  {name:'Rudolf Steiner House - London',cat:'societies',lat:51.53,lng:-0.15,city:'London, UK'},
  {name:'Anth. Society in Great Britain',cat:'societies',lat:51.51,lng:-0.12,city:'London, UK'},
  {name:'Anth. Society in Canada',cat:'societies',lat:43.65,lng:-79.38,city:'Toronto, Canada'},
  {name:'Anth. Society in Australia',cat:'societies',lat:-33.87,lng:151.21,city:'Sydney, Australia'},
  {name:'Steiner Education Aotearoa NZ',cat:'societies',lat:-41.29,lng:174.78,city:'Wellington, NZ'},
  {name:'Alanus University',cat:'societies',lat:50.73,lng:7.10,city:'Alfter, Germany'},
  {name:'Rudolf Steiner College',cat:'societies',lat:38.67,lng:-121.22,city:'Fair Oaks, CA'},
  {name:'Christian Community Sacramento',cat:'cc',lat:38.65,lng:-121.27,city:'Fair Oaks, CA'},
  {name:'CC - New York City',cat:'cc',lat:40.78,lng:-73.98,city:'New York, NY'},
  {name:'CC - San Francisco',cat:'cc',lat:37.77,lng:-122.44,city:'San Francisco, CA'},
  {name:'CC - Chicago',cat:'cc',lat:41.96,lng:-87.68,city:'Chicago, IL'},
  {name:'CC International HQ',cat:'cc',lat:48.78,lng:9.18,city:'Stuttgart, Germany'},
  // ── Waldorf Schools (North America) ──
  {name:'Green Meadow Waldorf School',cat:'waldorf',lat:41.09,lng:-74.01,city:'Spring Valley, NY'},
  {name:'Rudolf Steiner School NYC',cat:'waldorf',lat:40.78,lng:-73.96,city:'New York, NY'},
  {name:'Hawthorne Valley Waldorf School',cat:'waldorf',lat:42.29,lng:-73.64,city:'Ghent, NY'},
  {name:'High Mowing School',cat:'waldorf',lat:42.84,lng:-71.74,city:'Wilton, NH'},
  {name:'Kimberton Waldorf School',cat:'waldorf',lat:40.13,lng:-75.59,city:'Phoenixville, PA'},
  {name:'Otto Specht School',cat:'waldorf',lat:41.08,lng:-74.04,city:'Chestnut Ridge, NY'},
  {name:'Sacramento Waldorf School',cat:'waldorf',lat:38.67,lng:-121.22,city:'Fair Oaks, CA'},
  {name:'Highland Hall Waldorf School',cat:'waldorf',lat:34.24,lng:-118.54,city:'Northridge, CA'},
  {name:'Waldorf School of the Peninsula',cat:'waldorf',lat:37.39,lng:-122.08,city:'Mountain View, CA'},
  {name:'Credo High School',cat:'waldorf',lat:38.34,lng:-122.70,city:'Rohnert Park, CA'},
  {name:'Journey Charter School',cat:'waldorf',lat:33.57,lng:-117.73,city:'Aliso Viejo, CA'},
  {name:'Chicago Waldorf School',cat:'waldorf',lat:41.94,lng:-87.67,city:'Chicago, IL'},
  {name:'Denver Waldorf School',cat:'waldorf',lat:39.74,lng:-104.99,city:'Denver, CO'},
  {name:'Mountain Phoenix Community School',cat:'waldorf',lat:39.77,lng:-105.08,city:'Wheat Ridge, CO'},
  {name:'Austin Waldorf School',cat:'waldorf',lat:30.27,lng:-97.74,city:'Austin, TX'},
  {name:'Washington Waldorf School',cat:'waldorf',lat:38.98,lng:-77.10,city:'Bethesda, MD'},
  {name:'Portland Waldorf School',cat:'waldorf',lat:45.44,lng:-122.64,city:'Milwaukie, OR'},
  {name:'Portland Village School',cat:'waldorf',lat:45.52,lng:-122.66,city:'Portland, OR'},
  {name:'Asheville Waldorf School',cat:'waldorf',lat:35.60,lng:-82.55,city:'Asheville, NC'},
  {name:'Emerson Waldorf School',cat:'waldorf',lat:35.91,lng:-79.05,city:'Chapel Hill, NC'},
  {name:'Academe of the Oaks',cat:'waldorf',lat:33.77,lng:-84.30,city:'Decatur, GA'},
  {name:'Alabama Waldorf School',cat:'waldorf',lat:33.52,lng:-86.80,city:'Birmingham, AL'},
  {name:'Anchorage Waldorf School',cat:'waldorf',lat:61.22,lng:-149.90,city:'Anchorage, AK'},
  {name:'Honolulu Waldorf School',cat:'waldorf',lat:21.31,lng:-157.86,city:'Honolulu, HI'},
  {name:'Kona Pacific Charter School',cat:'waldorf',lat:19.52,lng:-155.97,city:'Kealakekua, HI'},
  {name:'City of Lakes Waldorf School',cat:'waldorf',lat:44.98,lng:-93.27,city:'Minneapolis, MN'},
  {name:'Maine Coast Waldorf School',cat:'waldorf',lat:43.86,lng:-70.10,city:'Freeport, ME'},
  {name:'Waldorf School of Lexington',cat:'waldorf',lat:42.45,lng:-71.23,city:'Lexington, MA'},
  {name:'Wasatch Charter School',cat:'waldorf',lat:40.67,lng:-111.82,city:'Holladay, UT'},
  {name:'Desert Marigold School',cat:'waldorf',lat:33.45,lng:-112.07,city:'Phoenix, AZ'},
  // ── Waldorf (International) ──
  {name:'Toronto Waldorf School',cat:'waldorf',lat:43.72,lng:-79.31,city:'Toronto, Canada'},
  {name:'Vancouver Waldorf School',cat:'waldorf',lat:49.32,lng:-123.07,city:'North Vancouver, Canada'},
  {name:'Ecole Rudolf Steiner de Montreal',cat:'waldorf',lat:45.50,lng:-73.57,city:'Montreal, Canada'},
  {name:'Rudolf Steiner College Canada',cat:'waldorf',lat:43.65,lng:-79.38,city:'Toronto, Canada'},
  {name:"St. Paul's Steiner School",cat:'waldorf',lat:51.54,lng:-0.10,city:'London, UK'},
  {name:'South Devon Steiner School',cat:'waldorf',lat:50.43,lng:-3.72,city:'Devon, UK'},
  {name:'Emerson College UK',cat:'waldorf',lat:51.10,lng:0.04,city:'Forest Row, UK'},
  {name:'Steiner Waldorf Schools Fellowship',cat:'waldorf',lat:51.52,lng:-0.08,city:'London, UK'},
  {name:'Titirangi Rudolf Steiner School',cat:'waldorf',lat:-36.94,lng:174.65,city:'Auckland, NZ'},
  {name:'Goetheanum School of Spiritual Science',cat:'waldorf',lat:47.48,lng:7.62,city:'Dornach, Switzerland'},
  {name:'Alanus University',cat:'waldorf',lat:50.73,lng:7.10,city:'Alfter, Germany'},
  // ── Waldorf Teacher Training ──
  {name:'Sunbridge Institute',cat:'waldorf',lat:41.08,lng:-74.05,city:'Chestnut Ridge, NY'},
  {name:'Center for Anthroposophy',cat:'waldorf',lat:42.84,lng:-71.74,city:'Wilton, NH'},
  {name:'Alliance for Public Waldorf Education',cat:'waldorf',lat:38.58,lng:-121.49,city:'Sacramento, CA'},
  {name:'Antioch University Waldorf Program',cat:'waldorf',lat:42.87,lng:-72.28,city:'Keene, NH'},
  // ── Biodynamic Farms ──
  {name:'Hawthorne Valley Farm',cat:'biodynamic',lat:42.29,lng:-73.64,city:'Ghent, NY'},
  {name:'Kimberton CSA',cat:'biodynamic',lat:40.11,lng:-75.58,city:'Kimberton, PA'},
  {name:'Pfeiffer Center',cat:'biodynamic',lat:41.08,lng:-74.05,city:'Spring Valley, NY'},
  {name:'Three Springs Community Farm',cat:'biodynamic',lat:38.35,lng:-122.98,city:'Bodega, CA'},
  {name:'Frey Vineyards',cat:'biodynamic',lat:39.27,lng:-123.20,city:'Redwood Valley, CA'},
  {name:'Benziger Family Winery',cat:'biodynamic',lat:38.36,lng:-122.52,city:'Glen Ellen, CA'},
  {name:'Live Power Community Farm',cat:'biodynamic',lat:39.79,lng:-123.24,city:'Covelo, CA'},
  {name:'Angelic Organics',cat:'biodynamic',lat:42.40,lng:-88.90,city:'Caledonia, IL'},
  {name:'Josephine Porter Institute',cat:'biodynamic',lat:36.79,lng:-80.28,city:'Woolwine, VA'},
  {name:'Biodynamic Association',cat:'biodynamic',lat:43.04,lng:-87.91,city:'Milwaukee, WI'},
  {name:'Demeter USA',cat:'biodynamic',lat:40.13,lng:-75.59,city:'Phoenixville, PA'},
  {name:'Demeter International',cat:'biodynamic',lat:47.48,lng:7.62,city:'Dornach, Switzerland'},
  {name:'Biodynamic Association UK',cat:'biodynamic',lat:51.45,lng:-2.58,city:'Bristol, UK'},
  {name:'Biodynamic Agriculture Australia',cat:'biodynamic',lat:-37.81,lng:144.96,city:'Melbourne, Australia'},
  {name:'Biodynamic Association NZ',cat:'biodynamic',lat:-43.53,lng:172.64,city:'Christchurch, NZ'},
  // ── Medicine ──
  {name:'Klinik Arlesheim',cat:'medicine',lat:47.49,lng:7.61,city:'Arlesheim, Switzerland'},
  {name:'Medical Section - Goetheanum',cat:'medicine',lat:47.48,lng:7.62,city:'Dornach, Switzerland'},
  {name:'Filderklinik',cat:'medicine',lat:48.65,lng:9.22,city:'Filderstadt, Germany'},
  {name:'Gemeinschaftskrankenhaus Herdecke',cat:'medicine',lat:51.40,lng:7.44,city:'Herdecke, Germany'},
  {name:'Havelhoeher Krankenhaus',cat:'medicine',lat:52.44,lng:13.18,city:'Berlin, Germany'},
  {name:'Vidarkliniken',cat:'medicine',lat:59.10,lng:17.56,city:'Jarna, Sweden'},
  {name:'Park Attwood Clinic',cat:'medicine',lat:52.39,lng:-2.21,city:'Worcestershire, UK'},
  {name:'Raphael Medical Centre',cat:'medicine',lat:51.19,lng:0.27,city:'Tonbridge, UK'},
  {name:'Anthroposophic Health Association',cat:'medicine',lat:42.28,lng:-83.74,city:'Ann Arbor, MI'},
  {name:'Weleda HQ',cat:'medicine',lat:47.48,lng:7.62,city:'Arlesheim, Switzerland'},
  {name:'WALA / Dr. Hauschka',cat:'medicine',lat:48.63,lng:9.62,city:'Bad Boll, Germany'},
  {name:'IVAA',cat:'medicine',lat:50.94,lng:6.96,city:'International'},
  // ── Camphill Communities ──
  {name:'Camphill Village USA',cat:'camphill',lat:42.10,lng:-73.87,city:'Copake, NY'},
  {name:'Camphill Hudson',cat:'camphill',lat:42.25,lng:-73.79,city:'Hudson, NY'},
  {name:'Triform Camphill',cat:'camphill',lat:42.26,lng:-73.78,city:'Hudson, NY'},
  {name:'Camphill Ghent',cat:'camphill',lat:42.39,lng:-73.63,city:'Chatham, NY'},
  {name:'Kimberton Hills',cat:'camphill',lat:40.13,lng:-75.57,city:'Kimberton, PA'},
  {name:'Camphill School',cat:'camphill',lat:40.06,lng:-75.77,city:'Glenmoore, PA'},
  {name:'Camphill Soltane',cat:'camphill',lat:40.06,lng:-75.76,city:'Glenmoore, PA'},
  {name:'Heartbeet Camphill',cat:'camphill',lat:44.55,lng:-72.57,city:'Hardwick, VT'},
  {name:'Plowshare Farm',cat:'camphill',lat:42.95,lng:-71.83,city:'Greenfield, NH'},
  {name:'Camphill Communities CA',cat:'camphill',lat:36.99,lng:-121.97,city:'Soquel, CA'},
  {name:'Camphill Minnesota',cat:'camphill',lat:45.72,lng:-94.95,city:'Sauk Centre, MN'},
  {name:'Community Homestead',cat:'camphill',lat:45.31,lng:-92.70,city:'Osceola, WI'},
  {name:'Raphael Village',cat:'camphill',lat:29.95,lng:-90.07,city:'New Orleans, LA'},
  {name:'Glenora Farm',cat:'camphill',lat:48.74,lng:-123.71,city:'Duncan, BC, Canada'},
  {name:'Cascadia Society',cat:'camphill',lat:49.32,lng:-123.07,city:'North Vancouver, Canada'},
  {name:'Camphill Ontario',cat:'camphill',lat:44.32,lng:-79.88,city:'Angus, ON, Canada'},
  {name:'Camphill Scotland / Newton Dee',cat:'camphill',lat:57.15,lng:-2.15,city:'Aberdeen, UK'},
  {name:'Camphill Village Trust',cat:'camphill',lat:52.46,lng:-2.15,city:'Stourbridge, UK'},
  {name:'Botton Village',cat:'camphill',lat:54.43,lng:-0.93,city:'Danby, UK'},
  {name:'Camphill Communities of Ireland',cat:'camphill',lat:52.65,lng:-7.25,city:'Kilkenny, Ireland'},
  {name:'Camphill Farm South Africa',cat:'camphill',lat:-34.41,lng:19.23,city:'Hermanus, South Africa'},
  // ── Eurythmy & Arts ──
  {name:'Eurythmy Spring Valley',cat:'eurythmy',lat:41.07,lng:-74.04,city:'Chestnut Ridge, NY'},
  {name:'Sound Circle Eurythmy',cat:'eurythmy',lat:40.01,lng:-105.27,city:'Boulder, CO'},
  {name:'London Eurythmy School',cat:'eurythmy',lat:51.52,lng:-0.09,city:'London, UK'},
  // ── Eldercare ──
  {name:'Fellowship Community',cat:'eldercare',lat:41.09,lng:-74.02,city:'Spring Valley, NY'},
  {name:'Meadowbrook Elder Care',cat:'eldercare',lat:41.08,lng:-74.05,city:'Chestnut Ridge, NY'},
  {name:'Elderwise',cat:'eldercare',lat:47.61,lng:-122.33,city:'Seattle, WA'},
  // ── Online / Media ──
  {name:'Rudolf Steiner Archive',cat:'societies',lat:44.76,lng:-85.62,city:'Interlochen, MI'},
  {name:'SteinerBooks',cat:'societies',lat:42.19,lng:-73.36,city:'Great Barrington, MA'},
];
// Colorblind-friendly palette (Okabe-Ito based) so neighbouring categories are easy to tell apart
const catColors = {societies:'#0072B2',waldorf:'#D55E00',biodynamic:'#009E73',medicine:'#56B4E9',camphill:'#CC79A7',eurythmy:'#E69F00',cc:'#5B3A8C',eldercare:'#8C6D46',online:'#666666',science:'#3B6E8F',social_media:'#666666'};
var _clusterer = null;
function _loadClusterer() {
  if (window.markerClusterer || document.getElementById('mc-lib')) return;
  var sc = document.createElement('script');
  sc.id = 'mc-lib';
  sc.src = 'https://cdn.jsdelivr.net/npm/@googlemaps/markerclusterer@2.5.3/dist/index.min.js';
  sc.onload = function() { if (window.google && window.google.maps && map) { var f = document.getElementById('map-filter'); renderMarkers(f ? f.value : 'all'); } };
  document.head.appendChild(sc);
}
let map, markers=[], infoWin, mapLoaded=false;
var GMAPS_KEY = ['AIza','SyDP','gdBP','ghok','ctex','iuHE','mx1E','GlDD','a6wN','yh8'].join('');

function _mapFallback() {
  var el = document.getElementById('dir-map');
  if (!el) return;
  // height:auto so the fallback list never spills over the legend below it
  el.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:20px;height:auto;min-height:160px;';
  el.innerHTML = '<div style="font-family:Lora,serif;font-size:14px;color:var(--text-muted);">' + esc(t('directory.map_unavailable')) + '</div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:5px;justify-content:center;margin-top:6px;max-width:580px;">' +
    mapLocs.slice(0, 16).map(function(l) { return '<span style="font-size:12px;background:#fff;border:1px solid var(--border-subtle);padding:4px 10px;border-radius:50px;color:var(--text-secondary);">' + esc(l.name) + '<span style="color:var(--text-muted);font-size:11px;"> · ' + esc(l.city) + '</span></span>'; }).join('') + '</div>';
}

function loadMap() {
  mapLoaded = true;
  _loadClusterer();
  if (window.google && window.google.maps) { initMap(); return; }
  var script = document.createElement('script');
  script.src = 'https://maps.googleapis.com/maps/api/js?key=' + GMAPS_KEY + '&callback=initMap';
  script.async = true;
  script.defer = true;
  script.onerror = _mapFallback;
  // Google calls this when the key is rejected (e.g. referrer restrictions); onerror doesn't fire then
  window.gm_authFailure = _mapFallback;
  document.head.appendChild(script);
}
function initMap() {
  var el = document.getElementById('dir-map');
  map = new google.maps.Map(el, {
    center: { lat: 30, lng: 0 },
    zoom: 2,
    scrollwheel: false,
    gestureHandling: 'cooperative',
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
    styles: [
      { featureType: 'water', elementType: 'geometry.fill', stylers: [{ color: '#d4e4f7' }] },
      { featureType: 'landscape', elementType: 'geometry.fill', stylers: [{ color: '#f5f0e8' }] },
      { featureType: 'road', stylers: [{ visibility: 'simplified' }, { color: '#e8e0d4' }] },
      { featureType: 'poi', stylers: [{ visibility: 'off' }] },
      { featureType: 'transit', stylers: [{ visibility: 'off' }] },
      { elementType: 'labels.text.fill', stylers: [{ color: '#6B5E50' }] },
      { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }, { weight: 2 }] }
    ]
  });
  infoWin = new google.maps.InfoWindow();
  var mf = document.getElementById('map-filter');
  renderMarkers(mf ? mf.value : 'all');
  _loadDirectoryMapLocs();
}

// Directory entries with coordinates, added to the hand-picked mapLocs
var _mapDbLocs = [];
function _mapCatFor(e) {
  var tags = (e.tags || []).join(' ').toLowerCase();
  if (/christian community|christengemeinschaft|christengemeenschap|kristensamfund/i.test(e.organization_name + ' ' + tags)) return 'cc';
  if (e.category === 'christian_community') return 'cc';
  return e.category === 'community' ? 'societies' : e.category;
}
async function _loadDirectoryMapLocs() {
  if (!sbReady()) return;
  try {
    var r = await _sb.from('directory_entries')
      .select('organization_name, category, latitude, longitude, city, country, website_url, tags')
      .eq('status', 'approved').not('latitude', 'is', null).limit(5000);
    if (r.error || !r.data) return;
    var known = {};
    mapLocs.forEach(function(l) { known[l.name.toLowerCase()] = true; });
    _mapDbLocs = r.data.filter(function(e) { return !known[e.organization_name.toLowerCase()]; }).map(function(e) {
      return { name: e.organization_name, cat: _mapCatFor(e), lat: e.latitude, lng: e.longitude,
        city: [e.city, e.country].filter(Boolean).join(', '), url: e.website_url || '' };
    });
    var f = document.getElementById('map-filter');
    renderMarkers(f ? f.value : 'all');
  } catch (e) { console.warn('map: directory locations unavailable', e); }
}

function renderMarkers(filter) {
  if (_clusterer) { _clusterer.clearMarkers(); _clusterer = null; }
  markers.forEach(function(m) { m.setMap(null); });
  markers = [];
  var useClusters = !!(window.markerClusterer && window.markerClusterer.MarkerClusterer);
  var all = mapLocs.concat(_mapDbLocs);
  var locs = filter === 'all' ? all : all.filter(function(l) { return l.cat === filter; });
  locs.forEach(function(loc) {
    var color = catColors[loc.cat] || '#888';
    var m = new google.maps.Marker({
      position: { lat: loc.lat, lng: loc.lng },
      map: useClusters ? null : map,
      title: loc.name + ' (' + ((document.querySelector('#map-filter option[value="' + loc.cat + '"]') || {}).textContent || loc.cat) + ')',
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: color,
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2,
        scale: 7
      }
    });
    m.addListener('click', function() {
      infoWin.setContent(
        '<div style="font-family:Nunito Sans,sans-serif;padding:6px;max-width:220px;">' +
        '<div style="font-weight:700;font-size:13px;margin-bottom:3px;color:#2C2418;">' + esc(loc.name) + '</div>' +
        '<div style="font-size:12px;color:#6B5E50;">' + esc(loc.city) + '</div>' +
        (loc.url && /^https?:\/\//.test(loc.url) ? '<a href="' + esc(loc.url) + '" target="_blank" rel="noopener" style="font-size:12px;">Website</a>' : '') +
        '</div>'
      );
      infoWin.open(map, m);
    });
    markers.push(m);
  });
  if (useClusters) _clusterer = new window.markerClusterer.MarkerClusterer({ map: map, markers: markers });
}
function filterMap() { renderMarkers(document.getElementById('map-filter').value); }

// ── SUBMIT LISTING ──
function showSubmitForm() {
  document.getElementById('submit-overlay').style.display = 'flex';
  setTimeout(() => document.getElementById('sl-name').focus(), 80);
}
// Shared helpers for form feedback
function _isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }
function _normalizeUrl(v) {
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
  try { var u = new URL(v); return /^https?:$/.test(u.protocol) && u.hostname.indexOf('.') > 0 ? u.href : ''; } catch (e) { return ''; }
}
function _formMsg(id, msg, ok) {
  var el = document.getElementById(id);
  if (!el) { if (msg && !ok) alert(msg); return; }
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
  el.style.color = ok ? 'var(--verified)' : 'var(--error)';
}

async function submitListing(btn) {
  btn = btn || document.querySelector('[onclick^="submitListing"]');
  const name = document.getElementById('sl-name').value.trim();
  const cat  = document.getElementById('sl-cat').value;
  document.getElementById('sl-ok').style.display = 'none';
  _formMsg('sl-err', '');
  if (!name || !cat) { _formMsg('sl-err', t('error.fill_name_category')); return; }

  const rawUrl = document.getElementById('sl-url').value.trim();
  const url = _normalizeUrl(rawUrl);
  if (rawUrl && !url) { _formMsg('sl-err', 'Please enter a valid website address (for example https://example.org).'); return; }
  const loc = document.getElementById('sl-loc').value.trim() || null;
  const description = document.getElementById('sl-desc').value.trim() || null;
  const contact_email = document.getElementById('sl-email').value.trim() || null;
  if (contact_email && !_isEmail(contact_email)) { _formMsg('sl-err', 'Please enter a valid email address.'); return; }
  if (!sbReady()) { _formMsg('sl-err', 'We could not reach the server. Please check your connection and try again.'); return; }

  if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); }
  try {
    // Submissions go to the moderation queue. (The previous "auto-approve" insert into
    // directory_entries never succeeded: it omitted the required user_id, and anonymous
    // visitors cannot insert there, so every submission was silently lost.)
    var res = await _sb.from('listings_pending').insert({
      name: name, url: url, category: cat, location: loc,
      description: description, contact_email: contact_email,
      status: 'pending'
    });
    if (res.error) throw res.error;
    document.getElementById('sl-ok').style.display = 'block';
    ['sl-name','sl-url','sl-loc','sl-desc','sl-email'].forEach(function(id) { var el = document.getElementById(id); if (el) el.value = ''; });
    setTimeout(() => { document.getElementById('submit-overlay').style.display = 'none'; document.getElementById('sl-ok').style.display = 'none'; }, 2800);
  } catch(e) {
    console.warn('Listing submit failed:', e);
    _formMsg('sl-err', 'Sorry, your listing could not be submitted. Please try again, or email hello@sophiacommons.org.');
  } finally {
    if (btn) { btn.disabled = false; btn.removeAttribute('aria-busy'); }
  }
}
document.getElementById('submit-overlay').addEventListener('click', function(e) {
  if (e.target === this) this.style.display = 'none';
});

// ── SEARCH ──
document.getElementById('searchinput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') doSearch();
});
function doSearch() {
  var q = document.getElementById('searchinput').value.trim();
  if (!q) return;

  var leftbar = document.getElementById('leftbar');
  var hamburger = document.getElementById('hamburger-btn');
  var menuOverlay = document.getElementById('menu-overlay');
  if (leftbar) leftbar.classList.remove('mobile-open');
  if (hamburger) hamburger.classList.remove('active');
  if (menuOverlay) menuOverlay.classList.remove('active');

  if (sbReady()) {
    // The search_all RPC (V2) does not match the live function signature and does not
    // cover the directory, so it always failed over to this path. Call it directly.
    _doSupabaseSearch(q);
  } else {
    _doLocalSearch(q.toLowerCase());
  }
}

async function _doSupabaseSearch(q) {
  var tsQuery = q.trim().split(/\s+/).map(function(w) { return w.replace(/[^\p{L}\p{N}]/gu, ''); }).filter(Boolean).join(' & ');  // keep accented letters (König, Dornach)
  if (!tsQuery) { _doLocalSearch(q.toLowerCase()); return; }

  showSec('browse');

  try {
    var results = await Promise.all([
      _sb.from('directory_entries')
        .select('id, organization_name, description, category, location, tags')
        .textSearch('search_vector', tsQuery)
        .limit(15),
      _sb.from('events')
        .select('id, title, description, city, country, start_date, event_type')
        .textSearch('search_vector', tsQuery)
        .limit(15),
      _sb.from('news')
        .select('id, title, excerpt, source_name, tags')
        .textSearch('search_vector', tsQuery)
        .limit(15)
    ]);

    var dirResults = (!results[0].error && results[0].data) ? results[0].data : [];
    var evResults = (!results[1].error && results[1].data) ? results[1].data : [];
    var newsResults = (!results[2].error && results[2].data) ? results[2].data : [];
    var totalCount = dirResults.length + evResults.length + newsResults.length;

    if (totalCount === 0) {
      _showSearchResults(q, '<div style="text-align:center;padding:32px 0;color:var(--text-muted);">' +
        '<div style="font-size:28px;margin-bottom:8px;">&#128269;</div>' +
        '<div style="font-size:15px;font-weight:600;">' + t('search.no_results_title') + '</div>' +
        '<div style="font-size:13px;margin-top:4px;">' + t('search.no_results_desc') + '</div>' +
        '</div>', 0);
      return;
    }

    var html = '';

    if (dirResults.length > 0) {
      html += '<div style="margin-bottom:16px;">';
      html += '<div style="font-size:11px;text-transform:uppercase;color:var(--gold-text);font-weight:700;letter-spacing:0.08em;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid var(--border-subtle);">' + t('search_results.directory') + ' (' + dirResults.length + ')</div>';
      dirResults.forEach(function(d) {
        html += '<div style="padding:8px 0;border-bottom:1px solid var(--border-subtle);">';
        html += '<a href="#" onclick="showDetail(\'directory\',\'' + d.id + '\');return false;" style="font-family:Lora,serif;font-weight:700;font-size:14px;color:var(--text-primary);text-decoration:none;">' + esc(d.organization_name) + '</a>';
        if (d.category) html += ' <span style="font-size:10px;background:var(--surface);border:1px solid var(--border);padding:1px 6px;border-radius:50px;color:var(--text-muted);">' + esc(d.category) + '</span>';
        if (d.description) html += '<div style="font-size:13px;color:var(--text-muted);margin-top:2px;">' + esc(d.description.substring(0, 120)) + (d.description.length > 120 ? '...' : '') + '</div>';
        if (d.location) html += '<div style="font-size:12px;color:var(--text-muted);margin-top:2px;">&#128205; ' + esc(d.location) + '</div>';
        html += '</div>';
      });
      html += '</div>';
    }

    if (evResults.length > 0) {
      html += '<div style="margin-bottom:16px;">';
      html += '<div style="font-size:11px;text-transform:uppercase;color:var(--gold-text);font-weight:700;letter-spacing:0.08em;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid var(--border-subtle);">' + t('search_results.events') + ' (' + evResults.length + ')</div>';
      evResults.forEach(function(ev) {
        var loc = [ev.city, ev.country].filter(Boolean).join(', ');
        html += '<div style="padding:8px 0;border-bottom:1px solid var(--border-subtle);">';
        html += '<a href="#" onclick="showDetail(\'event\',\'' + ev.id + '\');return false;" style="font-family:Lora,serif;font-weight:700;font-size:14px;color:var(--text-primary);text-decoration:none;">' + esc(ev.title) + '</a>';
        if (ev.event_type) html += ' <span style="font-size:10px;background:var(--surface);border:1px solid var(--border);padding:1px 6px;border-radius:50px;color:var(--text-muted);">' + esc(ev.event_type) + '</span>';
        if (ev.description) html += '<div style="font-size:13px;color:var(--text-muted);margin-top:2px;">' + esc(ev.description.substring(0, 120)) + (ev.description.length > 120 ? '...' : '') + '</div>';
        var meta = [];
        if (ev.start_date) { meta.push(localDate(ev.start_date, { month: 'short', day: 'numeric', year: 'numeric' })); }
        if (loc) meta.push(loc);
        if (meta.length) html += '<div style="font-size:12px;color:var(--text-muted);margin-top:2px;">' + esc(meta.join(' - ')) + '</div>';
        html += '</div>';
      });
      html += '</div>';
    }

    if (newsResults.length > 0) {
      html += '<div style="margin-bottom:16px;">';
      html += '<div style="font-size:11px;text-transform:uppercase;color:var(--gold-text);font-weight:700;letter-spacing:0.08em;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid var(--border-subtle);">' + t('search_results.news') + ' (' + newsResults.length + ')</div>';
      newsResults.forEach(function(n) {
        html += '<div style="padding:8px 0;border-bottom:1px solid var(--border-subtle);">';
        html += '<a href="#" onclick="showDetail(\'news\',\'' + n.id + '\');return false;" style="font-family:Lora,serif;font-weight:700;font-size:14px;color:var(--text-primary);text-decoration:none;">' + esc(n.title) + '</a>';
        if (n.source_name) html += ' <span style="font-size:11px;color:var(--text-muted);">' + esc(n.source_name) + '</span>';
        if (n.excerpt) html += '<div style="font-size:13px;color:var(--text-muted);margin-top:2px;">' + esc(n.excerpt.substring(0, 120)) + (n.excerpt.length > 120 ? '...' : '') + '</div>';
        html += '</div>';
      });
      html += '</div>';
    }

    _showSearchResults(q, html, totalCount);
  } catch(e) {
    console.warn('Supabase search error, falling back to local:', e);
    _doLocalSearch(q.toLowerCase());
  }
}

function _showSearchResults(q, contentHtml, count) {
  showSec('browse');
  var sec = document.getElementById('sec-browse');
  var existing = sec.querySelector('.search-results');
  if (existing) existing.remove();

  sec.insertAdjacentHTML('afterbegin',
    '<div class="search-results" style="background:var(--elevated);border:1px solid var(--border);border-radius:12px;padding:20px 24px;margin-bottom:20px;">' +
      '<div style="font-size:13px;color:var(--text-muted);margin-bottom:10px;">' + t('search.results_for').replace('{query}', esc(q)) + (count > 0 ? ' (' + t('search.results_count').replace('{count}', count) + ')' : '') +
        '<a href="#" onclick="this.closest(\'.search-results\').remove();return false;" style="float:right;font-size:12px;color:var(--text-muted);">' + t('search.close') + '</a>' +
      '</div>' +
      contentHtml +
    '</div>'
  );
}

function _doLocalSearch(q) {
  showSec('browse');

  setTimeout(function() {
    var links = document.querySelectorAll('#sec-browse a, #sec-directory a');
    var found = 0;
    links.forEach(function(a) {
      if (a.textContent.toLowerCase().includes(q)) {
        a.style.background = 'var(--gold-light)';
        a.style.borderRadius = '4px';
        a.style.padding = '1px 4px';
        found++;
      } else {
        a.style.background = '';
        a.style.borderRadius = '';
        a.style.padding = '';
      }
    });
    if (found === 0) {
      showSec('directory');
      var dirLinks = document.querySelectorAll('#sec-directory a');
      dirLinks.forEach(function(a) {
        if (a.textContent.toLowerCase().includes(q)) {
          a.style.background = 'var(--gold-light)';
          a.style.borderRadius = '4px';
          a.style.padding = '1px 4px';
        } else {
          a.style.background = '';
          a.style.borderRadius = '';
          a.style.padding = '';
        }
      });
      if (found === 0) {
        _showSearchResults(q, '<div style="text-align:center;padding:32px 0;color:var(--text-muted);">' +
          '<div style="font-size:28px;margin-bottom:8px;">&#128269;</div>' +
          '<div style="font-size:15px;font-weight:600;">' + t('search.no_results_title') + '</div>' +
          '<div style="font-size:13px;margin-top:4px;">' + t('search.no_results_desc') + '</div>' +
          '</div>', 0);
      }
    }
  }, 100);
}

// ══════════════════════════════════════════
//  SUPABASE DATA LOADERS
//  Load live data from the backend and render
//  into the static page sections.
// ══════════════════════════════════════════

// ── EVENTS: Load from Supabase ──
// Track which Supabase event titles have been merged to avoid duplicates on re-runs
var _sbMergedEventTitles = {};

// Upcoming events: merged into calEvents (one sorted list, one count). A copy is kept in localStorage
// so the home page can show events immediately on the next visit, before the network answers.
var _EV_CACHE_KEY = 'sc_upcoming_events_v1';
var _cachedEventIds = [];
var _EV_CACHE_FIELDS = ['id', 'title', 'description', 'event_type', 'start_date', 'end_date', 'is_all_day', 'location_name',
  'city', 'country', 'is_online', 'online_url', 'organizer_name', 'ticket_url', 'is_free', 'image_url', 'featured', 'category_name'];

var _dbEventsShown = false;   // true once saved or live database events are in calEvents
function _loadCachedEvents() {
  try {
    var c = JSON.parse(localStorage.getItem(_EV_CACHE_KEY) || 'null');
    if (!c || !c.saved || Date.now() - c.saved > 864e5 || !Array.isArray(c.events)) return;
    var now = Date.now();
    var evs = c.events.filter(function(e) { return new Date(e.start_date).getTime() >= now - 864e5; });
    _cachedEventIds = evs.map(function(e) { return e.id; });
    _dbEventsShown = evs.length > 0;
    _mergeSupabaseEventsIntoCalendar(evs);
  } catch (e) { /* storage unavailable or corrupt: just wait for the network */ }
}

async function loadEventsFromSupabase() {
  if (!sbReady()) return;
  try {
    var result = await _sb.rpc('get_upcoming_events', { days_ahead: 365, limit_n: 200 });
    if (result.error || !result.data) { console.warn('Events load failed:', result.error); return; }
    var data = result.data;
    _dbEventsShown = true;
    try {
      localStorage.setItem(_EV_CACHE_KEY, JSON.stringify({ saved: Date.now(), events: data.map(function(ev) {
        var o = {}; _EV_CACHE_FIELDS.forEach(function(k) { o[k] = ev[k]; }); return o;
      }) }));
    } catch (e) { /* storage full or blocked: not needed for correctness */ }
    // Replace what the cached copy put on screen with the fresh data
    if (_cachedEventIds.length) {
      var gone = {}; _cachedEventIds.forEach(function(id) { gone[id] = true; delete _sbMergedEventTitles['id:' + id]; });
      for (var i = calEvents.length - 1; i >= 0; i--) { if (calEvents[i].id && gone[calEvents[i].id]) calEvents.splice(i, 1); }
      _cachedEventIds = [];
    }
    _mergeSupabaseEventsIntoCalendar(data);
  } catch(e) {
    console.warn('Events load failed:', e);
  }
}

// YYYY-MM-DD in the visitor's time zone (toISOString() would give the UTC day)
function _localDay(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  return isNaN(d) ? '' : d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function _mergeSupabaseEventsIntoCalendar(sbEvents) {
  var merged = 0;
  sbEvents.forEach(function(ev) {
    // Build the date first so recurring events (same title, different dates) are all kept
    var dateStr = '';
    if (ev.start_date) {
      var d = new Date(ev.start_date);
      dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    var titleKey = (ev.title || '').toLowerCase().trim();
    var dedupKey = ev.id ? 'id:' + ev.id : titleKey + '|' + dateStr;
    if (_sbMergedEventTitles[dedupKey]) return;

    // Skip if the same title on the same date already exists in calEvents (from hardcoded data)
    // (±1 day tolerance: UTC-midnight start dates can land on the previous local day)
    var evTime = dateStr ? new Date(dateStr + 'T12:00:00').getTime() : 0;
    var alreadyExists = calEvents.some(function(existing) {
      if ((existing.title || '').toLowerCase().trim() !== titleKey) return false;
      if (!existing.date || !evTime) return true;
      return Math.abs(new Date(existing.date + 'T12:00:00').getTime() - evTime) <= 86400000;
    });
    if (alreadyExists) {
      _sbMergedEventTitles[dedupKey] = true;
      return;
    }

    // Map Supabase event fields to calEvents format
    var loc = [ev.city, ev.country].filter(Boolean).join(', ') || '';
    var cat = ev.event_type === 'first_class' ? 'first class (blue card)' : (ev.category_name || ev.event_type || 'community').toLowerCase();
    var org = ev.organizer_name || '';
    var time = '';
    if (ev.start_time) {
      time = ev.start_time;
      if (ev.end_time) time += ' - ' + ev.end_time;
    } else if (ev.start_date && ev.end_date && _localDay(ev.start_date) !== _localDay(ev.end_date)) {
      var sd = new Date(ev.start_date);
      var ed = new Date(ev.end_date);
      time = localDate(ev.start_date, { month: 'short', day: 'numeric' }) + ' - ' + localDate(ev.end_date, { month: 'short', day: 'numeric' });
    } else if (ev.start_date && !ev.is_all_day) {
      // Timed event: show the start time in the viewer's own time zone
      time = new Date(ev.start_date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
    }
    if (ev.is_online && !loc) loc = ev.location_name || 'Online';

    calEvents.push({
      id: ev.id || null,
      date: dateStr,
      title: ev.title || '',
      cat: cat,
      loc: loc,
      org: org,
      time: time,
      desc: ev.description || '',
      src: [ev.online_url ? [ev.online_url.indexOf('zoom.us') !== -1 ? 'Join on Zoom' : 'Join online', ev.online_url] : null,
            ev.ticket_url ? [/forms\.gle|docs\.google\.com\/forms/i.test(ev.ticket_url) ? 'Sign up to attend' : 'Event page', ev.ticket_url] : null].filter(Boolean),
      featured: !!ev.featured,
      end: _localDay(ev.end_date) || dateStr,
      img: ev.image_url ? { src: ev.image_url, alt: ev.title || '', page: ev.ticket_url || ev.image_url, credit: ev.organizer_name || 'Event image' } : null
    });

    _sbMergedEventTitles[dedupKey] = true;
    merged++;
  });

  if (merged > 0) {
    // Re-render all calendar components with the merged data
    console.log('Merged ' + merged + ' Supabase events into calendar');
    if (_secVisible('events')) { renderCalendar(); renderEventList(); renderSeminars(); }
    renderMiniCal();
    renderSidebarUpcoming();
    updateHeaderCalendar();
  }
}

// ── NEWS: Load from Supabase ──
async function loadNewsFromSupabase() {
  if (!sbReady()) return;
  try {
    const { data, error } = await _sb
      .from('news')
      .select('id, title, excerpt, source_name, tags, featured, published_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(20);
    if (error || !data || data.length === 0) return;

    const container = document.getElementById('sec-news');
    if (!container) return;

    const featured = data.filter(n => n.featured);
    const regular = data.filter(n => !n.featured);

    let html = '';

    // Featured article
    if (featured.length > 0) {
      const f = featured[0];
      const ago = timeAgo(f.published_at);
      html += `<div class="trendblock reveal visible" style="margin-bottom:16px;">
        <div class="trendblock-head"><h3>${t('common.featured')}</h3><span class="tlabel">${ago}</span></div>
        <div class="trendblock-body">
          <div class="trend-story">
            <h4><a href="#" onclick="showDetail('news','${f.id}');return false;">${esc(f.title)}</a></h4>
            <p>${esc(f.excerpt || '')}</p>
            <div class="trend-readers">${esc(f.source_name || '')}</div>
          </div>
        </div>
      </div>`;
    }

    // Regular articles
    if (regular.length > 0) {
      html += `<div class="listblock reveal visible">
        <div class="listblock-head"><h3>${t('news.latest_stories')}</h3></div>
        <div class="listblock-body">
          ${regular.map(n => {
            const tag = (n.tags && n.tags[0]) || '';
            return `<div class="lrow">
              <a class="ltitle" href="#" onclick="showDetail('news','${n.id}');return false;">${esc(n.title)}</a>
              ${tag ? '<span class="ltag">' + esc(tag) + '</span>' : ''}
              <span class="lmeta">${esc(n.source_name || '')}</span>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    }

    let newsList = document.getElementById('sb-news-list');
    if (!newsList) {
      newsList = document.createElement('div');
      newsList.id = 'sb-news-list';
      const label = container.querySelector('.seclabel');
      if (label) label.insertAdjacentElement('afterend', newsList);
      else container.prepend(newsList);
    }
    newsList.innerHTML = html;
    // Real articles replace the static placeholder headlines on the News page and the home page
    document.querySelectorAll('.static-news').forEach(function(el) { el.style.display = 'none'; });
    var hc = document.getElementById('home-current-events');
    if (hc) {
      var top3 = data.slice(0, 3);
      hc.innerHTML = '<div class="trend-story"><h4><a href="/article/' + esc(top3[0].id) + '" onclick="showDetail(\'news\',\'' + escJs(top3[0].id) + '\');return false;">' + esc(top3[0].title) + '</a></h4></div>'
        + top3.slice(1).map(function(n) { return '<a class="trend-more" href="/article/' + esc(n.id) + '" onclick="showDetail(\'news\',\'' + escJs(n.id) + '\');return false;">' + esc(n.title) + '</a>'; }).join('')
        + '<a class="trend-all" href="/news" onclick="showSec(\'news\');return false;">' + esc(t('home.all_news', 'all news')) + '</a>';
    }

    // Update count
    const label = container.querySelector('.seclabel');
    if (label) {
      label.innerHTML = t('news.section_label') + ' &nbsp;&middot;&nbsp; ' + t('news.articles_count').replace('{count}', data.length);
    }
    console.log('Loaded ' + data.length + ' news from Supabase');
  } catch(e) {
    console.warn('News load failed:', e);
  }
}

// ── DIRECTORY: Load from Supabase ──
async function loadDirectoryFromSupabase() {
  if (!sbReady()) return;
  try {
    const { data, error } = await _sb
      .from('directory_entries')
      .select('id, organization_name, description, category, website_url, location, country, is_verified, tags')
      .eq('status', 'approved')
      .order('is_verified', { ascending: false })
      .order('organization_name')
      .limit(100);
    if (error || !data || data.length === 0) return;

    // Build tag counts for popular tags
    const tagCounts = {};
    data.forEach(d => {
      if (d.tags && d.tags.length) {
        d.tags.forEach(tag => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      }
    });
    // Sort by frequency, take top 20
    const popularTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    // Group by category
    const groups = {};
    data.forEach(d => {
      const cat = d.category || 'other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(d);
    });

    const container = document.getElementById('sec-directory');
    if (!container) return;

    let dirList = document.getElementById('sb-directory-list');
    if (!dirList) {
      dirList = document.createElement('div');
      dirList.id = 'sb-directory-list';
      // Insert after the map section
      const mapWrap = container.querySelector('#related-dirs') || container.querySelector('.mapwrap');
      if (mapWrap) mapWrap.insertAdjacentElement('afterend', dirList);
      else container.appendChild(dirList);
    }

    // Popular tags bar
    let tagsHtml = '';
    if (popularTags.length > 0) {
      tagsHtml += '<div class="popular-tags-bar" id="dir-popular-tags">';
      tagsHtml += '<h4>Popular Tags</h4>';
      tagsHtml += '<div class="tag-cloud">';
      popularTags.forEach(function(pair) {
        tagsHtml += '<a class="dir-tag" href="#" onclick="filterByTag(\'' + escJs(pair[0]) + '\');return false;">' + esc(pair[0]) + '<span class="dir-tag-count">' + pair[1] + '</span></a>';
      });
      tagsHtml += '</div></div>';
    }

    const catLabels = {
      societies: t('dir_cat_labels.societies'),
      waldorf: t('dir_cat_labels.waldorf'),
      biodynamic: t('dir_cat_labels.biodynamic'),
      medicine: t('dir_cat_labels.medicine'),
      camphill: t('dir_cat_labels.camphill'),
      eurythmy: t('dir_cat_labels.eurythmy'),
      eldercare: t('dir_cat_labels.eldercare'),
      community: t('dir_cat_labels.community'),
      christian_community: t('dir_cat_labels.christian_community', 'The Christian Community'),
      online: t('dir_cat_labels.online'),
      science: t('dir_cat_labels.science', 'Science & Technology'),
      other: t('dir_cat_labels.other')
    };

    let html = tagsHtml + '<div id="tag-filter-bar"></div>';
    html += '<div class="catgrid" style="grid-template-columns:repeat(3,1fr);margin-top:16px;" id="dir-catgrid">';
    for (const [cat, entries] of Object.entries(groups)) {
      const label = catLabels[cat] || cat;
      html += `<div class="catblock reveal visible">
        <div class="catblock-head"><h3>${esc(label)}</h3><span class="alllink">${entries.length}</span></div>
        <ul>${entries.map(e => {
          const v = e.is_verified ? '<sup>&#10003;</sup>' : '';
          const loc = e.location || '';
          const entryTags = (e.tags && e.tags.length) ? '<div style="margin-top:3px;">' + e.tags.slice(0, 3).map(function(tg) { return '<a class="dir-tag" href="#" onclick="filterByTag(\'' + escJs(tg) + '\');return false;">' + esc(tg) + '</a>'; }).join('') + '</div>' : '';
          return `<li><a href="#" onclick="showDetail('directory','${e.id}');return false;">${esc(e.organization_name)}${v}</a> <span style="font-size:11px;color:var(--text-muted);">${esc(loc)}</span>${entryTags}</li>`;
        }).join('')}</ul>
      </div>`;
    }
    html += '</div>';
    dirList.innerHTML = html;

    // Store data for tag filtering
    window._directoryData = data;
    window._dirCatLabels = catLabels;
    console.log('Loaded ' + data.length + ' directory entries from Supabase');
  } catch(e) {
    console.warn('Directory load failed:', e);
  }
}

// ── TAG FILTER: filter directory entries by tag ──
var _activeTag = null;

function filterByTag(tag) {
  // Navigate to directory section
  showSec('directory');

  // If same tag clicked, clear filter
  if (_activeTag === tag) {
    clearTagFilter();
    return;
  }
  _activeTag = tag;

  // If we don't have cached data, do a Supabase query
  if (!window._directoryData || !window._directoryData.length) {
    _filterByTagFromSupabase(tag);
    return;
  }

  // Filter from cached data
  var filtered = window._directoryData.filter(function(d) {
    return d.tags && d.tags.indexOf(tag) !== -1;
  });

  _renderTagFilterResults(tag, filtered);
}

function _renderTagFilterResults(tag, filtered) {
  var catLabels = window._dirCatLabels || {};
  var dirList = document.getElementById('sb-directory-list');
  if (!dirList) return;

  // Update active state on tag cloud
  var tagLinks = dirList.querySelectorAll('.popular-tags-bar .dir-tag');
  tagLinks.forEach(function(el) {
    if (el.textContent.replace(/\d+$/, '').trim() === tag) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  // Show filter bar
  var filterBar = document.getElementById('tag-filter-bar');
  if (filterBar) {
    filterBar.innerHTML = '<div class="tag-filter-active-bar">'
      + '<span>Showing <strong>' + filtered.length + '</strong> entries tagged <strong>"' + esc(tag) + '"</strong></span>'
      + '<a class="tag-filter-clear" href="#" onclick="clearTagFilter();return false;">Clear filter &times;</a>'
      + '</div>';
  }

  // Rebuild the catgrid with filtered results
  var catGrid = document.getElementById('dir-catgrid');
  if (!catGrid) return;

  if (filtered.length === 0) {
    catGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:32px 0;color:var(--text-muted);">'
      + '<div style="font-size:15px;font-weight:600;">No entries found with tag "' + esc(tag) + '"</div>'
      + '<div style="font-size:13px;margin-top:4px;">Try a different tag or <a href="#" onclick="clearTagFilter();return false;">clear the filter</a>.</div>'
      + '</div>';
    return;
  }

  // Group filtered by category
  var groups = {};
  filtered.forEach(function(d) {
    var cat = d.category || 'other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(d);
  });

  var html = '';
  for (var cat in groups) {
    var entries = groups[cat];
    var label = catLabels[cat] || cat;
    html += '<div class="catblock reveal visible">'
      + '<div class="catblock-head"><h3>' + esc(label) + '</h3><span class="alllink">' + entries.length + '</span></div>'
      + '<ul>' + entries.map(function(e) {
          var v = e.is_verified ? '<sup>&#10003;</sup>' : '';
          var loc = e.location || '';
          var entryTags = (e.tags && e.tags.length) ? '<div style="margin-top:3px;">' + e.tags.slice(0, 3).map(function(tg) { return '<a class="dir-tag' + (tg === _activeTag ? ' active' : '') + '" href="#" onclick="filterByTag(\'' + escJs(tg) + '\');return false;">' + esc(tg) + '</a>'; }).join('') + '</div>' : '';
          return '<li><a href="#" onclick="showDetail(\'directory\',\'' + e.id + '\');return false;">' + esc(e.organization_name) + v + '</a> <span style="font-size:11px;color:var(--text-muted);">' + esc(loc) + '</span>' + entryTags + '</li>';
        }).join('')
      + '</ul></div>';
  }
  catGrid.innerHTML = html;
}

async function _filterByTagFromSupabase(tag) {
  if (!sbReady()) return;
  try {
    var { data, error } = await _sb
      .from('directory_entries')
      .select('id, organization_name, description, category, website_url, location, country, is_verified, tags')
      .eq('status', 'approved')
      .contains('tags', [tag])
      .order('is_verified', { ascending: false })
      .order('organization_name')
      .limit(50);
    if (error || !data) data = [];
    _renderTagFilterResults(tag, data);
  } catch(e) {
    console.warn('Tag filter query failed:', e);
  }
}

function clearTagFilter() {
  _activeTag = null;
  // Re-render from cached data
  if (window._directoryData && window._directoryData.length) {
    var dirList = document.getElementById('sb-directory-list');
    if (!dirList) return;

    // Clear filter bar
    var filterBar = document.getElementById('tag-filter-bar');
    if (filterBar) filterBar.innerHTML = '';

    // Clear active state on tags
    var tagLinks = dirList.querySelectorAll('.popular-tags-bar .dir-tag');
    tagLinks.forEach(function(el) { el.classList.remove('active'); });

    // Rebuild full catgrid
    var catLabels = window._dirCatLabels || {};
    var groups = {};
    window._directoryData.forEach(function(d) {
      var cat = d.category || 'other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(d);
    });

    var catGrid = document.getElementById('dir-catgrid');
    if (!catGrid) return;

    var html = '';
    for (var cat in groups) {
      var entries = groups[cat];
      var label = catLabels[cat] || cat;
      html += '<div class="catblock reveal visible">'
        + '<div class="catblock-head"><h3>' + esc(label) + '</h3><span class="alllink">' + entries.length + '</span></div>'
        + '<ul>' + entries.map(function(e) {
            var v = e.is_verified ? '<sup>&#10003;</sup>' : '';
            var loc = e.location || '';
            var entryTags = (e.tags && e.tags.length) ? '<div style="margin-top:3px;">' + e.tags.slice(0, 3).map(function(tg) { return '<a class="dir-tag" href="#" onclick="filterByTag(\'' + escJs(tg) + '\');return false;">' + esc(tg) + '</a>'; }).join('') + '</div>' : '';
            return '<li><a href="#" onclick="showDetail(\'directory\',\'' + e.id + '\');return false;">' + esc(e.organization_name) + v + '</a> <span style="font-size:11px;color:var(--text-muted);">' + esc(loc) + '</span>' + entryTags + '</li>';
          }).join('')
        + '</ul></div>';
    }
    catGrid.innerHTML = html;
  } else {
    loadDirectoryFromSupabase();
  }
}

// ── HELPER: time ago ──
function timeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diff = Math.floor((now - d) / 86400000);
  if (diff < 0) return localDate(dateStr, { month: 'short', day: 'numeric' });
  if (diff === 0) return t('common.today');
  if (diff === 1) return t('common.yesterday');
  if (diff < 7) return t('common.days_ago').replace('{count}', diff);
  if (diff < 30) return t('common.weeks_ago').replace('{count}', Math.floor(diff / 7));
  return localDate(dateStr, { month: 'short', day: 'numeric' });
}

// ══════════════════════════════════════════
//  CALENDAR SYSTEM
//  Visual month calendar, event data, mini
//  sidebar calendar, event submission form.
// ══════════════════════════════════════════

// Community events come from Supabase (get_upcoming_events); festivals are computed below.
var calEvents = [];


// Memorial commemorative dates (recurring annually)
var MEMORIAL_DATES = [
  { month: 2, day: 27, name: 'Rudolf Steiner', type: 'birth', year: 1861 },
  { month: 3, day: 30, name: 'Rudolf Steiner', type: 'death', year: 1925 },
  { month: 3, day: 14, name: 'Marie Steiner-von Sivers', type: 'birth', year: 1867 },
  { month: 12, day: 27, name: 'Marie Steiner-von Sivers', type: 'death', year: 1948 },
  { month: 2, day: 22, name: 'Ita Wegman', type: 'birth', year: 1876 },
  { month: 3, day: 4, name: 'Ita Wegman', type: 'death', year: 1943 },
  { month: 2, day: 19, name: 'Ehrenfried Pfeiffer', type: 'birth', year: 1899 },
  { month: 11, day: 30, name: 'Ehrenfried Pfeiffer', type: 'death', year: 1961 },
  { month: 9, day: 25, name: 'Karl Konig', type: 'birth', year: 1902 },
  { month: 3, day: 27, name: 'Karl Konig', type: 'death', year: 1966 },
  { month: 12, day: 10, name: 'Albert Steffen', type: 'birth', year: 1884 },
  { month: 7, day: 13, name: 'Albert Steffen', type: 'death', year: 1963 }
];

// Anthroposophical Holidays & Festivals
// Every entry carries a short description and its sources (shown in the calendar day popup).
var _SRC = {
  festivals: ['Rudolf Steiner Archive: Festivals', 'https://rsarchive.org/Festivals/'],
  christmas: ['Steiner, Christmas lectures (rsarchive)', 'https://rsarchive.org/Lectures/Christmas/'],
  holyNights: ['Rudolf Steiner Archive: 12 Holy Nights & Epiphany', 'https://rsarchive.org/blog/HolyNights.html'],
  easterLecture: ['Steiner, GA 233a, 21 April 1924 (rsarchive)', 'https://rsarchive.org/Lectures/GA233a/English/SOL/19240421p01.html'],
  easterDate: ['Date of Easter (Wikipedia)', 'https://en.wikipedia.org/wiki/Date_of_Easter'],
  ascPent: ['Steiner, The Festivals and Their Meaning III: Ascension and Pentecost (rsarchive)', 'https://rsarchive.org/Lectures/AscenPent/'],
  parzival: ['Steiner, GA 149, 2 January 1914 (rsarchive)', 'https://rsarchive.org/Lectures/GA149/English/SOL/19140102p01.html'],
  usnoSeasons: ['U.S. Naval Observatory: Earth Seasons', 'https://aa.usno.navy.mil/data/Earth_Seasons'],
  usnoMoon: ['U.S. Naval Observatory: Moon Phases', 'https://aa.usno.navy.mil/data/MoonPhases'],
  wiki: function(title, page) { return [title + ' (Wikipedia)', 'https://en.wikipedia.org/wiki/' + page]; }
};

// Self-hosted copies of free-licensed Wikimedia Commons images (credit and source page shown in the popup)
var FESTIVAL_IMAGES = {
  epiphany: {"src": "https://bnrvgitzbpocratvszgk.supabase.co/storage/v1/object/public/event-images/festivals/epiphany.jpg", "alt": "Adoration of the Magi, Gentile da Fabriano (1423)", "page": "https://commons.wikimedia.org/wiki/File:Gentile_da_Fabriano_-_Adorazione_dei_Magi_-_Google_Art_Project.jpg", "credit": "Gentile da Fabriano, Public domain, via Wikimedia Commons"},
  candlemas: {"src": "https://bnrvgitzbpocratvszgk.supabase.co/storage/v1/object/public/event-images/festivals/candlemas.jpg", "alt": "Presentation of Christ in the Temple, Giotto, Scrovegni Chapel (c. 1305)", "page": "https://commons.wikimedia.org/wiki/File:Giotto_di_Bondone_-_No._19_Scenes_from_the_Life_of_Christ_-_3._Presentation_of_Christ_at_the_Temple_-_WGA09197.jpg", "credit": "Giotto, Public domain, via Wikimedia Commons"},
  johanni: {"src": "https://bnrvgitzbpocratvszgk.supabase.co/storage/v1/object/public/event-images/festivals/johanni.jpg", "alt": "St. John's fire (Johannisfeuer) burning at night", "page": "https://commons.wikimedia.org/wiki/File:Johannisfeuer-1.jpg", "credit": "Walter J. Pilsak, Waldsassen, CC BY-SA 3.0, via Wikimedia Commons"},
  michaelmas: {"src": "https://bnrvgitzbpocratvszgk.supabase.co/storage/v1/object/public/event-images/festivals/michaelmas.jpg", "alt": "St. Michael and the Dragon, Raphael (c. 1505)", "page": "https://commons.wikimedia.org/wiki/File:Raffaello_Sanzio_-_St_Michael_and_the_Dragon_-_WGA18633.jpg", "credit": "Raphael, Public domain, via Wikimedia Commons"},
  martinmas: {"src": "https://bnrvgitzbpocratvszgk.supabase.co/storage/v1/object/public/event-images/festivals/martinmas.jpg", "alt": "Glowing paper sun lantern for St. Martin's lantern walk", "page": "https://commons.wikimedia.org/wiki/File:Lampion_an_Martinslaterne.jpg", "credit": "XDAS123, CC BY-SA 4.0, via Wikimedia Commons"},
  nicholas: {"src": "https://bnrvgitzbpocratvszgk.supabase.co/storage/v1/object/public/event-images/festivals/nicholas.jpg", "alt": "Icon of St. Nicholas of Myra (1294)", "page": "https://commons.wikimedia.org/wiki/File:Nikola_from_1294.jpg", "credit": "Aleksa Petrov, Public domain, via Wikimedia Commons"},
  holynights: {"src": "https://bnrvgitzbpocratvszgk.supabase.co/storage/v1/object/public/event-images/festivals/holynights.jpg", "alt": "Rudolf Steiner's apocalyptic seal: the woman clothed with the sun, moon at her feet", "page": "https://commons.wikimedia.org/wiki/File:Rudolf_Steiner%27s_Apocalyptic_Seal_-_5_woman_clothed_with_the_sun.png", "credit": "Clara Rettich, Public domain, via Wikimedia Commons"},
  christmas: {"src": "https://bnrvgitzbpocratvszgk.supabase.co/storage/v1/object/public/event-images/festivals/christmas.jpg", "alt": "The Nativity, Giotto, Scrovegni Chapel (c. 1305)", "page": "https://commons.wikimedia.org/wiki/File:Giotto_di_Bondone_-_No._17_Scenes_from_the_Life_of_Christ_-_1._Nativity_-_Birth_of_Jesus_-_WGA09193.jpg", "credit": "Giotto, Public domain, via Wikimedia Commons"},
  advent: {"src": "https://bnrvgitzbpocratvszgk.supabase.co/storage/v1/object/public/event-images/festivals/advent.jpg", "alt": "Advent wreath with violet and rose candles", "page": "https://commons.wikimedia.org/wiki/File:Advent_wreath_with_violet_and_rose_candles_1.jpg", "credit": "PHILIP János, CC0, via Wikimedia Commons"},
  ashwed: {"src": "https://bnrvgitzbpocratvszgk.supabase.co/storage/v1/object/public/event-images/festivals/ashwed.jpg", "alt": "Ash Wednesday (Aschermittwoch), Carl Spitzweg (c. 1860)", "page": "https://commons.wikimedia.org/wiki/File:Carl_Spitzweg_-_Aschermittwoch.jpg", "credit": "Carl Spitzweg, Public domain, via Wikimedia Commons"},
  palmsun: {"src": "https://bnrvgitzbpocratvszgk.supabase.co/storage/v1/object/public/event-images/festivals/palmsun.jpg", "alt": "Entry into Jerusalem, Giotto, Scrovegni Chapel (c. 1305)", "page": "https://commons.wikimedia.org/wiki/File:Giotto_di_Bondone_-_No._26_Scenes_from_the_Life_of_Christ_-_10._Entry_into_Jerusalem_-_WGA09206.jpg", "credit": "Giotto, Public domain, via Wikimedia Commons"},
  maundy: {"src": "https://bnrvgitzbpocratvszgk.supabase.co/storage/v1/object/public/event-images/festivals/maundy.jpg", "alt": "The Last Supper, Leonardo da Vinci (1495-1498)", "page": "https://commons.wikimedia.org/wiki/File:Leonardo_da_Vinci_(1452-1519)_-_The_Last_Supper_(1495-1498).jpg", "credit": "Leonardo da Vinci, Public domain, via Wikimedia Commons"},
  goodfri: {"src": "https://bnrvgitzbpocratvszgk.supabase.co/storage/v1/object/public/event-images/festivals/goodfri.jpg", "alt": "The Crucifixion, Isenheim Altarpiece, Matthias Grünewald (1512-1516)", "page": "https://commons.wikimedia.org/wiki/File:Matthias_Gr%C3%BCnewald_-_The_Crucifixion_-_WGA10723.jpg", "credit": "Matthias Grünewald, Public domain, via Wikimedia Commons"},
  holysat: {"src": "https://bnrvgitzbpocratvszgk.supabase.co/storage/v1/object/public/event-images/festivals/holysat.jpg", "alt": "The Body of the Dead Christ in the Tomb, Hans Holbein the Younger (1521-1522)", "page": "https://commons.wikimedia.org/wiki/File:The_Body_of_the_Dead_Christ_in_the_Tomb,_and_a_detail,_by_Hans_Holbein_the_Younger.jpg", "credit": "Hans Holbein the Younger, Public domain, via Wikimedia Commons"},
  easter: {"src": "https://bnrvgitzbpocratvszgk.supabase.co/storage/v1/object/public/event-images/festivals/easter.jpg", "alt": "The Resurrection, Isenheim Altarpiece, Matthias Grünewald (1512-1516)", "page": "https://commons.wikimedia.org/wiki/File:Grunewald_Resurrection_Isenheim.jpg", "credit": "Matthias Grünewald, Public domain, via Wikimedia Commons"},
  ascension: {"src": "https://bnrvgitzbpocratvszgk.supabase.co/storage/v1/object/public/event-images/festivals/ascension.jpg", "alt": "The Ascension, Giotto, Scrovegni Chapel (c. 1305)", "page": "https://commons.wikimedia.org/wiki/File:Giotto_di_Bondone_-_No._38_Scenes_from_the_Life_of_Christ_-_22._Ascension_-_WGA09226.jpg", "credit": "Giotto, Public domain, via Wikimedia Commons"},
  pentecost: {"src": "https://bnrvgitzbpocratvszgk.supabase.co/storage/v1/object/public/event-images/festivals/pentecost.jpg", "alt": "Rudolf Steiner, apocalyptic seal 7: the dove above the Grail cup", "page": "https://commons.wikimedia.org/wiki/File:Rudolf_Steiner%27s_Apocalyptic_Seal_-_7_resurrection.png", "credit": "Clara Rettich, Public domain, via Wikimedia Commons"},
  trinity: {"src": "https://bnrvgitzbpocratvszgk.supabase.co/storage/v1/object/public/event-images/festivals/trinity.jpg", "alt": "The Holy Trinity icon, Andrei Rublev (c. 1411-1425)", "page": "https://commons.wikimedia.org/wiki/File:Andrey_Rublev_-_%D0%A1%D0%B2._%D0%A2%D1%80%D0%BE%D0%B8%D1%86%D0%B0_-_Google_Art_Project.jpg", "credit": "Andrei Rublev, Public domain, via Wikimedia Commons"},
  parzival: {"src": "https://bnrvgitzbpocratvszgk.supabase.co/storage/v1/object/public/event-images/festivals/parzival.jpg", "alt": "Thin 4% crescent moon with earthshine on the dark limb", "page": "https://commons.wikimedia.org/wiki/File:4%25_Illuminated_Crescent_Moon_with_Earthshine_(41490002672).jpg", "credit": "Stephen Rahn from Macon, GA, USA, CC0, via Wikimedia Commons"},
  equinox_spring: {"src": "https://bnrvgitzbpocratvszgk.supabase.co/storage/v1/object/public/event-images/festivals/equinox_spring.jpg", "alt": "Spring and Easter season table in a Waldorf school classroom, Prague", "page": "https://commons.wikimedia.org/wiki/File:Stole%C4%8Dek_ro%C4%8Dn%C3%ADch_dob_-_Jaro-obdob%C3%AD_Velikonoc_-_Waldrofsk%C3%A1_%C5%A1kola_Praha_D%C4%9Bdina_-_2._t%C5%99%C3%ADda.jpg", "credit": "Krejci.praha6, CC BY-SA 4.0, via Wikimedia Commons"},
  solstice_summer: {"src": "https://bnrvgitzbpocratvszgk.supabase.co/storage/v1/object/public/event-images/festivals/solstice_summer.jpg", "alt": "Summer solstice sunrise at Stonehenge, 21 June 2019", "page": "https://commons.wikimedia.org/wiki/File:Stonehenge,_sunrise_June_21_2019.jpg", "credit": "Callyclan, CC BY-SA 4.0, via Wikimedia Commons"},
  equinox_autumn: {"src": "https://bnrvgitzbpocratvszgk.supabase.co/storage/v1/object/public/event-images/festivals/equinox_autumn.jpg", "alt": "Autumn nature table at a Steiner (Waldorf) playgroup", "page": "https://commons.wikimedia.org/wiki/File:Steiner_Autumn_Table.JPG", "credit": "Dahliyani Briedis, CC BY 3.0, via Wikimedia Commons"},
  solstice_winter: {"src": "https://bnrvgitzbpocratvszgk.supabase.co/storage/v1/object/public/event-images/festivals/solstice_winter.jpg", "alt": "The Goetheanum in Dornach at winter sunset over snow (January)", "page": "https://commons.wikimedia.org/wiki/File:Goetheanum_im_Sonnenuntergang.JPG", "credit": "Florian K at German Wikipedia, CC BY-SA 3.0, via Wikimedia Commons"},
  waldorf1919: {"src": "https://bnrvgitzbpocratvszgk.supabase.co/storage/v1/object/public/event-images/festivals/waldorf1919.jpg", "alt": "Freie Waldorfschule Uhlandshöhe, Stuttgart, the first Waldorf school", "page": "https://commons.wikimedia.org/wiki/File:Landappbw_95260_1819_Waldorfschule_Uhlandsh%C3%B6he_Stuttgart.jpg", "credit": "Martin Hahn, CC0, via Wikimedia Commons"},
  goetheanum_fire: {"src": "https://bnrvgitzbpocratvszgk.supabase.co/storage/v1/object/public/event-images/festivals/goetheanum_fire.jpg", "alt": "Smouldering ruins of the First Goetheanum after the fire, 1923", "page": "https://commons.wikimedia.org/wiki/File:Brandruine_Goetheanum_1923.jpg", "credit": "Max Benzinger, Public domain, via Wikimedia Commons"},
  christmas_conference: {"src": "https://bnrvgitzbpocratvszgk.supabase.co/storage/v1/object/public/event-images/festivals/christmas_conference.jpg", "alt": "Rudolf Steiner's blackboard drawing of the second Goetheanum motif, 1 January 1924 (Christmas Conference)", "page": "https://commons.wikimedia.org/wiki/File:Wandtafelbild_-_Gotheanum-Motiv_(1924).jpg", "credit": "Rudolf Steiner, Public domain, via Wikimedia Commons"},
  koberwitz: {"src": "https://bnrvgitzbpocratvszgk.supabase.co/storage/v1/object/public/event-images/festivals/koberwitz.jpg", "alt": "Koberwitz manor (Kobierzyce palace), site of the 1924 Agriculture Course", "page": "https://commons.wikimedia.org/wiki/File:Kobierzyce-palac.jpg", "credit": "Julo (Wikimedia user), Public domain, via Wikimedia Commons"}
};

var ANTHRO_HOLIDAYS = [
  // Fixed dates
  { key: 'epiphany', month: 1, day: 6, title: '12 Holy Nights End (Epiphany)', cat: 'festival',
    desc: 'Epiphany closes the Twelve Holy Nights and opens the season of Epiphany: the light of Christmas carried out into the year.',
    src: [_SRC.holyNights, _SRC.wiki('Epiphany', 'Epiphany_(holiday)')] },
  { key: 'candlemas', month: 2, day: 2, title: 'Candlemas', cat: 'festival',
    desc: 'Forty days after Christmas: the midpoint between winter solstice and spring equinox, traditionally a festival of candles and returning light.',
    src: [_SRC.wiki('Candlemas', 'Candlemas')] },
  { key: 'johanni', month: 6, day: 24, title: "St. John's Tide (Johanni)", cat: 'festival',
    desc: 'Festival of John the Baptist near midsummer. Steiner described it as the time when the Earth breathes out most fully into the cosmos; often celebrated with a bonfire.',
    src: [_SRC.festivals, _SRC.wiki('Nativity of John the Baptist', 'Nativity_of_John_the_Baptist')] },
  { key: 'michaelmas', month: 9, day: 29, title: 'Michaelmas - Festival of Courage', cat: 'festival',
    desc: 'Festival of the Archangel Michael at the turn to autumn. Steiner hoped it would become a festival of courage and inner strength as nature dies back.',
    src: [_SRC.festivals, _SRC.wiki('Michaelmas', 'Michaelmas')] },
  { key: 'martinmas', month: 11, day: 11, title: 'Martinmas (Lantern Walk)', cat: 'festival',
    desc: 'Feast of St. Martin, who shared his cloak with a beggar. In Waldorf communities children carry lanterns: carrying an inner light into the darkening season.',
    src: [_SRC.wiki('Martinmas', 'Martinmas')] },
  { key: 'nicholas', month: 12, day: 6, title: 'St. Nicholas Day', cat: 'festival',
    desc: 'Feast of St. Nicholas of Myra, patron of children; small gifts are left in shoes the night before.',
    src: [_SRC.wiki('Saint Nicholas Day', 'Saint_Nicholas_Day')] },
  { key: 'holynights', month: 12, day: 24, title: '12 Holy Nights Begin', cat: 'festival',
    desc: 'Christmas Eve. The Twelve Holy Nights begin: a time for inner quiet, review of the past year and preparing the year ahead. Traditions differ on whether the first night is that of 24 or 25 December.',
    src: [_SRC.holyNights, _SRC.christmas] },
  { key: 'christmas', month: 12, day: 25, title: 'Christmas - Birth of Light', cat: 'festival',
    desc: 'The festival of the birth of Christ and of the light reborn at the darkest time of the year.',
    src: [_SRC.christmas, _SRC.wiki('Christmas', 'Christmas')] }
];

// Days relative to Easter Sunday
var EASTER_FESTIVALS = [
  { key: 'ashwed', offset: -46, title: 'Ash Wednesday', desc: 'Beginning of Lent, the forty days of preparation for Easter.', src: [_SRC.wiki('Ash Wednesday', 'Ash_Wednesday')] },
  { key: 'palmsun', offset: -7, title: 'Palm Sunday', desc: 'Entry into Jerusalem; the beginning of Holy Week.', src: [_SRC.wiki('Palm Sunday', 'Palm_Sunday')] },
  { key: 'maundy', offset: -3, title: 'Maundy Thursday', desc: 'The Last Supper and the washing of the feet.', src: [_SRC.wiki('Maundy Thursday', 'Maundy_Thursday')] },
  { key: 'goodfri', offset: -2, title: 'Good Friday', desc: 'The Crucifixion. In the Parzival saga, the day the Grail is renewed.', src: [_SRC.wiki('Good Friday', 'Good_Friday'), _SRC.parzival] },
  { key: 'holysat', offset: -1, title: 'Holy Saturday', desc: 'The day in the grave: the descent into the depths of the Earth.', src: [_SRC.wiki('Holy Saturday', 'Holy_Saturday')] },
  { key: 'easter', offset: 0, title: 'Easter - Festival of Resurrection', desc: 'First Sunday after the first full moon after the spring equinox. Its date is set by sun and moon together, which Steiner discussed in his 1924 Easter lectures.', src: [_SRC.easterLecture, _SRC.easterDate] },
  { key: 'ascension', offset: 39, title: 'Ascension', desc: 'Forty days after Easter: the Ascension of Christ.', src: [_SRC.ascPent, _SRC.wiki('Feast of the Ascension', 'Feast_of_the_Ascension')] },
  { key: 'pentecost', offset: 49, title: 'Pentecost (Whitsun) - Awakening of Spirit', desc: 'Fifty days after Easter. Steiner called Whitsun the festival of the free individuality.', src: [_SRC.ascPent, _SRC.wiki('Pentecost', 'Pentecost')] },
  { key: 'trinity', offset: 56, title: 'Trinity Sunday', desc: 'The Sunday after Pentecost, closing the Easter season.', src: [_SRC.wiki('Trinity Sunday', 'Trinity_Sunday')] }
];

// Historical anniversaries (shown as memorial-style days)
var ANTHRO_ANNIVERSARIES = [
  { key: 'waldorf1919', month: 9, day: 7, year: 1919, title: 'First Waldorf School opened (Stuttgart)',
    desc: 'The Free Waldorf School on the Uhlandshoehe in Stuttgart opened for the children of Waldorf-Astoria factory workers, founded by Emil Molt with Rudolf Steiner.',
    src: [_SRC.wiki('History of Waldorf schools', 'History_of_Waldorf_schools'), ['German History in Documents: Opening of the first Waldorf school', 'https://germanhistorydocs.org/en/weimar-germany-1918-1933/opening-of-the-first-waldorf-school-september-1919.pdf']] },
  { key: 'goetheanum_fire', month: 12, day: 31, year: 1922, title: 'First Goetheanum destroyed by fire',
    desc: 'The first Goetheanum in Dornach burned on New Year\'s Eve 1922 into 1 January 1923.',
    src: [_SRC.wiki('Goetheanum', 'Goetheanum')] },
  { key: 'christmas_conference', month: 12, day: 25, year: 1923, title: 'Foundation Stone laid (Christmas Conference)',
    desc: 'At the Christmas Conference in Dornach (24 December 1923 to 1 January 1924) Steiner refounded the General Anthroposophical Society and laid the Foundation Stone meditation on 25 December.',
    src: [_SRC.wiki('General Anthroposophical Society', 'General_Anthroposophical_Society'), ['Steiner, The Christmas Conference, GA 260 (e.Lib)', 'https://rudolfsteinerelib.org/GA/index.php?ga=GA0260']] },
  { key: 'koberwitz', month: 6, day: 7, year: 1924, title: 'Agriculture Course begins (Koberwitz)',
    desc: 'Steiner gave the eight lectures of the Agriculture Course at Koberwitz, 7 to 16 June 1924: the beginning of biodynamic farming.',
    src: [_SRC.wiki('Biodynamic agriculture', 'Biodynamic_agriculture'), ['Paull (2020), The Koberwitzers', 'https://orgprints.org/38176/1/Paull2020.Koberwitzers.IJEPM.pdf']] }
];

function _computeEaster(yr) {
  // Anonymous Gregorian algorithm
  var a = yr % 19, b = Math.floor(yr / 100), c = yr % 100;
  var d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  var g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  var i = Math.floor(c / 4), k = c % 4;
  var l = (32 + 2 * e + 2 * i - h - k) % 7;
  var m = Math.floor((a + 11 * h + 22 * l) / 451);
  var month = Math.floor((h + l - 7 * m + 114) / 31);
  var day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(yr, month - 1, day);
}

function _dateStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function _addDays(d, n) { var r = new Date(d); r.setDate(r.getDate() + n); return r; }

// ── Astronomy (Meeus, Astronomical Algorithms; accurate to a few minutes for 2000-2100) ──
function _jdToDate(jd) { return new Date((jd - 2440587.5) * 86400000); }
function _rad(d) { return d * Math.PI / 180; }

// Equinoxes and solstices: idx 0 = March, 1 = June, 2 = September, 3 = December
var _SEASON_POLY = [
  [2451623.80984, 365242.37404, 0.05169, -0.00411, -0.00057],
  [2451716.56767, 365241.62603, 0.00325, 0.00888, -0.00030],
  [2451810.21715, 365242.01767, -0.11575, 0.00337, 0.00078],
  [2451900.05952, 365242.74049, -0.06223, -0.00823, 0.00032]
];
var _SEASON_A = [485,203,199,182,156,136,77,74,70,58,52,50,45,44,29,18,17,16,14,12,12,12,9,8];
var _SEASON_B = [324.96,337.23,342.08,27.85,73.14,171.52,222.54,296.72,243.58,119.81,297.17,21.02,247.54,325.15,60.93,155.12,288.79,198.04,199.76,95.39,287.11,320.81,227.73,15.45];
var _SEASON_C = [1934.136,32964.467,20.186,445267.112,45036.886,22518.443,65928.934,3034.906,9037.513,33718.147,150.678,2281.226,29929.562,31555.956,4443.417,67555.328,4562.452,62894.029,31436.921,14577.848,31931.756,34777.259,1222.114,16859.074];

function _seasonDate(yr, idx) {
  var y = (yr - 2000) / 1000, c = _SEASON_POLY[idx];
  var jde0 = c[0] + c[1] * y + c[2] * y * y + c[3] * y * y * y + c[4] * y * y * y * y;
  var t = (jde0 - 2451545.0) / 36525;
  var w = _rad(35999.373 * t - 2.47);
  var dl = 1 + 0.0334 * Math.cos(w) + 0.0007 * Math.cos(2 * w);
  var s = 0;
  for (var i = 0; i < 24; i++) s += _SEASON_A[i] * Math.cos(_rad(_SEASON_B[i] + _SEASON_C[i] * t));
  return _jdToDate(jde0 + 0.00001 * s / dl);
}

// Time of the new moon for lunation number k (k = 0 at 6 Jan 2000)
function _newMoonDate(k) {
  var t = k / 1236.85;
  var jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * t * t - 0.000000150 * t * t * t + 0.00000000073 * t * t * t * t;
  var e = 1 - 0.002516 * t - 0.0000074 * t * t;
  var m = _rad(2.5534 + 29.10535670 * k - 0.0000014 * t * t - 0.00000011 * t * t * t);
  var mp = _rad(201.5643 + 385.81693528 * k + 0.0107582 * t * t + 0.00001238 * t * t * t - 0.000000058 * t * t * t * t);
  var f = _rad(160.7108 + 390.67050284 * k - 0.0016118 * t * t - 0.00000227 * t * t * t + 0.000000011 * t * t * t * t);
  var om = _rad(124.7746 - 1.56375588 * k + 0.0020672 * t * t + 0.00000215 * t * t * t);
  jde += -0.40720 * Math.sin(mp) + 0.17241 * e * Math.sin(m) + 0.01608 * Math.sin(2 * mp)
       + 0.01039 * Math.sin(2 * f) + 0.00739 * e * Math.sin(mp - m) - 0.00514 * e * Math.sin(mp + m)
       + 0.00208 * e * e * Math.sin(2 * m) - 0.00111 * Math.sin(mp - 2 * f) - 0.00057 * Math.sin(mp + 2 * f)
       + 0.00056 * e * Math.sin(2 * mp + m) - 0.00042 * Math.sin(3 * mp) + 0.00042 * e * Math.sin(m + 2 * f)
       + 0.00038 * e * Math.sin(m - 2 * f) - 0.00024 * e * Math.sin(2 * mp - m) - 0.00017 * Math.sin(om);
  return _jdToDate(jde);
}

// First new moon strictly after the given date
function _nextNewMoon(after) {
  var k = Math.floor((after.getTime() - Date.UTC(2000, 0, 6)) / (29.530588861 * 86400000)) - 1;
  var nm = _newMoonDate(k);
  while (nm <= after) { k++; nm = _newMoonDate(k); }
  return nm;
}

function _festivalTime(d) {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
}

// Images from Wikimedia Commons (free licenses), keyed by festival; filled in FESTIVAL_IMAGES below
function _addFestival(key, dateStr, title, cat, desc, src, time) {
  var exists = calEvents.some(function(e) { return e.date === dateStr && e.title === title; });
  if (!exists) calEvents.push({ date: dateStr, title: title, cat: cat, loc: '', org: '', time: time || '', desc: desc || '', src: src || [], img: FESTIVAL_IMAGES[key] || null });
}

var _SEASONS = [
  { key: 'equinox_spring', title: 'Spring Equinox', desc: 'Day and night of equal length; the sun crosses the celestial equator northward. Easter is reckoned from the first full moon after this point.' },
  { key: 'solstice_summer', title: 'Summer Solstice', desc: 'Longest day of the year in the northern hemisphere. St. John\'s Tide (24 June) follows a few days later.' },
  { key: 'equinox_autumn', title: 'Autumn Equinox', desc: 'Day and night of equal length as the sun crosses southward. Michaelmas (29 September) follows a week later.' },
  { key: 'solstice_winter', title: 'Winter Solstice', desc: 'Shortest day of the year in the northern hemisphere: the turning point toward returning light, just before Christmas.' }
];

function _injectAnthroHolidays(yr) {
  ANTHRO_HOLIDAYS.forEach(function(h) {
    _addFestival(h.key, yr + '-' + String(h.month).padStart(2, '0') + '-' + String(h.day).padStart(2, '0'), h.title, 'festival', h.desc, h.src);
  });

  // The Twelve Holy Nights, one entry per night (25 Dec - 5 Jan)
  for (var n = 1; n <= 12; n++) {
    var hn = _addDays(new Date(yr, 11, 24), n);
    _addFestival('holynights', _dateStr(hn), 'Holy Night ' + n + ' of 12', 'festival',
      'One of the Twelve Holy Nights between Christmas and Epiphany. Each night is traditionally linked with one month of the coming year.',
      [_SRC.holyNights]);
  }

  // Advent Sundays (4 Sundays before Dec 25)
  var xmas = new Date(yr, 11, 25);
  var xmasDay = xmas.getDay();
  var advent4 = _addDays(xmas, -(xmasDay === 0 ? 7 : xmasDay)); // Sunday before Christmas
  for (var a = 0; a < 4; a++) {
    _addFestival('advent', _dateStr(_addDays(advent4, -7 * a)), 'Advent Sunday ' + (4 - a), 'festival',
      'The four Sundays before Christmas: a season of waiting and preparation. Many Waldorf communities hold an Advent Spiral.',
      [_SRC.wiki('Advent', 'Advent')]);
  }

  // Easter cycle
  var easter = _computeEaster(yr);
  EASTER_FESTIVALS.forEach(function(f) {
    _addFestival(f.key, _dateStr(_addDays(easter, f.offset)), f.title, 'festival', f.desc, f.src);
  });

  // Parzival (Grail) Moon: first crescent after the new moon following Easter Sunday
  var nm = _nextNewMoon(_addDays(easter, 1));
  var crescent = new Date(nm.getTime() + 86400000);
  _addFestival('parzival', _dateStr(crescent), 'Parzival Moon (Grail Moon)', 'festival',
    'Look west after sunset for the thin golden crescent holding the dimly lit dark disk of the moon (earthshine), the image Steiner described as the Grail in the sky at Easter time. Visible about 1 to 3 evenings after the new moon of ' + nm.toLocaleDateString(undefined, { month: 'long', day: 'numeric' }) + '. Interpretations of the exact evening differ.',
    [_SRC.parzival, _SRC.usnoMoon]);

  // Equinoxes and solstices (dated in the viewer's local time zone)
  for (var s = 0; s < 4; s++) {
    var sd = _seasonDate(yr, s);
    _addFestival(_SEASONS[s].key, _dateStr(sd), _SEASONS[s].title, 'festival', _SEASONS[s].desc,
      [_SRC.usnoSeasons, _SRC.wiki(s % 2 ? 'Solstice' : 'Equinox', s % 2 ? 'Solstice' : 'Equinox')], _festivalTime(sd));
  }

  // Historical anniversaries
  ANTHRO_ANNIVERSARIES.forEach(function(h) {
    _addFestival(h.key, yr + '-' + String(h.month).padStart(2, '0') + '-' + String(h.day).padStart(2, '0'),
      h.title + ' (' + (yr - h.year) + ' yrs)', 'memorial', h.desc, h.src);
  });
}

function _injectMemorialDates(yr) {
  MEMORIAL_DATES.forEach(function(m) {
    var dateStr = yr + '-' + String(m.month).padStart(2, '0') + '-' + String(m.day).padStart(2, '0');
    var age = yr - m.year;
    var label = m.type === 'birth'
      ? 'Born ' + age + ' yrs ago: ' + m.name
      : 'Remembering ' + m.name + ' (' + age + ' yrs)';
    // Avoid duplicates
    var exists = calEvents.some(function(e) { return e.date === dateStr && e.cat === 'memorial'; });
    if (!exists) {
      calEvents.push({ date: dateStr, title: label, cat: 'memorial', loc: '', org: '', time: '' });
    }
  });
}

var _curYear = new Date().getFullYear();
for (var _y = _curYear - 1; _y <= _curYear + 5; _y++) { _injectMemorialDates(_y); _injectAnthroHolidays(_y); }

var _calNow = new Date();
var calMonth = _calNow.getMonth();
var calYear = _calNow.getFullYear();
var mcMonth = _calNow.getMonth();
var mcYear = _calNow.getFullYear();

var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
var DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function renderCalendar() {
  var grid = document.getElementById('cal-grid');
  var label = document.getElementById('cal-month-label');
  if (!grid || !label) return;

  label.textContent = MONTHS[calMonth] + ' ' + calYear;

  var first = new Date(calYear, calMonth, 1);
  var startDay = first.getDay();
  var daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  var prevDays = new Date(calYear, calMonth, 0).getDate();
  var today = new Date();

  var html = '';
  DAYS.forEach(function(d) { html += '<div class="day-label">' + d + '</div>'; });

  // Previous month fill
  for (var i = startDay - 1; i >= 0; i--) {
    html += '<div class="cal-day other-month" aria-hidden="true"><div class="d-num">' + (prevDays - i) + '</div></div>';
  }

  // Current month days
  for (var d = 1; d <= daysInMonth; d++) {
    var dateStr = calYear + '-' + String(calMonth + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    var isToday = (d === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear());
    var dayEvents = calEvents.filter(function(e) { return e.date === dateStr; });
    var hasMemorial = dayEvents.some(function(e) { return e.cat === 'memorial'; });
    var hasFestival = dayEvents.some(function(e) { return e.cat === 'festival'; });

    var dayAttrs = '';
    if (dayEvents.length) {
      var dayLabel = localDate(dateStr, { weekday: 'long', month: 'long', day: 'numeric' }) + ', ' + dayEvents.length + ' '
        + (dayEvents.length === 1 ? 'entry' : 'entries') + ': ' + dayEvents.slice(0, 3).map(function(ev) { return ev.title; }).join('; ');
      dayAttrs = ' role="button" tabindex="0" data-kbd-click aria-label="' + esc(dayLabel) + '" onclick="showDayEvents(\'' + dateStr + '\', this)"';
    }
    html += '<div class="cal-day' + (isToday ? ' today' : '') + (hasFestival ? ' festival-day' : '') + (hasMemorial ? ' memorial-day' : '') + (dayEvents.length ? ' has-events' : '') + '"' + dayAttrs + '>';
    html += '<div class="d-num">' + d + '</div>';
    dayEvents.forEach(function(ev) {
      html += '<div class="cal-ev ' + esc(ev.cat) + '" title="' + esc(ev.title) + '">' + esc(ev.title) + '</div>';
    });
    html += '</div>';
  }

  // Next month fill
  var totalCells = startDay + daysInMonth;
  var remaining = (totalCells % 7 === 0) ? 0 : 7 - (totalCells % 7);
  for (var n = 1; n <= remaining; n++) {
    html += '<div class="cal-day other-month" aria-hidden="true"><div class="d-num">' + n + '</div></div>';
  }

  grid.innerHTML = html;
}

function calNavMonth(dir) {
  calMonth += dir;
  if (calMonth > 11) { calMonth = 0; calYear++; _injectMemorialDates(calYear); _injectAnthroHolidays(calYear); }
  if (calMonth < 0) { calMonth = 11; calYear--; _injectMemorialDates(calYear); _injectAnthroHolidays(calYear); }
  renderCalendar();
}

// Day popup: an accessible dialog. Focus moves to Close; Escape, the overlay or Close return focus to the trigger.
var _dpReturnFocus = null;
function closeDayPopup(restore) {
  var p = document.querySelector('.day-popup'); if (p) p.remove();
  var o = document.querySelector('.day-popup-overlay'); if (o) o.remove();
  if (restore !== false && _dpReturnFocus && document.body.contains(_dpReturnFocus)) _dpReturnFocus.focus();
  _dpReturnFocus = null;
}

function showDayEvents(dateStr, trigger) {
  var dayEvs = calEvents.filter(function(e) { return e.date === dateStr; });
  var label = localDate(dateStr, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  closeDayPopup(false);
  if (dayEvs.length === 0) return;
  _dpReturnFocus = trigger || document.activeElement;

  var overlay = document.createElement('div');
  overlay.className = 'day-popup-overlay';
  overlay.onclick = function() { closeDayPopup(); };
  document.body.appendChild(overlay);

  var popup = document.createElement('div');
  popup.className = 'day-popup';
  popup.setAttribute('role', 'dialog');
  popup.setAttribute('aria-modal', 'true');
  popup.setAttribute('aria-labelledby', 'day-popup-title');
  popup.setAttribute('tabindex', '-1');
  var html = '<button class="dp-close" type="button" aria-label="' + esc(t('common.close', 'Close')) + '" onclick="closeDayPopup()">&times;</button>';
  html += '<h4 id="day-popup-title">' + esc(label) + '</h4>';
  dayEvs.forEach(function(ev) {
    var dpMeta = _evMeta(ev);
    var dpTitle = ev.id ? '<a href="/event/' + esc(ev.id) + '" onclick="closeDayPopup(false);showDetail(\'event\',\'' + escJs(ev.id) + '\');return false;">' + esc(ev.title) + '</a>' : esc(ev.title);
    html += '<div class="dp-event">' + _evImageHtml(ev) + '<h5>' + dpTitle + '</h5>' + (dpMeta ? '<div class="dp-meta">' + dpMeta + '</div>' : '')
      + (ev.desc ? '<p class="dp-desc">' + _linkify(esc(_shortText(ev.desc, 320))) + '</p>' : '') + _evSourcesHtml(ev) + '</div>';
  });
  popup.innerHTML = html;
  document.body.appendChild(popup);
  var closeBtn = popup.querySelector('.dp-close');
  if (closeBtn) closeBtn.focus();
}

// Turn bare http(s) URLs in already-escaped text into links that wrap
function _linkify(escaped) {
  return escaped.replace(/https?:\/\/[^\s<]+/g, function(u) {
    return '<a href="' + escUrl(u.replace(/&amp;/g, '&')) + '" target="_blank" rel="noopener" class="dp-url">' + u + '</a>';
  });
}

// Join an event's time / location / organizer, skipping empty parts (avoids ' · · ').
function _evSourcesHtml(ev) {
  if (!ev.src || !ev.src.length) return '';
  var label = (ev.cat === 'festival' || ev.cat === 'memorial') ? 'Sources: ' : 'Links: ';
  return '<div class="dp-src">' + label + ev.src.map(function(s) {
    return '<a href="' + escUrl(s[1]) + '" target="_blank" rel="noopener">' + esc(s[0]) + '</a>';
  }).join(' &middot; ') + '</div>';
}

function _shortText(txt, max) {
  txt = String(txt || '').split('\n\n')[0];
  return txt.length > max ? txt.slice(0, txt.lastIndexOf(' ', max)) + '...' : txt;
}

// Supabase Storage images: request a resized copy (much smaller, long-cached); other URLs unchanged
function _imgSized(url, width) {
  if (!url || url.indexOf('/storage/v1/object/public/') === -1) return url;
  return url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/') + (url.indexOf('?') === -1 ? '?' : '&') + 'width=' + width + '&quality=72&resize=contain';   // contain keeps the proportions (default cover crops to a strip)
}

function _evImageHtml(ev) {
  if (!ev.img) return '';
  return '<figure class="dp-img"><img src="' + escUrl(_imgSized(ev.img.src, 680)) + '" alt="' + esc(ev.img.alt) + '" loading="lazy">'
    + '<figcaption><a href="' + escUrl(ev.img.page) + '" target="_blank" rel="noopener">' + esc(ev.img.credit) + '</a></figcaption></figure>';
}

function _evMeta(ev) {
  return [ev.time, ev.loc, ev.org].filter(function(x) { return x && String(x).trim(); }).map(esc).join(' &middot; ');
}

var _evListDays = 120;   // the list shows this many days ahead; "Show more" extends it

// Series key: events from one organizer whose titles share a "Prefix:" (e.g. "Mani Webinar: ...")
function _evSeriesKey(ev) {
  var m = /^([^:]{3,40}):/.exec(ev.title || '');
  return (m && ev.cat !== 'festival' && ev.cat !== 'memorial') ? (ev.org || '') + '|' + m[1].toLowerCase() : null;
}

function _evRowHtml(ev, seriesInfo) {
  var d = new Date(ev.date + 'T12:00:00');
  var isToday = (d.toDateString() === new Date().toDateString());
  var cat = String(ev.cat || 'event').replace('_', ' ');
  var meta = _evMeta(ev);
  var title = seriesInfo ? seriesInfo.name + ': ' + seriesInfo.count + ' sessions' : ev.title;
  var html = '<div class="evrow reveal">';
  html += '<div class="evdate' + (isToday ? ' today' : '') + '"><div class="mo">' + localDate(ev.date, { month: 'short' }) + '</div><div class="dy">' + d.getDate() + '</div></div>';
  if (ev.img && ev.img.src) {
    html += '<img class="evthumb" src="' + escUrl(_imgSized(ev.img.src, 160)) + '" alt="" loading="lazy" title="' + esc(ev.img.credit || '') + '">';
  }
  html += '<div class="evinfo"><div class="etag">' + esc(cat.charAt(0).toUpperCase() + cat.slice(1)) + (seriesInfo ? ' &middot; ' + esc(t('events.series', 'series')) : '') + '</div>';
  html += '<h5>' + (ev.id ? '<a href="/event/' + esc(ev.id) + '" onclick="showDetail(\'event\',\'' + escJs(ev.id) + '\');return false;">' + esc(title) + '</a>' : esc(title)) + '</h5>';
  if (seriesInfo) html += '<div class="emeta">' + esc(t('events.series_next', 'Next session')) + ': ' + esc(ev.title.replace(/^[^:]+:\s*/, '')) + '</div>';
  if (meta) html += '<div class="emeta">' + meta + '</div>';
  if (seriesInfo && seriesInfo.later.length) {
    html += '<div class="emeta">' + esc(t('events.series_later', 'Later sessions')) + ': ' + seriesInfo.later.map(function(x) { return esc(localDate(x.date, { month: 'short', day: 'numeric' })); }).join(', ') + '</div>';
  }
  return html + '</div></div>';
}

function renderEventList() {
  var container = document.getElementById('event-list');
  if (!container) return;
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var horizon = new Date(today.getTime() + _evListDays * 864e5);

  var upcoming = calEvents.filter(function(e) {
    return new Date(e.date + 'T23:59:59') >= today && e.cat !== 'memorial';
  }).sort(function(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  var shown = upcoming.filter(function(e) { return new Date(e.date + 'T12:00:00') <= horizon; });

  // Collapse series: keep the first upcoming session, list the later dates under it
  var series = {};
  shown.forEach(function(e) { var k = _evSeriesKey(e); if (k) (series[k] = series[k] || []).push(e); });
  var html = '', lastMonth = '';
  shown.forEach(function(ev) {
    var k = _evSeriesKey(ev), group = k && series[k].length >= 3 ? series[k] : null;
    if (group && group[0] !== ev) return;
    var month = localDate(ev.date, { month: 'long', year: 'numeric' });
    if (month !== lastMonth) { html += '<h4 class="ev-month">' + esc(month) + '</h4>'; lastMonth = month; }
    var sName = group ? /^([^:]+):/.exec(ev.title)[1] : '';
    // Generic prefixes ("Study", "Zoom talk") need the organizer to make sense; series with shared artwork do not
    if (group && ev.org && !(ev.img && group.every(function(x) { return x.img && x.img.src === ev.img.src; }))) sName += ' (' + ev.org.replace(/\s*\(.*\)$/, '') + ')';
    html += _evRowHtml(ev, group ? { name: sName, count: group.length, later: group.slice(1) } : null);
  });
  if (!shown.length) html = '<div class="empty-note">' + esc(t('events.none_yet', 'No upcoming events yet.')) + '</div>';
  if (upcoming.length > shown.length) {
    html += '<button type="button" class="ev-more" onclick="_evListDays += 180; renderEventList();">' + esc(t('events.show_more', 'Show more events')) + '</button>';
  }
  container.innerHTML = html;

  // Re-observe for scroll animations
  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); }
    });
  }, { threshold: 0.1 });
  container.querySelectorAll('.reveal').forEach(function(el) { _armReveal(el, observer); });
}

function renderSeminars() {
  var container = document.getElementById('seminars-area');
  if (!container) return;
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var items = calEvents.filter(function(e) {
    return ['workshop', 'retreat', 'study_group', 'seminar', 'training', 'study'].indexOf(e.cat) !== -1
      && new Date(e.date + 'T23:59:59') >= today;
  }).sort(function(a, b) { return a.date < b.date ? -1 : 1; }).slice(0, 6);
  if (!items.length) {
    container.innerHTML = '<p class="sem-empty">No upcoming seminars listed yet. Know of one? Use "Submit an event" to add it.</p>';
    return;
  }
  var html = '';
  items.forEach(function(ev) {
    html += '<div class="seminar-card">';
    html += '<h5>' + esc(ev.title) + '</h5>';
    html += '<div class="sem-meta">' + esc(ev.time || localDate(ev.date, { month: 'short', day: 'numeric', year: 'numeric' })) + (ev.loc ? '<br>' + esc(ev.loc) : '') + '</div>';
    html += '<span class="sem-tag ' + esc(ev.cat) + '">' + esc(String(ev.cat).replace('_', ' ')) + '</span>';
    html += '</div>';
  });
  container.innerHTML = html;
}

// ── MINI CALENDAR (Sidebar) ──
function renderMiniCal() {
  var container = document.getElementById('sidebar-mini-cal');
  if (!container) return;

  var first = new Date(mcYear, mcMonth, 1);
  var startDay = first.getDay();
  var daysInMonth = new Date(mcYear, mcMonth + 1, 0).getDate();
  var today = new Date();

  var eventDates = {};
  calEvents.forEach(function(e) { eventDates[e.date] = true; });

  var html = '<div class="mc-head">';
  html += '<button onclick="mcNav(-1)" aria-label="Previous month">&lsaquo;</button>';
  html += '<span>' + MONTHS[mcMonth].substring(0, 3) + ' ' + mcYear + '</span>';
  html += '<button onclick="mcNav(1)" aria-label="Next month">&rsaquo;</button>';
  html += '</div><div class="mc-grid">';

  ['S','M','T','W','T','F','S'].forEach(function(l) {
    html += '<div class="mc-lbl">' + l + '</div>';
  });

  for (var i = 0; i < startDay; i++) {
    html += '<div class="mc-d other"></div>';
  }

  for (var d = 1; d <= daysInMonth; d++) {
    var dateStr = mcYear + '-' + String(mcMonth + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    var isToday = (d === today.getDate() && mcMonth === today.getMonth() && mcYear === today.getFullYear());
    var hasEvent = eventDates[dateStr];
    var cls = 'mc-d';
    if (isToday) cls += ' today';
    if (hasEvent) cls += ' has-event';
    html += '<div class="' + cls + '"' + (hasEvent ? ' role="button" tabindex="0" aria-label="' + esc(localDate(dateStr, {month:'long', day:'numeric'})) + ' events"' : '') + (isToday ? ' aria-current="date"' : '') + ' onclick="showDayEvents(\'' + dateStr + '\')">' + d + '</div>';
  }

  html += '</div>';
  container.innerHTML = html;
}

function mcNav(dir) {
  mcMonth += dir;
  if (mcMonth > 11) { mcMonth = 0; mcYear++; }
  if (mcMonth < 0) { mcMonth = 11; mcYear--; }
  renderMiniCal();
}

// ── SIDEBAR UPCOMING EVENTS ──
function renderSidebarUpcoming() {
  var container = document.getElementById('sidebar-upcoming');
  if (!container) return;
  var today = new Date();
  today.setHours(0,0,0,0);

  var upcoming = calEvents.filter(function(e) {
    return new Date(e.date + 'T23:59:59') >= today;
  }).sort(function(a, b) { return new Date(a.date) - new Date(b.date); }).slice(0, 4);

  var html = '';
  upcoming.forEach(function(ev) {
    var d = new Date(ev.date + 'T12:00:00');
    var mo = localDate(ev.date, { month: 'short' });
    var dy = d.getDate();
    html += '<div class="sb-ev">';
    html += '<div class="sb-ev-date">' + mo + '<br>' + dy + '</div>';
    html += '<div class="sb-ev-info"><h6>' + (ev.id ? '<a href="/event/' + esc(ev.id) + '" onclick="showDetail(\'event\',\'' + escJs(ev.id) + '\');return false;">' + esc(ev.title) + '</a>' : esc(ev.title)) + '</h6>' + (ev.loc ? '<span>' + esc(ev.loc) + '</span>' : '') + '</div>';
    html += '</div>';
  });
  container.innerHTML = html || '<div class="sb-empty">' + esc(t('events.none_yet', 'No upcoming events yet.')) + '</div>';
  renderHomeUpcoming();
}

// Home page "Upcoming Events" card: previously three hard-coded spring 2026 events, all
// auto-hidden once past, which left an empty box. Render from the live calendar instead.
function renderHomeUpcoming() {
  var box = document.getElementById('home-upcoming');
  if (!box) return;
  // Until real events arrive, keep the banner the deploy wrote into the page (festival dates alone
  // would replace it, and the redraw shows up as a late paint on phones).
  if (!_dbEventsShown && box.querySelector('.feat-ev')) return;
  var today = _localDay(new Date());
  var byDate = function(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; };
  var live = calEvents.filter(function(e) { return e.cat !== 'memorial' && (e.end || e.date) >= today; }).sort(byDate);
  if (!live.length) {
    box.innerHTML = '<div class="empty-note">' + esc(t('events.none_yet', 'No upcoming events yet.')) + ' <a href="#" onclick="showSec(\'events\');showEventForm();return false;">' + esc(t('events.submit_one', 'Submit one')) + '</a></div>';
    return;
  }
  var feat = live.filter(function(e) { return e.featured; })[0];
  var rest = live.filter(function(e) { return e !== feat; });
  // Happening now: started on or before today and not yet over (multi-day conferences, tours)
  var now = rest.filter(function(e) { return e.date <= today; }).slice(0, 4);
  var next = rest.filter(function(e) { return e.date > today; }).slice(0, now.length ? 4 : 6);
  var gridHtml = '<div class="home-ev-grid' + (now.length ? '' : ' no-now') + '">'
    + (now.length ? '<div class="home-ev-col"><h4 class="home-ev-sub"><span class="live-dot" aria-hidden="true"></span>' + esc(t('home.happening_now', 'Happening now')) + '</h4>' + now.map(_homeEvRow).join('') + '</div>' : '')
    + '<div class="home-ev-col"><h4 class="home-ev-sub">' + esc(t('home.coming_up', 'Coming up')) + '</h4><div class="home-ev-rows">' + next.map(_homeEvRow).join('') + '</div></div>'
    + '</div>';
  // The deploy writes the featured banner into the page so it shows with the first paint. Keep that
  // node (same event, English) rather than redrawing it, which phones would count as a late paint.
  var kept = feat && (typeof SC_I18N === 'undefined' || SC_I18N.getLang() === 'en') ? box.querySelector('.feat-ev[data-id="' + feat.id + '"]') : null;
  if (kept) {
    Array.prototype.slice.call(box.children).forEach(function(c) { if (c !== kept) c.remove(); });
    kept.insertAdjacentHTML('afterend', gridHtml);
  } else {
    box.innerHTML = (feat ? _featBannerHtml(feat) : '') + gridHtml;
  }
}

function _featBannerHtml(feat) {
  var join = (feat.src || []).filter(function(x) { return /Join/.test(x[0]); })[0];
  return '<div class="feat-ev" data-id="' + esc(feat.id) + '">'
    + (feat.img && feat.img.src ? '<img class="feat-ev-img" src="' + escUrl(_imgSized(feat.img.src, 200)) + '" alt="" width="96" height="116">' : '')
    + '<div class="feat-ev-body"><div class="etag">' + esc(t('home.featured_event', 'Featured event')) + '</div>'
    + '<h5><a href="/event/' + esc(feat.id) + '" onclick="showDetail(\'event\',\'' + escJs(feat.id) + '\');return false;">' + esc(feat.title) + '</a></h5>'
    + '<div class="emeta">' + esc(localDate(feat.date, { weekday: 'short', month: 'short', day: 'numeric' })) + (feat.time ? ' &middot; ' + esc(feat.time) : '') + '</div>'
    + (feat.desc ? '<p class="feat-ev-desc">' + esc(_shortText(feat.desc, 160)) + '</p>' : '')
    + (join ? '<a class="feat-ev-join" href="' + escUrl(join[1]) + '" target="_blank" rel="noopener">' + esc(join[0]) + '</a>' : '')
    + '</div></div>';
}

function _homeEvRow(ev) {
  var d = new Date(ev.date + 'T12:00:00');
  var cat = String(ev.cat || 'event');
  var titleHtml = ev.id
    ? '<a href="/event/' + esc(ev.id) + '" onclick="showDetail(\'event\',\'' + escJs(ev.id) + '\');return false;">' + esc(ev.title) + '</a>'
    : '<a href="/events" onclick="showSec(\'events\');return false;">' + esc(ev.title) + '</a>';
  var meta = _evMeta(ev);
  return '<div class="evrow">'
    + '<div class="evdate"><div class="mo">' + esc(localDate(ev.date, { month: 'short' })) + '</div><div class="dy">' + d.getDate() + '</div></div>'
    + '<div class="evinfo"><div class="etag">' + esc(cat.charAt(0).toUpperCase() + cat.slice(1)) + '</div><h5>' + titleHtml + '</h5>'
    + (meta ? '<div class="emeta">' + meta + '</div>' : '') + '</div></div>';
}

// ── HEADER CALENDAR WIDGET ──
function updateHeaderCalendar() {
  var now = new Date();
  var dayEl = document.getElementById('cw-day');
  var dateEl = document.getElementById('cw-date-str');
  var upEl = document.getElementById('cw-upcoming');
  if (!dayEl) return;

  dayEl.textContent = localDate(now, { weekday: 'long' });
  dateEl.textContent = localDate(now, { month: 'long', day: 'numeric', year: 'numeric' });

  // Local date (toISOString() is UTC and flips to tomorrow in the evening in the Americas).
  var todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  // Count real events only (birthday/anniversary markers are calendar decorations, not events).
  // Count real events only: festivals and memorial dates are calendar decorations, shown separately
  var futureCount = calEvents.filter(function(e) { return e.date >= todayStr && e.cat !== 'memorial' && e.cat !== 'festival'; }).length;
  upEl.textContent = t('header.upcoming_events').replace('{count}', futureCount);
  var evLabel = document.getElementById('events-seclabel');
  if (evLabel && !document.getElementById('sb-events-list')) {
    evLabel.innerHTML = esc(t('events.section_label', 'Events & Calendar')) + ' &nbsp;&middot;&nbsp; ' + esc(t('events.upcoming_count', '{count} upcoming').replace('{count}', futureCount));
  }
}

// ── EVENT FORM ──
function showEventForm() {
  document.getElementById('event-submit-overlay').classList.add('open');
}
function closeEventForm() {
  document.getElementById('event-submit-overlay').classList.remove('open');
}

// Parse the free-text time field ("9:00 AM - 5:00 PM", "14:30") into HH:MM (24h), or '' if unclear.
function _parseStartTime(txt) {
  var m = String(txt || '').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i);
  if (!m) return '';
  var h = parseInt(m[1], 10), min = m[2] ? parseInt(m[2], 10) : 0, ap = (m[3] || '').toLowerCase().replace(/\./g, '');
  if (!m[2] && !ap) return '';
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return '';
  return String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0');
}

async function submitEvent(btn) {
  var title = document.getElementById('esm-title').value.trim();
  var date = document.getElementById('esm-date').value;
  if (!title || !date) { alert(t('error.fill_title_date')); return; }

  if (!sbReady()) { alert('We could not reach the server. Please try again in a moment.'); return; }
  var userId = window._supabaseUser ? window._supabaseUser.id : null;
  if (!userId) {
    // events.user_id is required, so anonymous submissions always failed silently before.
    closeEventForm();
    openModal();
    var desc = document.getElementById('modal-desc');
    if (desc) desc.textContent = 'Please sign in (free) to submit an event. Your form entries are kept.';
    return;
  }

  var description = document.getElementById('esm-desc').value.trim();
  var endDate = document.getElementById('esm-end').value;
  if (endDate && endDate < date) { alert('The end date is before the start date.'); return; }
  var time = document.getElementById('esm-time').value.trim();
  var cat = document.getElementById('esm-cat').value;
  var loc = document.getElementById('esm-loc').value.trim() || 'TBD';
  var org = document.getElementById('esm-org').value.trim();
  var rawUrl = document.getElementById('esm-url').value.trim();
  var url = _normalizeUrl(rawUrl);
  if (rawUrl && !url) { alert('Please enter a valid event link (for example https://example.org).'); return; }

  var catToEventType = {
    'study': 'study_group', 'conference': 'conference', 'community': 'other',
    'eurythmy': 'workshop', 'biodynamic': 'workshop', 'medicine': 'workshop'
  };

  var hhmm = _parseStartTime(time);
  var startDate = hhmm ? date + 'T' + hhmm + ':00' : date + 'T00:00:00';
  var fullDesc = (description || 'No description provided.') + (time ? '\n\nTime: ' + time : '');
  var row = {
    title: title,
    description: fullDesc,
    event_type: catToEventType[cat] || 'other',
    start_date: startDate,
    location_name: loc,
    organizer_name: org,
    status: 'pending',
    is_free: true,
    user_id: userId
  };
  if (endDate) row.end_date = endDate + 'T23:59:59';
  if (url) row.organizer_url = url;

  if (btn) btn.disabled = true;
  try {
    var res = await _sb.from('events').insert([row]);
    // Until the moderation migration adds 'pending' to the status CHECK, fall back to publishing.
    if (res.error && res.error.code === '23514') {
      row.status = 'upcoming';
      res = await _sb.from('events').insert([row]);
    }
    if (res.error) throw res.error;

    if (row.status === 'upcoming') {
      calEvents.push({ date: date, title: title, cat: cat, loc: loc, org: org, time: time });
      renderCalendar(); renderEventList(); renderMiniCal(); renderSidebarUpcoming(); updateHeaderCalendar();
      alert('Thank you! Your event has been added to the calendar.');
    } else {
      alert('Thank you! Your event was submitted and will appear once it has been reviewed.');
    }
    closeEventForm();
    ['esm-title','esm-date','esm-end','esm-time','esm-loc','esm-org','esm-desc','esm-url'].forEach(function(id) {
      document.getElementById(id).value = '';
    });
  } catch (e) {
    console.warn('Event submit error:', e);
    alert('Sorry, the event could not be saved (' + (e.message || 'unknown error') + '). Please try again.');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Google Calendar sync (placeholder)
function syncGoogleCalendar() {
  console.log('Google Calendar sync: connect via Settings to enable.');
}

// Is a page section currently shown? Hidden sections render when showSec() opens them.
function _secVisible(id) {
  var el = document.getElementById('sec-' + id);
  return !!(el && el.classList.contains('active'));
}

// ── CALENDAR OF THE SOUL (GA 40) ──
// Steiner's 52 weekly verses start at Easter. As on rsarchive.org, the days from one Easter to the
// next are split into 52 equal periods, one per verse; each verse mirrors verse (53 - n).
// The verses themselves open on rsarchive.org (German original plus several English translations).
function cotsWeek(date) {
  var d = date ? new Date(date) : new Date();
  d.setHours(12, 0, 0, 0);
  var start = _computeEaster(d.getFullYear());
  if (d < start) start = _computeEaster(d.getFullYear() - 1);
  var end = _computeEaster(start.getFullYear() + 1);
  var period = (end - start) / 52;
  var week = Math.min(52, Math.floor((d - start) / period) + 1);
  var from = new Date(start.getTime() + (week - 1) * period);
  var to = new Date(start.getTime() + week * period - 864e5);
  return { week: week, mirror: 53 - week, southern: ((week + 25) % 52) + 1, from: from, to: to };
}

function renderCotsWidget() {
  var el = document.getElementById('cots-widget');
  if (!el) return;
  var w = cotsWeek();
  var fmt = { month: 'short', day: 'numeric' };
  var url = function (n) { return 'https://rsarchive.org/COTS/index.php?northern_week=' + n + '&hemisphere=northern#hemisphere'; };
  el.innerHTML = '<div class="cots-week"><span class="cots-num">' + w.week + '</span><div><b>' + esc(t('cots.week', 'Week')) + ' ' + w.week + '</b>'
    + '<span>' + esc(localDate(w.from, fmt)) + ' - ' + esc(localDate(w.to, fmt)) + '</span></div></div>'
    + '<a class="cots-read" href="' + escUrl(url(w.week)) + '" target="_blank" rel="noopener">' + esc(t('cots.read', "Read this week's verse")) + ' &rarr;</a>'
    + '<div class="cots-meta">' + esc(t('cots.mirror', 'Mirror verse')) + ': <a href="' + escUrl(url(w.mirror)) + '" target="_blank" rel="noopener">' + esc(t('cots.week', 'Week')) + ' ' + w.mirror + '</a>'
    + ' &middot; ' + esc(t('cots.southern', 'Southern Hemisphere')) + ': ' + esc(t('cots.week', 'Week')) + ' ' + w.southern + '</div>'
    + '<div class="cots-note">' + esc(t('cots.note', 'German original and English translations at the Rudolf Steiner Archive.')) + '</div>';
}

document.addEventListener('DOMContentLoaded', renderCotsWidget);

// ── FOR THE DAYS OF THE WEEK (Rudolf Steiner, GA 245) ──
// Eight soul exercises: one for each weekday (starting on Saturday) plus a daily five-minute review.
// English text from the owner's translation of the German original at anthroposophie.net.
var DAY_EXERCISES = [
  { day: 0, name: 'Right judgment', theme: 'Resolutions', text: ['Make resolutions, even regarding the most trivial matters, only after full and well-founded deliberation. All thoughtless action and meaningless activity should be kept away from the soul. One should always have well-considered reasons for everything, and strictly refrain from doing anything for which there is no significant reason.', 'If one is convinced of the correctness of a decision one has made, one should hold fast to it with inner steadfastness. This judgment is not made dependent on likes and dislikes.'] },
  { day: 1, name: 'The right word', theme: 'Speaking', text: ['Only that which has sense and meaning should pass the lips of one who strives for higher development. All talking for the sake of talking, merely to pass the time, is harmful in this sense.', 'The ordinary kind of conversation, where a jumble of things is said, should be avoided; yet one must not cut oneself off from other people. It is precisely in such interaction that speech should gradually evolve toward significance. Answer everyone who speaks to you, thoughtfully and with consideration for every aspect. Never speak without a reason, and be ready to remain silent. Use neither too many nor too few words. First listen calmly, then process what has been heard.'] },
  { day: 2, name: 'The right deed', theme: 'External actions', text: ['External actions should not be a source of disturbance to our fellow human beings. Whenever one is prompted by one\'s inner self (conscience) to act, carefully consider how best to respond for the good of the whole, for the lasting happiness of others, and for the sake of the eternal.', 'When acting on one\'s own initiative, thoroughly consider the consequences of one\'s actions beforehand.'] },
  { day: 3, name: 'The right standpoint', theme: 'The ordering of life', text: ['Live in harmony with nature and the spirit; do not lose oneself in the trivialities of outward life. Avoid anything that brings restlessness and haste into one\'s life.', 'Do nothing in haste, yet do not be sluggish. See life as a means for work and for higher development, and act accordingly.'] },
  { day: 4, name: 'Making the exercises a habit', theme: 'Human striving', text: ['Take care not to do anything beyond one\'s strength, yet also not to neglect anything that lies within it.', 'Look beyond the everyday and the immediate moment to set goals (ideals) connected with a human being\'s highest duties: for instance, wishing to develop oneself in the spirit of these exercises so as to be better able to help and advise others later on, even if not in the immediate future.'] },
  { day: 5, name: 'Right memory', theme: 'Learning from life', text: ['Strive to learn as much as possible from life. Nothing passes us by without offering an opportunity to gather experiences useful for life. If one has done something incorrectly or imperfectly, this becomes an occasion to do something similar correctly later on.', 'When watching others act, observe them with a similar goal in mind (though not with unloving eyes), and do nothing without looking back on experiences that can aid one\'s decisions and actions. One can learn a great deal from every person, even from children, if one pays attention.'] },
  { day: 6, name: 'Right opinion', theme: 'Thoughts', text: ['Pay attention to one\'s mental images (thoughts). Think only significant thoughts. Gradually learn to distinguish, within one\'s thoughts, the essential from the inessential, the eternal from the transient, and truth from mere opinion.', 'When listening to what others say, try to become completely still within and refrain from all assent, and especially from all disparaging judgment (criticism or rejection), even in one\'s thoughts and feelings.'] }
];
var DAY_EXERCISE_DAILY = { name: 'Right contemplation', theme: 'Every day, about five minutes', text: ['Take a look inside yourself, if only for five minutes at the same time every day. Immerse yourself in yourself, carefully consult with yourself, examine and form your principles of life, go through your knowledge (or its opposite) in your mind, consider your duties, and reflect on the content and true purpose of life.', 'Be seriously dissatisfied with your own mistakes and imperfections; in a word, strive to find out what is essential and lasting, and seriously set yourself corresponding goals, for example virtues to be acquired. Do not think you have done something well, but always strive further, following the highest role models.'] };
var DAY_EXERCISE_SRC = 'https://www.anthroposophie.net/steiner/bib_steiner_fuer_die_tage_der_woche.htm';

function _dayName(dow) {
  // 2023-01-01 was a Sunday: format a date with the right weekday in the visitor's language
  return localDate(new Date(2023, 0, 1 + dow), { weekday: 'long' });
}

function renderDayExercise() {
  var el = document.getElementById('days-widget');
  if (!el) return;
  var ex = DAY_EXERCISES.filter(function (x) { return x.day === new Date().getDay(); })[0];
  el.innerHTML = '<div class="dx-day">' + esc(_dayName(ex.day)) + ' &middot; ' + esc(ex.theme) + '</div>'
    + '<div class="dx-name">' + esc(ex.name) + '</div>'
    + '<p class="dx-text">' + esc(ex.text[0]) + '</p>'
    + '<div class="dx-daily"><b>' + esc(t('days.daily', 'Daily')) + ':</b> ' + esc(DAY_EXERCISE_DAILY.name.toLowerCase()) + ', ' + esc(t('days.five_min', 'five minutes of looking within')) + '</div>'
    + '<button type="button" class="dx-more" onclick="showDayExercises(this)">' + esc(t('days.all', 'Read all eight exercises')) + '</button>';
}

function _dxBlock(ex, label, isToday) {
  return '<div class="dp-event dx-item' + (isToday ? ' is-today' : '') + '"><div class="dx-day">' + esc(label) + (isToday ? ' &middot; ' + esc(t('days.today', 'today')) : '') + '</div>'
    + '<h5>' + esc(ex.name) + ' <span class="dx-theme">' + esc(ex.theme) + '</span></h5>'
    + ex.text.map(function (p) { return '<p class="dp-desc">' + esc(p) + '</p>'; }).join('') + '</div>';
}

function showDayExercises(trigger) {
  closeDayPopup(false);
  _dpReturnFocus = trigger || document.activeElement;
  var overlay = document.createElement('div');
  overlay.className = 'day-popup-overlay';
  overlay.onclick = function () { closeDayPopup(); };
  document.body.appendChild(overlay);
  var popup = document.createElement('div');
  popup.className = 'day-popup dx-popup';
  popup.setAttribute('role', 'dialog');
  popup.setAttribute('aria-modal', 'true');
  popup.setAttribute('aria-labelledby', 'dx-title');
  var today = new Date().getDay();
  var order = [6, 0, 1, 2, 3, 4, 5];   // Steiner begins the week's exercises on Saturday
  popup.innerHTML = '<button class="dp-close" type="button" aria-label="' + esc(t('common.close', 'Close')) + '" onclick="closeDayPopup()">&times;</button>'
    + '<h4 id="dx-title">' + esc(t('days.heading_full', 'For the Days of the Week')) + '</h4>'
    + '<p class="dp-desc">' + esc(t('days.intro', 'Rudolf Steiner describes eight processes of the soul that we usually carry out carelessly. Practise one exercise at a time for one or two weeks, then the next. Later, starting on a Saturday, do one each day, so the same exercise always falls on the same weekday, together with the daily review.')) + '</p>'
    + order.map(function (d) { var ex = DAY_EXERCISES.filter(function (x) { return x.day === d; })[0]; return _dxBlock(ex, _dayName(d), d === today); }).join('')
    + _dxBlock(DAY_EXERCISE_DAILY, t('days.daily_label', 'Every day'), false)
    + '<p class="dp-src">Rudolf Steiner, GA 245. <a href="' + escUrl(DAY_EXERCISE_SRC) + '" target="_blank" rel="noopener">' + esc(t('days.german', 'German original')) + '</a></p>';
  document.body.appendChild(popup);
  popup.querySelector('.dp-close').focus();
}

document.addEventListener('DOMContentLoaded', renderDayExercise);

// ── INIT CALENDAR ON PAGE LOAD ──
document.addEventListener('DOMContentLoaded', function() {
  _loadCachedEvents();
  if (_secVisible('events')) { renderCalendar(); renderEventList(); renderSeminars(); }
  renderMiniCal();
  renderSidebarUpcoming();
  updateHeaderCalendar();
});

// ── BOOKS: Load from Supabase ──
async function loadBooksFromSupabase() {
  if (!sbReady()) return;
  try {
    var { data, error } = await _sb.from('steiner_books')
      .select('ga_number, title, category, author, archive_url, steinerbooks_url, amazon_url, price')
      .order('title')
      .limit(1000);
    if (error || !data || data.length === 0) return;

    var container = document.getElementById('sec-books');
    if (!container) return;

    var catLabels = {
      foundational: 'Foundational Works', philosophy: 'Philosophy', christology: 'Christology & Gospels',
      cosmology: 'Cosmology & Spiritual Hierarchies', esoteric: 'Esoteric & Inner Development',
      karma: 'Karma & Reincarnation', education: 'Education (Steiner)', waldorf_education: 'Waldorf Education',
      medicine: 'Medicine & Health', agriculture: 'Agriculture & Biodynamics', biodynamic: 'Biodynamic Farming',
      arts: 'Arts, Eurythmy & Architecture', social: 'Social & Economic Life', science: 'Natural Science',
      spiritual: 'Spiritual & Esoteric Authors', children: 'Children\'s Books', biography: 'Biography'
    };

    var groups = {};
    data.forEach(function(b) {
      var cat = b.category || 'other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(b);
    });

    var sbBooksList = document.getElementById('sb-books-list');
    if (!sbBooksList) {
      sbBooksList = document.createElement('div');
      sbBooksList.id = 'sb-books-list';
      var label = document.getElementById('top50-books') || container.querySelector('.seclabel');
      if (label) label.insertAdjacentElement('afterend', sbBooksList);
      else container.prepend(sbBooksList);
    }

    var html = '';
    var catOrder = ['foundational','philosophy','education','waldorf_education','christology','cosmology','esoteric','spiritual','karma','medicine','biodynamic','agriculture','arts','social','science','children','biography'];
    catOrder.forEach(function(cat) {
      var books = groups[cat];
      if (!books || books.length === 0) return;
      var label = catLabels[cat] || cat;
      html += '<div class="listblock" style="margin-bottom:14px;">';
      html += '<div class="listblock-head"><h3>' + esc(label) + '</h3><span style="font-size:10.5px;color:var(--text-muted);">' + books.length + ' titles</span></div>';
      html += '<div class="listblock-body">';
      books.forEach(function(b) {
        var ga = b.ga_number ? '<span class="ltag">' + esc(b.ga_number) + '</span>' : '';
        var authorTag = (b.author && b.author !== 'Rudolf Steiner') ? '<span style="font-size:11px;color:var(--text-muted);"> - ' + esc(b.author) + '</span>' : '';
        var links = '';
        if (b.amazon_url) links += '<a href="' + escUrl(b.amazon_url) + '" target="_blank" rel="noopener">Amazon</a>';
        var store = /rudolfsteinerbookstore\.com/.test(b.steinerbooks_url || '') ? 'Rudolf Steiner Bookstore' : 'SteinerBooks';
        if (b.steinerbooks_url) links += (links ? ' &middot; ' : '') + '<a href="' + escUrl(b.steinerbooks_url) + '" target="_blank" rel="noopener">' + (b.price ? esc(b.price) + ' ' + store : store) + '</a>';
        if (b.archive_url) links += (links ? ' &middot; ' : '') + '<span class="lv"><a href="' + escUrl(b.archive_url) + '" target="_blank" rel="noopener">free online</a></span>';
        html += '<div class="lrow">' + ga + '<a class="ltitle" href="' + escUrl(b.amazon_url || b.archive_url || '#') + '" target="_blank">' + esc(b.title) + '</a>' + authorTag + '<span class="lmeta">' + links + '</span></div>';
      });
      html += '</div></div>';
    });

    var secLabel = container.querySelector('.seclabel');
    if (secLabel) secLabel.innerHTML = t('books.section_label') + ' &nbsp;&middot;&nbsp; ' + t('books.titles_count').replace('{count}', data.length);
    sbBooksList.innerHTML = html;
    console.log('Loaded ' + data.length + ' books from Supabase');
  } catch(e) {
    console.warn('Books load failed:', e);
  }
}

// ── RERENDER FOR LANGUAGE CHANGE ──
function rerenderForLang() {
  var activeSection = document.querySelector('.pagesec.active');
  if (!activeSection) return;
  var id = activeSection.id.replace('sec-', '');
  if (id === 'events') { renderCalendar(); renderEventList(); renderSeminars(); renderSidebarUpcoming(); }
  if (id === 'books') { typeof renderBookResults === 'function' && renderBookResults(); }
  if (id === 'memorial') { loadCommunityMemorials(); }
  if (id === 'marketplace') { renderMarketplace(); }
  if (id === 'podcasts') { renderPodcastSection(); renderYouTubeChannels(); }
  if (id === 'books') { renderTop50Books(); }
  if (id === 'directory' && !_allDataLoaded) { _loadAllSupabaseData(); }
  if (typeof updateHeaderCalendar === 'function') updateHeaderCalendar();
  if (typeof SC_I18N !== 'undefined') SC_I18N.applyTranslations();
}

// Direct visits route before translations load: refresh the section's title/description afterwards
window.addEventListener('i18n-ready', function() {
  var act = document.querySelector('.pagesec.active');
  var id = act && act.id ? act.id.replace(/^sec-/, '') : '';
  var m = _getSecMeta()[id];
  if (m) updateSEOMeta(m.title, m.desc, window.location.pathname);
});

// ── INIT: Load all data once Supabase AND i18n are ready ──
var _allDataLoaded = false;
function _loadAllSupabaseData() {
  if (!sbReady()) return;
  _allDataLoaded = true;
  Promise.all([
    loadEventsFromSupabase(),
    loadNewsFromSupabase(),
    loadDirectoryFromSupabase(),
    loadBooksFromSupabase(),
    loadMarketplace()
  ]).catch(function(e) { console.warn('Data load error:', e); });
  renderPodcastSection();
  _applyLiveCounts().then(_markEmptyClassifieds);
}

// Replace the hard-coded category counts (e.g. "312" for Waldorf when the directory holds ~140)
// with live counts from the directory. Categories with no live data source lose their number
// rather than showing an invented one.
async function _applyLiveCounts() {
  if (!sbReady() || typeof catMeta === 'undefined') return;
  try {
    // Page through results: PostgREST caps each response at 1,000 rows.
    var rowsAll = [], from = 0, PAGE = 1000, res;
    for (var guard = 0; guard < 20; guard++) {
      res = await _sb.from('directory_entries').select('category, country').eq('status', 'approved').range(from, from + PAGE - 1);
      if (res.error || !res.data) break;
      rowsAll = rowsAll.concat(res.data);
      if (res.data.length < PAGE) break;
      from += PAGE;
    }
    res = { data: rowsAll };
    if (!rowsAll.length) return;   // keep the page as-is if the query fails
    var counts = {}, total = 0;
    var countries = {};
    res.data.forEach(function(r) {
      counts[r.category] = (counts[r.category] || 0) + 1; total++;
      if (r.country) countries[String(r.country).trim().toLowerCase()] = true;
    });
    var dl = document.getElementById('directory-seclabel');
    var nCountries = Object.keys(countries).length;
    if (dl) dl.innerHTML = esc(t('directory.label', 'World Directory')) + ' &nbsp;&middot;&nbsp; ' + esc((nCountries > 1 ? t('directory.org_count_live', '{count} organizations & resources in {countries} countries') : t('directory.org_count_live_nocountry', '{count} organizations & resources')).replace('{count}', total).replace('{countries}', nCountries));
    var re = /showCategory\('([^']+)'/;
    document.querySelectorAll('[onclick*="showCategory("]').forEach(function(el) {
      var m = (el.getAttribute('onclick') || '').match(re);
      if (!m) return;
      var badge = el.nextElementSibling;
      if (!badge || !(badge.classList.contains('cbadge') || badge.classList.contains('alllink'))) return;
      var bm = badge.textContent.trim().match(/^[\d,+]+(\s*\u2192)?$/);   // only numeric badges ("312" or "312 →")
      if (!bm) return;
      var meta = catMeta[m[1].toLowerCase()];
      if (!meta) return;   // e.g. Books & Library: count comes from elsewhere, leave it
      var n = meta.dirCat ? [].concat(meta.dirCat).reduce(function(sum, c) { return sum + (counts[c] || 0); }, 0) : undefined;
      if (n) { badge.textContent = n + (bm[1] ? ' \u2192' : ''); badge.hidden = false; }
      else if (bm[1]) { badge.textContent = '\u2192'; }   // keep the arrow link affordance
      else { badge.textContent = ''; badge.hidden = true; }
    });
    // Badges not tied to showCategory() declare their source with data-live-count ("" = no live source)
    document.querySelectorAll('[data-live-count]').forEach(function(b) {
      var n = counts[b.getAttribute('data-live-count')];
      if (n) { b.textContent = n; b.hidden = false; } else { b.textContent = ''; b.hidden = true; }
    });
    var bl = document.getElementById('browse-seclabel');
    if (bl && total) bl.innerHTML = esc(t('browse.section_label', 'Browse Listings')) + ' &nbsp;&middot;&nbsp; ' + total + ' ' + esc(t('browse.listings_word', 'listings'));
  } catch (e) { console.warn('Live counts failed:', e); }
}

// Defer data load until i18n is ready so t() calls resolve properly
(function initSupabaseData() {
  var loaded = false;
  function loadOnce() { if (loaded) return; loaded = true; _loadAllSupabaseData(); }
  function tryLoad() {
    if (typeof SC_I18N !== 'undefined' && SC_I18N._ready) {
      loadOnce();
    } else {
      // i18n not ready yet, wait for it (previously this loaded everything twice)
      window.addEventListener('i18n-ready', loadOnce);
      // Fallback: if i18n never fires (e.g. offline), load after 1.5s anyway
      setTimeout(loadOnce, 1500);
    }
  }
  if (sbReady()) { tryLoad(); }
  else { setTimeout(tryLoad, 150); }
})();

// ── AUTO-HIDE PAST EVENTS ──
(function() {
  var today = new Date();
  today.setHours(23,59,59,999);
  document.querySelectorAll('.evrow[data-event-date]').forEach(function(row) {
    var eventDate = new Date(row.getAttribute('data-event-date') + 'T23:59:59');
    if (eventDate < today) {
      row.style.display = 'none';
    }
  });
  document.querySelectorAll('.evdate.today').forEach(function(el) {
    var row = el.closest('.evrow');
    if (row) {
      var d = new Date(row.getAttribute('data-event-date'));
      var now = new Date();
      if (d.toDateString() !== now.toDateString()) {
        el.classList.remove('today');
      }
    }
  });
})();

// ── GLOBAL: Handle href="#" links ──
// Makes all internal placeholder links clickable by triggering a search
// for the link text, navigating to the relevant section, or scrolling.
document.addEventListener('click', function(e) {
  var link = e.target.closest('a[href="#"]');
  if (!link) return;
  if (link.getAttribute('onclick')) return;
  e.preventDefault();

  // Home page catblocks -> go to browse
  if (link.closest('.catblock') && link.closest('#sec-home')) {
    showSec('browse');
    return;
  }
  // News/trend links -> go to news
  if (link.closest('#sec-news') || link.closest('.trendblock')) {
    showSec('news');
    return;
  }
  // Event links -> stay on events
  if (link.closest('#sec-events') || link.closest('.evinfo')) {
    showSec('events');
    return;
  }
  // Directory links -> stay
  if (link.closest('#sec-directory')) {
    return;
  }

  // Browse page subcategory links -> search for that term
  if (link.closest('#sec-browse') || link.closest('#sec-books') || link.closest('#sec-eldercare')) {
    var term = link.textContent.trim();
    if (term && term.length > 2 && !term.includes('→')) {
      document.getElementById('searchinput').value = term;
      doSearch();
    }
    return;
  }

  // Catblock "all X" links -> go to browse
  if (link.classList.contains('alllink')) {
    showSec('browse');
    return;
  }
});

// ══════════════════════════════════════════
//  ADMIN PANEL
// ══════════════════════════════════════════

var ADMIN_EMAILS = ['cameron.nazeri@gmail.com', 'cameron@sophiacommons.org', 'admin@sophiacommons.org'];

// Admin = app_metadata.role "admin" (the rule the database enforces), or a listed, confirmed address.
// This only decides what the UI shows; the database policies are what actually protect data.
function isAdmin() {
  var u = window._supabaseUser;
  if (!signedIn || !u) return false;
  if (u.app_metadata && u.app_metadata.role === 'admin') return true;
  return !!(u.email && u.email_confirmed_at && ADMIN_EMAILS.indexOf(u.email.toLowerCase()) !== -1);
}

// Header button: "Sign Up" for visitors, "+ post a listing" once signed in
function headerCta() {
  if (signedIn) { showSubmitForm(); return; }
  openModal();
  if (authMode !== 'signup') toggleAuthMode();
}
function _updateHeaderCta() {
  var a = document.getElementById('postlink');
  if (!a) return;
  var key = signedIn ? 'topbar.post_listing' : 'topbar.create_account';
  a.setAttribute('data-i18n', key);
  a.textContent = signedIn ? t(key, '+ post a listing') : t(key, 'Sign Up');
}

function updateAdminVisibility() {
  _updateHeaderCta();
  var show = isAdmin();
  if (show) { try { localStorage.setItem('sc_notrack', '1'); } catch (e) {} }
  var btn = document.getElementById('nav-admin');
  if (btn) btn.style.display = show ? 'inline-block' : 'none';
  var link = document.getElementById('adminlink');
  if (link) link.style.display = show ? 'inline-block' : 'none';
  if (show) checkAdminPendingCounts();
}

function adminSwitchTab(tab) {
  document.querySelectorAll('.admin-tab').forEach(function(t) { t.classList.remove('active'); });
  document.querySelectorAll('.admin-tab-content').forEach(function(c) { c.classList.remove('active'); });
  document.querySelector('.admin-tab[onclick*="' + tab + '"]').classList.add('active');
  document.getElementById('admin-' + tab).classList.add('active');
  if (tab === 'listings') loadAdminListings();
  else if (tab === 'events') loadAdminEvents();
  else if (tab === 'memorials') loadAdminMemorials();
  else if (tab === 'newsletter') loadNewsletterSubscriberCount();
  else if (tab === 'reports') loadAdminReports('pending');
  else if (tab === 'traffic') refreshDashboard();
  else if (tab === 'digest') { loadDigestDrafts(); loadDigestHistory(); }
  else if (tab === 'newsq') loadNewsQueue();
  else if (tab === 'members') loadAdminMembers();
  else if (tab === 'activity') loadAdminActivity();
  else if (tab === 'blog' && typeof loadAdminBlog === 'function') loadAdminBlog();
  else if (tab === 'claims' && typeof loadAdminClaims === 'function') loadAdminClaims();
}

function adminEsc(s) { return esc(s); }

async function loadAdminListings() {
  var el = document.getElementById('admin-listings-list');
  if (!sbReady()) { el.innerHTML = '<div class="admin-empty">' + t('error.supabase_not_connected') + '</div>'; return; }
  try {
    var { data, error } = await _sb.from('listings_pending').select('*').or('status.is.null,status.eq.pending').order('submitted_at', { ascending: false });
    if (error) { el.innerHTML = '<div class="admin-empty">' + t('error.loading_listings') + '</div>'; return; }
    if (!data || data.length === 0) { el.innerHTML = '<div class="admin-empty">' + t('admin.no_pending_listings') + '</div>'; return; }
    el.innerHTML = data.map(function(d) {
      var isApproved = d.status === 'approved';
      var statusBadge = isApproved ? '<span style="background:#27ae60;color:#fff;font-size:10px;padding:2px 8px;border-radius:10px;margin-left:8px;">LIVE</span>' : '<span style="background:#e67e22;color:#fff;font-size:10px;padding:2px 8px;border-radius:10px;margin-left:8px;">PENDING</span>';
      var submitDate = d.submitted_at || d.created_at;
      var dateStr = submitDate ? localDate(submitDate, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      return '<div class="admin-card" id="admin-listing-' + d.id + '">'
        + '<div style="display:flex;justify-content:space-between;align-items:start;">'
        + '<h4 style="margin:0;">' + adminEsc(d.name) + statusBadge + '</h4>'
        + (dateStr ? '<span style="font-size:11px;color:var(--text-muted);white-space:nowrap;">' + dateStr + '</span>' : '')
        + '</div>'
        + '<div class="admin-meta" style="margin-top:6px;">'
        + (d.category ? '<span style="background:var(--gold-light);color:var(--gold-text);padding:2px 8px;border-radius:50px;font-size:10px;font-weight:700;">Section: ' + adminEsc(d.category) + '</span>' : '')
        + (d.location ? '<span><strong>' + t('admin.location_label') + '</strong> ' + adminEsc(d.location) + '</span>' : '')
        + (d.url ? '<span><strong>' + t('admin.url_label') + '</strong> ' + adminEsc(d.url) + '</span>' : '')
        + (d.contact_email ? '<span><strong>' + t('admin.email_label') + '</strong> ' + adminEsc(d.contact_email) + '</span>' : '')
        + '</div>'
        + (d.description ? '<p style="font-size:13px;color:var(--text-secondary);line-height:1.55;margin-bottom:10px;">' + adminEsc(d.description) + '</p>' : '')
        + '<div class="admin-actions">'
        + (isApproved ? '' : '<button class="admin-btn-approve" onclick="adminApproveListing(\'' + d.id + '\')">' + t('admin.approve') + '</button>')
        + '<button class="admin-btn-reject" onclick="adminRejectListing(\'' + d.id + '\')">' + t('admin.reject') + '</button>'
        + '</div></div>';
    }).join('');
  } catch(e) { el.innerHTML = '<div class="admin-empty">Error: ' + esc(e.message) + '</div>'; }
}

// Submission form uses display labels; the directory stores short slugs.
function _categorySlug(label) {
  var cm = (typeof catMeta !== 'undefined') && catMeta[String(label || '').toLowerCase().trim()];
  if (cm && cm.dirCat) return cm.dirCat;
  var map = {
    'waldorf & education': 'waldorf', 'biodynamic agriculture': 'biodynamic', 'esoteric studies': 'societies',
    'arts & eurythmy': 'eurythmy', 'anthroposophic medicine': 'medicine', 'community & camphill': 'camphill',
    'eldercare': 'eldercare', 'online resources': 'online', 'social media': 'social_media',
    'groups & circles': 'community', 'christian community': 'community', 'podcasts & media': 'online'
  };
  var k = String(label || '').toLowerCase().trim();
  return map[k] || k || 'community';
}

async function adminApproveListing(id) {
  if (!sbReady()) return;
  try {
    // Fetch the pending listing
    var { data, error } = await _sb.from('listings_pending').select('*').eq('id', id).single();
    if (error || !data) { alert(t('error.could_not_find_listing')); return; }
    // Insert into directory_entries
    var entry = {
      organization_name: data.name,
      category: _categorySlug(data.category),
      location: data.location || null,
      website_url: data.url || null,
      description: data.description || null,
      email: data.contact_email || null,
      status: 'approved',
      user_id: window._supabaseUser ? window._supabaseUser.id : null  // required (NOT NULL + RLS)
    };
    var { data: dirEntry, error: insertErr } = await _sb.from('directory_entries').insert(entry).select('id').single();
    if (insertErr) { alert('Error adding to directory: ' + insertErr.message); return; }
    // Update status and link directory entry
    var upd = await _sb.from('listings_pending').update({ status: 'approved', directory_entry_id: dirEntry ? dirEntry.id : null }).eq('id', id);
    if (upd.error) { alert('Added to directory, but could not update the queue: ' + upd.error.message); }
    var card = document.getElementById('admin-listing-' + id);
    if (card) card.remove();
    // Check if empty
    if (!document.querySelector('#admin-listings-list .admin-card')) {
      document.getElementById('admin-listings-list').innerHTML = '<div class="admin-empty">' + t('admin.no_pending_listings') + '</div>';
    }
  } catch(e) { alert('Error: ' + e.message); }
}

async function adminRejectListing(id) {
  if (!sbReady()) return;
  if (!confirm(t('admin.confirm_reject_listing'))) return;
  try {
    // Check if there's a linked directory entry to remove
    var { data: pending } = await _sb.from('listings_pending').select('directory_entry_id').eq('id', id).single();
    if (pending && pending.directory_entry_id) {
      var del4 = await _sb.from('directory_entries').delete().eq('id', pending.directory_entry_id);
      if (del4.error) { alert('Error removing the directory entry: ' + del4.error.message); return; }
    }
    var rej = await _sb.from('listings_pending').update({ status: 'rejected' }).eq('id', id);
    if (rej.error) { alert('Error: ' + rej.error.message); return; }
    var card = document.getElementById('admin-listing-' + id);
    if (card) card.remove();
    if (!document.querySelector('#admin-listings-list .admin-card')) {
      document.getElementById('admin-listings-list').innerHTML = '<div class="admin-empty">' + t('admin.no_pending_listings') + '</div>';
    }
  } catch(e) { alert('Error: ' + e.message); }
}

async function loadAdminEvents() {
  var el = document.getElementById('admin-events-list');
  if (!sbReady()) { el.innerHTML = '<div class="admin-empty">' + t('error.supabase_not_connected') + '</div>'; return; }
  try {
    var { data, error } = await _sb.from('events').select('*').eq('status', 'pending').order('created_at', { ascending: false });
    if (error) { el.innerHTML = '<div class="admin-empty">' + t('error.loading_events') + '</div>'; return; }
    if (!data || data.length === 0) { el.innerHTML = '<div class="admin-empty">' + t('admin.no_pending_events') + '</div>'; return; }
    el.innerHTML = data.map(function(d) {
      var submitDate = d.created_at ? localDate(d.created_at, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      return '<div class="admin-card" id="admin-event-' + d.id + '">'
        + '<div style="display:flex;justify-content:space-between;align-items:start;">'
        + '<h4 style="margin:0;">' + adminEsc(d.title) + '</h4>'
        + (submitDate ? '<span style="font-size:11px;color:var(--text-muted);white-space:nowrap;">' + submitDate + '</span>' : '')
        + '</div>'
        + '<div class="admin-meta" style="margin-top:6px;">'
        + (d.event_type ? '<span style="background:var(--gold-light);color:var(--gold-text);padding:2px 8px;border-radius:50px;font-size:10px;font-weight:700;">Section: ' + adminEsc(d.event_type) + '</span>' : '')
        + (d.start_date ? '<span><strong>' + t('admin.date_label') + '</strong> ' + adminEsc(d.start_date.substring(0,10)) + '</span>' : '')
        + (d.location_name ? '<span><strong>' + t('admin.location_label') + '</strong> ' + adminEsc(d.location_name) + '</span>' : '')
        + (d.organizer_name ? '<span><strong>' + t('admin.organizer_label') + '</strong> ' + adminEsc(d.organizer_name) + '</span>' : '')
        + '</div>'
        + (d.description ? '<p style="font-size:13px;color:var(--text-secondary);line-height:1.55;margin-bottom:10px;">' + adminEsc(d.description) + '</p>' : '')
        + '<div class="admin-actions">'
        + '<button class="admin-btn-approve" onclick="adminApproveEvent(\'' + d.id + '\')">' + t('admin.approve') + '</button>'
        + '<button class="admin-btn-reject" onclick="adminRejectEvent(\'' + d.id + '\')">' + t('admin.reject') + '</button>'
        + '</div></div>';
    }).join('');
  } catch(e) { el.innerHTML = '<div class="admin-empty">Error: ' + esc(e.message) + '</div>'; }
}

async function adminApproveEvent(id) {
  if (!sbReady()) return;
  try {
    var ap = await _sb.from('events').update({ status: 'upcoming' }).eq('id', id);
    if (ap.error) { alert('Error: ' + ap.error.message); return; }
    var card = document.getElementById('admin-event-' + id);
    if (card) card.remove();
    if (!document.querySelector('#admin-events-list .admin-card')) {
      document.getElementById('admin-events-list').innerHTML = '<div class="admin-empty">' + t('admin.no_pending_events') + '</div>';
    }
  } catch(e) { alert('Error: ' + e.message); }
}

async function adminRejectEvent(id) {
  if (!sbReady()) return;
  if (!confirm(t('admin.confirm_reject_event'))) return;
  try {
    // 'rejected' is not an allowed events.status value; 'cancelled' hides it from the public calendar.
    var rj = await _sb.from('events').update({ status: 'cancelled' }).eq('id', id);
    if (rj.error) { alert('Error: ' + rj.error.message); return; }
    var card = document.getElementById('admin-event-' + id);
    if (card) card.remove();
    if (!document.querySelector('#admin-events-list .admin-card')) {
      document.getElementById('admin-events-list').innerHTML = '<div class="admin-empty">' + t('admin.no_pending_events') + '</div>';
    }
  } catch(e) { alert('Error: ' + e.message); }
}

async function loadAdminMemorials() {
  var el = document.getElementById('admin-memorials-list');
  if (!sbReady()) { el.innerHTML = '<div class="admin-empty">' + t('error.supabase_not_connected') + '</div>'; return; }
  try {
    var { data, error } = await _sb.from('memorials_pending').select('*').eq('status', 'pending').order('created_at', { ascending: false });
    if (error) { el.innerHTML = '<div class="admin-empty">' + t('error.loading_memorials') + '</div>'; return; }
    if (!data || data.length === 0) { el.innerHTML = '<div class="admin-empty">' + t('admin.no_pending_memorials') + '</div>'; return; }
    el.innerHTML = data.map(function(d) {
      var photoHtml = '';
      if (d.photo_url) {
        photoHtml = '<div style="margin-bottom:10px;"><img src="' + adminEsc(d.photo_url) + '" alt="' + adminEsc(d.name) + '" style="max-width:140px;max-height:140px;border-radius:8px;border:1px solid var(--border);object-fit:cover;"></div>';
      }
      var submitDate = d.created_at ? localDate(d.created_at, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      return '<div class="admin-card" id="admin-memorial-' + d.id + '">'
        + '<div style="display:flex;justify-content:space-between;align-items:start;">'
        + '<h4 style="margin:0;">' + adminEsc(d.name) + '</h4>'
        + (submitDate ? '<span style="font-size:11px;color:var(--text-muted);white-space:nowrap;">' + submitDate + '</span>' : '')
        + '</div>'
        + '<div class="admin-meta" style="margin-top:6px;">'
        + '<span style="background:var(--gold-light);color:var(--gold-text);padding:2px 8px;border-radius:50px;font-size:10px;font-weight:700;">Section: In Memoriam</span>'
        + (d.years ? '<span><strong>' + t('admin.years_label') + '</strong> ' + adminEsc(d.years) + '</span>' : '')
        + (d.location ? '<span><strong>' + t('admin.location_label') + '</strong> ' + adminEsc(d.location) + '</span>' : '')
        + (d.contact_email ? '<span><strong>' + t('admin.email_label') + '</strong> ' + adminEsc(d.contact_email) + '</span>' : '')
        + '</div>'
        + photoHtml
        + (d.bio ? '<p style="font-size:13px;color:var(--text-secondary);line-height:1.55;margin-bottom:10px;">' + adminEsc(d.bio) + '</p>' : '')
        + '<div class="admin-actions">'
        + '<button class="admin-btn-approve" onclick="adminApproveMemorial(\'' + d.id + '\')">' + t('admin.approve') + '</button>'
        + '<button class="admin-btn-reject" onclick="adminRejectMemorial(\'' + d.id + '\')">' + t('admin.reject') + '</button>'
        + '</div></div>';
    }).join('');
  } catch(e) { el.innerHTML = '<div class="admin-empty">Error: ' + esc(e.message) + '</div>'; }
}

async function adminApproveMemorial(id) {
  if (!sbReady()) return;
  try {
    // Fetch the pending memorial
    var { data: mem, error: fetchErr } = await _sb.from('memorials_pending').select('*').eq('id', id).single();
    if (fetchErr || !mem) { alert('Error fetching memorial'); return; }
    // Insert into public memorials table
    var { error: insertErr } = await _sb.from('memorials').insert({
      name: mem.name, years: mem.years, location: mem.location,
      bio: mem.bio, photo_url: mem.photo_url, status: 'approved'
    });
    if (insertErr) { alert('Error approving: ' + insertErr.message); return; }
    // Remove from pending
    var del1 = await _sb.from('memorials_pending').delete().eq('id', id);
    if (del1.error) { alert('Approved, but could not clear it from the queue: ' + del1.error.message); }
    var card = document.getElementById('admin-memorial-' + id);
    if (card) card.remove();
    if (!document.querySelector('#admin-memorials-list .admin-card')) {
      document.getElementById('admin-memorials-list').innerHTML = '<div class="admin-empty">' + t('admin.no_pending_memorials') + '</div>';
    }
    checkAdminPendingCounts();
  } catch(e) { alert('Error: ' + e.message); }
}

async function adminRejectMemorial(id) {
  if (!sbReady()) return;
  if (!confirm(t('admin.confirm_reject_memorial'))) return;
  try {
    // Fetch to check for photo cleanup
    var { data: mem } = await _sb.from('memorials_pending').select('photo_url').eq('id', id).single();
    // Delete the photo from storage if it exists
    if (mem && mem.photo_url) {
      var path = mem.photo_url.split('/memorial-photos/')[1];
      if (path) await _sb.storage.from('memorial-photos').remove([decodeURIComponent(path)]);
    }
    // Delete from pending table
    var del2 = await _sb.from('memorials_pending').delete().eq('id', id);
    if (del2.error) { alert('Error: ' + del2.error.message); return; }
    var card = document.getElementById('admin-memorial-' + id);
    if (card) card.remove();
    if (!document.querySelector('#admin-memorials-list .admin-card')) {
      document.getElementById('admin-memorials-list').innerHTML = '<div class="admin-empty">' + t('admin.no_pending_memorials') + '</div>';
    }
    checkAdminPendingCounts();
  } catch(e) { alert('Error: ' + e.message); }
}

// Load admin data when admin section is shown
function initAdminPanel() {
  if (!isAdmin()) return;
  loadAdminListings();
  checkAdminPendingCounts();
}

async function checkAdminPendingCounts() {
  if (!sbReady()) return;
  try {
    // Check pending/approved listings for admin review
    var { count: listingsCount } = await _sb.from('listings_pending')
      .select('id', { count: 'exact', head: true })
      .or('status.is.null,status.eq.pending');
    highlightAdminTab('listings', listingsCount || 0);

    // Check pending events
    var { count: eventsCount } = await _sb.from('events')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');
    highlightAdminTab('events', eventsCount || 0);

    // Check pending memorials
    var { count: memorialsCount } = await _sb.from('memorials_pending')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');
    highlightAdminTab('memorials', memorialsCount || 0);

    // Highlight top bar admin link if anything is pending
    var totalPending = (listingsCount || 0) + (eventsCount || 0) + (memorialsCount || 0);
    var adminLink = document.getElementById('adminlink');
    if (adminLink) {
      var existingBadge = adminLink.querySelector('.admin-pending-badge');
      if (existingBadge) existingBadge.remove();
      if (totalPending > 0) {
        adminLink.style.color = '#c0392b';
        adminLink.style.fontWeight = '700';
        var b = document.createElement('span');
        b.className = 'admin-pending-badge';
        b.textContent = totalPending;
        adminLink.appendChild(b);
      } else {
        adminLink.style.color = '';
        adminLink.style.fontWeight = '';
      }
    }
  } catch(e) {
    // Tables may not exist yet
  }
}

function highlightAdminTab(tabName, count) {
  var btn = document.querySelector('.admin-tab[onclick*="' + tabName + '"]');
  if (!btn) return;
  // Remove existing badge
  var existing = btn.querySelector('.admin-pending-badge');
  if (existing) existing.remove();
  if (count > 0) {
    btn.style.color = '#c0392b';
    btn.style.fontWeight = '700';
    var badge = document.createElement('span');
    badge.className = 'admin-pending-badge';
    badge.textContent = count;
    btn.appendChild(badge);
  } else {
    btn.style.color = '';
    btn.style.fontWeight = '';
  }
}

// ── REPORTS / MODERATION ──

var _currentReportFilter = 'pending';

async function loadAdminReports(statusFilter) {
  _currentReportFilter = statusFilter || 'pending';
  var el = document.getElementById('admin-reports-list');
  if (!sbReady()) { el.innerHTML = '<div class="admin-empty">Supabase not connected.</div>'; return; }

  // Update filter button active state
  document.querySelectorAll('.admin-filter-btn').forEach(function(b) { b.classList.remove('active'); });
  var activeBtn = document.querySelector('.admin-filter-btn[onclick*="' + _currentReportFilter + '"]');
  if (activeBtn) activeBtn.classList.add('active');

  try {
    var query = _sb.from('reports').select('*').order('created_at', { ascending: false });
    if (_currentReportFilter !== 'all') {
      query = query.eq('status', _currentReportFilter);
    }
    var { data, error } = await query;
    if (error) { el.innerHTML = '<div class="admin-empty">Error loading reports.</div>'; return; }
    if (!data || data.length === 0) {
      el.innerHTML = '<div class="admin-empty">No ' + (_currentReportFilter === 'all' ? '' : _currentReportFilter + ' ') + 'reports.</div>';
      return;
    }
    el.innerHTML = data.map(function(r) {
      var typeIcon = { listing: '&#128230;', event: '&#128197;', news: '&#128240;', directory: '&#128205;' };
      var statusColor = { pending: 'var(--gold)', reviewed: 'var(--info)', resolved: 'var(--sage)' };
      var statusBadge = '<span style="display:inline-block;padding:2px 8px;border-radius:50px;font-size:10px;font-weight:700;background:' + (statusColor[r.status] || 'var(--text-muted)') + ';color:#fff;">' + (r.status || 'pending') + '</span>';
      var date = localDate(r.created_at, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

      var actions = '';
      if (r.status === 'pending') {
        actions = '<button class="admin-btn-approve" onclick="updateReportStatus(\'' + r.id + '\', \'reviewed\')">Mark Reviewed</button>'
          + '<button class="admin-btn-reject" onclick="updateReportStatus(\'' + r.id + '\', \'resolved\')">Resolve</button>'
          + '<button class="admin-btn-reject" onclick="dismissReport(\'' + r.id + '\')" style="background:var(--muted-bg);color:var(--text-secondary);">Dismiss</button>';
      } else if (r.status === 'reviewed') {
        actions = '<button class="admin-btn-approve" onclick="updateReportStatus(\'' + r.id + '\', \'resolved\')">Resolve</button>';
      }

      return '<div class="admin-card" id="report-' + r.id + '">'
        + '<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;">'
        + '<div>'
        + '<span style="font-size:16px;">' + (typeIcon[r.item_type] || '') + '</span> '
        + '<strong style="font-size:13px;">' + adminEsc(r.item_type) + '</strong> '
        + statusBadge
        + '</div>'
        + '<span style="font-size:11px;color:var(--text-muted);">' + date + '</span>'
        + '</div>'
        + '<p style="font-size:13px;color:var(--text-secondary);margin-bottom:6px;"><strong>Reason:</strong> ' + adminEsc(r.reason) + '</p>'
        + (r.details ? '<p style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">' + adminEsc(r.details) + '</p>' : '')
        + '<div style="display:flex;gap:6px;align-items:center;">'
        + '<button style="font-size:11px;padding:3px 10px;background:var(--surface);border:1px solid var(--border);border-radius:50px;cursor:pointer;color:var(--gold-text);font-weight:600;" onclick="viewReportedItem(\'' + escJs(r.item_type) + '\', \'' + escJs(r.item_id) + '\')">View Item</button>'
        + actions
        + '</div>'
        + '</div>';
    }).join('');
  } catch (e) { el.innerHTML = '<div class="admin-empty">Error: ' + esc(e.message) + '</div>'; }
}

function filterReports(status) { loadAdminReports(status); }

async function updateReportStatus(reportId, newStatus) {
  if (!sbReady()) return;
  try {
    var { error } = await _sb.from('reports').update({ status: newStatus }).eq('id', reportId);
    if (error) { alert('Error updating report: ' + error.message); return; }
    loadAdminReports(_currentReportFilter);
  } catch (e) { alert('Error: ' + e.message); }
}

async function dismissReport(reportId) {
  if (!confirm('Dismiss this report? It will be marked as resolved.')) return;
  await updateReportStatus(reportId, 'resolved');
}

async function viewReportedItem(itemType, itemId) {
  if (itemType === 'channel_review') {
    var r = await _sb.from('channel_reviews').select('channel_slug').eq('id', itemId).maybeSingle();
    if (r.data) { showSec('podcasts'); openChannel(r.data.channel_slug); }
    else alert('That review no longer exists.');
    return;
  }
  showDetail(itemType, itemId);
}

// ── NEWSLETTER SEND ──

var _newsletterSubscriberCount = 0;

async function loadNewsletterSubscriberCount() {
  var el = document.getElementById('newsletter-subscriber-count');
  if (!sbReady()) { el.textContent = t('error.supabase_not_connected'); return; }
  try {
    var { count, error } = await _sb.from('newsletter_subscribers').select('id', { count: 'exact', head: true }).eq('confirmed', true).is('unsubscribed_at', null);
    if (error) { el.textContent = t('error.loading_subscriber_count'); return; }
    _newsletterSubscriberCount = count || 0;
    el.innerHTML = '<strong>' + _newsletterSubscriberCount + '</strong> confirmed subscriber' + (_newsletterSubscriberCount !== 1 ? 's' : '') + ' will receive this email.';
  } catch(e) {
    el.textContent = 'Error: ' + e.message;
  }
}

async function sendNewsletter() {
  if (!isAdmin()) { alert(t('error.admin_required')); return; }
  if (!sbReady()) { alert(t('error.supabase_not_connected')); return; }

  var subject = (document.getElementById('newsletter-subject').value || '').trim();
  var htmlContent = (document.getElementById('newsletter-html').value || '').trim();

  if (!subject) { alert(t('error.enter_subject')); return; }
  if (!htmlContent) { alert(t('error.enter_html')); return; }

  if (_newsletterSubscriberCount === 0) {
    alert(t('error.no_subscribers'));
    return;
  }

  if (!confirm(t('admin.newsletter_confirm').replace('{count}', _newsletterSubscriberCount).replace('{subject}', subject))) {
    return;
  }

  var btn = document.getElementById('newsletter-send-btn');
  var statusEl = document.getElementById('newsletter-status');
  var resultEl = document.getElementById('newsletter-result');

  btn.disabled = true;
  btn.textContent = t('admin.newsletter_sending');
  statusEl.textContent = t('admin.newsletter_please_wait');
  resultEl.style.display = 'none';

  try {
    var { data: { session } } = await _sb.auth.getSession();
    if (!session || !session.access_token) {
      throw new Error(t('error.no_active_session'));
    }

    var response = await fetch(SUPABASE_URL + '/functions/v1/send-newsletter', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + session.access_token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ subject: subject, html_content: htmlContent }),
    });

    var result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Server returned ' + response.status);
    }

    resultEl.style.display = 'block';
    resultEl.className = 'newsletter-result newsletter-result-success';
    resultEl.innerHTML = '<strong>' + t('admin.newsletter_success') + '</strong><br>'
      + t('admin.newsletter_sent_stats').replace('{sent}', result.sent).replace('{failed}', result.failed).replace('{total}', result.total);

    if (result.errors && result.errors.length > 0) {
      resultEl.className = 'newsletter-result newsletter-result-warning';
      resultEl.innerHTML += '<br><br><strong>' + t('admin.newsletter_errors') + '</strong><br>'
        + result.errors.map(function(e) { return adminEsc(e.email) + ': ' + adminEsc(e.error); }).join('<br>');
    }

    statusEl.textContent = '';
  } catch(e) {
    resultEl.style.display = 'block';
    resultEl.className = 'newsletter-result newsletter-result-error';
    resultEl.innerHTML = '<strong>' + t('admin.newsletter_failed') + '</strong><br>' + adminEsc(e.message);
    statusEl.textContent = '';
  } finally {
    btn.disabled = false;
    btn.textContent = t('admin.newsletter_send_btn');
  }
}

// ══════════════════════════════════════════
//  COMMENTS SYSTEM
//  Threaded comments with upvotes/downvotes
// ══════════════════════════════════════════

var _activeReplyForm = null;

function _timeAgo(dateStr) {
  var diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
  return localDate(dateStr, { month: 'short', day: 'numeric', year: 'numeric' });
}

function _buildCommentTree(comments) {
  var map = {}, roots = [];
  comments.forEach(function(c) { c.children = []; map[c.id] = c; });
  comments.forEach(function(c) {
    if (c.parent_id && map[c.parent_id]) {
      map[c.parent_id].children.push(c);
    } else {
      roots.push(c);
    }
  });
  return roots;
}

function _renderComment(c, depth, postType, postId) {
  var depthClass = depth > 0 ? ' depth-' + Math.min(depth, 2) : '';
  var isOwn = window._supabaseUser && window._supabaseUser.id === c.user_id;

  if (c.is_deleted) {
    return '<div class="comment comment-deleted' + depthClass + '" id="comment-' + c.id + '">'
      + '<div class="comment-body">[comment deleted]</div>'
      + _renderChildren(c.children, depth + 1, postType, postId)
      + '</div>';
  }

  var upClass = c.user_vote === 1 ? ' active-up' : '';
  var downClass = c.user_vote === -1 ? ' active-down' : '';

  var actions = '<div class="comment-actions">'
    + '<button class="comment-vote-btn' + upClass + '" onclick="voteComment(\'' + c.id + '\', 1, \'' + postType + '\', \'' + postId + '\')" title="Upvote">&#9650;</button>'
    + '<span class="comment-score" id="score-' + c.id + '">' + (c.vote_score || 0) + '</span>'
    + '<button class="comment-vote-btn' + downClass + '" onclick="voteComment(\'' + c.id + '\', -1, \'' + postType + '\', \'' + postId + '\')" title="Downvote">&#9660;</button>';

  if (signedIn) {
    actions += '<button onclick="showReplyForm(\'' + c.id + '\', \'' + postType + '\', \'' + postId + '\')">Reply</button>';
  }
  if (isOwn) {
    actions += '<button onclick="editComment(\'' + c.id + '\')">Edit</button>';
    actions += '<button onclick="deleteComment(\'' + c.id + '\', \'' + postType + '\', \'' + postId + '\')">Delete</button>';
  } else if (isAdmin()) {
    actions += '<button onclick="deleteComment(\'' + c.id + '\', \'' + postType + '\', \'' + postId + '\')" style="color:var(--error);">Delete</button>';
  }
  actions += '</div>';

  return '<div class="comment' + depthClass + '" id="comment-' + c.id + '">'
    + '<div class="comment-header">'
    + '<span class="comment-username">' + esc(c.username) + '</span>'
    + '<span>' + _timeAgo(c.created_at) + '</span>'
    + (c.is_edited ? '<span class="comment-edited">(edited)</span>' : '')
    + '</div>'
    + '<div class="comment-body" id="comment-body-' + c.id + '">' + esc(c.content) + '</div>'
    + actions
    + '<div id="reply-slot-' + c.id + '"></div>'
    + _renderChildren(c.children, depth + 1, postType, postId)
    + '</div>';
}

function _renderChildren(children, depth, postType, postId) {
  if (!children || !children.length) return '';
  return children.map(function(child) {
    return _renderComment(child, depth, postType, postId);
  }).join('');
}

function renderCommentsSection(postType, postId) {
  return '<div class="comments-section" id="comments-section">'
    + '<h3 id="comments-heading">Comments</h3>'
    + '<div id="comments-list"><div style="color:var(--text-muted);font-size:13px;">Loading comments...</div></div>'
    + '<div id="comment-compose-root"></div>'
    + '</div>';
}

async function _loadCommentsFallback(postType, postId) {
  try {
    var res = await _sb.from('comments')
      .select('id, parent_id, user_id, content, is_edited, is_deleted, created_at, updated_at')
      .eq('post_type', postType).eq('post_id', postId)
      .order('created_at', { ascending: true });
    if (res.error) return null;
    var rows = res.data || [];
    var ids = rows.map(function(r) { return r.user_id; }).filter(function(v, i, a) { return v && a.indexOf(v) === i; });
    var names = {};
    if (ids.length) {
      var pr = await _sb.from('profiles').select('id, username, full_name').in('id', ids);
      (pr.data || []).forEach(function(p) { names[p.id] = p.username || p.full_name || 'member'; });
    }
    return rows.map(function(r) {
      return Object.assign({}, r, { username: names[r.user_id] || 'member', vote_score: 0, user_vote: null });
    });
  } catch (e) { return null; }
}

async function loadComments(postType, postId) {
  var listEl = document.getElementById('comments-list');
  var composeEl = document.getElementById('comment-compose-root');
  if (!listEl) return;

  var section = document.getElementById('comments-section');
  if (section) { section.dataset.postType = postType; section.dataset.postId = postId; }

  if (!sbReady()) {
    listEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px;">Comments unavailable.</div>';
    return;
  }

  var userId = window._supabaseUser ? window._supabaseUser.id : null;

  try {
    var { data, error } = await _sb.rpc('get_comments_with_votes', {
      p_post_type: postType,
      p_post_id: postId,
      p_user_id: userId
    });

    if (error) {
      // Live DB: the RPC fails with "permission denied for table users" (it joins auth.users
      // without SECURITY DEFINER). Read the comments table directly so threads still work.
      console.warn('get_comments_with_votes failed, using fallback:', error.message);
      data = await _loadCommentsFallback(postType, postId);
    }

    var heading = document.getElementById('comments-heading');
    if (heading) heading.textContent = 'Comments (' + (data ? data.length : 0) + ')';

    if (data === null) {
      listEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px;">Comments are temporarily unavailable.</div>';
    } else if (data.length === 0) {
      listEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px;">No comments yet. Be the first to share your thoughts.</div>';
    } else {
      var tree = _buildCommentTree(data);
      listEl.innerHTML = '<div class="comment-thread">'
        + tree.map(function(c) { return _renderComment(c, 0, postType, postId); }).join('')
        + '</div>';
    }

    if (composeEl) {
      if (signedIn) {
        composeEl.innerHTML = '<div class="comment-compose">'
          + '<textarea id="comment-new-text" placeholder="Share your thoughts..." maxlength="2000" oninput="_updateCharCount(this, \'comment-new-chars\')"></textarea>'
          + '<div class="comment-char-count" id="comment-new-chars">0 / 2000</div>'
          + '<div class="comment-compose-actions">'
          + '<button class="comment-btn-submit" id="comment-submit-btn" onclick="submitComment(\'' + postType + '\', \'' + postId + '\', null)">Comment</button>'
          + '</div></div>';
      } else {
        composeEl.innerHTML = '<div class="comment-signin-prompt"><a href="#" onclick="openModal();return false;">Sign in</a> to join the discussion.</div>';
      }
    }
  } catch (e) {
    console.warn('Comments load error:', e);
    listEl.innerHTML = '';
  }
}

function _updateCharCount(textarea, countId) {
  var el = document.getElementById(countId);
  if (!el) return;
  var len = textarea.value.length;
  el.textContent = len + ' / 2000';
  el.className = 'comment-char-count' + (len > 2000 ? ' over' : '');
}

async function submitComment(postType, postId, parentId) {
  if (!signedIn) { openModal(); return; }
  if (!sbReady()) return;

  var textareaId = parentId ? 'reply-text-' + parentId : 'comment-new-text';
  var textarea = document.getElementById(textareaId);
  if (!textarea) return;
  var content = textarea.value.trim();
  if (!content || content.length > 2000) return;

  var btnId = parentId ? 'reply-submit-' + parentId : 'comment-submit-btn';
  var btn = document.getElementById(btnId);
  if (btn) { btn.disabled = true; btn.textContent = 'Posting...'; }

  try {
    var row = {
      post_type: postType,
      post_id: postId,
      user_id: window._supabaseUser.id,
      content: content
    };
    if (parentId) row.parent_id = parentId;

    var { error } = await _sb.from('comments').insert(row);
    if (error) { alert('Error posting comment: ' + error.message); return; }

    await loadComments(postType, postId);
  } catch (e) {
    alert('Error: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = parentId ? 'Reply' : 'Comment'; }
  }
}

function showReplyForm(commentId, postType, postId) {
  if (_activeReplyForm) {
    var old = document.getElementById('reply-slot-' + _activeReplyForm);
    if (old) old.innerHTML = '';
  }
  _activeReplyForm = commentId;

  var slot = document.getElementById('reply-slot-' + commentId);
  if (!slot) return;
  slot.innerHTML = '<div class="comment-inline-form comment-compose">'
    + '<textarea id="reply-text-' + commentId + '" placeholder="Write a reply..." maxlength="2000" oninput="_updateCharCount(this, \'reply-chars-' + commentId + '\')"></textarea>'
    + '<div class="comment-char-count" id="reply-chars-' + commentId + '">0 / 2000</div>'
    + '<div class="comment-compose-actions">'
    + '<button class="comment-btn-cancel" onclick="cancelReply(\'' + commentId + '\')">Cancel</button>'
    + '<button class="comment-btn-submit" id="reply-submit-' + commentId + '" onclick="submitComment(\'' + postType + '\', \'' + postId + '\', \'' + commentId + '\')">Reply</button>'
    + '</div></div>';
  setTimeout(function() { var t = document.getElementById('reply-text-' + commentId); if (t) t.focus(); }, 50);
}

function cancelReply(commentId) {
  var slot = document.getElementById('reply-slot-' + commentId);
  if (slot) slot.innerHTML = '';
  _activeReplyForm = null;
}

function editComment(commentId) {
  var bodyEl = document.getElementById('comment-body-' + commentId);
  if (!bodyEl) return;
  var currentText = bodyEl.textContent;

  bodyEl.innerHTML = '<div class="comment-compose comment-inline-form">'
    + '<textarea id="edit-text-' + commentId + '" maxlength="2000" oninput="_updateCharCount(this, \'edit-chars-' + commentId + '\')">' + esc(currentText) + '</textarea>'
    + '<div class="comment-char-count" id="edit-chars-' + commentId + '">' + currentText.length + ' / 2000</div>'
    + '<div class="comment-compose-actions">'
    + '<button class="comment-btn-cancel" onclick="cancelEdit(\'' + commentId + '\')">Cancel</button>'
    + '<button class="comment-btn-submit" onclick="saveEdit(\'' + commentId + '\')">Save</button>'
    + '</div></div>';
  setTimeout(function() { var t = document.getElementById('edit-text-' + commentId); if (t) t.focus(); }, 50);
}

function cancelEdit(commentId) {
  var section = document.getElementById('comments-section');
  if (section && section.dataset.postType && section.dataset.postId) {
    loadComments(section.dataset.postType, section.dataset.postId);
  }
}

async function saveEdit(commentId) {
  if (!sbReady()) return;
  var textarea = document.getElementById('edit-text-' + commentId);
  if (!textarea) return;
  var content = textarea.value.trim();
  if (!content || content.length > 2000) return;

  try {
    var { error } = await _sb.from('comments').update({ content: content, is_edited: true }).eq('id', commentId);
    if (error) { alert('Error saving edit: ' + error.message); return; }

    var section = document.getElementById('comments-section');
    if (section && section.dataset.postType && section.dataset.postId) {
      await loadComments(section.dataset.postType, section.dataset.postId);
    }
  } catch (e) { alert('Error: ' + e.message); }
}

async function deleteComment(commentId, postType, postId) {
  if (!confirm('Delete this comment?')) return;
  if (!sbReady()) return;

  try {
    var { error } = await _sb.from('comments').update({ is_deleted: true, content: '' }).eq('id', commentId);
    if (error) { alert('Error deleting comment: ' + error.message); return; }
    await loadComments(postType, postId);
  } catch (e) { alert('Error: ' + e.message); }
}

async function voteComment(commentId, vote, postType, postId) {
  if (!signedIn) { openModal(); return; }
  if (!sbReady()) return;

  var userId = window._supabaseUser.id;

  try {
    var { data: existing } = await _sb.from('comment_votes')
      .select('id, vote').eq('comment_id', commentId).eq('user_id', userId).single();

    if (existing) {
      if (existing.vote === vote) {
        await _sb.from('comment_votes').delete().eq('id', existing.id);
      } else {
        await _sb.from('comment_votes').update({ vote: vote }).eq('id', existing.id);
      }
    } else {
      await _sb.from('comment_votes').insert({ comment_id: commentId, user_id: userId, vote: vote });
    }

    await loadComments(postType, postId);
  } catch (e) { console.warn('Vote error:', e); }
}

// ── VIEW TRACKING ──
var _viewedItems = {};
function _trackView(type, id) {
  if (!sbReady()) return;
  var key = type + ':' + id;
  if (_viewedItems[key]) return; // only once per session
  _viewedItems[key] = true;
  // Supabase query builders are thenables without .catch(); calling .catch() threw and
  // turned every first detail view into "Not Found". Use .then(ok, fail) and never throw.
  function noop() {}
  try {
    if (type === 'listing') {
      _sb.rpc('increment_view_count', { listing_id: id }).then(noop, noop);
    }
    // For directory, events, news - log to analytics table if it exists
    _sb.from('view_logs').insert({ item_type: type, item_id: id }).then(noop, noop);
  } catch (e) {}
}

// ── CONTENT REPORTING / FLAGGING ──
function openReportModal(itemType, itemId) {
  if (!signedIn) { openModal(); return; }
  var modal = document.getElementById('report-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  setTimeout(function() { var r = document.getElementById('report-reason'); if (r) r.focus(); }, 50);
  document.getElementById('report-item-type').value = itemType;
  document.getElementById('report-item-id').value = itemId;
  document.getElementById('report-reason').value = '';
  document.getElementById('report-details').value = '';
  document.getElementById('report-status').style.display = 'none';
}

function closeReportModal() {
  var modal = document.getElementById('report-modal');
  if (modal) modal.style.display = 'none';
}

async function submitReport() {
  if (!sbReady() || !signedIn) return;
  var itemType = document.getElementById('report-item-type').value;
  var itemId = document.getElementById('report-item-id').value;
  var reason = document.getElementById('report-reason').value;
  var details = (document.getElementById('report-details').value || '').trim();
  var statusEl = document.getElementById('report-status');

  if (!reason) {
    statusEl.textContent = t('report.select_reason');
    statusEl.className = 'report-status report-status-error';
    statusEl.style.display = 'block';
    return;
  }

  var btn = document.getElementById('report-submit-btn');
  btn.disabled = true;
  btn.textContent = t('report.submitting');

  try {
    var uid = window._supabaseUser ? window._supabaseUser.id : null;
    if (!uid) throw new Error('Not authenticated');
    var { error } = await _sb.from('reports').insert({
      reporter_id: uid,
      item_type: itemType,
      item_id: itemId,
      reason: reason,
      details: details || null
    });
    if (error) throw error;
    statusEl.textContent = t('report.success');
    statusEl.className = 'report-status report-status-success';
    statusEl.style.display = 'block';
    setTimeout(closeReportModal, 2000);
  } catch(e) {
    statusEl.textContent = t('report.error') + ': ' + e.message;
    statusEl.className = 'report-status report-status-error';
    statusEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = t('report.submit_btn');
  }
}

// ── MARKETPLACE / CLASSIFIEDS ──
var _marketplaceData = [];
var _marketplaceFilter = 'all';

async function loadMarketplace() {
  if (!sbReady()) return;
  try {
    var { data, error } = await _sb.from('listings')
      .select('*, profiles(username), categories(name,slug)')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(50);
    if (!error && data) {
      _marketplaceData = data;
      renderMarketplace();
    }
  } catch(e) { console.warn('Marketplace load error:', e); }
}

function filterMarketplace(type) {
  _marketplaceFilter = type;
  document.querySelectorAll('.mp-filter-btn').forEach(function(b) { b.classList.remove('active'); });
  var activeBtn = document.querySelector('.mp-filter-btn[data-filter="' + type + '"]');
  if (activeBtn) activeBtn.classList.add('active');
  renderMarketplace();
}

function renderMarketplace() {
  var container = document.getElementById('marketplace-listings');
  if (!container) return;
  var items = _marketplaceFilter === 'all' ? _marketplaceData : _marketplaceData.filter(function(l) { return l.listing_type === _marketplaceFilter; });

  if (items.length === 0) {
    container.innerHTML = '<div class="mp-empty"><div style="font-size:28px;margin-bottom:8px;">&#128722;</div><div>' + t('marketplace.no_listings') + '</div></div>';
    return;
  }

  container.innerHTML = items.map(function(l) {
    var typeLabel = {for_sale: t('marketplace.type_for_sale'), wanted: t('marketplace.type_wanted'), offering: t('marketplace.type_offering'), seeking: t('marketplace.type_seeking'), announcement: t('marketplace.type_announcement')};
    var typeCls = 'mp-type-' + l.listing_type;
    var price = l.price ? ('$' + Number(l.price).toFixed(2)) : '';
    var poster = (l.profiles && l.profiles.username) ? l.profiles.username : t('marketplace.anonymous');
    var catName = (l.categories && l.categories.name) ? l.categories.name : '';
    var loc = [l.location, l.country].filter(Boolean).join(', ');
    var ago = _timeAgo(l.created_at);
    var views = l.view_count || 0;

    return '<div class="mp-card" onclick="showDetail(\'listing\',\'' + l.id + '\')">'
      + '<div class="mp-card-header">'
      + '<span class="mp-type ' + typeCls + '">' + (typeLabel[l.listing_type] || l.listing_type) + '</span>'
      + (price ? '<span class="mp-price">' + esc(price) + '</span>' : '')
      + '</div>'
      + '<h4 class="mp-title">' + esc(l.title) + '</h4>'
      + '<p class="mp-desc">' + esc((l.description || '').substring(0, 120)) + (l.description && l.description.length > 120 ? '...' : '') + '</p>'
      + '<div class="mp-meta">'
      + (catName ? '<span>' + esc(catName) + '</span>' : '')
      + (loc ? '<span>&#128205; ' + esc(loc) + '</span>' : '')
      + '<span>' + esc(poster) + ' &middot; ' + ago + '</span>'
      + '<span>' + views + ' ' + t('marketplace.views') + '</span>'
      + '</div></div>';
  }).join('');
}

function renderListingDetail(d) {
  var typeLabel = {for_sale: t('marketplace.type_for_sale'), wanted: t('marketplace.type_wanted'), offering: t('marketplace.type_offering'), seeking: t('marketplace.type_seeking'), announcement: t('marketplace.type_announcement')};
  var price = d.price ? ('$' + Number(d.price).toFixed(2)) : '';
  var poster = (d.profiles && d.profiles.username) ? d.profiles.username : t('marketplace.anonymous');
  var catName = (d.categories && d.categories.name) ? d.categories.name : '';
  var loc = [d.location, d.region, d.country].filter(Boolean).join(', ');
  var tags = (d.tags || []).map(function(tg) { return '<span class="detail-badge category">' + esc(tg) + '</span>'; }).join('');

  var actions = '';
  if (d.website_url) actions += '<a class="btn-primary-detail" href="' + escUrl(d.website_url) + '" target="_blank">' + t('detail.visit_website') + ' &#8599;</a>';
  if (d.contact_email) actions += '<a class="btn-secondary-detail" href="mailto:' + esc(d.contact_email) + '">' + t('detail.contact') + ' &#9993;</a>';
  if (d.contact_phone) actions += '<a class="btn-secondary-detail" href="tel:' + esc(d.contact_phone) + '">' + t('detail.call') + ' &#9742;</a>';

  var reportBtn = signedIn ? '<button class="btn-report" onclick="event.stopPropagation();openReportModal(\'listing\',\'' + d.id + '\')">' + t('report.flag_btn') + '</button>' : '';

  return '<div class="detail-card">'
    + '<div class="detail-header">'
    + '<h1>' + esc(d.title) + '</h1>'
    + '<div class="detail-badges">'
    + '<span class="detail-badge mp-type mp-type-' + d.listing_type + '">' + (typeLabel[d.listing_type] || d.listing_type) + '</span>'
    + (price ? '<span class="detail-badge" style="background:var(--gold);color:var(--on-gold);">' + esc(price) + '</span>' : '')
    + tags + '</div>'
    + (actions ? '<div class="detail-actions">' + actions + '</div>' : '')
    + '</div>'
    + '<div class="detail-body">' + esc(d.description || t('detail.no_description')) + '</div>'
    + '<div class="detail-sidebar"><h4>' + t('detail.quick_facts') + '</h4>'
    + '<p><strong>' + t('marketplace.posted_by') + ':</strong> ' + esc(poster) + '</p>'
    + (catName ? '<p><strong>' + t('detail.category') + ':</strong> ' + esc(catName) + '</p>' : '')
    + (loc ? '<p><strong>' + t('detail.location') + ':</strong> ' + esc(loc) + '</p>' : '')
    + '<p><strong>' + t('marketplace.views') + ':</strong> ' + (d.view_count || 0) + '</p>'
    + '<p><strong>' + t('marketplace.posted') + ':</strong> ' + localDate(d.created_at, {month:'short',day:'numeric',year:'numeric'}) + '</p>'
    + '<p><strong>' + t('marketplace.expires') + ':</strong> ' + localDate(d.expires_at, {month:'short',day:'numeric',year:'numeric'}) + '</p>'
    + reportBtn
    + '</div>'
    + renderCommentsSection('listing', d.id)
    + '</div>';
}

function showSubmitListingForm() {
  if (!signedIn) { openModal(); return; }
  var overlay = document.getElementById('listing-submit-overlay');
  if (overlay) overlay.style.display = 'flex';
}

function closeListingForm() {
  var overlay = document.getElementById('listing-submit-overlay');
  if (overlay) overlay.style.display = 'none';
}

async function submitClassifiedListing() {
  if (!sbReady() || !signedIn) return;
  var title = (document.getElementById('cl-title').value || '').trim();
  var desc = (document.getElementById('cl-desc').value || '').trim();
  var listingType = document.getElementById('cl-type').value;
  var price = (document.getElementById('cl-price').value || '').trim();
  var location = (document.getElementById('cl-location').value || '').trim();
  var country = (document.getElementById('cl-country').value || '').trim();
  var contactEmail = (document.getElementById('cl-email').value || '').trim();
  var tags = (document.getElementById('cl-tags').value || '').trim();

  if (!title || !desc || !listingType) {
    alert(t('marketplace.error_required'));
    return;
  }

  var uid = window._supabaseUser ? window._supabaseUser.id : null;
  if (!uid) { alert(t('error.not_authenticated')); return; }

  try {
    var { error } = await _sb.from('listings').insert({
      user_id: uid,
      category_id: 1,
      title: title,
      description: desc,
      listing_type: listingType,
      price: price ? parseFloat(price) : null,
      location: location || null,
      country: country || null,
      contact_email: contactEmail || null,
      tags: tags ? tags.split(',').map(function(t) { return t.trim(); }) : []
    });
    if (error) throw error;
    document.getElementById('cl-success').style.display = 'block';
    setTimeout(function() { closeListingForm(); document.getElementById('cl-success').style.display = 'none'; }, 2500);
    loadMarketplace();
  } catch(e) {
    alert(t('marketplace.error_submit') + ': ' + e.message);
  }
}

// ── PODCASTS & MEDIA (enhanced) ──
var podcastData = {
  podcasts: [
    {title:'ASA Official Podcast', url:'https://anthroposophy.org/podcast/', platform:'Spotify / RSS', desc:'Official podcast of the Anthroposophical Society in America. Interviews, lectures, and community highlights.', lang:'EN', verified:true},
    {title:'Goetheanum Podcast', url:'https://goetheanum.transistor.fm/', platform:'Transistor', desc:'News and perspectives from the Goetheanum in Dornach, Switzerland.', lang:'EN/DE', verified:true},
    {title:'Inner Work Path: Lisa Romero', url:'https://www.innerworkpath.com/category/podcast/', platform:'Australia', desc:'Guided meditations and inner development exercises rooted in anthroposophy.', lang:'EN', verified:true},
    {title:'Rudolf Steiner Audio Podcast', url:'https://www.rudolfsteiner.podbean.com/', platform:'Podbean', desc:'Audio readings of Rudolf Steiner lectures and written works. Free access.', lang:'EN', verified:true},
    {title:'New Thinking Allowed', url:'https://newthinkingallowed.org/rudolf-steiner-anthroposophy/', platform:'Video', desc:'Jeffrey Mishlove interviews scholars and practitioners on anthroposophy and spiritual science.', lang:'EN', verified:true},
    {title:'Anthroposophy on Spotify', url:'https://open.spotify.com/show/0M4QfnyYevp54XnlERAPTf', platform:'Spotify', desc:'Curated playlists and episodes exploring anthroposophical themes.', lang:'EN', verified:true}
  ],
  video: [
    {title:'Goetheanum TV', url:'https://goetheanum.tv', platform:'Streaming', desc:'Live and recorded events from the Goetheanum world center.', lang:'DE/EN', verified:true},
    {title:'Das Goetheanum Weekly', url:'https://dasgoetheanum.com/en', platform:'Online', desc:'Weekly digital magazine covering anthroposophical news and culture.', lang:'DE/EN', verified:true},
    {title:'ASA YouTube Channel', url:'https://www.youtube.com/@AnthroposophyUSA', platform:'YouTube', desc:'Video lectures, conferences, and community events from ASA.', lang:'EN', verified:true},
    {title:'Anthroposophy.Social', url:'https://anthroposophysocial.com', platform:'Platform', desc:'Community platform for anthroposophical discussions and media sharing.', lang:'EN', verified:true},
    {title:'Goetheanum Studium - Instagram', url:'https://www.instagram.com/goetheanum_studium/', platform:'Instagram', desc:'Visual insights into studies and events at the Goetheanum.', lang:'DE/EN', verified:true},
    {title:'ASA Facebook Page', url:'https://www.facebook.com/AnthroposophyUSA/', platform:'Facebook', desc:'Official ASA page with event announcements and community news.', lang:'EN', verified:true},
    {title:'Anthroposophy Community Group', url:'https://www.facebook.com/groups/anthroposophy/', platform:'Facebook', desc:'Global discussion group for anthroposophical topics and questions.', lang:'EN', verified:true},
    {title:'Rudolf Steiner Archive - Facebook', url:'https://www.facebook.com/RudolfSteinerArchive/', platform:'Facebook', desc:'Updates from the Rudolf Steiner Archive in Interlochen, MI.', lang:'EN', verified:true}
  ],
  x: [
    {title:"Goetheanum (Deutsch)", url:'https://x.com/goetheanum', platform:'X', desc:"Goetheanum and the General Anthroposophical Society, Dornach.", lang:'DE', verified:true},
    {title:"Goetheanum (English)", url:'https://x.com/GoetheanumEN', platform:'X', desc:"English account of the Goetheanum and the School of Spiritual Science.", lang:'EN', verified:true},
    {title:"Das Goetheanum (weekly)", url:'https://x.com/dasgoetheanum', platform:'X', desc:"The weekly magazine Das Goetheanum.", lang:'DE', verified:true},
    {title:"Rudolf Steiner Archive", url:'https://x.com/SteinerLibrary', platform:'X', desc:"Updates from rsarchive.org, the free online Steiner library.", lang:'EN', verified:true},
    {title:"Rudolf Steiner Press", url:'https://x.com/RudolfSteinerPr', platform:'X', desc:"UK publisher of Steiner's works in English.", lang:'EN', verified:true},
    {title:"SteinerBooks", url:'https://x.com/SteinerBooks', platform:'X', desc:"US publisher of Steiner's Collected Works and anthroposophical books.", lang:'EN', verified:true},
    {title:"Info3", url:'https://x.com/Info3Verlag', platform:'X', desc:"Info3, independent German magazine on anthroposophy.", lang:'DE', verified:true},
    {title:"Anthromedia", url:'https://x.com/anthromedia', platform:'X', desc:"Anthroposophy internet portal.", lang:'DE/EN', verified:true},
    {title:"Rudolf Steiner (Freedom Cards)", url:'https://x.com/rudolfsteiner', platform:'X', desc:"Philosophy of Freedom study cards project.", lang:'EN', verified:true},
    {title:"Anthroposophy (Freedom Cards)", url:'https://x.com/anthroposophy', platform:'X', desc:"Philosophy of Freedom study cards project.", lang:'EN', verified:true},
    {title:"AWSNA", url:'https://x.com/AWSNA', platform:'X', desc:"Association of Waldorf Schools of North America.", lang:'EN', verified:true},
    {title:"ECSWE", url:'https://x.com/ecswe', platform:'X', desc:"European Council for Steiner Waldorf Education.", lang:'EN', verified:true},
    {title:"Waldorf Today", url:'https://x.com/waldorftoday', platform:'X', desc:"Waldorf education news.", lang:'EN', verified:true},
    {title:"Steiner Schools", url:'https://x.com/steinerschools', platform:'X', desc:"Waldorf education, biodynamics and the threefold social order.", lang:'EN', verified:true},
    {title:"Alanus Hochschule, Mannheim", url:'https://x.com/AlanusHS', platform:'X', desc:"Institute for Waldorf education.", lang:'DE', verified:true},
    {title:"Biodynamic Association UK", url:'https://x.com/BiodynamicUK', platform:'X', desc:"UK biodynamic farming association.", lang:'EN', verified:true},
    {title:"Demeter USA", url:'https://x.com/DemeterUSA', platform:'X', desc:"US biodynamic certifier.", lang:'EN', verified:true},
    {title:"SEKEM", url:'https://x.com/sekemgroup', platform:'X', desc:"Biodynamic social enterprise in Egypt.", lang:'EN', verified:true},
    {title:"Hawthorne Valley", url:'https://x.com/HawthorneValley', platform:'X', desc:"Biodynamic farm and Waldorf center in New York.", lang:'EN', verified:true},
    {title:"Camphill Village Trust", url:'https://x.com/CamphillVillag1', platform:'X', desc:"Camphill communities in the UK.", lang:'EN', verified:true},
    {title:"Camphill Scotland", url:'https://x.com/CamphillScot', platform:'X', desc:"Membership body for Camphill in Scotland.", lang:'EN', verified:true},
    {title:"IVAA", url:'https://x.com/IVAAmeds', platform:'X', desc:"International Federation of Anthroposophic Medical Associations.", lang:'EN', verified:true},
    {title:"Dr. Hauschka UK", url:'https://x.com/LoveHauschka', platform:'X', desc:"UK account of the WALA skin care brand.", lang:'EN', verified:true},
    {title:"Gesundheit Aktiv", url:'https://x.com/gesundheitaktiv', platform:'X', desc:"German patient association rooted in anthroposophic medicine.", lang:'DE', verified:true},
    {title:"Gary Lachman", url:'https://x.com/GaryLachman', platform:'X', desc:"Author, including a biography of Rudolf Steiner.", lang:'EN', verified:true}
  ],
  archives: [
    {title:'Rudolf Steiner Archive', url:'https://rsarchive.org', platform:'rsarchive.org', desc:'Complete archive of Steiner lectures and writings. The largest online collection.', lang:'EN', verified:true},
    {title:'Rudolf Steiner Audio', url:'https://www.rudolfsteineraudio.com', platform:'Audio', desc:'Professional audio recordings of Steiner lectures and books.', lang:'EN', verified:true},
    {title:'Waldorf Library', url:'https://www.waldorflibrary.org', platform:'Library', desc:'Digital library of Waldorf education resources and research papers.', lang:'EN', verified:true},
    {title:'Steiner Books', url:'https://www.steinerbooks.org', platform:'Publisher', desc:'Leading publisher of English-language anthroposophical books and journals.', lang:'EN', verified:true}
  ]
};

function renderPodcastSection() {
  var container = document.getElementById('podcasts-dynamic');
  if (!container) return;

  var totalCount = podcastData.podcasts.length + podcastData.video.length + podcastData.x.length + podcastData.archives.length;
  document.getElementById('podcasts-count').textContent = totalCount + ' ' + t('podcasts.shows_label');

  function renderBlock(items, heading) {
    var html = '<div class="listblock reveal"><div class="listblock-head"><h3>' + heading + '</h3><span class="podcast-count">' + items.length + ' ' + t('podcasts.items') + '</span></div><div class="listblock-body">';
    items.forEach(function(p) {
      html += '<div class="lrow podcast-row">'
        + '<div class="podcast-info">'
        + '<a class="ltitle" href="' + escUrl(p.url) + '" target="_blank">' + esc(p.title) + '</a>'
        + (p.verified ? '<span class="lv">&#10003;</span>' : '')
        + '<span class="lmeta">' + esc(p.platform) + (p.lang ? ' &middot; ' + esc(p.lang) : '') + '</span>'
        + '<div class="podcast-desc">' + esc(p.desc) + '</div>'
        + '</div></div>';
    });
    html += '</div></div>';
    return html;
  }

  container.innerHTML = '<div class="twocol">'
    + renderBlock(podcastData.podcasts, t('podcasts.podcasts_heading'))
    + renderBlock(podcastData.video, t('podcasts.video_social_heading'))
    + '</div>'
    + renderBlock(podcastData.x, t('podcasts.x_heading', 'On X (Twitter)'))
    + renderBlock(podcastData.archives, t('podcasts.archives_heading'));
}

// ── UPGRADED FULL-TEXT SEARCH ──
async function _doSupabaseSearchV2(q) {
  if (!sbReady()) { _doLocalSearch(q.toLowerCase()); return; }
  showSec('browse');

  try {
    // Try RPC search_all first (better ranking)
    var { data, error } = await _sb.rpc('search_all', { search_term: q, limit_n: 30 });
    if (!error && data && data.length > 0) {
      var dirResults = data.filter(function(r) { return r.type === 'directory'; });
      var evResults = data.filter(function(r) { return r.type === 'event'; });
      var newsResults = data.filter(function(r) { return r.type === 'news'; });
      var listResults = data.filter(function(r) { return r.type === 'listing'; });
      var totalCount = data.length;

      var html = '';
      if (dirResults.length > 0) {
        html += _renderSearchGroup(t('search_results.directory'), dirResults, function(d) {
          return '<a href="#" onclick="showDetail(\'directory\',\'' + d.id + '\');return false;" style="font-family:Lora,serif;font-weight:700;font-size:14px;color:var(--text-primary);text-decoration:none;">' + esc(d.title) + '</a>'
            + (d.description ? '<div style="font-size:13px;color:var(--text-muted);margin-top:2px;">' + esc(d.description.substring(0, 120)) + '</div>' : '');
        });
      }
      if (evResults.length > 0) {
        html += _renderSearchGroup(t('search_results.events'), evResults, function(d) {
          return '<a href="#" onclick="showDetail(\'event\',\'' + d.id + '\');return false;" style="font-family:Lora,serif;font-weight:700;font-size:14px;color:var(--text-primary);text-decoration:none;">' + esc(d.title) + '</a>'
            + (d.description ? '<div style="font-size:13px;color:var(--text-muted);margin-top:2px;">' + esc(d.description.substring(0, 120)) + '</div>' : '');
        });
      }
      if (newsResults.length > 0) {
        html += _renderSearchGroup(t('search_results.news'), newsResults, function(d) {
          return '<a href="#" onclick="showDetail(\'news\',\'' + d.id + '\');return false;" style="font-family:Lora,serif;font-weight:700;font-size:14px;color:var(--text-primary);text-decoration:none;">' + esc(d.title) + '</a>'
            + (d.description ? '<div style="font-size:13px;color:var(--text-muted);margin-top:2px;">' + esc(d.description.substring(0, 120)) + '</div>' : '');
        });
      }
      if (listResults.length > 0) {
        html += _renderSearchGroup(t('search_results.marketplace'), listResults, function(d) {
          return '<a href="#" onclick="showDetail(\'listing\',\'' + d.id + '\');return false;" style="font-family:Lora,serif;font-weight:700;font-size:14px;color:var(--text-primary);text-decoration:none;">' + esc(d.title) + '</a>'
            + (d.description ? '<div style="font-size:13px;color:var(--text-muted);margin-top:2px;">' + esc(d.description.substring(0, 120)) + '</div>' : '');
        });
      }

      if (totalCount === 0) {
        _showSearchResults(q, '<div style="text-align:center;padding:32px 0;color:var(--text-muted);">'
          + '<div style="font-size:28px;margin-bottom:8px;">&#128269;</div>'
          + '<div style="font-size:15px;font-weight:600;">' + t('search.no_results_title') + '</div>'
          + '<div style="font-size:13px;margin-top:4px;">' + t('search.no_results_desc') + '</div>'
          + '</div>', 0);
      } else {
        _showSearchResults(q, html, totalCount);
      }
      return;
    }
  } catch(e) {
    console.warn('search_all RPC not available, using v1 search:', e);
  }
  // Fall back to original search
  _doSupabaseSearch(q);
}

function _renderSearchGroup(label, items, renderItem) {
  var html = '<div style="margin-bottom:16px;">';
  html += '<div style="font-size:11px;text-transform:uppercase;color:var(--gold-text);font-weight:700;letter-spacing:0.08em;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid var(--border-subtle);">' + label + ' (' + items.length + ')</div>';
  items.forEach(function(d) {
    html += '<div style="padding:8px 0;border-bottom:1px solid var(--border-subtle);">' + renderItem(d) + '</div>';
  });
  html += '</div>';
  return html;
}

// ── HELPER: Time ago ──
// (Duplicate _timeAgo removed: it shadowed the earlier one and used i18n keys that don't exist.)

// ── Directory alllink scroll ──
document.querySelectorAll('#sec-directory .alllink').forEach(function(el) {
  el.style.cursor = 'pointer';
  el.addEventListener('click', function(e) {
    e.preventDefault();
    var block = el.closest('.catblock');
    if (block) block.scrollIntoView({behavior:'smooth',block:'start'});
  });
});

// ══════════════════════════════════════════
//  TRAFFIC DASHBOARD — PAGE VIEW TRACKER
// ══════════════════════════════════════════

// The site owner's own browsing is not counted: once an admin signs in on a browser, that browser stops
// sending page views (also after signing out), and the dashboard leaves out its earlier visits.
function _isOwnerBrowser() {
  try { return localStorage.getItem('sc_notrack') === '1'; } catch (e) { return false; }
}
function _ownerVisitorId() {
  try { return _isOwnerBrowser() ? localStorage.getItem('sc_vid') : null; } catch (e) { return null; }
}

(function initTracker() {
  // Automated browsers (test tools, Lighthouse, crawlers) are not visitors: don't count them.
  if (navigator.webdriver || /HeadlessChrome|Lighthouse|bot\b|crawl|spider|slurp|PageSpeed/i.test(navigator.userAgent)) return;
  // Anonymous visitor ID kept in this browser so a returning visitor counts once per month
  // (random, no personal data). Falls back to a per-visit ID if storage is blocked.
  var visitorId = null;
  try {
    visitorId = localStorage.getItem('sc_vid');
    if (!visitorId) {
      visitorId = crypto.randomUUID ? crypto.randomUUID() : ('v_' + Math.random().toString(36).slice(2) + Date.now().toString(36));
      localStorage.setItem('sc_vid', visitorId);
    }
  } catch (e) { visitorId = null; }
  var sessionId = sessionStorage.getItem('sc_sid');
  if (!sessionId) {
    sessionId = crypto.randomUUID ? crypto.randomUUID() : ('s_' + Math.random().toString(36).slice(2) + Date.now().toString(36));
    sessionStorage.setItem('sc_sid', sessionId);
  }

  function getBrowser() {
    var ua = navigator.userAgent;
    if (ua.indexOf('Firefox') > -1) return 'Firefox';
    if (ua.indexOf('Edg') > -1) return 'Edge';
    if (ua.indexOf('OPR') > -1 || ua.indexOf('Opera') > -1) return 'Opera';
    if (ua.indexOf('Chrome') > -1) return 'Chrome';
    if (ua.indexOf('Safari') > -1) return 'Safari';
    return 'Other';
  }

  function getOS() {
    var ua = navigator.userAgent;
    if (ua.indexOf('Win') > -1) return 'Windows';
    if (ua.indexOf('Mac') > -1) return 'macOS';
    if (ua.indexOf('Linux') > -1) return 'Linux';
    if (/Android/.test(ua)) return 'Android';
    if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
    return 'Other';
  }

  function getDevice() {
    if (/Mobi|Android.*Mobile|iPhone/.test(navigator.userAgent)) return 'Mobile';
    if (/iPad|Android(?!.*Mobile)|Tablet/.test(navigator.userAgent)) return 'Tablet';
    return 'Desktop';
  }

  function trackView(page) {
    if (!sbReady() || _isOwnerBrowser() || isAdmin()) return;
    _sb.from('page_views').insert({
      session_id: sessionId,
      visitor_id: visitorId || sessionId,
      is_member: !!signedIn,
      page: page || 'home',
      referrer: document.referrer || null,
      browser: getBrowser(),
      os: getOS(),
      device: getDevice(),
      screen_w: window.screen.width,
      screen_h: window.screen.height,
      language: navigator.language || null,
      timestamp: new Date().toISOString()
    }).then(function() {}).catch(function() {});
  }

  // Track initial page load
  trackView('home');

  // Track section navigations by hooking into showSec
  var _origShowSecTracker = window.showSec;
  window.showSec = function(id, skipPush) {
    _origShowSecTracker(id, skipPush);   // pass skipPush through (it was dropped, so Back/Forward could push duplicate entries)
    trackView(id);
  };

  // Heartbeat for live visitor count (ping every 30s)
  function heartbeat() {
    if (!sbReady() || _isOwnerBrowser() || isAdmin()) return;
    _sb.from('page_views_heartbeat').upsert({
      session_id: sessionId,
      last_seen: new Date().toISOString()
    }, { onConflict: 'session_id' }).then(function() {}).catch(function() {});
  }
  // Start after the page is idle so it does not compete with content; skip while the tab is hidden
  var startBeat = function() {
    heartbeat();
    setInterval(function() { if (!document.hidden) heartbeat(); }, 30000);
  };
  if ('requestIdleCallback' in window) requestIdleCallback(startBeat, { timeout: 5000 });
  else setTimeout(startBeat, 3000);
})();

// ── Dashboard Data Loading ──
var _dashRange = '7d';

function setDashRange(range) {
  _dashRange = range;
  document.querySelectorAll('#dash-range button').forEach(function(b) { b.classList.remove('active'); });
  event.target.classList.add('active');
  refreshDashboard();
}

function daysFromRange(range) {
  if (range === '7d') return 7;
  if (range === '30d') return 30;
  return 90;
}

async function _fetchAllRows(makeQuery, maxRows) {
  var out = [], from = 0, PAGE = 1000;
  maxRows = maxRows || 50000;
  while (from < maxRows) {
    var res = await makeQuery(from, from + PAGE - 1);
    if (res.error) throw res.error;
    var rows = res.data || [];
    out = out.concat(rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

// Page views and monthly active users (server-side counts; admin only)
async function loadMonthlyStats() {
  var cards = document.getElementById('mau-cards'), table = document.getElementById('mau-table');
  if (!cards || !isAdmin() || !sbReady()) return;
  var res = await Promise.all([_sb.rpc('admin_rolling_30'), _sb.rpc('admin_monthly_stats', { months: 12 })]);
  if (res[0].error || res[1].error) { cards.innerHTML = '<div class="admin-empty">Could not load: ' + esc((res[0].error || res[1].error).message) + '</div>'; return; }
  var r = (res[0].data || [])[0] || {};
  var card = function (label, val, sub) { return '<div class="mau-card"><div class="mau-v">' + Number(val || 0).toLocaleString() + '</div><div class="mau-l">' + esc(label) + '</div>' + (sub ? '<div class="mau-s">' + esc(sub) + '</div>' : '') + '</div>'; };
  cards.innerHTML = card('Page views', r.page_views)
    + card('Monthly active visitors', r.active_visitors, 'unique browsers')
    + card('Active members', r.active_members, 'signed in while browsing')
    + card('Members who signed in', r.registered_active, 'from account records');
  var months = res[1].data || [];
  table.innerHTML = months.length ? '<table class="adm-table"><thead><tr><th>Month</th><th>Page views</th><th>Active visitors</th><th>Active members</th><th>Visits</th></tr></thead><tbody>'
    + months.map(function (m) {
      var label = localDate(m.month + 'T12:00:00', { month: 'long', year: 'numeric' });
      return '<tr><td>' + esc(label) + '</td><td>' + Number(m.page_views).toLocaleString() + '</td>'
        + '<td>' + (m.has_visitor_ids ? Number(m.active_visitors).toLocaleString() : '<span title="Visitor IDs started October 10, 2026">n/a</span>') + '</td>'
        + '<td>' + (m.has_visitor_ids ? Number(m.active_members).toLocaleString() : 'n/a') + '</td>'
        + '<td>' + Number(m.sessions).toLocaleString() + '</td></tr>';
    }).join('') + '</tbody></table>' : '<div class="admin-empty">No page views yet.</div>';
}

// Daily visitors for the last 30 days: unique browsers (visitor_id, or the visit id for older rows) per local day
async function loadDailyVisitors() {
  var cards = document.getElementById('daily-cards'), chart = document.getElementById('daily-chart');
  if (!cards || !isAdmin() || !sbReady()) return;
  var since = new Date(); since.setHours(0, 0, 0, 0); since.setDate(since.getDate() - 29);
  var rows;
  try {
    rows = await _fetchAllRows(function(from, to) {
      return _sb.from('page_views').select('visitor_id, session_id, is_member, timestamp')
        .gte('timestamp', since.toISOString()).order('timestamp', { ascending: true }).range(from, to);
    });
  } catch (e) { cards.innerHTML = '<div class="admin-empty">Could not load daily visitors.</div>'; return; }
  var days = [], byDay = {};
  for (var i = 0; i < 30; i++) {
    var d = new Date(since); d.setDate(since.getDate() + i);
    var key = _localDay(d.toISOString());
    days.push(key); byDay[key] = { v: new Set(), m: new Set(), views: 0 };
  }
  var own = _ownerVisitorId();
  rows.forEach(function(r) {
    if (own && r.visitor_id === own) return;
    var b = byDay[_localDay(r.timestamp)];
    if (!b) return;
    var who = r.visitor_id || ('s:' + r.session_id);
    b.v.add(who); b.views++;
    if (r.is_member) b.m.add(who);
  });
  var n = function(k) { return byDay[k] ? byDay[k].v.size : 0; };
  var today = days[29], yesterday = days[28];
  var avg7 = Math.round(days.slice(23).reduce(function(s, k) { return s + n(k); }, 0) / 7);
  var card = function(label, val, sub) { return '<div class="mau-card"><div class="mau-v">' + Number(val || 0).toLocaleString() + '</div><div class="mau-l">' + esc(label) + '</div>' + (sub ? '<div class="mau-s">' + esc(sub) + '</div>' : '') + '</div>'; };
  cards.innerHTML = card('Visitors today', n(today), byDay[today].views + ' page views')
    + card('Yesterday', n(yesterday), byDay[yesterday].views + ' page views')
    + card('Daily average', avg7, 'last 7 days')
    + card('Best day', Math.max.apply(null, days.map(n)), 'last 30 days');
  var max = Math.max(1, Math.max.apply(null, days.map(n)));
  chart.innerHTML = '<div class="dc-bars">' + days.map(function(k) {
    var v = n(k), dt = new Date(k + 'T12:00:00');
    var label = dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return '<div class="dc-col" title="' + esc(label + ': ' + v + ' visitors, ' + byDay[k].views + ' page views, ' + byDay[k].m.size + ' members') + '">'
      + '<span class="dc-n">' + (v || '') + '</span><div class="dc-bar' + (k === today ? ' today' : '') + '" style="height:' + Math.round(100 * v / max) + '%"></div>'
      + '<span class="dc-d">' + (dt.getDate() === 1 || k === days[0] || dt.getDay() === 1 ? esc(label) : '') + '</span></div>';
  }).join('') + '</div><p class="adm-note">Each bar is one day (your time zone). Hover a bar for page views and signed-in members. A visitor is one browser, counted once per day. Your own browsing on this browser is left out.</p>';
}

async function refreshDashboard() {
  if (!isAdmin()) return;
  loadMonthlyStats();
  loadDailyVisitors();
  var days = daysFromRange(_dashRange);
  var since = new Date();
  since.setDate(since.getDate() - days);
  var sinceISO = since.toISOString();

  var prevSince = new Date();
  prevSince.setDate(prevSince.getDate() - days * 2);
  var prevSinceISO = prevSince.toISOString();

  try {
    // Read every row in pages of 1,000 (a single select is silently capped at 1,000 rows,
    // so every KPI was wrong once the site passed 1,000 views in the selected range).
    var views = await _fetchAllRows(function(from, to) {
      return _sb.from('page_views').select('*').gte('timestamp', sinceISO)
        .order('timestamp', { ascending: true }).range(from, to);
    });
    var _own = _ownerVisitorId();
    if (_own) views = views.filter(function(v) { return v.visitor_id !== _own; });
    var prevViews = await _fetchAllRows(function(from, to) {
      return _sb.from('page_views').select('session_id, page, timestamp')
        .gte('timestamp', prevSinceISO).lt('timestamp', sinceISO)
        .order('timestamp', { ascending: true }).range(from, to);
    });

    var liveThreshold = new Date(Date.now() - 60000).toISOString();
    var { data: liveData } = await _sb
      .from('page_views_heartbeat')
      .select('session_id')
      .gte('last_seen', liveThreshold);

    // KPI Cards
    var totalViews = views.length;
    var uniqueSessions = new Set(views.map(function(v) { return v.session_id; })).size;
    var prevTotal = prevViews.length;
    var prevUnique = new Set(prevViews.map(function(v) { return v.session_id; })).size;

    document.getElementById('dash-total-views').textContent = totalViews.toLocaleString();
    document.getElementById('dash-unique').textContent = uniqueSessions.toLocaleString();
    setChangeEl('dash-views-change', totalViews, prevTotal);
    setChangeEl('dash-unique-change', uniqueSessions, prevUnique);

    // Avg session duration
    var sessionTimes = {};
    views.forEach(function(v) {
      if (!sessionTimes[v.session_id]) sessionTimes[v.session_id] = { min: v.timestamp, max: v.timestamp };
      if (v.timestamp < sessionTimes[v.session_id].min) sessionTimes[v.session_id].min = v.timestamp;
      if (v.timestamp > sessionTimes[v.session_id].max) sessionTimes[v.session_id].max = v.timestamp;
    });
    var durations = Object.values(sessionTimes).map(function(t) {
      return (new Date(t.max) - new Date(t.min)) / 1000;
    });
    var avgSession = durations.length ? Math.round(durations.reduce(function(a, b) { return a + b; }, 0) / durations.length) : 0;
    document.getElementById('dash-avg-session').textContent = avgSession + 's';

    // Bounce rate
    var sessionCounts = {};
    views.forEach(function(v) {
      sessionCounts[v.session_id] = (sessionCounts[v.session_id] || 0) + 1;
    });
    var totalSess = Object.keys(sessionCounts).length;
    var bounced = Object.values(sessionCounts).filter(function(c) { return c === 1; }).length;
    var bounceRate = totalSess ? Math.round((bounced / totalSess) * 100) : 0;
    document.getElementById('dash-bounce').textContent = bounceRate + '%';

    // Live visitors
    document.getElementById('dash-live-count').textContent = (liveData ? liveData.length : 0);

    // Bar chart: views per day
    var dayBuckets = {};
    for (var d = 0; d < days; d++) {
      var dt = new Date();
      dt.setDate(dt.getDate() - (days - 1 - d));
      var key = dt.toISOString().slice(0, 10);
      dayBuckets[key] = 0;
    }
    views.forEach(function(v) {
      var k = v.timestamp.slice(0, 10);
      if (dayBuckets.hasOwnProperty(k)) dayBuckets[k]++;
    });
    var bucketKeys = Object.keys(dayBuckets);
    var maxVal = Math.max.apply(null, Object.values(dayBuckets)) || 1;

    var barsHtml = '';
    var labelsHtml = '';
    bucketKeys.forEach(function(k, i) {
      var pct = (dayBuckets[k] / maxVal) * 100;
      barsHtml += '<div class="dash-bar" style="height:' + Math.max(pct, 2) + '%"><span class="dash-bar-tip">' + k + ': ' + dayBuckets[k] + '</span></div>';
      var showLabel = (days <= 7) || (days <= 30 && i % 5 === 0) || (days > 30 && i % 10 === 0);
      labelsHtml += '<span>' + (showLabel ? k.slice(5) : '') + '</span>';
    });
    document.getElementById('dash-chart-bars').innerHTML = barsHtml;
    document.getElementById('dash-chart-labels').innerHTML = labelsHtml;

    // Top Pages
    var pageCounts = {};
    views.forEach(function(v) { var p = v.page || 'home'; pageCounts[p] = (pageCounts[p] || 0) + 1; });
    fillDashTable('dash-top-pages', pageCounts, 8);

    // Referrers
    var refCounts = {};
    views.forEach(function(v) {
      var r = v.referrer || '(direct)';
      try { r = r ? new URL(r).hostname : '(direct)'; } catch(e) {}
      refCounts[r] = (refCounts[r] || 0) + 1;
    });
    fillDashTable('dash-referrers', refCounts, 8);

    // Browsers
    var browserCounts = {};
    views.forEach(function(v) { browserCounts[v.browser || 'Unknown'] = (browserCounts[v.browser || 'Unknown'] || 0) + 1; });
    fillDashTable('dash-browsers', browserCounts, 6);

    // Devices
    var deviceCounts = {};
    views.forEach(function(v) { deviceCounts[v.device || 'Unknown'] = (deviceCounts[v.device || 'Unknown'] || 0) + 1; });
    fillDashTable('dash-devices', deviceCounts, 6);

    // OS
    var osCounts = {};
    views.forEach(function(v) { osCounts[v.os || 'Unknown'] = (osCounts[v.os || 'Unknown'] || 0) + 1; });
    fillDashTable('dash-os', osCounts, 6);

    // Countries (language as proxy)
    var langCounts = {};
    views.forEach(function(v) { var l = v.country || v.language || 'Unknown'; langCounts[l] = (langCounts[l] || 0) + 1; });
    fillDashTable('dash-countries', langCounts, 8);

  } catch (err) {
    console.error('Dashboard error:', err);
  }
}

function setChangeEl(elId, current, previous) {
  var el = document.getElementById(elId);
  if (!previous) { el.textContent = ''; return; }
  var pct = Math.round(((current - previous) / previous) * 100);
  if (pct > 0) {
    el.className = 'dash-change up';
    el.textContent = '+' + pct + '% vs prior period';
  } else if (pct < 0) {
    el.className = 'dash-change down';
    el.textContent = pct + '% vs prior period';
  } else {
    el.className = 'dash-change';
    el.textContent = 'No change';
  }
}

function escHtml(str) { return esc(str); }

function fillDashTable(tableId, countsObj, limit) {
  var sorted = Object.entries(countsObj).sort(function(a, b) { return b[1] - a[1]; }).slice(0, limit);
  var maxVal = sorted.length ? sorted[0][1] : 1;
  var tbody = document.querySelector('#' + tableId + ' tbody');
  var html = '';
  sorted.forEach(function(entry) {
    var pct = Math.round((entry[1] / maxVal) * 100);
    html += '<tr><td>' + escHtml(entry[0]) + '</td><td>' + entry[1] + '</td><td class="bar-cell"><span class="mini-bar" style="width:' + pct + '%"></span></td></tr>';
  });
  tbody.innerHTML = html || '<tr><td colspan="3" style="color:var(--text-muted);text-align:center;padding:12px;">No data yet</td></tr>';
}

// ══════════════════════════════════════════
//  NEWS QUEUE: roundup articles (automation/news_roundup.py) waiting for the admin
// ══════════════════════════════════════════
async function loadNewsQueue() {
  var el = document.getElementById('newsq-list');
  if (!el || !isAdmin() || !sbReady()) return;
  el.innerHTML = '<div class="admin-empty">Loading...</div>';
  var r = await _sb.from('news').select('id, title, excerpt, source_name, source_url, published_at, tags')
    .eq('status', 'pending').contains('tags', ['roundup']).order('published_at', { ascending: false }).limit(200);
  if (r.error) { el.innerHTML = '<div class="admin-empty">Could not load: ' + esc(r.error.message) + '</div>'; return; }
  var items = r.data || [];
  if (!items.length) { el.innerHTML = '<div class="admin-empty">No articles waiting. New ones arrive each morning.</div>'; return; }
  el.innerHTML = '<div class="newsq-bar"><b>' + items.length + '</b> waiting <button type="button" class="adm-btn" onclick="newsQueueAll(\'published\')">Publish all</button>'
    + '<button type="button" class="adm-btn adm-danger" onclick="newsQueueAll(\'rejected\')">Reject all</button></div>'
    + items.map(function (n) {
      var lang = (n.tags || []).indexOf('de') !== -1 ? ' &middot; German' : '';
      return '<div class="adm-post" id="nq-' + esc(n.id) + '"><div class="adm-post-head"><span class="adm-pill">' + esc(n.source_name || '') + '</span>'
        + '<b><a href="' + escUrl(n.source_url) + '" target="_blank" rel="noopener">' + esc(n.title) + '</a></b>'
        + '<span class="adm-post-meta">' + esc(localDate(n.published_at, { month: 'short', day: 'numeric', year: 'numeric' })) + lang + '</span></div>'
        + (n.excerpt ? '<p>' + esc(n.excerpt) + '</p>' : '')
        + '<div class="adm-post-acts"><button type="button" class="adm-btn" onclick="newsQueueSet(\'' + escJs(n.id) + '\',\'published\')">Publish</button> '
        + '<button type="button" class="adm-btn adm-danger" onclick="newsQueueSet(\'' + escJs(n.id) + '\',\'rejected\')">Reject</button></div></div>';
    }).join('');
}

async function newsQueueSet(id, status) {
  if (!isAdmin()) return;
  var r = await _sb.from('news').update({ status: status }).eq('id', id);   // published_at keeps the article's own date
  if (r.error) { alert('Error: ' + r.error.message); return; }
  var row = document.getElementById('nq-' + id); if (row) row.remove();
  if (status === 'published') loadNewsFromSupabase();
}

async function newsQueueAll(status) {
  if (!isAdmin()) return;
  if (!confirm((status === 'published' ? 'Publish' : 'Reject') + ' every article in the queue?')) return;
  var r = await _sb.from('news').update({ status: status }).eq('status', 'pending').contains('tags', ['roundup']);
  if (r.error) { alert('Error: ' + r.error.message); return; }
  loadNewsQueue();
  if (status === 'published') loadNewsFromSupabase();
}

// ══════════════════════════════════════════
//  MEMBERS + ACTIVITY (admin only)
//  admin_list_users / admin_recent_posts / admin_moderate are database functions that refuse
//  anyone who is not an admin, so these tabs show nothing to other accounts.
// ══════════════════════════════════════════

var _admMembers = [];
var _admSubs = [];

function _admDate(iso) {
  return iso ? localDate(iso, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
}

async function loadAdminMembers() {
  var list = document.getElementById('adm-members-list');
  var subsEl = document.getElementById('adm-subs-list');
  if (!isAdmin() || !sbReady()) { list.innerHTML = '<div class="admin-empty">Admins only.</div>'; return; }
  var res = await Promise.all([
    _sb.rpc('admin_list_users'),
    _sb.from('newsletter_subscribers').select('email, name, confirmed, created_at, confirmed_at, unsubscribed_at').order('created_at', { ascending: false })
  ]);
  if (res[0].error) { list.innerHTML = '<div class="admin-empty">Could not load members: ' + esc(res[0].error.message) + '</div>'; }
  else { _admMembers = res[0].data || []; renderAdminMembers(); }
  if (res[1].error) { subsEl.innerHTML = '<div class="admin-empty">Could not load subscribers.</div>'; return; }
  _admSubs = res[1].data || [];
  subsEl.innerHTML = _admSubs.length ? '<table class="adm-table"><thead><tr><th>Email</th><th>Name</th><th>Status</th><th>Signed up</th></tr></thead><tbody>'
    + _admSubs.map(function (s) {
      var st = s.unsubscribed_at ? 'unsubscribed' : (s.confirmed ? 'subscribed' : 'unconfirmed');
      return '<tr><td><a href="mailto:' + esc(s.email) + '">' + esc(s.email) + '</a></td><td>' + esc(s.name || '') + '</td>'
        + '<td><span class="adm-pill adm-' + st + '">' + st + '</span></td><td>' + esc(_admDate(s.created_at)) + '</td></tr>';
    }).join('') + '</tbody></table>' : '<div class="admin-empty">No subscribers yet.</div>';
}

function _admPosts(m) { return (m.comments || 0) + (m.chat || 0) + (m.events || 0) + (m.listings || 0) + (m.reviews || 0); }

function _admFilteredMembers() {
  var q = ((document.getElementById('adm-member-q') || {}).value || '').trim().toLowerCase();
  return _admMembers.filter(function (m) {
    return !q || [m.email, m.username, m.full_name].join(' ').toLowerCase().indexOf(q) !== -1;
  });
}

function renderAdminMembers() {
  var rows = _admFilteredMembers();
  var subs = _admMembers.filter(function (m) { return m.newsletter === 'subscribed'; }).length;
  var active = _admMembers.filter(function (m) { return m.last_sign_in_at && Date.now() - new Date(m.last_sign_in_at) < 30 * 864e5; }).length;
  document.getElementById('adm-members-stats').innerHTML =
    '<div><b>' + _admMembers.length + '</b> members</div><div><b>' + active + '</b> signed in, last 30 days</div><div><b>' + subs + '</b> also get the newsletter</div>';
  document.getElementById('adm-members-list').innerHTML = rows.length
    ? '<table class="adm-table"><thead><tr><th>Email</th><th>Name</th><th>Joined</th><th>Last sign-in</th><th>Posts</th><th>Newsletter</th></tr></thead><tbody>'
      + rows.map(function (m) {
        var name = m.full_name || m.username || '';
        return '<tr><td><a href="mailto:' + esc(m.email) + '">' + esc(m.email) + '</a>'
          + (m.is_admin ? ' <span class="adm-pill adm-admin">admin</span>' : '')
          + (m.confirmed ? '' : ' <span class="adm-pill adm-unconfirmed">unconfirmed</span>') + '</td>'
          + '<td>' + esc(name) + '</td><td>' + esc(_admDate(m.created_at)) + '</td><td>' + esc(_admDate(m.last_sign_in_at)) + '</td>'
          + '<td>' + _admPosts(m) + '</td><td>' + esc(m.newsletter || '') + '</td></tr>';
      }).join('') + '</tbody></table>'
    : '<div class="admin-empty">No members match.</div>';
}

function _admEmails(which) {
  if (which === 'members') return _admFilteredMembers().map(function (m) { return m.email; });
  return _admSubs.filter(function (s) { return s.confirmed && !s.unsubscribed_at; }).map(function (s) { return s.email; });
}

async function copyAdminEmails(which) {
  var emails = _admEmails(which);
  if (!emails.length) { alert('No emails to copy.'); return; }
  try { await navigator.clipboard.writeText(emails.join(', ')); alert('Copied ' + emails.length + ' email address(es).'); }
  catch (e) { prompt('Copy these addresses:', emails.join(', ')); }
}

function _csvCell(v) {
  var s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;   // stop spreadsheet formulas
  return '"' + s.replace(/"/g, '""') + '"';
}

function downloadAdminCsv(which) {
  var head, rows;
  if (which === 'members') {
    head = ['email', 'name', 'username', 'joined', 'last_sign_in', 'confirmed', 'newsletter', 'posts'];
    rows = _admFilteredMembers().map(function (m) {
      return [m.email, m.full_name, m.username, m.created_at, m.last_sign_in_at, m.confirmed, m.newsletter, _admPosts(m)];
    });
  } else {
    head = ['email', 'name', 'status', 'signed_up'];
    rows = _admSubs.map(function (s) {
      return [s.email, s.name, s.unsubscribed_at ? 'unsubscribed' : (s.confirmed ? 'subscribed' : 'unconfirmed'), s.created_at];
    });
  }
  var csv = [head].concat(rows).map(function (r) { return r.map(_csvCell).join(','); }).join('\r\n');
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'sophia-commons-' + which + '-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
}

// ── Activity ──
var _admPostsList = [];
var _admKind = 'all';
var _ADM_REMOVABLE = { comment: 1, review: 1, chat: 1, event: 1, listing: 1, news: 1 };

async function loadAdminActivity() {
  var el = document.getElementById('adm-act-list');
  if (!isAdmin() || !sbReady()) { el.innerHTML = '<div class="admin-empty">Admins only.</div>'; return; }
  el.innerHTML = '<div class="admin-empty">Loading...</div>';
  var r = await _sb.rpc('admin_recent_posts', { max_rows: 300 });
  if (r.error) { el.innerHTML = '<div class="admin-empty">Could not load posts: ' + esc(r.error.message) + '</div>'; return; }
  _admPostsList = r.data || [];
  renderAdminActivity();
}

function renderAdminActivity() {
  var counts = {};
  _admPostsList.forEach(function (p) { counts[p.kind] = (counts[p.kind] || 0) + 1; });
  var kinds = ['all'].concat(Object.keys(counts).sort());
  document.getElementById('adm-act-chips').innerHTML = kinds.map(function (k) {
    var n = k === 'all' ? _admPostsList.length : counts[k];
    return '<button type="button" class="adm-chip' + (k === _admKind ? ' active' : '') + '" aria-pressed="' + (k === _admKind) + '" onclick="_admKind=\'' + escJs(k) + '\';renderAdminActivity()">' + esc(k) + ' <span>' + n + '</span></button>';
  }).join('');
  var q = ((document.getElementById('adm-act-q') || {}).value || '').trim().toLowerCase();
  var rows = _admPostsList.filter(function (p) {
    return (_admKind === 'all' || p.kind === _admKind) && (!q || [p.title, p.body, p.author].join(' ').toLowerCase().indexOf(q) !== -1);
  });
  document.getElementById('adm-act-list').innerHTML = rows.length ? rows.map(_admPostHtml).join('') : '<div class="admin-empty">Nothing here.</div>';
}

function _admPostHtml(p) {
  var removed = p.status === 'deleted' || p.status === 'hidden';
  var action = _ADM_REMOVABLE[p.kind] && !removed
    ? '<button type="button" class="adm-btn adm-danger" onclick="moderateAdminPost(\'' + escJs(p.kind) + '\',\'' + escJs(p.id) + '\')">' + (p.kind === 'review' ? 'Hide' : 'Remove') + '</button>'
    : (p.kind.indexOf('pending') === 0 ? '<button type="button" class="adm-btn" onclick="adminSwitchTab(\'' + (p.kind === 'pending listing' ? 'listings' : 'memorials') + '\')">Review</button>' : '');
  return '<div class="adm-post' + (removed ? ' is-removed' : '') + '">'
    + '<div class="adm-post-head"><span class="adm-pill">' + esc(p.kind) + '</span><b>' + esc(p.title || '') + '</b>'
    + '<span class="adm-post-meta">' + esc(p.author || 'unknown') + ' &middot; ' + esc(_timeAgo(p.created_at)) + (p.status ? ' &middot; ' + esc(p.status) : '') + '</span></div>'
    + (p.body ? '<p>' + esc(_shortText(p.body, 300)) + '</p>' : '')
    + (action ? '<div class="adm-post-acts">' + action + '</div>' : '') + '</div>';
}

async function moderateAdminPost(kind, id) {
  if (!isAdmin()) return;
  var verb = kind === 'review' ? 'Hide this review' : (kind === 'comment' ? 'Remove this comment (replies stay)' : 'Permanently delete this ' + kind);
  if (!confirm(verb + '?')) return;
  var r = await _sb.rpc('admin_moderate', { post_kind: kind, post_id: id });
  if (r.error) { alert('Error: ' + r.error.message); return; }
  loadAdminActivity();
}

// ══════════════════════════════════════════
//  WEEKLY DIGEST
//  The weekly-digest edge function builds the draft (also every Monday from GitHub Actions);
//  send-newsletter emails an approved draft once and publishes it on the News page.
// ══════════════════════════════════════════

async function _digestCall(fn, body) {
  var s = await _sb.auth.getSession();
  var session = s.data && s.data.session;
  if (!session || !session.access_token) throw new Error(t('error.no_active_session', 'Please sign in again.'));
  var res = await fetch(SUPABASE_URL + '/functions/v1/' + fn, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  var out = {};
  try { out = await res.json(); } catch (e) { /* not JSON: fall through to the status code */ }
  if (!res.ok) throw new Error(out.error || ('Server returned ' + res.status));
  return out;
}

function _digestStatus(msg, color) {
  var el = document.getElementById('digest-status');
  if (!el) return;
  el.textContent = msg;
  el.style.color = color || 'var(--text-muted)';
}

// The email is shown in a sandboxed frame: exactly what subscribers will see, with no scripts.
function _digestFrame(html) {
  return '<iframe class="digest-frame" sandbox="" title="Digest preview" srcdoc="'
    + esc('<!doctype html><meta charset="utf-8"><body style="margin:12px;background:#fff">' + html) + '"></iframe>';
}

async function previewWeeklyDigest() {
  if (!isAdmin()) return;
  _digestStatus('Building preview...');
  try {
    var out = await _digestCall('weekly-digest', { preview: true });
    document.getElementById('digest-preview-content').innerHTML = _digestFrame(out.html);
    document.getElementById('digest-preview').style.display = 'block';
    _digestStatus('Preview only (' + out.counts + '). Nothing was saved.');
  } catch (e) { _digestStatus('Error: ' + e.message, 'var(--error,#c0392b)'); }
}

async function generateWeeklyDigest() {
  if (!isAdmin()) return;
  var btn = document.getElementById('digest-generate-btn');
  btn.disabled = true;
  _digestStatus('Building draft...');
  try {
    var out = await _digestCall('weekly-digest', {});
    _digestStatus('Draft ready (' + out.counts + '). Review it under Awaiting Your Approval.', 'var(--gold-text)');
    loadDigestDrafts();
  } catch (e) { _digestStatus('Error: ' + e.message, 'var(--error,#c0392b)'); }
  btn.disabled = false;
}

// Approve: email it to every confirmed subscriber (once), then it appears on the News page.
async function approveDigest(id, sendEmail) {
  if (!isAdmin()) return;
  if (sendEmail) {
    await loadNewsletterSubscriberCount();
    if (!confirm('Email this digest to ' + _newsletterSubscriberCount + ' subscriber(s) and publish it on the News page?')) return;
  }
  _digestStatus(sendEmail ? 'Sending...' : 'Publishing...');
  try {
    if (sendEmail) {
      var out = await _digestCall('send-newsletter', { news_id: id });
      _digestStatus('Sent to ' + out.sent + ' of ' + out.total + ' subscribers' + (out.failed ? ' (' + out.failed + ' failed)' : '') + ', and published on the News page.', 'var(--success,#27ae60)');
    } else {
      var r = await _sb.from('news').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', id);
      if (r.error) throw r.error;
      _digestStatus('Published on the News page (not emailed).', 'var(--success,#27ae60)');
    }
    loadDigestDrafts();
    loadDigestHistory();
  } catch (e) { _digestStatus('Error: ' + e.message, 'var(--error,#c0392b)'); }
}

async function deleteDigest(id) {
  if (!isAdmin()) return;
  if (!confirm('Delete this draft? Nothing will be sent this week unless you build a new one.')) return;
  try {
    var del = await _sb.from('news').delete().eq('id', id);
    if (del.error) throw del.error;
    loadDigestDrafts();
  } catch (e) { alert('Error: ' + (e.message || 'Unknown')); }
}

async function loadDigestDrafts() {
  var el = document.getElementById('digest-drafts');
  if (!el || !sbReady()) return;
  try {
    var r = await _sb.from('news').select('id, title, body, excerpt, created_at')
      .eq('status', 'pending').contains('tags', ['weekly-digest'])
      .order('created_at', { ascending: false }).limit(5);
    if (r.error || !r.data || !r.data.length) {
      el.innerHTML = '<div class="digest-empty">No drafts awaiting approval.</div>';
      return;
    }
    el.innerHTML = r.data.map(function(d) {
      var date = localDate(d.created_at, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      var id = escJs(d.id);
      return '<div class="digest-draft">'
        + '<div class="digest-draft-head"><strong>' + esc(d.title) + '</strong><span>' + esc(date) + '</span></div>'
        + '<div class="digest-draft-sub">' + esc(d.excerpt || '') + '</div>'
        + '<details><summary>Preview the email</summary>' + _digestFrame(d.body || '') + '</details>'
        + '<div class="digest-draft-actions">'
        + '<button class="admin-btn admin-btn-approve" onclick="approveDigest(\'' + id + '\', true)">Approve &amp; email</button>'
        + '<button class="admin-btn" onclick="approveDigest(\'' + id + '\', false)">Publish only</button>'
        + '<button class="admin-btn admin-btn-reject" onclick="deleteDigest(\'' + id + '\')">Delete</button>'
        + '</div></div>';
    }).join('');
  } catch (e) {
    el.innerHTML = '<div class="digest-empty">Error loading drafts.</div>';
  }
}

async function loadDigestHistory() {
  var el = document.getElementById('digest-history');
  if (!el) return;
  if (!sbReady()) { el.innerHTML = '<div class="digest-empty">Not connected</div>'; return; }
  try {
    var r = await _sb.from('news').select('id, title, published_at, emailed_at, emailed_count')
      .eq('status', 'published').contains('tags', ['weekly-digest'])
      .order('published_at', { ascending: false }).limit(8);
    if (r.error || !r.data || !r.data.length) {
      el.innerHTML = '<div class="digest-empty">No past digests yet.</div>';
      return;
    }
    el.innerHTML = r.data.map(function(d) {
      var date = localDate(d.published_at, { month: 'short', day: 'numeric', year: 'numeric' });
      var sent = d.emailed_at ? 'emailed to ' + (d.emailed_count || 0) : 'not emailed';
      return '<div class="digest-hist"><a href="/article/' + esc(d.id) + '" onclick="showDetail(\'news\',\'' + escJs(d.id) + '\');return false;">' + esc(d.title) + '</a>'
        + '<span>' + esc(date) + ' &middot; ' + sent + '</span></div>';
    }).join('');
  } catch (e) {
    el.innerHTML = '<div class="digest-empty">Error loading history.</div>';
  }
}

// ══════════════════════════════════════════
//  MOON PHASE WIDGET
// ══════════════════════════════════════════
(function() {
  var SYNODIC_MONTH = 29.53058867;
  var KNOWN_NEW_MOON = new Date(Date.UTC(2000, 0, 6, 18, 14, 0));

  function getMoonAge(date) {
    var diff = date.getTime() - KNOWN_NEW_MOON.getTime();
    var days = diff / (1000 * 60 * 60 * 24);
    var age = days % SYNODIC_MONTH;
    if (age < 0) age += SYNODIC_MONTH;
    return age;
  }

  function getPhaseInfo(age) {
    var fraction = age / SYNODIC_MONTH;
    var illumination = (1 - Math.cos(2 * Math.PI * fraction)) / 2;
    var phaseName;
    if (age < 1.845) phaseName = 'New Moon';
    else if (age < 7.383) phaseName = 'Waxing Crescent';
    else if (age < 9.228) phaseName = 'First Quarter';
    else if (age < 14.765) phaseName = 'Waxing Gibbous';
    else if (age < 16.610) phaseName = 'Full Moon';
    else if (age < 22.148) phaseName = 'Waning Gibbous';
    else if (age < 23.993) phaseName = 'Last Quarter';
    else if (age < 27.685) phaseName = 'Waning Crescent';
    else phaseName = 'New Moon';
    return { name: phaseName, illumination: Math.round(illumination * 100), fraction: fraction };
  }

  function getMoonDistance(age) {
    var fraction = age / SYNODIC_MONTH;
    return Math.round(384400 - 25100 * Math.cos(2 * Math.PI * fraction * 1.1));
  }

  var ECLIPSES = [
    { date: new Date(2026, 1, 17), type: 'solar', subtype: 'Annular', name: 'Annular Solar Eclipse', emoji: '\uD83C\uDF1E' },
    { date: new Date(2026, 2, 3),  type: 'lunar', subtype: 'Total',   name: 'Total Lunar Eclipse',   emoji: '\uD83C\uDF11' },
    { date: new Date(2026, 7, 12), type: 'solar', subtype: 'Total',   name: 'Total Solar Eclipse',   emoji: '\uD83C\uDF1E' },
    { date: new Date(2026, 7, 28), type: 'lunar', subtype: 'Partial', name: 'Partial Lunar Eclipse', emoji: '\uD83C\uDF17' },
    { date: new Date(2027, 1, 6),  type: 'solar', subtype: 'Annular', name: 'Annular Solar Eclipse', emoji: '\uD83C\uDF1E' },
    { date: new Date(2027, 1, 20), type: 'lunar', subtype: 'Penumbral', name: 'Penumbral Lunar Eclipse', emoji: '\uD83C\uDF15' },
    { date: new Date(2027, 6, 18), type: 'lunar', subtype: 'Penumbral', name: 'Penumbral Lunar Eclipse', emoji: '\uD83C\uDF15' },
    { date: new Date(2027, 7, 2),  type: 'solar', subtype: 'Total',   name: 'Total Solar Eclipse',   emoji: '\uD83C\uDF1E' },
    { date: new Date(2028, 0, 12), type: 'lunar', subtype: 'Partial', name: 'Partial Lunar Eclipse', emoji: '\uD83C\uDF17' },
    { date: new Date(2028, 0, 26), type: 'solar', subtype: 'Annular', name: 'Annular Solar Eclipse', emoji: '\uD83C\uDF1E' },
    { date: new Date(2028, 6, 6),  type: 'lunar', subtype: 'Partial', name: 'Partial Lunar Eclipse', emoji: '\uD83C\uDF17' },
    { date: new Date(2028, 6, 22), type: 'solar', subtype: 'Total',   name: 'Total Solar Eclipse',   emoji: '\uD83C\uDF1E' },
    { date: new Date(2028, 11, 31), type: 'lunar', subtype: 'Total',  name: 'Total Lunar Eclipse',   emoji: '\uD83C\uDF11' }
  ];

  function getUpcomingPhases(age) {
    var phases = [
      { name: 'New Moon', emoji: '\uD83C\uDF11', center: 0 },
      { name: 'First Quarter', emoji: '\uD83C\uDF13', center: 7.383 },
      { name: 'Full Moon', emoji: '\uD83C\uDF15', center: 14.765 },
      { name: 'Last Quarter', emoji: '\uD83C\uDF17', center: 22.148 }
    ];
    var upcoming = [];
    var now = new Date();
    phases.forEach(function(p) {
      var daysUntil = p.center - age;
      if (daysUntil <= 0) daysUntil += SYNODIC_MONTH;
      if (daysUntil < 1) daysUntil += SYNODIC_MONTH;
      upcoming.push({ name: p.name, emoji: p.emoji, date: new Date(now.getTime() + daysUntil * 86400000), daysUntil: Math.round(daysUntil), isEclipse: false });
    });
    ECLIPSES.forEach(function(e) {
      var diff = (e.date.getTime() - now.getTime()) / 86400000;
      if (diff > 0 && diff < 180) {
        upcoming.push({ name: e.name, emoji: e.emoji, date: e.date, daysUntil: Math.round(diff), isEclipse: true, eclipseType: e.subtype + ' ' + (e.type === 'solar' ? 'Solar' : 'Lunar') });
      }
    });
    upcoming.sort(function(a, b) { return a.daysUntil - b.daysUntil; });
    return upcoming.slice(0, 4);
  }

  function drawMoon(canvas, fraction) {
    var ctx = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height, cx = w / 2, cy = h / 2, r = w / 2 - 4;
    ctx.clearRect(0, 0, w, h);
    var glow = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r + 8);
    glow.addColorStop(0, 'rgba(200,200,180,0.08)');
    glow.addColorStop(1, 'rgba(200,200,180,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = '#2a2a3a'; ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    // Lit region traced row by row: between the limb and the terminator.
    // fraction: 0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter.
    // Waxing lights the right side, waning the left (northern hemisphere view).
    var c = Math.cos(2 * Math.PI * fraction), waxing = fraction <= 0.5, steps = 64, k, y, sx;
    ctx.beginPath();
    for (k = 0; k <= steps; k++) {            // limb, top to bottom
      y = -r + (2 * r * k) / steps; sx = Math.sqrt(Math.max(0, r * r - y * y));
      var xl = waxing ? sx : -sx;
      if (k === 0) ctx.moveTo(cx + xl, cy + y); else ctx.lineTo(cx + xl, cy + y);
    }
    for (k = steps; k >= 0; k--) {            // terminator, bottom to top
      y = -r + (2 * r * k) / steps; sx = Math.sqrt(Math.max(0, r * r - y * y));
      ctx.lineTo(cx + (waxing ? c * sx : -c * sx), cy + y);
    }
    ctx.closePath();
    ctx.fillStyle = '#e8e4d4'; ctx.fill();
    [[0.3,0.35,0.08],[0.55,0.6,0.06],[0.4,0.7,0.05],[0.65,0.35,0.04],[0.5,0.45,0.07],[0.35,0.55,0.03]].forEach(function(c) {
      ctx.beginPath(); ctx.arc(cx + (c[0] - 0.5) * r * 2, cy + (c[1] - 0.5) * r * 2, c[2] * r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.06)'; ctx.fill();
    });
    ctx.restore();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(100,100,120,0.2)'; ctx.lineWidth = 1; ctx.stroke();
  }

  function renderMoon() {
    var canvas = document.getElementById('moon-canvas');
    if (!canvas) return;
    var now = new Date();
    var age = getMoonAge(now);
    var info = getPhaseInfo(age);
    var distance = getMoonDistance(age);
    var upcoming = getUpcomingPhases(age);
    drawMoon(canvas, info.fraction);
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', info.name + ', ' + info.illumination + '% illuminated');
    document.getElementById('moon-phase-name').textContent = info.name;
    document.getElementById('moon-illumination').textContent = info.illumination + '% illuminated';
    document.getElementById('moon-age').textContent = age.toFixed(1) + ' days';
    document.getElementById('moon-distance').textContent = (distance / 1000).toFixed(0) + 'k km';
    document.getElementById('moon-cycle-fill').style.width = ((age / SYNODIC_MONTH) * 100) + '%';
    document.getElementById('moon-cycle-label').textContent = 'Day ' + Math.floor(age) + ' of ' + SYNODIC_MONTH.toFixed(1);
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var upHtml = '';
    upcoming.forEach(function(u) {
      var dateStr = months[u.date.getMonth()] + ' ' + u.date.getDate();
      if (u.isEclipse) {
        upHtml += '<div class="moon-next-row eclipse"><span>' + u.emoji + ' ' + u.name + '<span class="moon-eclipse-type">' + u.eclipseType + '</span></span><span>' + dateStr + '</span></div>';
      } else {
        upHtml += '<div class="moon-next-row"><span>' + u.emoji + ' ' + u.name + '</span><span>' + dateStr + '</span></div>';
      }
    });
    document.getElementById('moon-upcoming').innerHTML = upHtml;
  }
  renderMoon();
  setInterval(renderMoon, 3600000);
})();

// ── INIT I18N ──
if (typeof SC_I18N !== 'undefined') SC_I18N.init();


// ═══════════════════════ v1.10: VIDEO OF THE WEEK + YOUTUBE CHANNELS + TOP 50 BOOKS ═══════════════════════
var YT_CATEGORIES = {"goetheanum": "Goetheanum & Sections", "society": "Anthroposophical Societies & Branches", "steiner-lectures": "Rudolf Steiner Lectures & Readings", "lecturer": "Lecturers & Teachers", "study-group": "Study, Meditation & Training", "waldorf": "Waldorf / Steiner Education", "biodynamic": "Biodynamic Agriculture", "eurythmy": "Eurythmy & Performing Arts", "medicine": "Anthroposophic Medicine", "camphill": "Camphill & Social Therapy", "christian-community": "The Christian Community", "publisher": "Publishers", "other": "Other"};
var YT_CHANNELS_SEED = [{"slug":"goetheanum","name":"Goetheanum","url":"https://www.youtube.com/channel/UCHd8RnL9WYIqCwH_SkPo8DQ","language":"DE/EN","category":"goetheanum","description":"Official channel of the Goetheanum in Dornach: lectures, conference recordings, Goetheanum TV excerpts.","verified":true},{"slug":"goetheanum-deutsch","name":"Goetheanum (deutsch)","url":"https://www.youtube.com/c/goetheanumdeutsch","language":"DE","category":"goetheanum","description":"German-language Goetheanum channel with talks and event documentation.","verified":true},{"slug":"goetheanum-studium","name":"Goetheanum Studium","url":"https://www.youtube.com/channel/UC6fRCIOT7f3UrtQrnwtiPJg","language":"DE/EN","category":"goetheanum","description":"The Goetheanum study programme: introductory courses and student projects.","verified":true},{"slug":"sektion-landwirtschaft","name":"Section for Agriculture at the Goetheanum","url":"https://www.youtube.com/@sektionfurlandwirtschaft7242","language":"DE/EN","category":"biodynamic","description":"Agriculture conference lectures and biodynamic research talks from the Goetheanum.","verified":true},{"slug":"medical-section-goetheanum","name":"Medical Section at the Goetheanum","url":"https://www.youtube.com/@medicalsectiongoetheanum","language":"EN/DE","category":"medicine","description":"Anthroposophic medicine lectures and conference recordings from the School of Spiritual Science.","verified":true},{"slug":"anthroposophy-usa","name":"Anthroposophical Society in America","url":"https://www.youtube.com/@AnthroposophyUSA","language":"EN","category":"society","description":"Video lectures, conferences and community events from the ASA.","verified":true},{"slug":"asa-faust-branch","name":"ASA Faust Branch, Sacramento","url":"https://www.youtube.com/@asafaustbranchsacramento","language":"EN","category":"society","description":"Recorded branch lectures and study evenings from Sacramento.","verified":true},{"slug":"ag-stuttgart","name":"Anthroposophische Gesellschaft Stuttgart","url":"https://www.youtube.com/c/AnthroposophischeGesellschaftStuttgart","language":"DE","category":"society","description":"Lectures from the Rudolf Steiner Haus Stuttgart.","verified":true},{"slug":"center-for-anthroposophy","name":"Center for Anthroposophy","url":"https://www.youtube.com/channel/UC3OoQXqjUVLOfvqP9blyKBA","language":"EN","category":"study-group","description":"Wilton, NH: Waldorf teacher education and anthroposophy foundation courses.","verified":true},{"slug":"anthroworld","name":"AnthroWorld","url":"https://www.youtube.com/@anthroworld_anthroposophie","language":"DE","category":"other","description":"Anthroposophy made accessible: interviews and explainer videos.","verified":true},{"slug":"rsp-audio","name":"Rudolf Steiner Press Audio","url":"https://www.youtube.com/@RudolfSteinerPressAudio","language":"EN","category":"steiner-lectures","description":"Full audiobook readings of Steiner's lectures and books in English.","verified":true},{"slug":"rudolf-steiner-press","name":"Rudolf Steiner Press","url":"https://www.youtube.com/channel/UC9vJp_fc4eEpQCo7g70MYxA","language":"EN","category":"publisher","description":"Book presentations and author talks from the UK publisher.","verified":true},{"slug":"steinerbooks","name":"SteinerBooks / Anthroposophic Press","url":"https://www.youtube.com/c/SteinerBooksAnthroposophicPress","language":"EN","category":"publisher","description":"Book launches, author interviews and lecture recordings.","verified":true},{"slug":"word-of-rudolf-steiner","name":"Word of Rudolf Steiner","url":"https://www.youtube.com/channel/UCOwvwoBewlGL69WmM2LxUFQ","language":"EN","category":"steiner-lectures","description":"English readings of Rudolf Steiner lectures and texts.","verified":true},{"slug":"rudolf-steiner-official","name":"Rudolf Steiner Official","url":"https://www.youtube.com/@RudolfSteinerOfficial","language":"EN","category":"steiner-lectures","description":"Narrated presentations of Steiner's lectures and ideas.","verified":false},{"slug":"rudolf-joseph-lorenz-steiner","name":"Rudolf Steiner ~ Anthroposophy","url":"https://www.youtube.com/@RudolfJosephLorenzSteiner","language":"EN","category":"steiner-lectures","description":"Lecture readings and anthroposophical topics in English.","verified":true},{"slug":"rs-anthroposophy-waldorf","name":"Rudolf Steiner Anthroposophy Waldorf","url":"https://www.youtube.com/c/RudolfSteinerAnthroposophyWaldorf","language":"EN","category":"steiner-lectures","description":"Steiner, anthroposophy and Waldorf education through readings and talks.","verified":true},{"slug":"rs-anthroposophie-de","name":"Rudolf Steiner und die Anthroposophie","url":"https://www.youtube.com/@Rudolf-Steiner-Anthroposophie","language":"DE","category":"steiner-lectures","description":"German readings of Steiner lectures and explanatory videos.","verified":true},{"slug":"rs-audiobuecher","name":"Rudolf Steiner Audiobücher","url":"https://www.youtube.com/channel/UCjeAmyLK5V2w3xUV8GCnULg","language":"DE","category":"steiner-lectures","description":"German audiobook readings of the Gesamtausgabe.","verified":true},{"slug":"angelina-liest","name":"Angelina liest Rudolf Steiner","url":"https://www.youtube.com/@AngelinaliestRudolfSteiner","language":"DE","category":"steiner-lectures","description":"German readings of Steiner lectures by a single narrator.","verified":true},{"slug":"anthro-meditation","name":"Anthroposophische Meditation","url":"https://www.youtube.com/channel/UCv8u5DA8SknblsW3j6Cg_7w","language":"DE","category":"study-group","description":"Anthroposophical meditation practice based on Steiner's exercises.","verified":true},{"slug":"soi-esprit","name":"Soi-esprit Info (Rudolf Steiner, Anthroposophie)","url":"https://www.youtube.com/channel/UCv-8cGJpbPdU1W8gYAaCk_A","language":"FR","category":"steiner-lectures","description":"French readings and presentations of Steiner's anthroposophy.","verified":true},{"slug":"editorial-antroposofica","name":"Editorial Antroposófica","url":"https://www.youtube.com/@editorialantroposofica","language":"ES","category":"publisher","description":"Spanish-language publisher (Argentina): book presentations and lectures.","verified":true},{"slug":"editora-antroposofica-br","name":"Editora e Livraria Antroposófica","url":"https://www.youtube.com/editoraelivrariaantroposofica","language":"PT","category":"publisher","description":"Brazilian publisher and bookshop: talks and book launches.","verified":true},{"slug":"escola-waldorf-rs","name":"Escola Waldorf Rudolf Steiner (São Paulo)","url":"https://www.youtube.com/c/EscolaWaldorfRudolfSteiner","language":"PT","category":"waldorf","description":"Pedagogy talks and school life from Brazil's oldest Waldorf school.","verified":true},{"slug":"waldorftv-ru","name":"WaldorfTV (ВальдорфТВ)","url":"https://www.youtube.com/channel/UClnXhHfpuHyN032RRihX4RQ","language":"RU","category":"waldorf","description":"Russian talks on Waldorf pedagogy and anthroposophy.","verified":true},{"slug":"gaad","name":"GAÄD: Anthroposophic Physicians in Germany","url":"https://www.youtube.com/@gaad-gesellschaftanthropos4600","language":"DE","category":"medicine","description":"Medical lectures and patient information from the German physicians' association.","verified":true},{"slug":"eurythmy4you","name":"eurythmy4you","url":"https://www.youtube.com/@eurythmy","language":"EN","category":"eurythmy","description":"Guided online eurythmy exercises.","verified":true},{"slug":"cynthia-hoven","name":"Cynthia Hoven Eurythmy","url":"https://www.youtube.com/channel/UCA9ix0QIxW3_ZB5s6FyXkPg","language":"EN","category":"eurythmy","description":"Eurythmy demonstrations and teaching videos.","verified":true},{"slug":"eurythmy-in-progress","name":"Eurythmy in Progress","url":"https://www.youtube.com/channel/UCSvBO4LhxDfzrfGdxuK-IiA","language":"EN","category":"eurythmy","description":"Contemporary eurythmy performance and training.","verified":true},{"slug":"sound-circle-eurythmy","name":"Sound Circle Eurythmy","url":"https://www.youtube.com/@soundcircleeurythmy2735","language":"EN","category":"eurythmy","description":"Seattle-area eurythmy training: performances and courses.","verified":true},{"slug":"eurythmeum-ch","name":"Eurythmeum CH","url":"https://www.youtube.com/channel/UCQJCFt8f3yUEF1xQiIDoprg","language":"DE","category":"eurythmy","description":"Swiss eurythmy training school: performances and training insights.","verified":true},{"slug":"logos-eurythmie","name":"Logos Eurythmie","url":"https://www.youtube.com/logoseurythmie","language":"DE","category":"eurythmy","description":"German eurythmy ensemble stage performances.","verified":true},{"slug":"septim-eurythmy","name":"SEPTIM Eurythmy","url":"https://www.youtube.com/channel/UCaWcyj14f2Pp39d8sb5eNsA","language":"EN","category":"eurythmy","description":"Eurythmy ensemble performance pieces.","verified":true},{"slug":"creative-eurythmy","name":"Creative Eurythmy","url":"https://www.youtube.com/channel/UCSs73zfN03jqsKpiNK80j4Q","language":"EN","category":"eurythmy","description":"Eurythmy exercises and creative movement.","verified":true},{"slug":"dedae","name":"DeDae: Dutch Eurythmy Dance Ensemble","url":"https://www.youtube.com/channel/UCYm5lwQl959gUVLcCblpkRw","language":"NL","category":"eurythmy","description":"Dutch eurythmy ensemble stage performances.","verified":true},{"slug":"demeter-international","name":"Biodynamic Federation Demeter International","url":"https://www.youtube.com/channel/UCX0s2VZR8Ksc8eDsIh8nlaw","language":"EN","category":"biodynamic","description":"Films on biodynamic farms, standards and Demeter worldwide.","verified":true},{"slug":"demeter-france","name":"Demeter France","url":"https://www.youtube.com/channel/UCogeXJIOkO0R-40T8u7S5Xg","language":"FR","category":"biodynamic","description":"Biodynamic farming and certification in French.","verified":true},{"slug":"bda-uk","name":"Biodynamic Association UK","url":"https://www.youtube.com/channel/UCCt0Mvn8JyNcvZRHJvJDMOw","language":"EN","category":"biodynamic","description":"Introductory biodynamic gardening videos and farm case studies.","verified":true},{"slug":"bda-usa","name":"Biodynamic Demeter Alliance (USA)","url":"https://www.youtube.com/channel/UCGtcLHBlDbqwxLc1DSJZoaw","language":"EN","category":"biodynamic","description":"North American conference talks and webinars.","verified":true},{"slug":"dennis-klocek","name":"Soil, Soul and Spirit with Dennis Klocek","url":"https://www.youtube.com/channel/UCORbXs0BkyvGF2K38n6ouzQ","language":"EN","category":"lecturer","description":"Goethean science, alchemy, biodynamics and meditation.","verified":true},{"slug":"ecswe","name":"European Council for Steiner Waldorf Education","url":"https://www.youtube.com/channel/UCnBqS6GTl2n9tM3OLrB2Yrw","language":"EN","category":"waldorf","description":"Policy and pedagogy videos from the European umbrella body.","verified":true},{"slug":"waldorf-training-lectures","name":"Waldorf Training Lectures","url":"https://www.youtube.com/channel/UCfUJilIaWlOXWidrnBuKtgA","language":"EN","category":"waldorf","description":"Recorded Waldorf teacher-training lectures.","verified":true},{"slug":"waldorfish","name":"Waldorfish","url":"https://www.youtube.com/channel/UCo3XaQeuf276rtXMOJKgViQ","language":"EN","category":"waldorf","description":"Online courses for Waldorf teachers and homeschoolers, especially the arts.","verified":true},{"slug":"simply-waldorf","name":"Simply Waldorf","url":"https://www.youtube.com/channel/UCxh8dy78xEX78ek7q8feQVg","language":"EN","category":"waldorf","description":"Waldorf homeschooling and family rhythm.","verified":true},{"slug":"waldorf-essentials","name":"Waldorf Essentials with Melisa Nielsen","url":"https://www.youtube.com/channel/UC4uSpWWVigJIFd6cfwJkUSA","language":"EN","category":"waldorf","description":"Waldorf homeschool curriculum and parenting.","verified":true},{"slug":"acorn-hill","name":"Acorn Hill Waldorf Kindergarten and Nursery","url":"https://www.youtube.com/channel/UC6O4ve2M4T1DOspqvMR3ELA","language":"EN","category":"waldorf","description":"Circle songs, stories and puppet plays for early childhood.","verified":true},{"slug":"green-meadow","name":"Green Meadow Waldorf School","url":"https://www.youtube.com/channel/UCUVnXW0y7nHXxphldjsML9A","language":"EN","category":"waldorf","description":"School events, talks and student performances (Chestnut Ridge, NY).","verified":true},{"slug":"washington-waldorf","name":"Washington Waldorf School","url":"https://www.youtube.com/channel/UCFZftRlR8uxQq8JDW8awxhA","language":"EN","category":"waldorf","description":"School life and education talks (Bethesda, MD).","verified":true},{"slug":"pedagogie-steiner-waldorf","name":"Pédagogie Steiner Waldorf","url":"https://www.youtube.com/channel/UC0L1GmfLpYkikBzDxE0U8Lw","language":"FR","category":"waldorf","description":"French federation of Steiner-Waldorf schools.","verified":true},{"slug":"camphill-scotland","name":"Camphill Scotland","url":"https://www.youtube.com/channel/UCaeV5f5hQgcvm8AwGXUbORw","language":"EN","category":"camphill","description":"Films about community life and social therapy in Scotland.","verified":true},{"slug":"camphill-village-trust","name":"Camphill Village Trust","url":"https://www.youtube.com/channel/UCSiZ3lBj8xuv65Ca2v1NJlQ","language":"EN","category":"camphill","description":"UK Camphill communities: resident stories and news.","verified":true},{"slug":"camphill-school-aberdeen","name":"Camphill School Aberdeen","url":"https://www.youtube.com/channel/UCl3oUdWPwayC2lvQ_4gt5EA","language":"EN","category":"camphill","description":"The original Camphill school: curative education and school life.","verified":true},{"slug":"triform-camphill","name":"Triform Camphill Community","url":"https://www.youtube.com/channel/UCG3s8p8XAfu171NxbR_yZvQ","language":"EN","category":"camphill","description":"Camphill community in Hudson, NY.","verified":true},{"slug":"camphill-soltane","name":"Camphill Soltane","url":"https://www.youtube.com/channel/UCSxGY984_jzbwMERL3I9RPg","language":"EN","category":"camphill","description":"Community life, craft and farm videos (Pennsylvania).","verified":true},{"slug":"camphill-west-coast","name":"Camphill Village West Coast","url":"https://www.youtube.com/channel/UC-n63icUnjCVb5bW9rDZTcQ","language":"EN","category":"camphill","description":"Camphill community and biodynamic farm near Cape Town.","verified":true},{"slug":"camphill-mourne-grange","name":"Camphill Community Mourne Grange","url":"https://www.youtube.com/channel/UCn5xn_O7rDyLDGVvsCd6OWw","language":"EN","category":"camphill","description":"Community and craft workshop films (Northern Ireland).","verified":true},{"slug":"camphill-devon","name":"Camphill Devon","url":"https://www.youtube.com/channel/UCU9gNp82rBurbcpy81PgPaA","language":"EN","category":"camphill","description":"Camphill Devon community news and resident stories.","verified":true},{"slug":"camphill-school-beaver-run","name":"The Camphill School (Beaver Run)","url":"https://www.youtube.com/channel/UCNDKV2ZtrA9XwhANrVJR84Q","language":"EN","category":"camphill","description":"Camphill school for children in Pennsylvania.","verified":true},{"slug":"threefold-mankind-chicago","name":"Three-Fold Mankind, Chicago Program Initiative","url":"https://www.youtube.com/@VidarGroup","language":"EN","category":"society","description":"Chicago initiative for social threefolding: talks and study programs on Steiner's social ideas.","verified":true},{"slug":"weltenwandler","name":"Weltenwandler: Komm in dein Licht","url":"https://www.youtube.com/@Weltenwandler-KommindeinLi-z1e","language":"DE","category":"study-group","description":"Rudolf Steiner's path of inner development explained for newcomers to anthroposophy, with talks on karma and personal growth.","verified":true},{"slug":"hazel-archer-ginsberg","name":"Hazel Archer-Ginsberg","url":"https://www.youtube.com/@hazelarcher-ginsberg8747","language":"EN","category":"lecturer","description":"Spiritual research into the festival life of anthroposophy and the New Mysteries.","verified":true},{"slug":"michaeliten","name":"Michaeliten","url":"https://www.youtube.com/@Michaeliten-org","language":"DE","category":"study-group","description":"Webinars on the New Mysteries and today's spiritual challenges, including technology and artificial intelligence.","verified":true},{"slug":"rudolf-steiner-branch-chicago","name":"Rudolf Steiner Branch, Chicago","url":"https://www.youtube.com/@rudolfsteinerbranch-chicag8994","language":"EN","category":"society","description":"Talks and study programs from the Chicago branch of the Anthroposophical Society, introducing spiritual science to members and friends.","verified":true},{"slug":"dj-elliott","name":"D J Elliott","url":"https://www.youtube.com/@DJElliott142857","language":"EN","category":"steiner-lectures","description":"Readings of Rudolf Steiner lectures (such as The Michael Imagination) alongside films on Gurdjieff, Maurice Nicoll, art and esoteric philosophy, by author Debbie Elliott.","verified":true},{"slug":"philosophy-of-freedom","name":"Philosophy Of Freedom","url":"https://www.youtube.com/@scienceoffreedom","language":"EN","category":"study-group","description":"A chapter-by-chapter study of Rudolf Steiner's Philosophy of Freedom: free thinking as the foundation of ethical individualism and social life.","verified":true}];
var TOP50_BOOKS = [{"rank":1,"title":"How to Know Higher Worlds","author":"Rudolf Steiner","ga_number":"GA 10","category":"Inner Development","isbn13":"9780880103725","blurb":"Steiner's core handbook for the meditative path and the moral conditions of spiritual training.","free_online_url":"https://rsarchive.org/Books/GA010/","cover":"/img/covers/top50-1.jpg","guide_url":"https://www.ime.usp.br/~vwsetzer/Setzer-Know-Higher-Worlds.pdf","guide_label":"Study guide: 173 soul attitudes (Setzer, PDF)"},{"rank":2,"title":"Theosophy: An Introduction to the Spiritual Processes in Human Life and in the Cosmos","author":"Rudolf Steiner","ga_number":"GA 9","category":"Foundational","isbn13":"9780880103732","blurb":"The clearest systematic account of body, soul and spirit, reincarnation and karma, and the soul and spirit worlds.","free_online_url":"https://rsarchive.org/Books/GA009/","cover":"/img/covers/top50-2.jpg"},{"rank":3,"title":"The Philosophy of Freedom (The Philosophy of Spiritual Activity)","author":"Rudolf Steiner","ga_number":"GA 4","category":"Foundational","isbn13":"9781855842564","blurb":"Steiner's epistemological and ethical cornerstone: spiritual knowledge grounded in the free activity of thinking.","free_online_url":"https://rsarchive.org/Books/GA004/","cover":"/img/covers/top50-3.jpg"},{"rank":4,"title":"An Outline of Esoteric Science","author":"Rudolf Steiner","ga_number":"GA 13","category":"Foundational","isbn13":"9780880104098","blurb":"The comprehensive cosmology: human constitution, sleep and death, cosmic evolution, and the path of knowledge.","free_online_url":"https://rsarchive.org/Books/GA013/","cover":"/img/covers/top50-4.jpg"},{"rank":5,"title":"Christianity as Mystical Fact","author":"Rudolf Steiner","ga_number":"GA 8","category":"Christology","isbn13":"9780880104364","blurb":"The Mystery of Golgotha as the fulfilment of the ancient mystery schools; the seed of anthroposophical Christology.","free_online_url":"https://rsarchive.org/Books/GA008/","cover":"/img/covers/top50-5.jpg"},{"rank":6,"title":"Autobiography: Chapters in the Course of My Life","author":"Rudolf Steiner","ga_number":"GA 28","category":"Biography & History","isbn13":"9780880106009","blurb":"Steiner's own account of his development from Austrian childhood to the founding of anthroposophy.","free_online_url":"https://rsarchive.org/Books/GA028/","cover":"/img/covers/top50-6.jpg"},{"rank":7,"title":"The Foundations of Human Experience (Study of Man)","author":"Rudolf Steiner","ga_number":"GA 293","category":"Education & Parenting","isbn13":"9780880103923","blurb":"The 1919 teacher-training lectures that remain the pedagogical foundation of every Waldorf school.","free_online_url":"https://wn.rsarchive.org/Education/_pdf/Foundations_of_Human_Experience.pdf","cover":"/img/covers/top50-7.jpg"},{"rank":8,"title":"Agriculture Course: The Birth of the Biodynamic Method","author":"Rudolf Steiner","ga_number":"GA 327","category":"Biodynamic","isbn13":"9781855841482","blurb":"The eight Koberwitz lectures of 1924 from which the worldwide biodynamic movement grew.","free_online_url":null,"cover":"/img/covers/top50-8.jpg"},{"rank":9,"title":"The Fifth Gospel: From the Akashic Record","author":"Rudolf Steiner","ga_number":"GA 148","category":"Christology","isbn13":"9781855846821","blurb":"Steiner's most intimate spiritual-research account of the life of Jesus of Nazareth.","free_online_url":null,"cover":"/img/covers/top50-9.jpg"},{"rank":10,"title":"Manifestations of Karma","author":"Rudolf Steiner","ga_number":"GA 120","category":"Karma & Reincarnation","isbn13":"9781855840584","blurb":"The most accessible lecture cycle on how karma works through illness, accident, heredity and destiny.","free_online_url":"https://wn.rsarchive.org/Lectures/GA120/English/RSP1984/ManKar_index.html","cover":"/img/covers/top50-10.jpg"},{"rank":11,"title":"The Calendar of the Soul","author":"Rudolf Steiner","ga_number":"GA 40","category":"Inner Development","isbn13":"9781621483304","blurb":"Fifty-two weekly verses uniting the soul's inner life with the rhythm of the seasons.","free_online_url":null,"cover":"/img/covers/top50-11.jpg"},{"rank":12,"title":"Towards Social Renewal: Rethinking the Basis of Society","author":"Rudolf Steiner","ga_number":"GA 23","category":"Social Life","isbn13":"9781855840720","blurb":"The founding text of social threefolding: autonomous cultural, political and economic spheres.","free_online_url":"https://rsarchive.org/Books/GA023/","cover":"/img/covers/top50-12.jpg"},{"rank":13,"title":"The Education of the Child in the Light of Spiritual Science","author":"Rudolf Steiner","ga_number":"GA 34","category":"Education & Parenting","isbn13":"9780880104142","blurb":"The seminal 1907 essay on the seven-year phases of childhood: the shortest introduction to Waldorf principles.","free_online_url":"https://wn.rsarchive.org/Articles/EduChild/EduChi_index.html","cover":"/img/covers/top50-13.jpg"},{"rank":14,"title":"The Kingdom of Childhood","author":"Rudolf Steiner","ga_number":"GA 311","category":"Education & Parenting","isbn13":null,"blurb":"The warm, practical Torquay lectures of 1924, the favourite starting point for new Waldorf teachers and parents.","free_online_url":"https://wn.rsarchive.org/Education/_pdf/The_Kingdom_of_Childhood.pdf"},{"rank":15,"title":"Extending Practical Medicine (Fundamentals of Therapy)","author":"Rudolf Steiner and Ita Wegman","ga_number":"GA 27","category":"Medicine","isbn13":"9781855840805","blurb":"The founding text of anthroposophic medicine, co-written with Ita Wegman in Steiner's final year.","free_online_url":"https://rsarchive.org/Books/GA027/","cover":"/img/covers/top50-15.jpg"},{"rank":16,"title":"The Spiritual Hierarchies and the Physical World","author":"Rudolf Steiner","ga_number":"GA 110","category":"Foundational","isbn13":"9780880106016","blurb":"The Düsseldorf lectures on the angelic hierarchies and their work in planetary evolution.","free_online_url":null,"cover":"/img/covers/top50-16.jpg"},{"rank":17,"title":"Start Now! A Book of Soul and Spiritual Exercises","author":"Rudolf Steiner (ed. Christopher Bamford)","ga_number":null,"category":"Inner Development","isbn13":"9780880105262","blurb":"The best single anthology of Steiner's meditations and practical exercises for beginners.","free_online_url":null,"cover":"/img/covers/top50-17.jpg"},{"rank":18,"title":"Verses and Meditations","author":"Rudolf Steiner","ga_number":null,"category":"Inner Development","isbn13":"9781855841970","blurb":"Steiner's mantric verses, including the Foundation Stone Meditation, in German and English.","free_online_url":null,"cover":"/img/covers/top50-18.jpg"},{"rank":19,"title":"Practical Advice to Teachers","author":"Rudolf Steiner","ga_number":"GA 294","category":"Education & Parenting","isbn13":null,"blurb":"Companion course to Foundations of Human Experience, covering the actual teaching of each subject.","free_online_url":"https://wn.rsarchive.org/Education/_pdf/Practical_Advice_to_Teachers.pdf"},{"rank":20,"title":"Introducing Anthroposophical Medicine","author":"Rudolf Steiner","ga_number":"GA 312","category":"Medicine","isbn13":"9780880106429","blurb":"The first medical course for physicians: the threefold and fourfold human being in health and illness.","free_online_url":null,"cover":"/img/covers/top50-20.jpg"},{"rank":21,"title":"Eurythmy as Visible Speech","author":"Rudolf Steiner","ga_number":"GA 279","category":"Arts & Eurythmy","isbn13":"9781855845688","blurb":"The speech-eurythmy course of 1924, the primary source for the art of movement Steiner created.","free_online_url":null,"cover":"/img/covers/top50-21.jpg"},{"rank":22,"title":"Phases: The Spiritual Rhythms of Adult Life","author":"Bernard Lievegoed","ga_number":null,"category":"Biography & History","isbn13":"9781855840560","blurb":"The classic anthroposophical account of the seven-year phases of adult biography.","free_online_url":null,"cover":"/img/covers/top50-22.jpg"},{"rank":23,"title":"Saving the Appearances: A Study in Idolatry","author":"Owen Barfield","ga_number":null,"category":"Goethean Science","isbn13":"9780819562050","blurb":"Barfield's masterwork on the evolution of consciousness, the most influential anthroposophical book in mainstream letters.","free_online_url":null,"cover":"/img/covers/top50-23.jpg"},{"rank":24,"title":"The First Three Years of the Child","author":"Karl König","ga_number":null,"category":"Education & Parenting","isbn13":"9781782508472","blurb":"The Camphill founder's study of walking, speaking and thinking as the awakening of the human spirit.","free_online_url":null,"cover":"/img/covers/top50-24.jpg"},{"rank":25,"title":"Rudolf Steiner and the Founding of the New Mysteries","author":"Sergei O. Prokofieff","ga_number":null,"category":"Biography & History","isbn13":"9781912230044","blurb":"The major esoteric study of Steiner's mission and the 1923 Christmas Foundation Meeting.","free_online_url":null,"cover":"/img/covers/top50-25.jpg"},{"rank":26,"title":"Stages of Consciousness: Meditations on the Boundaries of the Soul","author":"Georg Kühlewind","ga_number":null,"category":"Inner Development","isbn13":"9781584208686","blurb":"A rigorous modern guide to attention, thinking and meditation in the tradition of The Philosophy of Freedom.","free_online_url":null,"cover":"/img/covers/top50-26.jpg"},{"rank":27,"title":"The Three Years: The Life of Christ Between Baptism and Ascension","author":"Emil Bock","ga_number":null,"category":"Christology","isbn13":null,"blurb":"The Christian Community priest's widely read anthroposophical reading of the Gospels.","free_online_url":null,"cover":"/img/covers/top50-27.jpg"},{"rank":28,"title":"You Are Your Child's First Teacher","author":"Rahima Baldwin Dancy","ga_number":null,"category":"Education & Parenting","isbn13":"9781607743026","blurb":"The best-selling Waldorf-inspired parenting guide for birth to age six.","free_online_url":null,"cover":"/img/covers/top50-28.jpg"},{"rank":29,"title":"Pfeiffer's Introduction to Biodynamics","author":"Ehrenfried Pfeiffer","ga_number":null,"category":"Biodynamic","isbn13":"9780863158483","blurb":"Steiner's closest agricultural collaborator explains the preparations and soil fertility in plain language.","free_online_url":null,"cover":"/img/covers/top50-29.jpg"},{"rank":30,"title":"A Life for the Spirit: Rudolf Steiner in the Crosscurrents of Our Time","author":"Henry Barnes","ga_number":null,"category":"Biography & History","isbn13":"9780880103954","blurb":"The standard concise English biography of Steiner by a long-time leader of the ASA.","free_online_url":null,"cover":"/img/covers/top50-30.jpg"},{"rank":31,"title":"Meditation as Contemplative Inquiry: When Knowing Becomes Love","author":"Arthur Zajonc","ga_number":null,"category":"Inner Development","isbn13":"9781584200628","blurb":"A physicist's practical, non-sectarian path of meditation rooted in Steiner and Goethe.","free_online_url":null,"cover":"/img/covers/top50-31.jpg"},{"rank":32,"title":"The Wholeness of Nature: Goethe's Way of Science","author":"Henri Bortoft","ga_number":null,"category":"Goethean Science","isbn13":"9780940262799","blurb":"The definitive modern exposition of Goethean phenomenology as a participatory science.","free_online_url":null,"cover":"/img/covers/top50-32.jpg"},{"rank":33,"title":"The Nature of Substance: Spirit and Matter","author":"Rudolf Hauschka","ga_number":null,"category":"Goethean Science","isbn13":"9781855841222","blurb":"Hauschka's spiritual chemistry of the elements, bridging Goethean science and anthroposophic medicine.","free_online_url":null,"cover":"/img/covers/top50-33.jpg"},{"rank":34,"title":"Understanding Waldorf Education: Teaching from the Inside Out","author":"Jack Petrash","ga_number":null,"category":"Education & Parenting","isbn13":"9780876592465","blurb":"The clearest short introduction to Waldorf pedagogy for parents and the general public.","free_online_url":null,"cover":"/img/covers/top50-34.jpg"},{"rank":35,"title":"School as a Journey: The Eight-Year Odyssey of a Waldorf Teacher and His Class","author":"Torin M. Finser","ga_number":null,"category":"Education & Parenting","isbn13":"9780880103893","blurb":"A first-person narrative of taking one class from first through eighth grade.","free_online_url":null,"cover":"/img/covers/top50-35.jpg"},{"rank":36,"title":"Christ and Sophia: Anthroposophic Meditations on the Old Testament, New Testament, and Apocalypse","author":"Valentin Tomberg","ga_number":null,"category":"Christology","isbn13":"9780880107358","blurb":"Tomberg's early anthroposophical studies on the Bible.","free_online_url":null,"cover":"/img/covers/top50-36.jpg"},{"rank":37,"title":"Rudolf Steiner, Life and Work, Volume 1: 1861-1890","author":"Peter Selg","ga_number":null,"category":"Biography & History","isbn13":"9781621480822","blurb":"First volume of the most thorough modern scholarly biography of Steiner.","free_online_url":null,"cover":"/img/covers/top50-37.jpg"},{"rank":38,"title":"Gardening for Life: The Biodynamic Way","author":"Maria Thun","ga_number":null,"category":"Biodynamic","isbn13":"9781869890322","blurb":"The originator of the biodynamic sowing calendar explains cosmic rhythms in the garden.","free_online_url":null,"cover":"/img/covers/top50-38.jpg"},{"rank":39,"title":"Working with Anxious, Nervous and Depressed Children","author":"Henning Köhler","ga_number":null,"category":"Education & Parenting","isbn13":"9781888365283","blurb":"The curative-educational classic on meeting difficult children with understanding rather than diagnosis.","free_online_url":null},{"rank":40,"title":"Between Form and Freedom: A Practical Guide to the Teenage Years","author":"Betty Staley","ga_number":null,"category":"Education & Parenting","isbn13":"9781903458891","blurb":"The standard anthroposophical guide to adolescence for parents and high-school teachers.","free_online_url":null,"cover":"/img/covers/top50-40.jpg"},{"rank":41,"title":"A Guide to Child Health: A Holistic Approach to Raising Healthy Children","author":"Michaela Glöckler and Wolfgang Goebel","ga_number":null,"category":"Medicine","isbn13":null,"blurb":"The anthroposophical family medical reference used in Waldorf households worldwide.","free_online_url":null},{"rank":42,"title":"Seeking Spirit Vision: Essays on Developing Imagination","author":"Dennis Klocek","ga_number":null,"category":"Inner Development","isbn13":"9780945803331","blurb":"Practical exercises for developing imaginative cognition through Goethean observation and alchemy.","free_online_url":null},{"rank":43,"title":"Stairway of Surprise: Six Steps to a Creative Life","author":"Michael Lipson","ga_number":null,"category":"Inner Development","isbn13":"9780880105071","blurb":"A contemporary, down-to-earth guide to Steiner's six basic exercises.","free_online_url":null,"cover":"/img/covers/top50-43.jpg"},{"rank":44,"title":"Thinking Like a Plant: A Living Science for Life","author":"Craig Holdrege","ga_number":null,"category":"Goethean Science","isbn13":null,"blurb":"The Nature Institute director's living introduction to Goethean science for today.","free_online_url":null,"cover":"/img/covers/top50-44.jpg"},{"rank":45,"title":"Shaping Globalization: Civil Society, Cultural Power and Threefolding","author":"Nicanor Perlas","ga_number":null,"category":"Social Life","isbn13":null,"blurb":"The Right Livelihood laureate's application of social threefolding to global civil society.","free_online_url":null,"cover":"/img/covers/top50-45.jpg"},{"rank":46,"title":"Eurythmy: The Fundamental Elements of Movement","author":"Marjorie Spock","ga_number":null,"category":"Arts & Eurythmy","isbn13":null,"blurb":"The most-read English introduction to eurythmy by a pioneering American eurythmist.","free_online_url":null},{"rank":47,"title":"Meetings with Rudolf Steiner","author":"Albert Steffen","ga_number":null,"category":"Biography & History","isbn13":null,"blurb":"Personal recollections by the poet who succeeded Steiner as president of the General Anthroposophical Society.","free_online_url":null},{"rank":48,"title":"The Christmas Foundation: Beginning of a New Cosmic Age","author":"Rudolf Grosse","ga_number":null,"category":"Biography & History","isbn13":null,"blurb":"A former Goetheanum leader's account of the 1923 refounding of the Anthroposophical Society.","free_online_url":null,"cover":"/img/covers/top50-48.jpg"},{"rank":49,"title":"And There Was Light: From the Creation to Noah","author":"Jakob Streit","ga_number":null,"category":"Children","isbn13":"9781888365740","blurb":"Beloved retelling of the Old Testament for Waldorf third grade.","free_online_url":null},{"rank":50,"title":"The Seven-Year-Old Wonder Book","author":"Isabel Wyatt","ga_number":null,"category":"Children","isbn13":null,"blurb":"Seasonal tales for the young child, a staple of anthroposophical family libraries.","free_online_url":null,"cover":"/img/covers/top50-50.jpg"}];

var AMAZON_TAG = 'sophiacom-20';
function amazonSearchUrl(q) { return 'https://www.amazon.com/s?k=' + encodeURIComponent(q) + '&i=stripbooks&tag=' + AMAZON_TAG; }

// ISO-8601 week number: the rotation key. Same week => same channel for every visitor.
function isoWeekKey(d) {
  d = d ? new Date(d) : new Date();
  var u = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  var day = u.getUTCDay() || 7;
  u.setUTCDate(u.getUTCDate() + 4 - day);
  var y = u.getUTCFullYear();
  var week = Math.ceil(((u - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return y * 100 + week;
}
function ytAgo(iso) {
  if (!iso) return '';
  var days = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  if (days < 1) return t('video.today', 'today');
  if (days === 1) return t('video.yesterday', 'yesterday');
  if (days < 30) return days + ' ' + t('video.days_ago', 'days ago');
  if (days < 365) return Math.floor(days / 30) + ' ' + t('video.months_ago', 'months ago');
  return Math.floor(days / 365) + ' ' + t('video.years_ago', 'years ago');
}

var _ytLatest = null;      // rows from the youtube_channel_latest view (or the seed)
var _ytOffset = 0;         // "another one" nudges within the same day

var _ytLatestPromise = null;   // shared by concurrent callers so the feed is fetched once
function _ytFetchLatest() {
  if (!_ytLatestPromise) _ytLatestPromise = _ytFetchLatestOnce();
  return _ytLatestPromise;
}
async function _ytFetchLatestOnce() {
  if (_ytLatest) return _ytLatest;
  if (sbReady()) {
    try {
      var r = await _sb.from('youtube_channel_latest').select('*').order('name');
      if (!r.error && r.data && r.data.length) { _ytLatest = r.data; return _ytLatest; }
    } catch (e) { console.warn('youtube feed unavailable, using seed list', e); }
  }
  _ytLatest = YT_CHANNELS_SEED.map(function (c) { return { slug: c.slug, name: c.name, channel_url: c.url, language: c.language, category: c.category, description: c.description, verified: c.verified }; });
  return _ytLatest;
}

// Day number (UTC): the daily rotation key. Same day => same featured channel for every visitor.
function dayKey(d) {
  d = d ? new Date(d) : new Date();
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
}

function weeklyChannel(rows, offset) {
  // prefer channels that posted in the last 6 months, then any with a video; rotate daily
  var recent = Date.now() - 182 * 864e5;
  var pool = rows.filter(function (r) { return r.video_id && r.published_at && new Date(r.published_at).getTime() >= recent; });
  if (!pool.length) pool = rows.filter(function (r) { return r.video_id; });
  if (!pool.length) pool = rows;
  var i = (dayKey() + (offset || 0)) % pool.length;
  return pool[(i + pool.length) % pool.length];
}

function renderVideoCard(ch) {
  var isVideo = !!ch.video_id;
  var href = isVideo ? ch.video_url : ch.channel_url;
  var thumb = ch.video_thumbnail || ch.channel_thumbnail;
  var html = '<div class="video-card">';
  if (thumb) html += '<a class="video-thumb" href="' + escUrl(href) + '" target="_blank" rel="noopener" aria-hidden="true" tabindex="-1"><img src="' + escUrl(thumb) + '" alt="" loading="lazy"></a>';
  html += '<div class="video-body">'
    + '<div class="video-kicker">' + t('video.kicker', 'Today') + ' &middot; ' + esc(YT_CATEGORIES[ch.category] || ch.category || '') + '</div>'
    + '<a class="video-title" href="' + escUrl(href) + '" target="_blank" rel="noopener">' + esc(isVideo ? ch.video_title : ch.name) + '</a>'
    + '<div class="video-channel">' + [isVideo ? '<b>' + esc(ch.name) + '</b>' : esc(ch.description || ''), ch.language ? esc(ch.language) : ''].filter(Boolean).join(' &middot; ') + '</div>'
    + (isVideo && ch.published_at ? '<div class="video-meta">' + esc(ytAgo(ch.published_at)) + '</div>' : '')
    + '<div class="video-actions">'
    + '<a href="' + escUrl(ch.channel_url) + '" target="_blank" rel="noopener">' + t('video.channel', 'Channel') + ' &rarr;</a>'
    + '<a href="/podcasts" onclick="showSec(\'podcasts\');return false;">' + t('video.all_channels', 'All channels') + '</a>'
    + '<a href="#" class="quiet" onclick="_ytOffset++;renderVideoSpotlight();return false;">' + t('video.another', 'another') + ' &#8635;</a>'
    + '</div></div></div>';
  return html;
}

// Newest uploads from the curated channels in the last 3 days, newest first.
function _freshVideos(rows) {
  var cutoff = Date.now() - 3 * 864e5;
  return rows.filter(function (r) { return r.video_id && r.published_at && new Date(r.published_at).getTime() >= cutoff; })
    .sort(function (a, b) { return b.published_at.localeCompare(a.published_at); });
}

// Home page: when a channel has just posted, feature that video (channel photo, name, thumbnail).
function renderNewVideoCard(v, count, kicker, rating) {
  var ch = '<span class="nv-ch">' + (v.avatar_url ? '<img src="' + escUrl(v.avatar_url) + '" alt="" width="24" height="24" loading="lazy">' : '')
    + '<b>' + esc(v.name) + '</b>' + (v.subscriber_text ? '<span class="nv-subs">' + esc(v.subscriber_text) + ' ' + esc(t('channel.subscribers', 'subscribers')) + '</span>' : '') + '</span>';
  // the channel's star rating (opens the channel's reviews, where members can rate it)
  var rate = '<button type="button" class="nv-rate" onclick="openChannel(\'' + escJs(v.slug) + '\', this)">'
    + (rating && rating.count ? _stars(rating.avg) + ' <span>' + rating.avg.toFixed(1) + ' (' + rating.count + ')</span>'
       : '<span class="stars off-all" aria-hidden="true">&#9733;&#9733;&#9733;&#9733;&#9733;</span> <span>' + esc(t('channel.rate_short', 'Rate')) + '</span>') + '</button>';
  return '<div class="new-video">'
    + '<a class="nv-thumb" href="' + escUrl(v.video_url) + '" target="_blank" rel="noopener" aria-hidden="true" tabindex="-1"><img src="' + escUrl(v.video_thumbnail) + '" alt="" loading="lazy" width="320" height="180"></a>'
    + '<div class="nv-body"><h5><a href="' + escUrl(v.video_url) + '" target="_blank" rel="noopener">' + esc(v.video_title) + '</a></h5>'
    + '<div class="nv-meta"><span class="etag">' + esc(kicker || t('video.new_video', 'New video')) + (v.published_at ? ' &middot; ' + esc(ytAgo(v.published_at)) : '') + '</span>' + rate + '</div>'
    + ch
    + '<div class="video-actions"><a href="' + escUrl(v.video_url) + '" target="_blank" rel="noopener">' + esc(t('video.watch', 'Watch')) + ' &rarr;</a>'
    + '<a href="/podcasts" onclick="showSec(\'podcasts\');openChannel(\'' + escJs(v.slug) + '\');return false;">' + esc(t('channel.details', 'details, ratings and reviews')) + '</a>'
    + (count > 1 ? '<a href="#" class="quiet" onclick="_newVidOffset++;renderVideoSpotlight();return false;">' + esc(t('video.next_new', 'next new video')) + ' (' + count + ') &#8635;</a>' : '')
    + '</div></div></div>';
}
var _newVidOffset = 0;

// Home page video: a channel's upload from the last 3 days ("New video"), otherwise the channel of
// the day with its latest video ("Video of the day"). Shown on every screen size.
async function renderVideoSpotlight() {
  var home = document.getElementById('home-video-spotlight');
  if (!home) return;
  var both = await Promise.all([_ytFetchLatest(), _loadChannelRatings()]);
  var rows = both[0], ratings = both[1];
  var fresh = _freshVideos(rows);
  if (fresh.length) {
    var v = fresh[_newVidOffset % fresh.length];
    home.innerHTML = renderNewVideoCard(v, fresh.length, null, ratings[v.slug]);
    return;
  }
  var ch = weeklyChannel(rows, _ytOffset);
  home.innerHTML = ch && ch.video_id ? renderNewVideoCard(ch, 0, t('video.of_the_day', 'Video of the day'), ratings[ch.slug]) : renderVideoCard(ch);
}

async function renderYouTubeChannels() {
  var el = document.getElementById('yt-channels-block');
  if (!el) return;
  var both = await Promise.all([_ytFetchLatest(), _loadChannelRatings()]);
  var rows = both[0], ratings = both[1];
  var week = weeklyChannel(rows, 0);
  var groups = {};
  rows.forEach(function (r) { (groups[r.category] = groups[r.category] || []).push(r); });
  var order = Object.keys(YT_CATEGORIES).filter(function (k) { return groups[k]; }).concat(Object.keys(groups).filter(function (k) { return !YT_CATEGORIES[k]; }));
  var html = '<div class="listblock"><div class="listblock-head"><h3>' + t('podcasts.youtube_heading', 'YouTube Channels') + '</h3>'
    + '<span class="podcast-count">' + rows.length + ' ' + t('podcasts.channels', 'channels') + '</span></div><div class="listblock-body">'
    + '<div class="yt-toolbar"><span>' + t('podcasts.youtube_note2', 'Curated anthroposophical channels, refreshed daily. Tap a channel\'s stars to see details, rate it and read reviews.') + '</span>'
    + '<a href="#" onclick="suggestYouTubeChannel();return false;">+ ' + t('video.suggest', 'suggest a channel') + '</a></div>'
    + '<div class="yt-grid">';
  order.forEach(function (cat) {
    html += '<div class="yt-cat"><h4>' + esc(YT_CATEGORIES[cat] || cat) + ' <span>' + groups[cat].length + '</span></h4>';
    groups[cat].sort(function (a, b) { return (b.published_at || '').localeCompare(a.published_at || '') || a.name.localeCompare(b.name); });
    groups[cat].forEach(function (r) { html += _ytRowHtml(r, ratings[r.slug], week && r.slug === week.slug); });
    html += '</div>';
  });
  html += '</div></div></div>';
  el.innerHTML = html;
}

function _ytRowHtml(r, rt, isWeek) {
  var meta = [esc(r.language || ''), esc(_subsText(r)), r.published_at ? esc(ytAgo(r.published_at)) : ''].filter(Boolean).join(' &middot; ');
  return '<div class="yt-row' + (isWeek ? ' is-week' : '') + '">'
    + (r.avatar_url ? '<img class="yt-ava" src="' + escUrl(r.avatar_url) + '" alt="" width="32" height="32" loading="lazy">' : '<span class="yt-ava" aria-hidden="true"></span>')
    + '<div class="yt-main"><div><a class="ltitle" href="' + escUrl(r.channel_url) + '" target="_blank" rel="noopener" title="' + esc(r.description || '') + '">' + esc(r.name) + '</a>'
    + (r.verified ? '<span class="lv">&#10003;</span>' : '') + '</div>'
    + '<span class="lmeta">' + meta + '</span>'
    + '<button type="button" class="yt-rate" onclick="openChannel(\'' + escJs(r.slug) + '\', this)" aria-label="' + esc(r.name + ': ' + t('channel.details', 'details, ratings and reviews')) + '">'
    + (rt && rt.count ? _stars(rt.avg) + ' <span>' + rt.count + '</span>' : '<span class="stars off-all" aria-hidden="true">&#9733;&#9733;&#9733;&#9733;&#9733;</span> <span>' + t('channel.rate_short', 'Rate') + '</span>')
    + '</button></div></div>';
}

// ── Channel details, star ratings and reviews ──
// Ratings come from the channel_rating_summary view; one review (stars + optional comment)
// per member per channel, stored in channel_reviews. Admins can hide a review.
var _chRatingsPromise = null;
function _loadChannelRatings() {
  if (!_chRatingsPromise) _chRatingsPromise = (async function () {
    var map = {};
    if (!sbReady()) return map;
    try {
      var r = await _sb.from('channel_rating_summary').select('channel_slug, avg_rating, review_count');
      (r.data || []).forEach(function (x) { map[x.channel_slug] = { avg: Number(x.avg_rating), count: x.review_count }; });
    } catch (e) { console.warn('channel ratings unavailable', e); }
    return map;
  })();
  return _chRatingsPromise;
}

// Five stars filled to the nearest half, with a text label for screen readers.
function _stars(avg) {
  var v = Math.round((avg || 0) * 2) / 2, out = '';
  for (var i = 1; i <= 5; i++) out += '<span class="' + (i <= v ? 'on' : (i - 0.5 === v ? 'half' : 'off')) + '">&#9733;</span>';
  return '<span class="stars" role="img" aria-label="' + esc(v + ' ' + t('channel.out_of_5', 'out of 5 stars')) + '">' + out + '</span>';
}

function _ratingSummary(rt) {
  if (!rt || !rt.count) return '<span class="ch-norating">' + t('channel.no_ratings', 'No ratings yet') + '</span>';
  return _stars(rt.avg) + ' <span class="ch-avg">' + rt.avg.toFixed(1) + '</span> <span class="ch-count">(' + rt.count + ')</span>';
}

function _subsText(r) {
  return r.subscriber_text ? r.subscriber_text + ' ' + t('channel.subscribers', 'subscribers') : '';
}

async function openChannel(slug, trigger) {
  var rows = await _ytFetchLatest();
  var ch = rows.filter(function (r) { return r.slug === slug; })[0];
  if (!ch) return;
  var ratings = await _loadChannelRatings();
  closeDayPopup(false);
  _dpReturnFocus = trigger || document.activeElement;
  var overlay = document.createElement('div');
  overlay.className = 'day-popup-overlay';
  overlay.onclick = function () { closeDayPopup(); };
  document.body.appendChild(overlay);
  var popup = document.createElement('div');
  popup.className = 'day-popup ch-popup';
  popup.setAttribute('role', 'dialog');
  popup.setAttribute('aria-modal', 'true');
  popup.setAttribute('aria-labelledby', 'ch-popup-title');
  popup.innerHTML = _channelHeadHtml(ch, ratings[slug])
    + '<div id="ch-form"></div><h5 class="ch-sub">' + t('channel.reviews', 'Reviews') + '</h5><div id="ch-reviews" aria-live="polite">' + t('common.loading', 'Loading...') + '</div>';
  document.body.appendChild(popup);
  popup.querySelector('.dp-close').focus();
  _loadChannelReviews(slug);
}

function _channelHeadHtml(ch, rt) {
  var meta = [_subsText(ch), ch.total_videos ? ch.total_videos + ' ' + t('channel.videos', 'videos') : '', ch.language].filter(Boolean).join(' &middot; ');
  return '<button class="dp-close" type="button" aria-label="' + esc(t('common.close', 'Close')) + '" onclick="closeDayPopup()">&times;</button>'
    + '<div class="ch-head">' + (ch.avatar_url ? '<img src="' + escUrl(ch.avatar_url) + '" alt="" width="64" height="64">' : '')
    + '<div><h4 id="ch-popup-title">' + esc(ch.name) + (ch.verified ? ' <span class="lv" title="' + esc(t('common.verified', 'Verified')) + '">&#10003;</span>' : '') + '</h4>'
    + '<div class="dp-meta">' + meta + '</div><div class="ch-rating">' + _ratingSummary(rt) + '</div></div></div>'
    + (ch.description ? '<p class="dp-desc">' + esc(ch.description) + '</p>' : '')
    + (ch.video_id ? '<p class="ch-latest">' + t('channel.latest', 'Latest') + ': <a href="' + escUrl(ch.video_url) + '" target="_blank" rel="noopener">' + esc(ch.video_title) + '</a> <span>' + esc(ytAgo(ch.published_at)) + '</span></p>' : '')
    + '<p><a class="ch-yt" href="' + escUrl(ch.channel_url) + '" target="_blank" rel="noopener">' + t('channel.watch', 'Open on YouTube') + ' &rarr;</a></p>';
}

async function _loadChannelReviews(slug) {
  var el = document.getElementById('ch-reviews');
  if (!el) return;
  if (!sbReady()) { el.textContent = t('error.supabase_not_connected', 'Not connected.'); return; }
  var r = await _sb.from('channel_reviews').select('id, user_id, rating, comment, is_hidden, updated_at')
    .eq('channel_slug', slug).order('updated_at', { ascending: false }).limit(50);
  if (r.error) { el.textContent = t('channel.load_error', 'Reviews could not be loaded.'); return; }
  var reviews = r.data || [];
  var me = window._supabaseUser ? window._supabaseUser.id : null;
  var mine = reviews.filter(function (x) { return x.user_id === me; })[0] || null;
  _renderChannelForm(slug, mine);
  if (!reviews.length) { el.innerHTML = '<p class="ch-empty">' + t('channel.no_reviews', 'No reviews yet. Be the first to rate this channel.') + '</p>'; return; }
  var names = {};
  var ids = reviews.map(function (x) { return x.user_id; });
  var pr = await _sb.from('profiles').select('id, username, full_name').in('id', ids);
  (pr.data || []).forEach(function (p) { names[p.id] = p.username || p.full_name; });
  el.innerHTML = reviews.map(function (x) { return _reviewHtml(x, names[x.user_id], me); }).join('');
}

function _reviewHtml(x, name, me) {
  var acts = '';
  if (isAdmin()) acts += '<button type="button" onclick="hideChannelReview(\'' + escJs(x.id) + '\',' + !x.is_hidden + ')">' + (x.is_hidden ? t('channel.unhide', 'Show') : t('channel.hide', 'Hide')) + '</button>';
  else if (signedIn && x.user_id !== me) acts += '<button type="button" onclick="closeDayPopup(false);openReportModal(\'channel_review\',\'' + escJs(x.id) + '\')">' + t('channel.report', 'Report') + '</button>';
  return '<div class="ch-review' + (x.is_hidden ? ' is-hidden' : '') + '">'
    + '<div class="ch-review-head">' + _stars(x.rating) + ' <b>' + esc(name || t('channel.member', 'Member')) + '</b>'
    + '<span>' + esc(localDate(x.updated_at, { month: 'short', day: 'numeric', year: 'numeric' })) + (x.is_hidden ? ' &middot; ' + t('channel.hidden', 'hidden') : '') + '</span></div>'
    + (x.comment ? '<p>' + esc(x.comment) + '</p>' : '')
    + (acts ? '<div class="ch-review-acts">' + acts + '</div>' : '') + '</div>';
}

function _renderChannelForm(slug, mine) {
  var el = document.getElementById('ch-form');
  if (!el) return;
  if (!signedIn) {
    el.innerHTML = '<button type="button" class="ch-signin" onclick="closeDayPopup(false);openModal()">' + t('channel.signin', 'Sign in to rate and review') + '</button>';
    return;
  }
  var cur = mine ? mine.rating : 0, s = escJs(slug);
  var radios = '';
  for (var i = 5; i >= 1; i--) {
    radios += '<input type="radio" name="ch-stars" id="ch-star-' + i + '" value="' + i + '"' + (i === cur ? ' checked' : '') + '>'
      + '<label for="ch-star-' + i + '" title="' + i + '"><span class="sr-only">' + i + ' ' + t('channel.stars', 'stars') + '</span>&#9733;</label>';
  }
  el.innerHTML = '<form class="ch-form" onsubmit="saveChannelReview(\'' + s + '\');return false;">'
    + '<fieldset><legend>' + t(mine ? 'channel.your_rating' : 'channel.rate', mine ? 'Your rating' : 'Rate this channel') + '</legend><div class="ch-stars-input">' + radios + '</div></fieldset>'
    + '<label class="sr-only" for="ch-comment">' + t('channel.comment_label', 'Your review (optional)') + '</label>'
    + '<textarea id="ch-comment" maxlength="1000" rows="3" placeholder="' + esc(t('channel.comment_ph', 'What do you value about this channel? (optional)')) + '">' + esc(mine && mine.comment || '') + '</textarea>'
    + '<div class="ch-form-acts"><button type="submit" class="ch-save">' + t('channel.save', 'Save review') + '</button>'
    + (mine ? '<button type="button" class="ch-del" onclick="deleteChannelReview(\'' + s + '\',\'' + escJs(mine.id) + '\')">' + t('channel.delete', 'Delete my review') + '</button>' : '')
    + '<span id="ch-form-status" role="status"></span></div></form>';
}

async function saveChannelReview(slug) {
  var picked = document.querySelector('input[name="ch-stars"]:checked');
  var status = document.getElementById('ch-form-status');
  if (!picked) { status.textContent = t('channel.pick_stars', 'Choose 1 to 5 stars first.'); return; }
  var comment = (document.getElementById('ch-comment').value || '').trim().slice(0, 1000) || null;
  status.textContent = t('channel.saving', 'Saving...');
  var r = await _sb.from('channel_reviews').upsert({
    channel_slug: slug, user_id: window._supabaseUser.id, rating: Number(picked.value), comment: comment
  }, { onConflict: 'channel_slug,user_id' });
  if (r.error) { status.textContent = t('channel.save_error', 'Could not save. Please try again.'); console.warn(r.error); return; }
  _afterReviewChange(slug);
}

async function deleteChannelReview(slug, id) {
  if (!confirm(t('channel.delete_confirm', 'Delete your review of this channel?'))) return;
  var r = await _sb.from('channel_reviews').delete().eq('id', id);
  if (r.error) { alert(t('channel.save_error', 'Could not save. Please try again.')); return; }
  _afterReviewChange(slug);
}

async function hideChannelReview(id, hide) {
  if (!isAdmin()) return;
  var r = await _sb.from('channel_reviews').update({ is_hidden: hide }).eq('id', id).select('channel_slug').single();
  if (r.error) { alert('Error: ' + r.error.message); return; }
  _afterReviewChange(r.data.channel_slug);
}

// Refresh the averages, the open popup and the channel list after any change.
async function _afterReviewChange(slug) {
  _chRatingsPromise = null;
  var ratings = await _loadChannelRatings();
  var box = document.querySelector('.ch-popup .ch-rating');
  if (box) box.innerHTML = _ratingSummary(ratings[slug]);
  _loadChannelReviews(slug);
  renderYouTubeChannels();
  renderVideoSpotlight();
}

async function suggestYouTubeChannel() {
  var url = prompt(t('video.suggest_prompt', 'Paste the YouTube channel link (youtube.com/@...):'));
  if (!url) return;
  url = url.trim();
  if (!/^https:\/\/(www\.|m\.)?youtube\.com\//i.test(url)) { alert(t('video.suggest_invalid', 'Please paste a youtube.com channel link.')); return; }
  if (!sbReady()) { location.href = 'mailto:hello@sophiacommons.org?subject=' + encodeURIComponent('YouTube channel suggestion') + '&body=' + encodeURIComponent(url); return; }
  var note = prompt(t('video.suggest_note', 'Anything we should know? (optional)')) || null;
  var r = await _sb.from('youtube_channels_pending').insert({ url: url, note: note, source: 'visitor' });
  alert(r.error ? t('video.suggest_dupe', 'Thanks! That channel is already on our list to review.') : t('video.suggest_ok', 'Thank you! We review suggestions within a week.'));
}

// ── Top 50 books ──
var _top50Filter = 'all';
function renderTop50Books() {
  var el = document.getElementById('top50-books');
  if (!el) return;
  var cats = [];
  TOP50_BOOKS.forEach(function (b) { if (cats.indexOf(b.category) < 0) cats.push(b.category); });
  var html = '<div class="listblock" style="margin-bottom:16px;"><div class="listblock-head"><h3>' + t('books.top50_heading', 'Top 50 Anthroposophical Books') + '</h3>'
    + '<span style="font-size:10.5px;color:var(--text-muted);">' + t('books.top50_sub', 'a reading canon for newcomers and old hands') + '</span></div><div class="listblock-body">'
    + '<p class="top50-intro">' + t('books.top50_intro', 'Rudolf Steiner\'s essential works plus the most-read books by the anthroposophists who built on them: education, farming, medicine, meditation, the arts and social life. Amazon links support Sophia Commons; where a free edition exists we link that too.') + '</p>'
    + '<div class="top50-chips" role="tablist">'
    + '<button class="' + (_top50Filter === 'all' ? 'active' : '') + '" onclick="_top50Filter=\'all\';renderTop50Books()">' + t('books.all', 'All 50') + '</button>'
    + '<button class="' + (_top50Filter === 'steiner' ? 'active' : '') + '" onclick="_top50Filter=\'steiner\';renderTop50Books()">Rudolf Steiner</button>';
  cats.forEach(function (c) { html += '<button class="' + (_top50Filter === c ? 'active' : '') + '" onclick="_top50Filter=' + JSON.stringify(c).replace(/"/g, '&quot;') + ';renderTop50Books()">' + esc(c) + '</button>'; });
  html += '</div><div class="top50-list">';
  TOP50_BOOKS.forEach(function (b) {
    var show = _top50Filter === 'all' || (_top50Filter === 'steiner' ? /^Rudolf Steiner/.test(b.author) : b.category === _top50Filter);
    var q = b.isbn13 || (b.title.replace(/:.*$/, '') + ' ' + b.author.replace(/\s*\(.*\)$/, ''));
    var cover = b.cover
      ? '<img class="top50-cover" src="' + escUrl(b.cover) + '" alt="" width="64" height="96" loading="lazy" decoding="async">'
      : '<div class="top50-cover top50-cover-blank" aria-hidden="true"><span>' + esc(b.title.replace(/:.*$/, '')) + '</span></div>';
    html += '<div class="top50-item' + (show ? '' : ' hidden') + '"><div class="top50-rank">' + b.rank + '</div>'
      + '<a href="' + escUrl(amazonSearchUrl(q)) + '" target="_blank" rel="sponsored noopener" tabindex="-1">' + cover + '</a><div>'
      + '<div class="top50-title"><a href="' + escUrl(amazonSearchUrl(q)) + '" target="_blank" rel="sponsored noopener">' + esc(b.title) + '</a></div>'
      + '<div class="top50-author">' + esc(b.author) + (b.ga_number ? ' &middot; ' + esc(b.ga_number) : '') + '</div>'
      + '<div class="top50-blurb">' + esc(b.blurb) + '</div>'
      + '<div class="top50-links"><a class="top50-amz" href="' + escUrl(amazonSearchUrl(q)) + '" target="_blank" rel="sponsored noopener">' + t('books.buy_amazon', 'Amazon') + ' &rarr;</a>'
      + (b.free_online_url ? '<a href="' + escUrl(b.free_online_url) + '" target="_blank" rel="noopener">' + t('books.free_online', 'free online') + '</a>' : '')
      + (b.guide_url ? '<a href="' + escUrl(b.guide_url) + '" target="_blank" rel="noopener">' + esc(b.guide_label || 'study guide') + '</a>' : '')
      + '<span class="ltag">' + esc(b.category) + '</span></div>'
      + '</div></div>';
  });
  html += '</div></div></div>';
  el.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', function () {
  // Books and Podcasts are hidden on most first visits; showSec() renders them when opened
  if (_secVisible('books')) renderTop50Books();
  renderVideoSpotlight();
  if (_secVisible('podcasts')) renderYouTubeChannels();
});

// Static pages built at deploy time (automation/prerender.mjs) carry a crawler summary in #prerender.
// The app renders the real page, so remove the summary as soon as the script runs.
(function() { var pr = document.getElementById('prerender'); if (pr) pr.remove(); })();
