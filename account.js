// Account settings at /account (owner, 2026-11-01): change your password, and see everything you have
// posted (your events and your directory listings, with their status). A password-reset email link signs
// the person in and lands here with "Choose a new password" (sb-init.js flags the PASSWORD_RECOVERY event).
// Reads go through RLS: "directory: owner read all" (user_id) and events "owner reads own rows" (user_id).

function _accEsc(s) { return typeof esc === 'function' ? esc(s) : String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function _accDate(iso) { return iso ? localDate(iso, { month: 'short', day: 'numeric', year: 'numeric' }) : ''; }

function _accWithUser(cb) {
  if (window._supabaseUser) { cb(window._supabaseUser); return; }
  if (!sbReady()) { cb(null); return; }
  _sb.auth.getSession().then(function (r) {
    var s = r && r.data && r.data.session;
    if (s && s.user) window._supabaseUser = s.user;
    cb(s && s.user ? s.user : null);
  }).catch(function () { cb(null); });
}

function renderAccount() {
  var root = document.getElementById('acc-root');
  if (!root) return;
  _accWithUser(function (user) {
    if (!user) {
      root.innerHTML = '<p class="org-empty">' + _accEsc(t('acc.sign_in_first', 'Please sign in to see your account.')) + '</p>'
        + '<button type="button" class="org-btn" onclick="openModal()">' + _accEsc(t('topbar.sign_in', 'sign in')) + '</button>';
      return;
    }
    var recovery = !!window._scRecovery;
    root.innerHTML =
      '<section class="acc-card"><h3>' + _accEsc(t('acc.h_account', 'Your account')) + '</h3>'
      + '<p class="acc-line">' + _accEsc(t('acc.email', 'Email')) + ': <b>' + _accEsc(user.email || '') + '</b></p>'
      + '<p class="acc-line">' + _accEsc(t('acc.since', 'Member since')) + ' ' + _accEsc(_accDate(user.created_at)) + '</p></section>'
      + '<section class="acc-card" id="acc-pw"><h3>' + _accEsc(recovery ? t('acc.h_new_pw', 'Choose a new password') : t('acc.h_pw', 'Change password')) + '</h3>'
      + '<form onsubmit="saveAccountPassword(event)" novalidate>'
      + '<label for="acc-pw1">' + _accEsc(t('acc.pw_new', 'New password (at least 8 characters)')) + '</label>'
      + '<input type="password" id="acc-pw1" autocomplete="new-password" minlength="8" maxlength="72" required>'
      + '<label for="acc-pw2">' + _accEsc(t('acc.pw_again', 'New password again')) + '</label>'
      + '<input type="password" id="acc-pw2" autocomplete="new-password" minlength="8" maxlength="72" required>'
      + '<button type="submit" class="org-btn">' + _accEsc(t('acc.pw_save', 'Save new password')) + '</button>'
      + '<p id="acc-pw-msg" class="acc-msg" role="status"></p></form></section>'
      + '<section class="acc-card"><div class="acc-head"><h3>' + _accEsc(t('acc.h_events', 'My events')) + '</h3>'
      + '<a href="/my-events" onclick="orgGo(\'/my-events\');return false;">' + _accEsc(t('acc.manage_events', 'Manage my events')) + ' &rarr;</a></div>'
      + '<div id="acc-events"><p class="org-empty">' + _accEsc(t('common.loading', 'Loading...')) + '</p></div></section>'
      + '<section class="acc-card"><div class="acc-head"><h3>' + _accEsc(t('acc.h_listings', 'My listings')) + '</h3>'
      + '<a href="#" onclick="showSubmitForm();return false;">+ ' + _accEsc(t('topbar.post_listing_link', 'post a listing')) + '</a></div>'
      + '<div id="acc-listings"><p class="org-empty">' + _accEsc(t('common.loading', 'Loading...')) + '</p></div></section>';
    if (recovery) { var p = document.getElementById('acc-pw1'); if (p) p.focus(); }
    _loadAccountEvents(user.id);
    _loadAccountListings(user.id);
  });
}

var _ACC_EVENT_STATUS = { pending: ['Awaiting approval', 'org.st_pending'], upcoming: ['Listed', 'org.st_listed'], ongoing: ['Listed', 'org.st_listed'],
  past: ['Past', 'org.st_past'], cancelled: ['Cancelled', 'org.st_cancelled'], rejected: ['Not listed', 'acc.st_rejected'] };
var _ACC_LISTING_STATUS = { approved: ['Listed', 'org.st_listed'], pending: ['Awaiting approval', 'org.st_pending'], rejected: ['Not listed', 'acc.st_rejected'] };
function _accPill(map, st) { var x = map[st] || [st, '']; return '<span class="acc-pill acc-' + _accEsc(st) + '">' + _accEsc(x[1] ? t(x[1], x[0]) : x[0]) + '</span>'; }

function _loadAccountEvents(uid) {
  var el = document.getElementById('acc-events');
  _sb.from('events').select('id, title, start_date, status').eq('user_id', uid).order('start_date', { ascending: false }).limit(100)
    .then(function (r) {
      if (!el) return;
      if (r.error) { el.innerHTML = '<p class="org-empty">' + _accEsc(t('acc.load_error', 'Could not load this. Please try again.')) + '</p>'; return; }
      var rows = r.data || [];
      el.innerHTML = rows.length ? '<ul class="acc-list">' + rows.map(function (e) {
        return '<li><a href="/event/' + _accEsc(e.id) + '" onclick="showDetail(\'event\',\'' + _accEsc(e.id) + '\');return false;">' + _accEsc(e.title) + '</a>'
          + '<span class="acc-meta">' + _accEsc(_accDate(e.start_date)) + '</span>' + _accPill(_ACC_EVENT_STATUS, e.status) + '</li>';
      }).join('') + '</ul>'
        : '<p class="org-empty">' + _accEsc(t('acc.no_events', 'You have not created any events yet.')) + ' <a href="/events/new" onclick="showEventForm();return false;">' + _accEsc(t('topbar.create_event_link', 'create an event')) + '</a></p>';
    });
}

function _loadAccountListings(uid) {
  var el = document.getElementById('acc-listings');
  _sb.from('directory_entries').select('id, organization_name, category, city, status, created_at, user_id, claimed_by')
    .or('user_id.eq.' + uid + ',claimed_by.eq.' + uid).order('created_at', { ascending: false }).limit(100)
    .then(function (r) {
      if (!el) return;
      if (r.error) { el.innerHTML = '<p class="org-empty">' + _accEsc(t('acc.load_error', 'Could not load this. Please try again.')) + '</p>'; return; }
      var rows = r.data || [];
      el.innerHTML = rows.length ? '<ul class="acc-list">' + rows.map(function (d) {
        var how = d.claimed_by === uid && d.user_id !== uid ? t('acc.claimed', 'claimed') : t('acc.posted', 'posted');
        return '<li><a href="/listing/' + _accEsc(d.id) + '" onclick="showDetail(\'directory\',\'' + _accEsc(d.id) + '\');return false;">' + _accEsc(d.organization_name) + '</a>'
          + '<span class="acc-meta">' + _accEsc([d.category, d.city].filter(Boolean).join(', ')) + ' &middot; ' + _accEsc(how) + ' ' + _accEsc(_accDate(d.created_at)) + '</span>'
          + _accPill(_ACC_LISTING_STATUS, d.status) + '</li>';
      }).join('') + '</ul>'
        : '<p class="org-empty">' + _accEsc(t('acc.no_listings', 'You have not posted or claimed any listings yet.')) + '</p>';
    });
}

function saveAccountPassword(e) {
  e.preventDefault();
  var a = document.getElementById('acc-pw1').value, b = document.getElementById('acc-pw2').value;
  var msg = document.getElementById('acc-pw-msg'), btn = e.target.querySelector('button[type=submit]');
  msg.className = 'acc-msg acc-msg-err';
  if (a.length < 8) { msg.textContent = t('acc.pw_short', 'Please use at least 8 characters.'); return; }
  if (a !== b) { msg.textContent = t('acc.pw_mismatch', 'The two passwords are not the same.'); return; }
  btn.disabled = true; msg.className = 'acc-msg'; msg.textContent = t('acc.saving', 'Saving...');
  _sb.auth.updateUser({ password: a }).then(function (r) {
    btn.disabled = false;
    if (r.error) {
      msg.className = 'acc-msg acc-msg-err';
      msg.textContent = /same|different/i.test(r.error.message) ? t('acc.pw_same', 'That is your current password. Please choose a new one.')
        : t('acc.pw_error', 'Could not save the password:') + ' ' + r.error.message;
      return;
    }
    window._scRecovery = false;
    e.target.reset();
    msg.className = 'acc-msg acc-msg-ok';
    msg.textContent = t('acc.pw_saved', 'Your new password is saved.');
  });
}

// The password-reset link signs the person in; send them here to choose the new password
function _accOpenRecovery() {
  window._scRecovery = true;
  if (location.pathname !== '/account') history.pushState({ type: 'section', id: 'account' }, '', '/account');
  showSec('account', true);
}
window.addEventListener('sc-password-recovery', _accOpenRecovery);
if (window._scRecovery) _accOpenRecovery();
