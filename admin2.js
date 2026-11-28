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
