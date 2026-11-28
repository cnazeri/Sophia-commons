// Sophia Commons: saved links for signed-in members (owner, 2026-11-22: "individuals who are signed in can save their
// favorite links, similar to the app but only when they are signed in").
//   - A Save button on place, event, article and job pages, shown only to signed-in members (showDetail calls scSaveMount)
//   - "saved" in the top bar opens /saved: everything the member saved, grouped, each with a Remove button
// Stored in saved_items (one row per member and item; each member can only read, add and remove their own rows).
// Uses globals from sophia_commons_v9.js: _sb, sbReady, signedIn, esc, escJs, t, localDate, showDetail, showSec, openModal.

var _savedKeys = null;   // Set of 'type:id' for the signed-in member, loaded once per sign-in
var SAVED_TYPES = ['event', 'directory', 'news', 'listing'];
var SAVED_PATH = { directory: '/listing/', event: '/event/', news: '/article/', listing: '/classified/' };
// One heart means "saved" everywhere: cards, detail pages, channels (owner, 2026-11-23). Members only.
var SC_HEART_PATH = '<path d="M12 21s-7.5-4.6-9.6-9.3C.9 8.2 3 4.5 6.6 4.5c2.1 0 3.6 1.2 5.4 3.1 1.8-1.9 3.3-3.1 5.4-3.1 3.6 0 5.7 3.7 4.2 7.2C19.5 16.4 12 21 12 21z"/>';
var SAVED_ICON = '<svg class="sc-heart-ico" width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" style="vertical-align:-3px;margin-right:5px">' + SC_HEART_PATH + '</svg>';

function _savedUser() { return window._supabaseUser || null; }

// A heart for a card in a list (events, news). Drawn only for signed-in members; filled from the loaded keys.
// Hearts are always drawn and only shown to members (body.sc-member, set at sign-in), so lists drawn before the
// sign-in was restored still get them without being redrawn.
function scHeart(type, id) {
  if (!id || SAVED_TYPES.indexOf(type) < 0) return '';
  var on = !!(_savedKeys && _savedKeys.has(type + ':' + id));
  var label = on ? t('saved.unsave', 'Remove from saved') : t('saved.save', 'Save');
  return '<button type="button" class="sc-heart' + (on ? ' is-saved' : '') + '" aria-pressed="' + on + '" aria-label="' + esc(label) + '" title="' + esc(label) + '"'
    + ' data-type="' + esc(type) + '" data-id="' + esc(id) + '" onclick="event.stopPropagation();scToggleSave(this)">'
    + '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">' + SC_HEART_PATH + '</svg></button>';
}
// Books, talks, blogs and podcasts have no database id, so they are saved in saved_media with a copy of what
// to show (owner, 2026-11-23: "All events news Jobs books of the week, ect should have hearts").
var SAVED_MEDIA_KINDS = ['video', 'blog', 'podcast', 'book'];
var _savedMediaKeys = null, _scMediaData = {};
function scMediaHeart(kind, id, data) {
  if (!id || SAVED_MEDIA_KINDS.indexOf(kind) < 0) return '';
  var key = kind + ':' + id;
  _scMediaData[key] = Object.assign({ kind: kind, id: String(id) }, data || {});
  var on = !!(_savedMediaKeys && _savedMediaKeys.has(key));
  var label = on ? t('saved.unsave', 'Remove from saved') : t('saved.save', 'Save');
  return '<button type="button" class="sc-heart' + (on ? ' is-saved' : '') + '" aria-pressed="' + on + '" aria-label="' + esc(label) + '" title="' + esc(label) + '"'
    + ' data-mkind="' + esc(kind) + '" data-mid="' + esc(id) + '" onclick="event.stopPropagation();event.preventDefault();scToggleMedia(this)">'
    + '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">' + SC_HEART_PATH + '</svg></button>';
}
async function scToggleMedia(btn) {
  if (!signedIn || !_savedUser()) { openModal(); return; }
  var kind = btn.getAttribute('data-mkind'), id = btn.getAttribute('data-mid'), key = kind + ':' + id;
  await _savedLoad();
  var keys = _savedMediaKeys || (_savedMediaKeys = new Set()), on = keys.has(key);
  btn.disabled = true;
  var r = on
    ? await _sb.from('saved_media').delete().eq('kind', kind).eq('item_id', id)
    : await _sb.from('saved_media').upsert({ user_id: _savedUser().id, kind: kind, item_id: id, data: _scMediaData[key] || { kind: kind, id: id } }, { onConflict: 'user_id,kind,item_id' });
  btn.disabled = false;
  if (r.error) { scNotify(t('saved.error', 'Could not save. Please try again.')); return; }
  if (on) keys.delete(key); else keys.add(key);
  scHeartsRefresh();
}

// Updates every heart and Save button on the page to match what the member has saved
function scHeartsRefresh() {
  var keys = _savedKeys || new Set(), mkeys = _savedMediaKeys || new Set();
  document.querySelectorAll('.sc-heart, .btn-save').forEach(function (b) {
    if (b.hasAttribute('data-mkind')) {
      var mon = mkeys.has(b.getAttribute('data-mkind') + ':' + b.getAttribute('data-mid'));
      b.classList.toggle('is-saved', mon);
      b.setAttribute('aria-pressed', mon ? 'true' : 'false');
      return;
    }
    if (!b.hasAttribute('data-type')) return;
    var on = keys.has(b.getAttribute('data-type') + ':' + b.getAttribute('data-id'));
    b.classList.toggle('is-saved', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (b.classList.contains('btn-save')) b.innerHTML = SAVED_ICON + esc(on ? t('saved.saved', 'Saved') : t('saved.save', 'Save'));
  });
}

async function _savedLoad(force) {
  if (!signedIn || !sbReady() || !_savedUser()) { _savedKeys = null; return new Set(); }
  if (_savedKeys && !force) return _savedKeys;
  var both = await Promise.all([_sb.from('saved_items').select('item_type, item_id'), _sb.from('saved_media').select('kind, item_id')]);
  var r = both[0];
  _savedKeys = new Set((r.data || []).map(function (x) { return x.item_type + ':' + x.item_id; }));
  _savedMediaKeys = new Set(((both[1] && both[1].data) || []).map(function (x) { return x.kind + ':' + x.item_id; }));
  scHeartsRefresh();
  return _savedKeys;
}

// Called on sign-in and sign-out (sophia_commons_v9.js)
function savedAuthChanged() {
  _savedKeys = null; _savedMediaKeys = null;
  document.body.classList.toggle('sc-member', !!signedIn);
  // Favorite YouTube channels belong to the member too: reload them and redraw the list if it is open
  if (typeof _ytFavs !== 'undefined') _ytFavs = null;
  if (document.getElementById('yt-list') && typeof renderYouTubeChannels === 'function') renderYouTubeChannels();
  var l = document.getElementById('saved-link');
  if (l) l.style.display = signedIn ? 'inline' : 'none';
  var sec = document.getElementById('sec-saved');
  if (sec && sec.classList.contains('active')) renderSaved();
  // Hearts on event and news cards appear or disappear with sign-in: redraw those lists
  if (typeof renderEventList === 'function' && document.getElementById('sec-events')) { try { renderEventList(); } catch (e) { /* list draws on its next visit */ } }
  if (typeof loadNewsFromSupabase === 'function' && document.getElementById('sb-news-list')) loadNewsFromSupabase();
  try { if (typeof renderHomeUpcoming === 'function') renderHomeUpcoming(); } catch (e) { /* drawn on the next visit */ }
  try { if (typeof renderHomeNews === 'function') renderHomeNews(); } catch (e) { /* drawn on the next visit */ }
  if (signedIn) { _savedLoad(); _scSavePendingAfterSignIn(); }
}

// ── Save links from the AI app (owner, 2026-11-25): ChatGPT or Claude give people /listing/<slug>?save=1 or
// /event/<id>?save=1. Opening one saves that place or event. Members save at once; others are asked to sign in
// and the item is saved right after (the wish is kept for this browser tab only). ──
var SC_PENDING_SAVE = 'sc-pending-save';
function _scTakeSaveParam() {
  try {
    var u = new URL(location.href);
    if (u.searchParams.get('save') !== '1') return false;
    u.searchParams.delete('save');
    history.replaceState(history.state, '', u.pathname + u.search + u.hash);
    return true;
  } catch (e) { return false; }
}
async function _scSaveNow(type, id) {
  var keys = await _savedLoad();
  if (!keys.has(type + ':' + id)) {
    var r = await _sb.from('saved_items').insert({ user_id: _savedUser().id, item_type: type, item_id: id });
    if (r.error && !/duplicate/i.test(r.error.message)) { scNotify(t('saved.error', 'Could not save. Please try again.')); return false; }
    keys.add(type + ':' + id);
    scHeartsRefresh();
  }
  scNotify(t('saved.saved_from_link', 'Saved to your list'));
  return true;
}
async function _scSaveFromLink(type, id) {
  if (signedIn && _savedUser()) { await _scSaveNow(type, id); return; }
  try { sessionStorage.setItem(SC_PENDING_SAVE, type + ':' + id); } catch (e) { return; }
  // The sign-in may still be restoring on page load: ask only if it has not arrived after a moment
  setTimeout(function () { if (!signedIn) openModal(); }, 1500);
}
async function _scSavePendingAfterSignIn() {
  var want = null;
  try { want = sessionStorage.getItem(SC_PENDING_SAVE); sessionStorage.removeItem(SC_PENDING_SAVE); } catch (e) { return; }
  var m = want && want.match(/^([a-z]+):([0-9a-f-]{36})$/);
  if (!m || SAVED_TYPES.indexOf(m[1]) < 0 || !_savedUser()) return;
  if (await _scSaveNow(m[1], m[2])) {
    var btn = document.querySelector('#detail-content .btn-save[data-id="' + m[2] + '"]');
    if (btn) { btn.classList.add('is-saved'); btn.setAttribute('aria-pressed', 'true'); }
  }
}

function _saveBtnHtml(type, id, on) {
  return '<button type="button" class="btn-save' + (on ? ' is-saved' : '') + '" aria-pressed="' + (on ? 'true' : 'false') + '"'
    + ' data-type="' + esc(type) + '" data-id="' + esc(id) + '" onclick="scToggleSave(this)">'
    + SAVED_ICON + esc(on ? t('saved.saved', 'Saved') : t('saved.save', 'Save')) + '</button>';
}

// Adds the Save button to the detail page that was just drawn. Everyone sees it (owner, 2026-11-27); signed out,
// a tap asks to sign in and saves after.
async function scSaveMount(type, id) {
  if (SAVED_TYPES.indexOf(type) >= 0 && id && _scTakeSaveParam()) await _scSaveFromLink(type, id);
  if (SAVED_TYPES.indexOf(type) < 0 || !id) return;
  var keys = signedIn ? await _savedLoad() : new Set();
  var root = document.getElementById('detail-content');
  if (!root || root.querySelector('.btn-save')) return;
  var html = _saveBtnHtml(type, id, keys.has(type + ':' + id));
  var actions = root.querySelector('.detail-actions');
  if (actions) { actions.insertAdjacentHTML('afterbegin', html); return; }
  var anchor = root.querySelector('.detail-hero') || root.firstElementChild;
  var box = '<div class="detail-actions">' + html + '</div>';
  if (anchor) anchor.insertAdjacentHTML('afterend', box); else root.insertAdjacentHTML('afterbegin', box);
}

async function scToggleSave(btn) {
  // Signed out: remember this heart for the tab, ask to sign in, and _scSavePendingAfterSignIn saves it after (owner, 2026-11-27)
  if (!signedIn || !_savedUser()) {
    try { sessionStorage.setItem(SC_PENDING_SAVE, btn.getAttribute('data-type') + ':' + btn.getAttribute('data-id')); } catch (e) { /* private mode: just sign in */ }
    openModal(); return;
  }
  var type = btn.getAttribute('data-type'), id = btn.getAttribute('data-id'), key = type + ':' + id;
  var keys = await _savedLoad();
  var on = keys.has(key);
  btn.disabled = true;
  var r = on
    ? await _sb.from('saved_items').delete().eq('item_type', type).eq('item_id', id)
    : await _sb.from('saved_items').insert({ user_id: _savedUser().id, item_type: type, item_id: id });
  btn.disabled = false;
  if (r.error && !/duplicate/i.test(r.error.message)) { scNotify(t('saved.error', 'Could not save. Please try again.')); return; }
  if (on) keys.delete(key); else keys.add(key);
  scHeartsRefresh();
}

// The /saved page
async function renderSaved() {
  var root = document.getElementById('saved-root');
  if (!root) return;
  if (!signedIn || !sbReady() || !_savedUser()) {
    root.innerHTML = '<p class="org-empty">' + esc(t('saved.sign_in', 'Sign in to save events, places, articles and jobs, and find them here on any device.')) + '</p>'
      + '<button type="button" class="org-btn" onclick="openModal()">' + esc(t('topbar.sign_in', 'sign in')) + '</button>';
    return;
  }
  root.innerHTML = '<p class="org-empty">' + esc(t('common.loading', 'Loading...')) + '</p>';
  var r = await _sb.from('saved_items').select('item_type, item_id, created_at').order('created_at', { ascending: false });
  if (r.error) { root.innerHTML = '<p class="org-empty">' + esc(t('saved.error_load', 'Could not load your saved items.')) + '</p>'; return; }
  var ids = {}; SAVED_TYPES.forEach(function (k) { ids[k] = []; });
  (r.data || []).forEach(function (x) { if (ids[x.item_type]) ids[x.item_type].push(x.item_id); });
  _savedKeys = new Set((r.data || []).map(function (x) { return x.item_type + ':' + x.item_id; }));

  var q = function (table, cols, list) { return list.length ? _sb.from(table).select(cols).in('id', list) : Promise.resolve({ data: [] }); };
  var res = await Promise.all([
    q('events', 'id, title, start_date, is_online, city, country, location_name, directory_entry_id', ids.event),
    q('directory_entries', 'id, slug, organization_name, location, city, country', ids.directory),
    q('news', 'id, title, published_at', ids.news),
    q('listings', 'id, title, location, country', ids.listing),
  ]);
  var now = Date.now() - 864e5;
  var events = (res[0].data || []).sort(function (a, b) { return a.start_date.localeCompare(b.start_date); });
  // Each saved event shows the directory place it belongs to, with a link (owner, 2026-11-23)
  var hostIds = events.map(function (e) { return e.directory_entry_id; }).filter(Boolean);
  var hosts = {};
  if (hostIds.length) {
    var hr = await _sb.from('directory_entries').select('id, slug, organization_name').in('id', hostIds);
    (hr.data || []).forEach(function (h) { hosts[h.id] = h; });
  }
  var hostLink = function (e) {
    var h = e.directory_entry_id && hosts[e.directory_entry_id];
    if (!h) return '';
    return '<span class="saved-host">' + esc(t('saved.at', 'at')) + ' <a href="/listing/' + encodeURIComponent(h.slug || h.id) + '" onclick="showDetail(\'directory\',\'' + escJs(h.slug || h.id) + '\');return false;">' + esc(h.organization_name) + '</a></span>';
  };
  var groups = [
    { type: 'event', label: t('saved.events', 'Events'), extra: hostLink, rows: events.filter(function (e) { return Date.parse(e.start_date) >= now; }),
      title: function (e) { return e.title; }, meta: function (e) { return [localDate(e.start_date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }), e.is_online ? t('event_detail.online', 'Online') : [e.city, e.country].filter(Boolean).join(', ')].filter(Boolean).join(' · '); } },
    { type: 'directory', label: t('saved.places', 'Places and resources'), rows: (res[1].data || []).sort(function (a, b) { return a.organization_name.localeCompare(b.organization_name); }),
      title: function (d) { return d.organization_name; }, meta: function (d) { return [d.city || d.location, d.country].filter(Boolean).join(', '); }, path: function (d) { return d.slug || d.id; } },
    { type: 'news', label: t('saved.articles', 'Articles'), rows: res[2].data || [],
      title: function (n) { return n.title; }, meta: function (n) { return n.published_at ? localDate(n.published_at, { month: 'short', day: 'numeric', year: 'numeric' }) : ''; } },
    { type: 'listing', label: t('saved.jobs', 'Jobs'), rows: res[3].data || [],
      title: function (j) { return j.title; }, meta: function (j) { return [j.location, j.country].filter(Boolean).join(', '); } },
    { type: 'event', label: t('saved.past_events', 'Past events'), rows: events.filter(function (e) { return Date.parse(e.start_date) < now; }).reverse(),
      title: function (e) { return e.title; }, meta: function (e) { return localDate(e.start_date, { month: 'short', day: 'numeric', year: 'numeric' }); } },
  ];
  var html = groups.filter(function (g) { return g.rows.length; }).map(function (g) {
    return '<div class="saved-group"><h3>' + esc(g.label) + '</h3>' + g.rows.map(function (x) {
      var link = SAVED_PATH[g.type] + encodeURIComponent(g.path ? g.path(x) : x.id);
      return '<div class="saved-row" id="saved-' + esc(g.type) + '-' + esc(x.id) + '">'
        + '<div class="saved-main"><a href="' + link + '" onclick="showDetail(\'' + g.type + '\',\'' + escJs(g.path ? g.path(x) : x.id) + '\');return false;">' + esc(g.title(x)) + '</a>'
        + (g.meta(x) ? '<span class="saved-meta">' + esc(g.meta(x)) + '</span>' : '') + (g.extra ? g.extra(x) : '') + '</div>'
        + '<button type="button" class="btn-unsave" onclick="scRemoveSaved(\'' + g.type + '\',\'' + escJs(x.id) + '\')">' + esc(t('saved.remove', 'Remove')) + '</button></div>';
    }).join('') + '</div>';
  }).join('');
  html = (await _savedChannelsHtml()) + html + (await _savedMediaHtml());
  root.innerHTML = html || '<p class="org-empty">' + esc(t('saved.empty', 'Nothing saved yet. Open an event, a place, an article or a job and press Save.')) + '</p>';
}

// Favorite YouTube channels on the Saved page (owner, 2026-11-23), first because they are used most often
async function _savedChannelsHtml() {
  if (typeof _ytFavsLoad !== 'function') return '';
  _ytFavs = null;
  var favs = await _ytFavsLoad();
  if (!favs.size) return '';
  var rows = (await _ytFetchLatest()).filter(function (c) { return favs.has(c.slug); })
    .sort(function (a, b) { return a.name.localeCompare(b.name); });
  if (!rows.length) return '';
  return '<div class="saved-group"><h3>' + esc(t('saved.channels', 'Favorite YouTube channels')) + '</h3>' + rows.map(function (c) {
    var meta = [c.language, c.published_at && typeof ytAgo === 'function' ? t('saved.newest_video', 'newest video') + ' ' + ytAgo(c.published_at) : ''].filter(Boolean).join(' · ');
    return '<div class="saved-row" id="saved-channel-' + esc(c.slug) + '">'
      + '<div class="saved-main"><a href="' + escUrl(c.channel_url) + '" target="_blank" rel="noopener">' + esc(c.name) + '</a>'
      + (meta ? '<span class="saved-meta">' + esc(meta) + '</span>' : '') + '</div>'
      + '<button type="button" class="btn-unsave" onclick="scRemoveFavChannel(\'' + escJs(c.slug) + '\')">' + esc(t('saved.remove', 'Remove')) + '</button></div>';
  }).join('') + '</div>';
}
// Talks, blogs and podcasts saved in the app (saved_media, owner 2026-11-23): one Saved list per account
var SAVED_MEDIA_LABEL = { video: 'Talk', blog: 'Blog', podcast: 'Podcast', book: 'Book' };
async function _savedMediaHtml() {
  var r = await _sb.from('saved_media').select('kind, item_id, data, created_at').order('created_at', { ascending: false });
  if (r.error || !r.data || !r.data.length) return '';
  return '<div class="saved-group"><h3>' + esc(t('saved.media', 'Books, talks, blogs and podcasts')) + '</h3>' + r.data.map(function (m) {
    var d = m.data || {}, url = d.url || '';
    var meta = [t('saved.media_' + m.kind, SAVED_MEDIA_LABEL[m.kind] || m.kind), d.meta].filter(Boolean).join(' · ');
    var rid = 'saved-media-' + m.kind + '-' + String(m.item_id).replace(/[^A-Za-z0-9_-]/g, '');
    return '<div class="saved-row" id="' + esc(rid) + '"><div class="saved-main">'
      + (/^https?:\/\//.test(url) ? '<a href="' + escUrl(url) + '" target="_blank" rel="noopener">' + esc(d.title || m.item_id) + '</a>' : esc(d.title || m.item_id))
      + '<span class="saved-meta">' + esc(meta) + '</span></div>'
      + '<button type="button" class="btn-unsave" onclick="scRemoveSavedMedia(\'' + escJs(m.kind) + '\',\'' + escJs(m.item_id) + '\',\'' + escJs(rid) + '\')">' + esc(t('saved.remove', 'Remove')) + '</button></div>';
  }).join('') + '</div>';
}
async function scRemoveSavedMedia(kind, id, rid) {
  var r = await _sb.from('saved_media').delete().eq('kind', kind).eq('item_id', id);
  if (r.error) { scNotify(t('saved.error', 'Could not save. Please try again.')); return; }
  if (_savedMediaKeys) _savedMediaKeys.delete(kind + ':' + id);
  var row = document.getElementById(rid);
  if (row) row.remove();
  document.querySelectorAll('#saved-root .saved-group').forEach(function (g) { if (!g.querySelector('.saved-row')) g.remove(); });
  if (!document.querySelector('#saved-root .saved-row')) renderSaved();
}

async function scRemoveFavChannel(slug) {
  if (!(await ytToggleFav(slug))) return;
  var row = document.getElementById('saved-channel-' + slug);
  if (row) row.remove();
  document.querySelectorAll('#saved-root .saved-group').forEach(function (g) { if (!g.querySelector('.saved-row')) g.remove(); });
  if (!document.querySelector('#saved-root .saved-row')) renderSaved();
}

async function scRemoveSaved(type, id) {
  var r = await _sb.from('saved_items').delete().eq('item_type', type).eq('item_id', id);
  if (r.error) { scNotify(t('saved.error', 'Could not save. Please try again.')); return; }
  if (_savedKeys) _savedKeys.delete(type + ':' + id);
  scHeartsRefresh();
  var row = document.getElementById('saved-' + type + '-' + id);
  if (row) row.remove();
  document.querySelectorAll('#saved-root .saved-group').forEach(function (g) { if (!g.querySelector('.saved-row')) g.remove(); });
  if (!document.querySelector('#saved-root .saved-row')) renderSaved();
}

// The stored sign-in can be restored before this file has loaded; then the lists were drawn without hearts.
// Redraw them once now (owner, 2026-11-23: "I dont see any of the hearts").
if (typeof signedIn !== 'undefined' && signedIn) savedAuthChanged();
window.addEventListener('supabase-auth-ready', function () { setTimeout(function () { if (signedIn) savedAuthChanged(); }, 0); });
