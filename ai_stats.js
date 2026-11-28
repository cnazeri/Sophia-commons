// AI app usage page for admins (owner, 2026-11-25): /admin/ai-app. Reads ai_app_calls, which only admins can
// read (row level security, public.is_admin()). Uses the member's existing sign-in from the main site.
(function () {
  'use strict';
  var SB_URL = 'https://bnrvgitzbpocratvszgk.supabase.co';
  var SB_KEY = 'sb_publishable_Quj2NdNaaDKJOe4UT5Y5nw_1Sog2yjI';   // public key, same as sb-init.js
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var sb;

  function count(rows, key) {
    var m = {};
    rows.forEach(function (r) { var k = typeof key === 'function' ? key(r) : r[key]; m[k] = (m[k] || 0) + 1; });
    return Object.keys(m).map(function (k) { return [k, m[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
  }
  function table(title, head, rows) {
    if (!rows.length) return '';
    return '<h2>' + esc(title) + '</h2><table class="ai-table"><thead><tr>' + head.map(function (h, i) {
      return '<th' + (i ? ' class="n"' : '') + '>' + esc(h) + '</th>';
    }).join('') + '</tr></thead><tbody>' + rows.map(function (r) {
      return '<tr>' + r.map(function (c, i) { return '<td' + (i ? ' class="n"' : ' class="ai-args"') + '>' + esc(c) + '</td>'; }).join('') + '</tr>';
    }).join('') + '</tbody></table>';
  }
  // The search words of one call, for the "what people ask" list
  function asked(r) {
    try {
      var a = JSON.parse(r.args || '{}');
      return [a.query, a.category, a.city, a.country, a.ga && 'GA ' + a.ga, a.year, a.date].filter(Boolean).join(' / ') || '(no words)';
    } catch (e) { return r.args || ''; }
  }

  async function load() {
    var days = +$('ai-days').value || 30;
    var since = new Date(Date.now() - days * 864e5).toISOString();
    $('ai-status').textContent = 'Loading...';
    var rows = [], from = 0;
    while (true) {
      var r = await sb.from('ai_app_calls').select('created_at, tool, source, args, result_count, ms, error')
        .gte('created_at', since).order('created_at', { ascending: false }).range(from, from + 999);
      if (r.error) {
        $('ai-status').textContent = /does not exist|schema cache/i.test(r.error.message)
          ? 'The usage table is not set up yet. Run backend/migrations/RUN_THIS_2026-11-25_ai_app_calls.sql in the Supabase SQL editor.'
          : 'Could not load the log: ' + r.error.message;
        return;
      }
      rows = rows.concat(r.data || []);
      if (!r.data || r.data.length < 1000 || rows.length >= 20000) break;
      from += 1000;
    }
    if (!rows.length) { $('ai-status').textContent = 'No calls in this period yet.'; $('ai-out').innerHTML = ''; return; }
    var errors = rows.filter(function (r) { return r.error; }).length;
    var empty = rows.filter(function (r) { return !r.error && !r.result_count; }).length;
    var avgMs = Math.round(rows.reduce(function (n, r) { return n + (r.ms || 0); }, 0) / rows.length);
    var bySource = count(rows, 'source');
    var cards = [[rows.length, 'calls'], [bySource.filter(function (s) { return s[0] === 'chatgpt'; }).map(function (s) { return s[1]; })[0] || 0, 'from ChatGPT'],
      [bySource.filter(function (s) { return s[0] === 'claude'; }).map(function (s) { return s[1]; })[0] || 0, 'from Claude'],
      [empty, 'found nothing'], [errors, 'errors'], [avgMs + ' ms', 'average time']];
    $('ai-out').innerHTML = '<div class="ai-cards">' + cards.map(function (c) { return '<div class="ai-card"><b>' + esc(c[0]) + '</b><span>' + esc(c[1]) + '</span></div>'; }).join('') + '</div>'
      + table('By tool', ['Tool', 'Calls'], count(rows, 'tool'))
      + table('By assistant', ['Assistant', 'Calls'], bySource)
      + table('Most asked', ['Search', 'Times'], count(rows, asked).slice(0, 40))
      + table('Asked but found nothing (gaps to fill)', ['Search', 'Times'], count(rows.filter(function (r) { return !r.error && !r.result_count; }), asked).slice(0, 25))
      + table('By day', ['Day', 'Calls'], count(rows, function (r) { return r.created_at.slice(0, 10); }).sort(function (a, b) { return a[0] < b[0] ? 1 : -1; }));
    $('ai-status').textContent = rows.length.toLocaleString() + ' calls in the last ' + days + ' days.';
  }

  document.addEventListener('DOMContentLoaded', async function () {
    if (!window.supabase) { $('ai-status').textContent = 'Could not load the sign-in library. Reload the page.'; return; }
    sb = window.supabase.createClient(SB_URL, SB_KEY);
    var s = await sb.auth.getSession();
    var user = s.data && s.data.session && s.data.session.user;
    if (!user) { $('ai-status').innerHTML = 'Please <a href="/">sign in on Sophia Commons</a> with an admin account, then come back to this page.'; return; }
    if (!user.app_metadata || user.app_metadata.role !== 'admin') { $('ai-status').textContent = 'This page is for Sophia Commons admins.'; return; }
    $('ai-days').addEventListener('change', load);
    load();
  });
})();
