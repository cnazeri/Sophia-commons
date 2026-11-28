// Home, redesign phase 2 (owner, 2026-11-25: "I like the wireframes", _mockups/site2 #home).
// Under the title, search and category tiles: a main column (This week, New in the directory, News and the newsletter,
// Jobs and Take part, Talks) beside a column of cards (the coming festival, the Calendar of the Soul, the day's
// exercise, Remembering, Follow). The old Home blocks stay in the page and are hidden only once this has drawn, so
// a failure here leaves the old Home in place.
// Uses globals from sophia_commons_v9.js and saved.js: _sb, sbReady, calEvents, esc, escJs, escUrl, t, localDate,
// _localDay, _imgSized, _homeTitle, _featSlides, _homeNewsLoad, _newsBlurb, _homeJobsLoad, _homeJobSlides,
// showDetail, showSec, showSubmitForm, showEventForm, handleChat, scHeart, scMediaHeart, scHeartsRefresh.

var H2_WEEK_MAX = 3, H2_NEW_MAX = 3, H2_NEWS_MAX = 3, H2_JOBS_MAX = 4, H2_TALKS_MAX = 4;
var H2_FEST_AHEAD_DAYS = 21, H2_REMEMBER_DAYS = 7;
var H2_ADVENT_LIGHTS = ['The light of stones', 'The light of plants', 'The light of animals', 'The light of human beings'];

var H2_ICON = {
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  pin: '<path d="M12 21s-6.5-5.8-6.5-11a6.5 6.5 0 0 1 13 0c0 5.2-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  web: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.1 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.1-3.6-8.5s1.2-6.2 3.6-8.5z"/>',
  events: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="m12 12.3.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3z"/>',
  place: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2"/><path d="m15 9-1.9 4.1L9 15l1.9-4.1z"/>',
  pen: '<path d="M4 20l4-1 10.5-10.5a2.1 2.1 0 0 0-3-3L5 16z"/><path d="M14 6.5l3 3"/>',
  chat: '<path d="M4.5 6.5h15v9.5h-8l-4 3.5V16h-3z"/>',
  play: '<path d="M9 7.5v9l7.5-4.5z"/>',
  lemniscate: '<path d="M3.5 12c0-2.3 1.6-3.7 3.6-3.7 3.6 0 6.2 7.4 9.8 7.4 2 0 3.6-1.4 3.6-3.7s-1.6-3.7-3.6-3.7c-3.6 0-6.2 7.4-9.8 7.4-2 0-3.6-1.4-3.6-3.7z"/>',
  job: '<rect x="3.5" y="7.5" width="17" height="12" rx="2.5"/><path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3.5 12.5h17"/>'
};
function h2Ico(name, size) {
  return '<svg class="ico" viewBox="0 0 24 24" width="' + (size || 16) + '" height="' + (size || 16) + '" aria-hidden="true">' + H2_ICON[name] + '</svg>';
}
function h2Head(title, link, onclick, href) {
  return '<div class="h2-head"><h2>' + esc(title) + '</h2>'
    + (link ? '<a class="h2-link" href="' + escUrl(href || '#') + '" onclick="' + onclick + ';return false;">' + esc(link) + ' ' + h2Ico('arrow', 15) + '</a>' : '') + '</div>';
}
function h2Day(iso) { return localDate(iso, { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase(); }
function h2DaysUntil(dateStr) {
  var a = new Date(_localDay(new Date()) + 'T12:00:00'), b = new Date(dateStr + 'T12:00:00');
  return Math.round((b - a) / 864e5);
}

// ── This week: three event cards with the picture on top ──
function h2WeekEvents() {
  var today = _localDay(new Date());
  var end = _localDay(new Date(Date.now() + 6 * 864e5));
  var live = (window.calEvents || []).filter(function (e) {
    return e.id && e.cat !== 'memorial' && e.cat !== 'festival' && (e.end || e.date) >= today && e.date <= end && e.img && e.img.src;
  }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  return (typeof _featSlides === 'function' ? _featSlides(live) : live).concat(live).filter(function (e, i, all) {
    return all.indexOf(e) === i;
  }).slice(0, H2_WEEK_MAX);
}
function h2EventCard(e) {
  var href = '/event/' + e.id, go = 'showDetail(\'event\',\'' + escJs(e.id) + '\')';
  var when = h2Day(e.date) + (e.time ? ' · ' + String(e.time).split(/\s*[-–(]/)[0].trim().toUpperCase() : '');
  var where = e.online ? h2Ico('web', 14) + ' ' + esc(t('event_detail.online', 'Online')) : (e.loc ? h2Ico('pin', 14) + ' ' + esc(String(e.loc).split(',').slice(-2).join(',').trim()) : '');
  return '<article class="h2-card h2-ev"><a class="h2-pic" href="' + escUrl(href) + '" onclick="' + go + ';return false;" tabindex="-1" aria-hidden="true">'
    + '<img src="' + escUrl(_imgSized(String(e.img.src).replace(/#contain$/, ''), 600)) + '" alt="" loading="lazy" decoding="async"></a>'
    + (typeof scHeart === 'function' ? scHeart('event', e.id) : '')
    + '<div class="h2-body"><div class="h2-kick">' + esc(when) + '</div>'
    + '<h3><a href="' + escUrl(href) + '" onclick="' + go + ';return false;">' + esc(_homeTitle(e)) + '</a></h3>'
    + '<div class="h2-fmt">' + esc(h2EventFormat(e)) + '</div>'
    + (where ? '<div class="h2-meta">' + where + '</div>' : '') + '</div></article>';
}
// "Online · English" / "In person · German" (owner, 2026-11-25). Events with no language set are English, as on the calendar.
function h2EventFormat(e) {
  var how = e.online ? t('home2.online', 'Online') : t('home2.in_person', 'In person');
  return how + ' · ' + _langName(e.lang || 'en');
}

// ── The coming festival, as a card like the events ──
function h2Festival() {
  var today = _localDay(new Date());
  return (window.calEvents || []).filter(function (e) {
    return e.cat === 'festival' && e.date >= today && h2DaysUntil(e.date) <= H2_FEST_AHEAD_DAYS && e.img && e.img.src;
  }).sort(function (a, b) { return (a.id ? 1 : 0) - (b.id ? 1 : 0) || (a.date < b.date ? -1 : 1); })[0] || null;
}
function h2FestivalCard(f) {
  var n = h2DaysUntil(f.date);
  var advent = /advent sunday (\d)/i.exec(f.title || '');
  var line = advent ? t('home2.advent_light_' + advent[1], H2_ADVENT_LIGHTS[advent[1] - 1]) : String(f.desc || '').split(/(?<=\.)\s/)[0];
  var go = advent ? 'showSec(\'advent\')' : 'showSec(\'events\')', href = advent ? '/advent' : '/events';
  var badge = n === 0 ? t('home2.today', 'Today') : n === 1 ? t('home2.tomorrow', 'Tomorrow') : t('home2.in_days', 'in {n} days').replace('{n}', n);
  return '<article class="h2-card h2-ev h2-fest"><a class="h2-pic" href="' + href + '" onclick="' + go + ';return false;" tabindex="-1" aria-hidden="true">'
    + '<img src="' + escUrl(f.img.src) + '" alt="" loading="lazy" decoding="async"><span class="h2-badge">' + esc(badge) + '</span></a>'
    + '<div class="h2-body"><div class="h2-kick">' + esc(h2Day(f.date) + ' · ' + t('home2.festival', 'Festival').toUpperCase()) + '</div>'
    + '<h3><a href="' + href + '" onclick="' + go + ';return false;">' + esc(f.title) + '</a></h3>'
    + (line ? '<div class="h2-meta">' + h2Ico('lemniscate', 14) + ' ' + esc(line) + '</div>' : '') + '</div></article>';
}

// ── Remembering this week: anniversaries from the calendar's memorial dates ──
function h2Remember() {
  var today = _localDay(new Date()), end = _localDay(new Date(Date.now() + H2_REMEMBER_DAYS * 864e5));
  return (window.calEvents || []).filter(function (e) { return e.cat === 'memorial' && e.date >= today && e.date <= end; })
    .sort(function (a, b) { return a.date < b.date ? -1 : 1; })[0] || null;
}
function h2RememberCard(m) {
  var raw = String(m.title || '').replace(/^(in memoriam|remembering|death of|died)[:\s]*/i, '');
  var yrs = /\((\d+)\s*yrs?\)/i.exec(raw);
  var name = raw.replace(/\s*\([^)]*\)\s*$/, '').trim();
  var initials = name.split(/\s+/).filter(Boolean).map(function (w) { return w[0]; }).slice(0, 1).concat(name.split(/\s+/).slice(-1).map(function (w) { return w[0]; })).join('').toUpperCase();
  return '<section class="h2-card h2-side h2-remember" aria-label="' + esc(t('home2.remembering', 'Remembering this week')) + '">'
    + '<div class="h2-kick">' + esc(t('home2.remembering', 'Remembering this week')) + '</div>'
    + '<div class="h2-rm"><span class="h2-ini" aria-hidden="true">' + esc(initials) + '</span><div><b>' + esc(name) + '</b>'
    + '<div class="h2-small">' + esc(localDate(m.date, { month: 'long', day: 'numeric' }) + (yrs ? ', ' + t('home2.years_ago', '{n} years ago').replace('{n}', yrs[1]) : '')) + '</div>'
    + (m.desc ? '<div class="h2-s">' + esc(String(m.desc).slice(0, 140)) + '</div>' : '') + '</div></div>'
    + '<a class="h2-link" href="/memorial" onclick="showSec(\'memorial\');return false;">' + esc(t('home2.in_memoriam', 'In Memoriam')) + ' ' + h2Ico('arrow', 15) + '</a></section>';
}

function h2FollowCard() {
  var ig = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4.3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.4" cy="6.6" r="1.3" fill="currentColor"/></svg>';
  var x = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M18.9 2H22l-6.8 7.8L23 22h-6.3l-4.9-6.4L6.2 22H3l7.3-8.3L1 2h6.4l4.4 5.9L18.9 2zm-1.1 18h1.7L6.3 3.9H4.5L17.8 20z"/></svg>';
  var row = function (icon, name, handle, url) {
    return '<a class="h2-follow" href="' + url + '" target="_blank" rel="noopener">' + icon + '<span><b>' + name + '</b><span class="h2-small">' + handle + '</span></span></a>';
  };
  return '<section class="h2-card h2-side" aria-label="' + esc(t('home.social_heading', 'Follow Sophia Commons')) + '"><div class="h2-kick">' + esc(t('home.social_heading', 'Follow Sophia Commons')) + '</div>'
    + row(ig, 'Instagram', '@sophiacommons7', 'https://www.instagram.com/sophiacommons7/')
    + row(x, 'X', '@SophiaCommons7', 'https://x.com/SophiaCommons7') + '</section>';
}

// ── The app (on standby): the band at the bottom of Home and the footer buttons stay hidden until a store link
// is filled in here. Each button shows on its own, so iPhone and Android can go live on different days.
// Add ?app=preview to any page address to see them before release (the buttons then go nowhere).
var SC_APP_LINKS = { ios: '', android: '' };
function h2AppLinks() {
  // The router tidies the address bar on load, so read the address the page was opened with
  var nav = window.performance && performance.getEntriesByType ? performance.getEntriesByType('navigation')[0] : null;
  if (/[?&]app=preview\b/.test((nav && nav.name) || location.search)) return { ios: SC_APP_LINKS.ios || '#', android: SC_APP_LINKS.android || '#' };
  return SC_APP_LINKS;
}
function h2StoreButtons(cls) {
  var links = h2AppLinks();
  var btn = function (url, small, name, label) {
    return url ? '<a class="' + cls + '" href="' + escUrl(url) + '" target="_blank" rel="noopener" aria-label="' + esc(label) + '">'
      + '<svg class="ico" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M10.5 18h3"/></svg>'
      + '<span><small>' + esc(small) + '</small>' + esc(name) + '</span></a>' : '';
  };
  return btn(links.ios, t('app.get_for', 'Get the app for'), 'iPhone', t('app.ios_label', 'Get the Sophia Commons app for iPhone'))
    + btn(links.android, t('app.get_for', 'Get the app for'), 'Android', t('app.android_label', 'Get the Sophia Commons app for Android'));
}
function h2AppBand() {
  // Until a store link is filled in (SC_APP_LINKS), say it is coming instead of hiding the band (owner, 2026-11-27)
  var buttons = h2StoreButtons('h2-store') || ('<span class="h2-soon">'
    + '<svg class="ico" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M10.5 18h3"/></svg>'
    + esc(t('app.coming_soon', 'Coming soon to iPhone and Android')) + '</span>');
  return '<section class="h2-appband" aria-label="' + esc(t('app.band_kicker', 'The Sophia Commons app')) + '"><div class="h2-appband-text">'
    + '<div class="h2-kick">' + esc(t('app.band_kicker', 'The Sophia Commons app')) + '</div>'
    + '<h2>' + esc(t('app.band_title', 'Events, places and the Calendar of the Soul, in your pocket.')) + '</h2>'
    + '<p>' + esc(t('app.band_text', 'Save events with a reminder the day before, find places near you, and join the chat. Free for iPhone and Android.')) + '</p>'
    + '<div class="h2-stores">' + buttons + '</div></div>'
    + '<div class="h2-phone"><img src="/img/app-shot.webp" width="390" height="844" alt="' + esc(t('app.shot_alt', 'The app\'s Events screen')) + '" loading="lazy" decoding="async"></div></section>';
}
// ── Sophia Commons in AI assistants (owner, 2026-11-27: "put the logos up right away"): Claude, ChatGPT and any MCP
// app, with the connector address. On Home, in the footer (every page) and on About. ──
var SC_MCP_URL = 'https://sophiacommons.org/mcp';
var SC_AI_APPS = [['claude', 'Claude'], ['chatgpt', 'ChatGPT'], ['mcp', 'MCP']];
function scAiBadges(cls) {
  return '<div class="' + cls + '">' + SC_AI_APPS.map(function (a) {
    return '<span class="ai-badge"><img src="/img/ai/' + a[0] + '.svg" alt="" width="22" height="22"><span>' + esc(a[1]) + '</span></span>'; }).join('') + '</div>';
}
function scAiCopy(btn) {
  try { navigator.clipboard.writeText(SC_MCP_URL); btn.textContent = t('ai.copied', 'Copied'); setTimeout(function () { btn.textContent = t('ai.copy', 'Copy'); }, 2000); }
  catch (e) { /* the address stays visible to copy by hand */ }
}
function scAiBlock(cls) {
  return '<section class="ai-band ' + (cls || '') + '" id="' + (cls === 'ai-about' ? 'ai-apps' : 'ai-band') + '"><div>'
    + '<div class="h2-kick">' + esc(t('ai.kicker', 'In your AI assistant')) + '</div>'
    + '<h2>' + esc(t('ai.title', 'Use Sophia Commons in Claude, ChatGPT and other AI apps')) + '</h2>'
    + '<p>' + esc(t('ai.text', 'Ask your assistant for Waldorf schools, biodynamic farms, events or Steiner lectures, and it searches Sophia Commons for you. Find Sophia Commons in the app directory of Claude or ChatGPT, or add it as a connector with this address:')) + '</p>'
    + '<div class="ai-url"><code>' + esc(SC_MCP_URL) + '</code><button type="button" onclick="scAiCopy(this)">' + esc(t('ai.copy', 'Copy')) + '</button></div>'
    + '<p class="ai-howto"><a href="/ai">' + esc(t('ai.howto', 'How to connect, step by step')) + ' &rarr;</a></p></div>'
    + scAiBadges('ai-badges') + '</section>';
}
function scAiFooter() {
  var box = document.getElementById('ft-ai'); if (!box) return;
  box.innerHTML = '<a href="/ai">'   // the step-by-step page (owner, 2026-11-27)
    + '<span class="ft-ai-t">' + esc(t('ai.footer', 'Use us in your AI assistant')) + '</span>' + scAiBadges('ai-badges sm') + '</a>';
}

// The footer buttons are on every page, not only Home
function h2FooterStores() {
  var box = document.getElementById('ft-stores');
  if (!box) return;
  box.innerHTML = h2StoreButtons('ft-store');
  box.hidden = !box.innerHTML;
}

// ── The skeleton; the parts that need data fill in as it arrives ──
function h2Skeleton() {
  var takeRow = function (icon, title, sub, go) {
    return '<a href="#" onclick="' + go + ';return false;">' + h2Ico(icon, 22) + '<span><b>' + esc(title) + '</b><span class="h2-small">' + esc(sub) + '</span></span>' + h2Ico('arrow', 16) + '</a>';
  };
  return '<div class="h2-main">'
    + '<section class="h2-sec" id="h2-week-sec" hidden>' + h2Head(t('home2.this_week', 'This week'), t('home2.all_events', 'All events'), 'showSec(\'events\')', '/events') + '<div class="h2-evrow" id="h2-week"></div></section>'
    + '<section class="h2-sec" id="h2-new-sec" hidden><div id="h2-new-head"></div><div class="h2-evrow h2-newrow" id="h2-new"></div></section>'
    + '<section class="h2-sec h2-two"><div id="h2-news-col" hidden>' + h2Head(t('home.news_heading', 'News'), t('home2.all_news', 'All news'), 'showSec(\'events\')', '/events') + '<div class="h2-card h2-list" id="h2-news"></div></div>'
    + '<div>' + h2Head(t('home2.newsletter', 'The newsletter'), t('home2.archive', 'Archive'), 'showSec(\'blog\')', '/blog') + '<div class="h2-card h2-nl" id="h2-nl"><div id="h2-nl-issue"></div></div></div></section>'
    + '<section class="h2-sec h2-two"><div id="h2-jobs-col" hidden>' + h2Head(t('home.jobs_heading', 'Jobs'), t('home2.all_jobs', 'All jobs'), 'showCategory(\'Jobs & Volunteering\')', '/category/jobs-volunteering') + '<div class="h2-card h2-list" id="h2-jobs"></div></div>'
    + '<div>' + h2Head(t('home2.take_part', 'Take part')) + '<div class="h2-card h2-take">'
    + takeRow('events', t('home2.post_event', 'Post an event'), t('home2.post_event_sub', 'Free, and seen by readers worldwide'), 'showEventForm()')
    + takeRow('place', t('home2.add_place', 'Add a place'), t('home2.add_place_sub', 'A school, farm or community'), 'showSubmitForm()')
    + takeRow('pen', t('home2.write', 'Write an article'), t('home2.write_sub', 'A reflection, report or question'), 'showSec(\'blog\')')
    + takeRow('chat', t('home2.join_board', 'Join the community board'), t('home2.join_board_sub', 'Posts and comments, free membership'), 'handleChat()')
    + '</div></div></section>'
    + '<section class="h2-sec" id="h2-talks-sec" hidden>' + h2Head(t('home2.talks', 'Talks and podcasts'), t('home2.all_channels', 'All channels'), 'showSec(\'podcasts\')', '/podcasts') + '<div class="h2-evrow h2-talks" id="h2-talks"></div></section>'
    + '</div>'
    + '<aside class="h2-aside" aria-label="' + esc(t('home2.aside', 'The season and the day')) + '"><div id="h2-fest"></div><div id="h2-cc-slot"></div><div id="h2-cots-slot"></div><div id="h2-days-slot"></div><div id="h2-remember"></div>' + h2FollowCard() + '</aside>'
    + h2AppBand();   // the AI message lives in the footer and on About (owner, 2026-11-27: not on Home)
}

// The Calendar of the Soul and the day's exercise keep their own widgets (and language handling); they move from the
// old right column into cards here
function h2MoveWidgets() {
  [['.rb-cots', 'h2-cots-slot'], ['.rb-days', 'h2-days-slot']].forEach(function (p) {
    var sec = document.querySelector('#rightbar ' + p[0]), slot = document.getElementById(p[1]);
    if (sec && slot) { sec.classList.add('h2-card', 'h2-side'); slot.appendChild(sec); }
  });
  var nl = document.querySelector('#sec-home .nl-card-home'), box = document.getElementById('h2-nl');
  if (nl && box) box.appendChild(nl);
  // The Christian Community's monthly online gathering (owner, 2026-10-29) keeps its own card, in this column
  var cc = document.getElementById('home-cc-block'), ccSlot = document.getElementById('h2-cc-slot');
  if (cc && ccSlot) ccSlot.appendChild(cc);
}

function h2DrawCalendar() {
  var weekBox = document.getElementById('h2-week');
  if (!weekBox) return;
  var week = h2WeekEvents();
  document.getElementById('h2-week-sec').hidden = !week.length;
  weekBox.innerHTML = week.map(h2EventCard).join('');
  var f = h2Festival();
  document.getElementById('h2-fest').innerHTML = f ? h2FestivalCard(f) : '';
  var m = h2Remember();
  document.getElementById('h2-remember').innerHTML = m ? h2RememberCard(m) : '';
  if (typeof scHeartsRefresh === 'function') scHeartsRefresh();
}

async function h2DrawNewPlaces() {
  var since = new Date(Date.now() - 7 * 864e5).toISOString();
  var r = await _sb.from('directory_entries').select('id, organization_name, location, country, category, photo_url, created_at')
    .eq('status', 'approved').not('photo_url', 'is', null).gte('created_at', since).order('created_at', { ascending: false }).limit(40);
  var rows = (r.data || []).filter(function (x) { return !/#contain$/.test(x.photo_url); });
  if (r.error || !rows.length) return;
  var count = (r.data || []).length;
  document.getElementById('h2-new-head').innerHTML = h2Head(t('home2.new_places', 'New in the directory'),
    t('home2.n_this_week', '{n} this week').replace('{n}', count), 'showSec(\'directory\')', '/directory');
  document.getElementById('h2-new').innerHTML = rows.slice(0, H2_NEW_MAX).map(function (x) {
    var href = '/listing/' + x.id, go = 'showDetail(\'directory\',\'' + escJs(x.id) + '\')';
    var place = [x.location, x.country].filter(Boolean).join(', ') || t('event_detail.online', 'Online');
    return '<article class="h2-card h2-ev"><a class="h2-pic" href="' + escUrl(href) + '" onclick="' + go + ';return false;" tabindex="-1" aria-hidden="true">'
      + '<img src="' + escUrl(_imgSized(x.photo_url, 600)) + '" alt="" loading="lazy" decoding="async"></a>'
      + (typeof scHeart === 'function' ? scHeart('directory', x.id) : '')
      + '<div class="h2-body"><div class="h2-kick">' + esc(t('home2.new', 'New').toUpperCase()) + '</div>'
      + '<h3><a href="' + escUrl(href) + '" onclick="' + go + ';return false;">' + esc(x.organization_name) + '</a></h3>'
      + '<div class="h2-meta">' + h2Ico('pin', 14) + ' ' + esc(place) + '</div></div></article>';
  }).join('');
  document.getElementById('h2-new-sec').hidden = false;
}

async function h2DrawNews() {
  var rows = (await _homeNewsLoad()).slice(0, H2_NEWS_MAX);
  if (!rows.length) return;
  document.getElementById('h2-news').innerHTML = rows.map(function (n) {
    var href = '/article/' + n.id, go = 'showDetail(\'news\',\'' + escJs(n.id) + '\')';
    var blurb = typeof _newsBlurb === 'function' ? _newsBlurb(n) : '';
    return '<div class="h2-row">' + (typeof scHeart === 'function' ? scHeart('news', n.id) : '')
      + '<a class="h2-t" href="' + escUrl(href) + '" onclick="' + go + ';return false;">' + esc(n.title) + '</a>'
      + (blurb ? '<div class="h2-s">' + esc(blurb.slice(0, 150)) + '</div>' : '')
      + '<div class="h2-small">' + esc([n.source_name, localDate(n.published_at, { month: 'short', day: 'numeric' })].filter(Boolean).join(' · ')) + '</div></div>';
  }).join('');
  document.getElementById('h2-news-col').hidden = false;
}

async function h2DrawNewsletter() {
  var r = await _sb.from('news').select('id, title, excerpt, published_at').eq('status', 'published').contains('tags', ['weekly-digest'])
    .order('published_at', { ascending: false }).limit(1);
  var d = r.data && r.data[0], box = document.getElementById('h2-nl-issue');
  if (!d || !box) return;
  var href = '/article/' + d.id, go = 'showDetail(\'news\',\'' + escJs(d.id) + '\')';
  box.innerHTML = ('<div class="h2-kick">' + esc(localDate(d.published_at, { weekday: 'long', month: 'long', day: 'numeric' })) + '</div>'
    + '<h3><a href="' + escUrl(href) + '" onclick="' + go + ';return false;">' + esc(d.title) + '</a></h3>'
    + (d.excerpt ? '<p class="h2-s">' + esc(String(d.excerpt).slice(0, 180)) + '</p>' : '')
    + '<a class="h2-link" href="' + escUrl(href) + '" onclick="' + go + ';return false;">' + esc(t('home2.read_issue', 'Read this week\'s issue')) + ' ' + h2Ico('arrow', 15) + '</a>');
}

async function h2DrawJobs() {
  var rows = _homeJobSlides(await _homeJobsLoad()).slice(0, H2_JOBS_MAX);
  if (!rows.length) return;
  document.getElementById('h2-jobs').innerHTML = rows.map(function (j) {
    var href = '/classified/' + j.id, go = 'showDetail(\'listing\',\'' + escJs(j.id) + '\')';
    return '<div class="h2-row h2-job">' + (typeof scHeart === 'function' ? scHeart('listing', j.id) : '')
      + '<span class="h2-jic">' + h2Ico('job', 20) + '</span><span><a class="h2-t" href="' + escUrl(href) + '" onclick="' + go + ';return false;">' + esc(j.title) + '</a>'
      + '<span class="h2-small">' + esc([j.location, j.country].filter(Boolean).join(', ')) + '</span></span></div>';
  }).join('');
  document.getElementById('h2-jobs-col').hidden = false;
}

async function h2DrawTalks() {
  var r = await _sb.from('youtube_videos').select('video_id, title, title_en, url, thumbnail_url, channel_slug, published_at')
    .order('published_at', { ascending: false }).limit(40);
  if (r.error || !r.data) return;
  var seen = {}, picks = r.data.filter(function (v) {
    if (!v.thumbnail_url || seen[v.channel_slug]) return false;
    seen[v.channel_slug] = 1;
    return true;
  }).slice(0, H2_TALKS_MAX);
  if (!picks.length) return;
  var ch = await _sb.from('youtube_channels').select('slug, name').in('slug', picks.map(function (v) { return v.channel_slug; }));
  var names = {};
  (ch.data || []).forEach(function (c) { names[c.slug] = c.name; });
  document.getElementById('h2-talks').innerHTML = picks.map(function (v) {
    var title = v.title_en || v.title, url = v.url || ('https://www.youtube.com/watch?v=' + v.video_id);
    return '<article class="h2-card h2-ev h2-vid"><a class="h2-pic" href="' + escUrl(url) + '" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">'
      + '<img src="' + escUrl(v.thumbnail_url) + '" alt="" loading="lazy" decoding="async"><span class="h2-play">' + h2Ico('play', 22) + '</span></a>'
      + (typeof scMediaHeart === 'function' ? scMediaHeart('video', v.video_id, { title: title, url: url, image: v.thumbnail_url, meta: names[v.channel_slug] || '' }) : '')
      + '<div class="h2-body"><h3><a href="' + escUrl(url) + '" target="_blank" rel="noopener">' + esc(title) + '</a></h3>'
      + '<div class="h2-meta">' + esc(names[v.channel_slug] || '') + '</div></div></article>';
  }).join('');
  document.getElementById('h2-talks-sec').hidden = false;
}

// The title always on exactly two lines (owner, 2026-11-24), in any language and font: start at half its one-line
// width, widen it a step at a time until it sits on two lines, and make the type smaller only if the column runs out
var H2_TITLE_MAX = { en: 46, other: 34 }, H2_TITLE_MIN = 16, H2_TITLE_STEP = 1.04;
function h2Lines(el) {
  var r = document.createRange();
  r.selectNodeContents(el);
  var tops = {};
  Array.prototype.forEach.call(r.getClientRects(), function (x) { if (x.width > 1) tops[Math.round(x.top)] = 1; });
  return Object.keys(tops).length;
}
function h2FitTitle() {
  var h = document.querySelector('.hh-title'), col = h && h.parentElement;
  if (!h || !col || !col.clientWidth || !h.offsetParent) return;
  var room = col.clientWidth;
  var size = document.documentElement.lang === 'en' ? H2_TITLE_MAX.en : H2_TITLE_MAX.other;
  for (; size >= H2_TITLE_MIN; size = Math.floor(size * 0.94)) {
    h.style.fontSize = size + 'px';
    h.style.maxWidth = 'none';
    h.style.whiteSpace = 'nowrap';
    h.style.display = 'inline-block';   // shrink to the text, so its own width can be read
    var full = h.getBoundingClientRect().width;
    h.style.display = '';
    h.style.whiteSpace = '';
    for (var w = full / 2; w <= room; w *= H2_TITLE_STEP) {
      h.style.maxWidth = Math.ceil(w) + 'px';
      if (h2Lines(h) <= 2) return;
    }
  }
}

// The header menu: long labels (German, Russian) and narrow screens can run into the search button. Hide items from
// the end until the rest fit; they stay in the side menu. Home, Events and Directory always stay.
var H2_MENU_DROP = ['nav-chat', 'nav-memorial', 'nav-podcasts', 'nav-books'], H2_MENU_GAP = 8;

// Phones: a shorter search hint so it isn't cut off (owner, 2026-11-25)
var H2_NARROW = '(max-width: 600px)';
function h2FitSearch() {
  var el = document.getElementById('hero-search');
  if (!el) return;
  var narrow = window.matchMedia && matchMedia(H2_NARROW).matches;
  el.placeholder = narrow ? t('home.hero_search_short', 'Search places and events') : t('home.hero_search', 'Search schools, farms, events, articles');
}
// Items that do not fit go into a "More" menu at the end, never out of reach (owner, 2026-11-28: Resources, Social
// media, In memoriam and Community board were missing once Advent joined the menu)
function h2MoreBtn(nav) {
  var more = document.getElementById('nav-more');
  if (more) return more;
  var wrap = document.createElement('div');
  wrap.className = 'h2-more'; wrap.id = 'nav-more-wrap';
  wrap.innerHTML = '<button type="button" id="nav-more" aria-haspopup="true" aria-expanded="false" onclick="h2MoreToggle()">' + esc(t('nav.more', 'More')) + ' <span aria-hidden="true">&#9662;</span></button>'
    + '<div class="h2-more-menu" id="nav-more-menu" role="menu" hidden></div>';
  nav.appendChild(wrap);
  document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) h2MoreToggle(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') h2MoreToggle(false); });
  return document.getElementById('nav-more');
}
function h2MoreToggle(open) {
  var btn = document.getElementById('nav-more'), menu = document.getElementById('nav-more-menu');
  if (!btn || !menu) return;
  if (open === undefined) open = menu.hidden;
  if (open) {
    menu.innerHTML = H2_MENU_DROP.slice().reverse().map(function (id) {
      var b = document.getElementById(id);
      return b && b.classList.contains('h2-menu-off') && !b.hidden ? '<button type="button" role="menuitem" onclick="h2MoreToggle(false);document.getElementById(\'' + id + '\').click()">' + esc(b.textContent.trim()) + '</button>' : '';
    }).join('');
  }
  menu.hidden = !open;
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}
function h2FitMenu() {
  var nav = document.getElementById('mainnav'), search = document.getElementById('hdr-search');
  if (!nav || !search || !nav.offsetParent || !search.offsetParent) return;
  var more = h2MoreBtn(nav), wrap = more.parentNode;
  H2_MENU_DROP.forEach(function (id) { var b = document.getElementById(id); if (b) b.classList.remove('h2-menu-off'); });
  wrap.hidden = true; h2MoreToggle(false);
  var room = function () {
    var shown = Array.prototype.filter.call(nav.children, function (b) { return b.offsetParent; });
    var last = shown[shown.length - 1];
    return !last || last.getBoundingClientRect().right + H2_MENU_GAP <= search.getBoundingClientRect().left;
  };
  if (room()) return;
  wrap.hidden = false;
  for (var i = 0; i < H2_MENU_DROP.length && !room(); i++) {
    var b = document.getElementById(H2_MENU_DROP[i]);
    if (b) b.classList.add('h2-menu-off');
  }
}

function h2Run(name, fn) {
  try { var p = fn(); if (p && p.catch) p.catch(function (e) { console.warn('Home ' + name + ' failed:', e); }); }
  catch (e) { console.warn('Home ' + name + ' failed:', e); }
}

function renderHome2() {
  var explore = document.getElementById('home-explore');
  if (!explore || document.getElementById('home2')) return;
  var box = document.createElement('div');
  box.id = 'home2';
  box.innerHTML = h2Skeleton();
  explore.insertAdjacentElement('afterend', box);
  h2MoveWidgets();
  document.body.classList.add('home2-on');   // hides the old Home blocks and the old right column on Home
  h2Run('calendar', h2DrawCalendar);
  if (sbReady()) {
    h2Run('new places', h2DrawNewPlaces);
    h2Run('news', h2DrawNews);
    h2Run('newsletter', h2DrawNewsletter);
    h2Run('jobs', h2DrawJobs);
    h2Run('talks', h2DrawTalks);
  }
}

// Events load after the page; redraw the calendar parts whenever the site redraws its own Home events
(function () {
  if (typeof window.renderHomeUpcoming === 'function') {
    var orig = window.renderHomeUpcoming;
    window.renderHomeUpcoming = function () {
      var out = orig.apply(this, arguments);
      h2Run('calendar', h2DrawCalendar);
      return out;
    };
  }
  var fitTimer = null;
  var fit = function () { clearTimeout(fitTimer); fitTimer = setTimeout(function () { h2Run('title', h2FitTitle); h2Run('menu', h2FitMenu); h2Run('search hint', h2FitSearch); }, 80); };
  window.addEventListener('resize', fit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
  if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', fit);   // the menu and heading fonts arrive late
  var start = function () { h2Run('home', renderHome2); h2Run('title', h2FitTitle); h2Run('menu', h2FitMenu); h2Run('search hint', h2FitSearch); h2Run('stores', h2FooterStores); h2Run('ai footer', scAiFooter); };
  // A new language (the switcher calls rerenderForLang; the first load fires i18n-ready): put the moved widgets
  // back, then draw again with the new labels, refit the title and redo the date line
  var relang = function () {
    if (typeof renderHeroDate === 'function') h2Run('date', renderHeroDate);
    var box = document.getElementById('home2'), rb = document.getElementById('rightbar'), home = document.getElementById('sec-home');
    if (!box) return;
    ['.rb-cots', '.rb-days'].forEach(function (s) { var el = box.querySelector(s); if (el && rb) rb.appendChild(el); });
    var nl = box.querySelector('.nl-card-home');
    if (nl && home) home.appendChild(nl);
    var cc = box.querySelector('#home-cc-block');
    if (cc && home) home.appendChild(cc);
    box.remove();
    h2Run('home', renderHome2);
    h2Run('stores', h2FooterStores); h2Run('ai footer', scAiFooter);
    fit();
  };
  window.addEventListener('i18n-ready', relang);
  if (typeof window.rerenderForLang === 'function') {
    var origLang = window.rerenderForLang;
    window.rerenderForLang = function () { var out = origLang.apply(this, arguments); relang(); return out; };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
