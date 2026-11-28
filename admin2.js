// Admin, redesign (owner, 2026-11-25: "update the admin dashboard"). The tabs are grouped in a side menu
// (index.html); this draws the date line and the "Waiting for you" overview from the pending counts that
// checkAdminPendingCounts (sophia_commons_v9.js) puts on each tab. Uses globals: ADMIN_PENDING,
// checkAdminPendingCounts, adminSwitchTab, esc, localDate.

function adm2Label(btn) {
  return Array.prototype.filter.call(btn.childNodes, function (n) { return n.nodeType === 3; })
    .map(function (n) { return n.textContent; }).join('').trim();
}

function adm2DrawOverview() {
  var box = document.getElementById('adm2-overview');
  if (!box || typeof ADMIN_PENDING === 'undefined') return;
  var items = ADMIN_PENDING.map(function (p) {
    var btn = document.querySelector('.admin-tab[onclick*="\'' + p.tab + '\'"]');
    if (!btn) return null;
    var badge = btn.querySelector('.admin-pending-badge');
    return { tab: p.tab, label: adm2Label(btn), count: badge ? badge.textContent : '0' };
  }).filter(Boolean);
  var waiting = items.filter(function (i) { return i.count !== '0'; });
  var head = '<div class="adm2-ohead"><h2>Waiting for you</h2><button type="button" class="adm-btn" onclick="checkAdminPendingCounts()">Refresh</button></div>';
  if (!waiting.length) { box.innerHTML = head + '<div class="adm2-done">All caught up. Nothing is waiting for review.</div>'; return; }
  box.innerHTML = head + '<div class="adm2-cards">' + waiting.map(function (i) {
    return '<button type="button" class="adm2-card" onclick="adminSwitchTab(\'' + i.tab + '\')">'
      + '<b>' + esc(i.count) + '</b><span>' + esc(i.label) + '</span></button>';
  }).join('') + '</div>';
}

function adm2DrawDate() {
  var el = document.getElementById('adm2-date');
  if (el && typeof localDate === 'function') el.textContent = localDate(new Date().toISOString(), { weekday: 'long', month: 'long', day: 'numeric' });
}

// Redraw the overview every time the counts refresh (opening Admin, after each approve or decline)
(function () {
  if (typeof window.checkAdminPendingCounts !== 'function') return;
  var orig = window.checkAdminPendingCounts;
  window.checkAdminPendingCounts = async function () {
    var out = await orig.apply(this, arguments);
    try { adm2DrawDate(); adm2DrawOverview(); } catch (e) { console.warn('Admin overview failed:', e); }
    return out;
  };
})();

// ── Admin > AI apps (MCP) (owner, 2026-11-27: "track users from the MCP directory") ──
// Reads ai_app_calls (one row per tool call from ChatGPT, Claude or another MCP client; admins only). The log holds
// no account or IP address, so it counts uses, not people. Full detail: /admin/ai-app.
var ADM_AI_DAYS = 30, ADM_AI_PAGE = 1000, ADM_AI_MAX_PAGES = 10;
var ADM_AI_SOURCE = { claude: 'Claude', chatgpt: 'ChatGPT', mcp: 'Other MCP apps' };

async function admAiLoad(days) {
  var since = new Date(Date.now() - days * 864e5).toISOString(), rows = [];
  for (var p = 0; p < ADM_AI_MAX_PAGES; p++) {
    var r = await _sb.from('ai_app_calls').select('created_at, tool, source, args, result_count, error')
      .gte('created_at', since).order('created_at', { ascending: false }).range(p * ADM_AI_PAGE, (p + 1) * ADM_AI_PAGE - 1);
    if (r.error) throw r.error;
    rows = rows.concat(r.data || []);
    if (!r.data || r.data.length < ADM_AI_PAGE) break;
  }
  return rows;
}
function admAiCount(rows, fn) {
  var m = {};
  rows.forEach(function (r) { var k = fn(r); if (k) m[k] = (m[k] || 0) + 1; });
  return Object.keys(m).map(function (k) { return [k, m[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
}
function admAiAsked(r) {
  try { var a = JSON.parse(r.args || '{}'); return [a.query, a.category, a.city, a.country].filter(Boolean).join(' / '); }
  catch (e) { return r.args || ''; }
}
function admAiList(title, rows, max) {
  if (!rows.length) return '';
  return '<div class="adm-ai-card"><h4>' + esc(title) + '</h4>' + rows.slice(0, max || 10).map(function (x) {
    return '<div class="adm-ai-row"><span>' + esc(x[0]) + '</span><b>' + x[1].toLocaleString() + '</b></div>'; }).join('') + '</div>';
}
async function loadAdminAiApp(days) {
  var box = document.getElementById('admin-aiapp-box'); if (!box || !sbReady()) return;
  days = days || ADM_AI_DAYS;
  box.innerHTML = '<div class="admin-empty">Loading...</div>';
  try {
    var rows = await admAiLoad(days);
    var by = admAiCount(rows, function (r) { return ADM_AI_SOURCE[r.source] || r.source; });
    var perDay = admAiCount(rows, function (r) { return r.created_at.slice(0, 10); }).sort(function (a, b) { return a[0] < b[0] ? -1 : 1; });
    var top = Math.max.apply(null, perDay.map(function (d) { return d[1]; }).concat([1]));
    var errors = rows.filter(function (r) { return r.error; }).length;
    var chips = [7, 30, 90].map(function (d) { return '<button type="button" class="admin-filter-btn' + (d === days ? ' active' : '') + '" onclick="loadAdminAiApp(' + d + ')">' + d + ' days</button>'; }).join('');
    box.innerHTML = '<p class="adm-ai-note">Every time Claude, ChatGPT or another AI assistant uses Sophia Commons through the MCP app. The log keeps no names or addresses, so these are uses, not people. <a href="/admin/ai-app">Full details</a></p>'
      + '<div class="adm-ai-chips">' + chips + '</div>'
      + '<div class="adm-ai-stats">' + [[rows.length, 'uses'], [perDay.length, 'days with use'], [(by.find(function (x) { return x[0] === 'Claude'; }) || [0, 0])[1], 'from Claude'],
          [(by.find(function (x) { return x[0] === 'ChatGPT'; }) || [0, 0])[1], 'from ChatGPT'], [errors, 'errors']].map(function (s) {
          return '<div><b>' + Number(s[0]).toLocaleString() + '</b><span>' + s[1] + '</span></div>'; }).join('') + '</div>'
      + (perDay.length ? '<div class="adm-ai-card"><h4>Uses per day</h4><div class="adm-ai-bars">' + perDay.map(function (d) {
          return '<span title="' + esc(d[0] + ': ' + d[1]) + '" style="height:' + Math.max(4, Math.round(d[1] / top * 100)) + '%"></span>'; }).join('') + '</div></div>' : '')
      + '<div class="adm-ai-grid">' + admAiList('By assistant', by) + admAiList('Tools used', admAiCount(rows, function (r) { return r.tool; }))
      + admAiList('What people asked', admAiCount(rows, admAiAsked), 12) + '</div>'
      + (rows.length ? '' : '<div class="admin-empty">No uses in the last ' + days + ' days yet. They appear here once the app is listed in the Claude and ChatGPT directories.</div>');
  } catch (e) {
    box.innerHTML = '<div class="admin-empty">Could not load the AI app log: ' + esc(e.message || String(e)) + '</div>';
  }
}
(function () {
  var _sw = window.adminSwitchTab;
  if (typeof _sw === 'function') window.adminSwitchTab = function (tab) { var r = _sw.apply(this, arguments); if (tab === 'aiapp') loadAdminAiApp(); return r; };
})();

// ── New listings: review cards after the admin mockup (owner, 2026-11-28) ──
// Each card shows the picture, place, when it came in, a category picker (fixes listings landing in the wrong or
// raw category) and Approve, Edit and Decline. Approve uses the picked category and any edits.
var ADM_CATS = [['waldorf', 'Waldorf schools and education'], ['biodynamic', 'Biodynamic farms'], ['christian_community', 'The Christian Community'],
  ['camphill', 'Camphill and curative education'], ['societies', 'Societies and branches'], ['eurythmy', 'Eurythmy and arts'],
  ['medicine', 'Anthroposophic medicine'], ['eldercare', 'Eldercare'], ['science', 'Science and research'], ['online', 'Online resources'],
  ['social_media', 'Social media'], ['community', 'Other community initiatives']];
function admCatOptions(sel) {
  var known = ADM_CATS.some(function (c) { return c[0] === sel; });
  return (known ? '' : '<option value="" selected disabled>Pick a category</option>') + ADM_CATS.map(function (c) {
    return '<option value="' + c[0] + '"' + (c[0] === sel ? ' selected' : '') + '>' + esc(c[1]) + '</option>'; }).join('');
}
function admAgo(iso) {
  if (!iso) return '';
  var h = Math.round((Date.now() - new Date(iso).getTime()) / 36e5);
  return h < 1 ? 'just now' : h < 24 ? h + (h === 1 ? ' hour' : ' hours') + ' ago' : Math.round(h / 24) === 1 ? 'yesterday' : Math.round(h / 24) + ' days ago';
}
window.loadAdminListings = async function () {
  var el = document.getElementById('admin-listings-list');
  if (!el || !sbReady()) return;
  try {
    var r = await _sb.from('listings_pending').select('*').or('status.is.null,status.eq.pending').order('submitted_at', { ascending: false });
    if (r.error) throw r.error;
    if (!r.data || !r.data.length) { el.innerHTML = '<div class="admin-empty">' + esc(t('admin.no_pending_listings', 'No new listings waiting.')) + '</div>'; return; }
    el.innerHTML = r.data.map(function (d) {
      var slug = _categorySlug(d.category), id = escJs(d.id);
      var pic = d.photo_url ? '<div class="adm-lpic" style="background-image:url(\'' + escUrl(String(d.photo_url).replace(/#.*$/, '')) + '\')"></div>' : '<div class="adm-lpic adm-lpic-none" aria-hidden="true"></div>';
      return '<div class="admin-card adm-litem" id="admin-listing-' + esc(d.id) + '">' + pic + '<div class="adm-lbody">'
        + '<div class="adm-lwhen">Sent ' + esc(admAgo(d.submitted_at || d.created_at)) + (d.source ? ' &middot; ' + esc(d.source) : '') + (d.contact_email ? ' &middot; ' + esc(d.contact_email) : '') + '</div>'
        + '<h4 class="adm-lname" data-f="name">' + esc(d.name || '') + '</h4>'
        + '<div class="adm-lplace" data-f="location">' + esc(d.location || '') + '</div>'
        + (d.url ? '<div class="adm-lurl" data-f="url"><a href="' + escUrl(d.url) + '" target="_blank" rel="noopener">' + esc(d.url) + '</a></div>' : '<div class="adm-lurl" data-f="url"></div>')
        + '<p class="adm-ldesc" data-f="description">' + esc(d.description || '') + '</p>'
        + '<label class="adm-lcat">Category <select id="adm-cat-' + esc(d.id) + '">' + admCatOptions(slug) + '</select>'
        + (d.category ? ' <span class="adm-lsent">sent as "' + esc(d.category) + '"</span>' : '') + '</label></div>'
        + '<div class="adm-lact"><button class="admin-btn-approve" onclick="adminApproveListing(\'' + id + '\')">Approve</button>'
        + '<button class="adm-btn" onclick="admEditListing(\'' + id + '\', this)">Edit</button>'
        + '<button class="admin-btn-reject" onclick="adminRejectListing(\'' + id + '\')">Decline</button></div></div>';
    }).join('');
  } catch (e) { el.innerHTML = '<div class="admin-empty">Error: ' + esc(e.message || String(e)) + '</div>'; }
};
// Edit turns the name, place, website and description into fields; Approve then uses what is in them
function admEditListing(id, btn) {
  var card = document.getElementById('admin-listing-' + id); if (!card) return;
  card.querySelectorAll('[data-f]').forEach(function (f) {
    if (f.querySelector('input, textarea')) return;
    var v = f.getAttribute('data-f') === 'url' ? (f.textContent || '').trim() : f.textContent;
    var tag = f.getAttribute('data-f') === 'description' ? 'textarea' : 'input';
    f.innerHTML = '<' + tag + ' class="adm-lfield" aria-label="' + esc(f.getAttribute('data-f')) + '"' + (tag === 'input' ? ' value="' + esc(v) + '">' : ' rows="4">' + esc(v) + '</textarea>');
  });
  btn.disabled = true;
}
function admFieldValue(card, name) {
  var f = card.querySelector('[data-f="' + name + '"]'); if (!f) return null;
  var input = f.querySelector('input, textarea');
  return input ? input.value.trim() : null;
}
window.adminApproveListing = async function (id) {
  if (!sbReady()) return;
  var card = document.getElementById('admin-listing-' + id);
  var sel = document.getElementById('adm-cat-' + id);
  if (sel && !sel.value) { scNotify('Pick a category first.'); sel.focus(); return; }
  try {
    var r = await _sb.from('listings_pending').select('*').eq('id', id).single();
    if (r.error || !r.data) { scNotify(t('error.could_not_find_listing', 'Could not find this listing.')); return; }
    var d = r.data, edit = function (k, orig) { var v = card ? admFieldValue(card, k) : null; return v === null ? orig : (v || null); };
    var entry = {
      organization_name: edit('name', d.name), category: sel ? sel.value : _categorySlug(d.category),
      location: edit('location', d.location || null), website_url: edit('url', d.url || null), description: edit('description', d.description || null),
      email: d.contact_email || null, status: 'approved', user_id: window._supabaseUser ? window._supabaseUser.id : null
    };
    if (d.photo_url) entry.photo_url = d.photo_url;
    var pin = await _geocodePlace(entry.location, entry.category);
    if (pin) { entry.latitude = pin.lat; entry.longitude = pin.lng; }
    var ins = await _sb.from('directory_entries').insert(entry).select('id').single();
    if (ins.error) { scNotify('Error adding to directory: ' + ins.error.message); return; }
    var upd = await _sb.from('listings_pending').update({ status: 'approved', directory_entry_id: ins.data ? ins.data.id : null }).eq('id', id);
    if (upd.error) scNotify('Added to the directory, but the queue was not updated: ' + upd.error.message);
    else scNotify('Approved: "' + entry.organization_name + '" is in the directory.');
    if (card) card.remove();
    if (!document.querySelector('#admin-listings-list .admin-card')) loadAdminListings();
    checkAdminPendingCounts();
  } catch (e) { scNotify('Error: ' + (e.message || e)); }
};

// ── "This week" numbers under Waiting for you (owner, 2026-11-28, from the admin mockup) ──
async function admCount(table, build) {
  try { var r = await build(_sb.from(table).select('*', { count: 'exact', head: true })); return r.error ? null : r.count; } catch (e) { return null; }
}
async function adm2DrawWeek() {
  var box = document.getElementById('adm2-overview'); if (!box || !sbReady()) return;
  var week = new Date(Date.now() - 7 * 864e5).toISOString();
  var vals = await Promise.all([
    admCount('directory_entries', function (q) { return q.eq('status', 'approved').gte('created_at', week); }),
    admCount('events', function (q) { return q.gte('created_at', week).neq('status', 'cancelled'); }),
    admCount('newsletter_subscribers', function (q) { return q; }),
    admCount('newsletter_subscribers', function (q) { return q.gte('created_at', week); }),
    admCount('board_posts', function (q) { return q.gte('created_at', week); }),
    admCount('ai_app_calls', function (q) { return q.gte('created_at', week); })]);
  var stats = [[vals[0], 'places added'], [vals[1], 'events added'], [vals[2], 'newsletter readers', vals[3]], [vals[4], 'board posts'], [vals[5], 'AI app uses']]
    .filter(function (s) { return s[0] !== null; });
  var old = document.getElementById('adm2-week'); if (old) old.remove();
  if (!stats.length) return;
  box.insertAdjacentHTML('beforeend', '<div id="adm2-week"><div class="adm2-ohead"><h2>This week</h2></div><div class="adm2-week">' + stats.map(function (s) {
    return '<div><b>' + Number(s[0]).toLocaleString() + '</b><span>' + s[1] + '</span>' + (s[2] ? '<em>+' + Number(s[2]).toLocaleString() + ' this week</em>' : '') + '</div>'; }).join('') + '</div></div>');
}
(function () {
  var orig = window.adm2DrawOverview;
  window.adm2DrawOverview = function () { orig.apply(this, arguments); adm2DrawWeek(); };
})();
