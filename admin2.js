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
