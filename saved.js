// Sophia Commons: saved links for signed-in members (owner, 2026-11-22: "individuals who are signed in can save their
// favorite links, similar to the app but only when they are signed in").
//   - A Save button on place, event, article and job pages, shown only to signed-in members (showDetail calls scSaveMount)
//   - "saved" in the top bar opens /saved: everything the member saved, grouped, each with a Remove button
// Stored in saved_items (one row per member and item; each member can only read, add and remove their own rows).
// Uses globals from sophia_commons_v9.js: _sb, sbReady, signedIn, esc, escJs, t, localDate, showDetail, showSec, openModal.

var _savedKeys = null;   // Set of 'type:id' for the signed-in member, loaded once per sign-in
var SAVED_TYPES = ['event', 'directory', 'news', 'listing'];
var SAVED_PATH = { directory: '/listing/', event: '/event/', news: '/article/', listing: '/classified/' };
var SAVED_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" style="vertical-align:-2px;margin-right:5px">'
  + '<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1z" fill="currentColor"/></svg>';

function _savedUser() { return window._supabaseUser || null; }

async function _savedLoad(force) {
  if (!signedIn || !sbReady() || !_savedUser()) { _savedKeys = null; return new Set(); }
  if (_savedKeys && !force) return _savedKeys;
  var r = await _sb.from('saved_items').select('item_type, item_id');
  _savedKeys = new Set((r.data || []).map(function (x) { return x.item_type + ':' + x.item_id; }));
  return _savedKeys;
}

// Called on sign-in and sign-out (sophia_commons_v9.js)
function savedAuthChanged() {
  _savedKeys = null;
  var l = document.getElementById('saved-link');
  if (l) l.style.display = signedIn ? 'inline' : 'none';
  var sec = document.getElementById('sec-saved');
  if (sec && sec.classList.contains('active')) renderSaved();
}

function _saveBtnHtml(type, id, on) {
  return '<button type="button" class="btn-save' + (on ? ' is-saved' : '') + '" aria-pressed="' + (on ? 'true' : 'false') + '"'
    + ' data-type="' + esc(type) + '" data-id="' + esc(id) + '" onclick="scToggleSave(this)">'
    + SAVED_ICON + esc(on ? t('saved.saved', 'Saved') : t('saved.save', 'Save')) + '</button>';
}

// Adds the Save button to the detail page that was just drawn (signed-in members only)
async function scSaveMount(type, id) {
  if (SAVED_TYPES.indexOf(type) < 0 || !id || !signedIn) return;
  var keys = await _savedLoad();
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
  if (!signedIn || !_savedUser()) { openModal(); return; }
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
  btn.outerHTML = _saveBtnHtml(type, id, !on);
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
    q('events', 'id, title, start_date, is_online, city, country, location_name', ids.event),
    q('directory_entries', 'id, slug, organization_name, location, city, country', ids.directory),
    q('news', 'id, title, published_at', ids.news),
    q('listings', 'id, title, location, country', ids.listing),
  ]);
  var now = Date.now() - 864e5;
  var events = (res[0].data || []).sort(function (a, b) { return a.start_date.localeCompare(b.start_date); });
  var groups = [
    { type: 'event', label: t('saved.events', 'Events'), rows: events.filter(function (e) { return Date.parse(e.start_date) >= now; }),
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
        + (g.meta(x) ? '<span class="saved-meta">' + esc(g.meta(x)) + '</span>' : '') + '</div>'
        + '<button type="button" class="btn-unsave" onclick="scRemoveSaved(\'' + g.type + '\',\'' + escJs(x.id) + '\')">' + esc(t('saved.remove', 'Remove')) + '</button></div>';
    }).join('') + '</div>';
  }).join('');
  root.innerHTML = html || '<p class="org-empty">' + esc(t('saved.empty', 'Nothing saved yet. Open an event, a place, an article or a job and press Save.')) + '</p>';
}

async function scRemoveSaved(type, id) {
  var r = await _sb.from('saved_items').delete().eq('item_type', type).eq('item_id', id);
  if (r.error) { scNotify(t('saved.error', 'Could not save. Please try again.')); return; }
  if (_savedKeys) _savedKeys.delete(type + ':' + id);
  var row = document.getElementById('saved-' + type + '-' + id);
  if (row) row.remove();
  document.querySelectorAll('#saved-root .saved-group').forEach(function (g) { if (!g.querySelector('.saved-row')) g.remove(); });
  if (!document.querySelector('#saved-root .saved-row')) renderSaved();
}
