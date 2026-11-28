// ══════════════════════════════════════════
//  Social media page: several upcoming online events, not just one (owner, 2026-11-27).
//  Livestreams, webinars and online talks from the calendar (calEvents), as the Home page's event cards
//  (h2EventCard and h2Head from home2.js), under the video of the week. Uses globals: calEvents, _localDay, t, esc.
// ══════════════════════════════════════════

var SOC_EVENTS_MAX = 6;

function _socOnlineEvents() {
  var today = _localDay(new Date());
  var seen = {};
  return (window.calEvents || []).filter(function (e) {
    return e.id && e.online && e.cat !== 'festival' && e.cat !== 'memorial' && (e.end || e.date) >= today && e.img && e.img.src;
  }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; })
    // a weekly series shows once, with its next date
    .filter(function (e) { var k = String(e.title || '').replace(/\s*[:(-].*$/, '').toLowerCase(); if (seen[k]) return false; seen[k] = 1; return true; })
    .slice(0, SOC_EVENTS_MAX);
}

function socialEventsRender() {
  var spot = document.getElementById('pod-video-spotlight');
  if (!spot || typeof h2EventCard !== 'function') return;
  var box = document.getElementById('soc-events');
  if (!box) { box = document.createElement('section'); box.id = 'soc-events'; box.className = 'soc-events'; spot.insertAdjacentElement('afterend', box); }
  var list = _socOnlineEvents();
  if (!list.length) { box.innerHTML = ''; box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = h2Head(t('social2.events', 'Upcoming online events'), t('home2.all_events', 'All events'), "showSec('events')", '/events')
    + '<p class="soc-sub">' + esc(t('social2.events_sub', 'Livestreams, webinars and online talks you can join from anywhere.')) + '</p>'
    + '<div class="h2-row h2-evrow soc-evrow">' + list.map(h2EventCard).join('') + '</div>';
}

(function () {
  var _show = window.showSec;
  if (typeof _show === 'function') window.showSec = function (id) {
    var r = _show.apply(this, arguments);
    if (id === 'podcasts') { socialEventsRender(); setTimeout(socialEventsRender, 1500); }   // again once the calendar has loaded
    return r;
  };
  var _rl = window.rerenderForLang;
  if (typeof _rl === 'function') window.rerenderForLang = function () {
    var r = _rl.apply(this, arguments);
    var s = document.getElementById('sec-podcasts'); if (s && s.classList.contains('active')) socialEventsRender();
    return r;
  };
  window.addEventListener('load', function () { var s = document.getElementById('sec-podcasts'); if (s && s.classList.contains('active')) setTimeout(socialEventsRender, 1500); });
})();
