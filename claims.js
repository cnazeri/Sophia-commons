// Sophia Commons: organizations claim and manage their own listing.
// Members ask to manage a listing (listing_claims, reviewed in Admin > Claims). Once approved
// (directory_entries.claimed_by), they can update the listing's public details via owner_update_listing().
// Uses globals from sophia_commons_v9.js: _sb, sbReady, signedIn, isAdmin, esc, escUrl, t, openModal, showDetail.

var _claimEntry = null;

function _myUserId() { return (window._supabaseUser && window._supabaseUser.id) || null; }

function _domainOf(u) {
  return String(u || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[\/?#]/)[0];
}

// Sidebar box on a listing page
function claimBoxHtml(d) {
  _claimEntry = d;
  var mine = d.claimed_by && d.claimed_by === _myUserId();
  if (mine) {
    return '<div class="claim-box mine"><strong>' + esc(t('claim.you_manage', 'You manage this listing')) + '</strong>'
      + '<button type="button" class="claim-btn" onclick="openListingEditor()">' + esc(t('claim.edit', 'Edit listing details')) + '</button></div>';
  }
  if (d.claimed_by) {
    return '<div class="claim-box managed">&#10003; ' + esc(t('claim.managed', 'Managed by the organization')) + '</div>';
  }
  return '<div class="claim-box"><strong>' + esc(t('claim.question', 'Is this your organization?')) + '</strong>'
    + '<p>' + esc(t('claim.pitch', 'Claim this listing to keep its details up to date. It is free.')) + '</p>'
    + '<button type="button" class="claim-btn" onclick="openClaimForm()">' + esc(t('claim.claim', 'Claim this listing')) + '</button></div>';
}

// "Find us on Sophia Commons" badge: a ready-made link from the organization's own website back to
// its listing (a backlink for search engines, a referral for visitors). Light and dark images in /img.
function _badgeCode(d, dark) {
  var url = 'https://sophiacommons.org' + (typeof _listingPath === 'function' ? _listingPath(d) : '/listing/' + d.id);
  return '<a href="' + url + '" title="' + esc(d.organization_name) + ' on Sophia Commons">'
    + '<img src="https://sophiacommons.org/img/badge-listed' + (dark ? '-dark' : '') + '.svg" alt="Find us on Sophia Commons" width="200" height="56"></a>';
}
function badgeBoxHtml(d) {
  var code = function (dark) {
    return '<label class="badge-opt"><img src="/img/badge-listed' + (dark ? '-dark' : '') + '.svg" alt="" width="160" height="45" loading="lazy">'
      + '<textarea readonly rows="3" onfocus="this.select()">' + esc(_badgeCode(d, dark)) + '</textarea></label>'
      + '<button type="button" class="claim-btn badge-copy" onclick="copyBadgeCode(this)">' + esc(t('badge.copy', 'Copy code')) + '</button>';
  };
  return '<details class="badge-box"><summary>' + esc(t('badge.summary', 'Add a badge to your website')) + '</summary>'
    + '<p>' + esc(t('badge.pitch', 'Paste this code into your website so visitors can find your listing here. Free, no sign-up.')) + '</p>'
    + code(false) + code(true) + '</details>';
}
function copyBadgeCode(btn) {
  var ta = btn.previousElementSibling.querySelector('textarea');
  var done = function () { btn.textContent = t('badge.copied', 'Copied'); setTimeout(function () { btn.textContent = t('badge.copy', 'Copy code'); }, 2000); };
  if (navigator.clipboard) navigator.clipboard.writeText(ta.value).then(done, function () { ta.select(); });
  else { ta.select(); document.execCommand('copy'); done(); }
}

function _claimModal(inner) {
  var m = document.getElementById('claim-modal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'claim-modal';
    m.className = 'claim-modal';
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-modal', 'true');
    m.addEventListener('click', function(e) { if (e.target === m) closeClaimModal(); });
    document.body.appendChild(m);
  }
  m.innerHTML = '<div class="claim-card"><button type="button" class="claim-x" aria-label="Close" onclick="closeClaimModal()">&times;</button>' + inner + '</div>';
  m.classList.add('open');
  var first = m.querySelector('input, textarea');
  if (first) first.focus();
}
function closeClaimModal() { var m = document.getElementById('claim-modal'); if (m) m.classList.remove('open'); }

function openClaimForm() {
  if (!signedIn) { openModal(); return; }
  var d = _claimEntry;
  if (!d) return;
  _claimModal('<h3>' + esc(t('claim.title', 'Claim this listing')) + '</h3>'
    + '<p class="claim-sub">' + esc(d.organization_name) + '</p>'
    + '<form onsubmit="submitClaim(event)">'
    + '<label for="cl-name">' + esc(t('claim.f_name', 'Your name')) + '</label><input id="cl-name" maxlength="120" required>'
    + '<label for="cl-role">' + esc(t('claim.f_role', 'Your role there (for example director, teacher, farmer)')) + '</label><input id="cl-role" maxlength="120" required>'
    + '<label for="cl-email">' + esc(t('claim.f_email', 'Work email')) + '</label><input id="cl-email" type="email" maxlength="200" required>'
    + '<div class="claim-hint">' + esc(t('claim.f_email_hint', 'An address at the organization\'s own website domain is approved fastest.')) + '</div>'
    + '<label for="cl-phone">' + esc(t('claim.f_phone', 'Phone (optional)')) + '</label><input id="cl-phone" maxlength="40">'
    + '<label for="cl-msg">' + esc(t('claim.f_msg', 'Anything we should know? (optional)')) + '</label><textarea id="cl-msg" rows="3" maxlength="1500"></textarea>'
    + '<button type="submit" class="claim-btn">' + esc(t('claim.send', 'Send request')) + '</button>'
    + '<div id="cl-status" class="claim-hint" role="status"></div></form>');
}

async function submitClaim(ev) {
  ev.preventDefault();
  var g = function(id) { return (document.getElementById(id).value || '').trim(); };
  var st = document.getElementById('cl-status');
  var row = { entry_id: _claimEntry.id, contact_name: g('cl-name'), role: g('cl-role'), work_email: g('cl-email'),
              phone: g('cl-phone') || null, message: g('cl-msg') || null };
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(row.work_email)) { st.textContent = t('claim.err_email', 'Please check the email address.'); return; }
  st.textContent = t('common.saving', 'Saving...');
  var r = await _sb.from('listing_claims').insert(row);
  if (r.error) {
    st.textContent = /duplicate|unique/i.test(r.error.message)
      ? t('claim.err_dup', 'You already have a request waiting for this listing.')
      : t('claim.err_save', 'Could not send: ') + r.error.message;
    return;
  }
  st.textContent = t('claim.sent', 'Thank you. We will review your request and email you, usually within 48 hours.');
  ev.target.querySelector('button[type=submit]').disabled = true;
}

function openListingEditor() {
  var d = _claimEntry;
  if (!d) return;
  var f = function(id, label, val, type) {
    return '<label for="' + id + '">' + esc(label) + '</label><input id="' + id + '"' + (type ? ' type="' + type + '"' : '') + ' value="' + esc(val || '') + '">';
  };
  _claimModal('<h3>' + esc(t('claim.edit', 'Edit listing details')) + '</h3><p class="claim-sub">' + esc(d.organization_name) + '</p>'
    + '<form onsubmit="saveListingEdits(event)">'
    + '<label for="le-desc">' + esc(t('claim.f_desc', 'Description')) + '</label><textarea id="le-desc" rows="5" maxlength="3000">' + esc(d.description || '') + '</textarea>'
    + f('le-web', t('claim.f_web', 'Website'), d.website_url, 'url')
    + f('le-email', t('claim.f_pubemail', 'Public email'), d.email, 'email')
    + f('le-phone', t('claim.f_pubphone', 'Phone'), d.phone)
    + f('le-addr', t('claim.f_addr', 'Street address'), d.address)
    + f('le-city', t('claim.f_city', 'City'), d.city || d.location)
    + f('le-tags', t('claim.f_tags', 'Topics, separated by commas'), (d.tags || []).join(', '))
    + '<div class="claim-hint">' + esc(t('claim.edit_hint', 'Name, category and pictures are changed by the editor: email hello@sophiacommons.org.')) + '</div>'
    + '<button type="submit" class="claim-btn">' + esc(t('claim.save', 'Save changes')) + '</button>'
    + '<div id="le-status" class="claim-hint" role="status"></div></form>');
}

async function saveListingEdits(ev) {
  ev.preventDefault();
  var d = _claimEntry, g = function(id) { return (document.getElementById(id).value || '').trim(); };
  var st = document.getElementById('le-status');
  var web = g('le-web');
  if (web && !/^https?:\/\//i.test(web)) web = 'https://' + web;
  var fields = { description: g('le-desc'), website_url: web, email: g('le-email'), phone: g('le-phone'),
                 address: g('le-addr'), city: g('le-city'), location: g('le-city'),
                 tags: g('le-tags').split(',').map(function(x) { return x.trim(); }).filter(Boolean) };
  st.textContent = t('common.saving', 'Saving...');
  var r = await _sb.rpc('owner_update_listing', { entry: d.id, fields: fields });
  if (r.error) { st.textContent = t('claim.err_save', 'Could not save: ') + r.error.message; return; }
  st.textContent = t('claim.saved', 'Saved. Thank you for keeping your listing up to date.');
  setTimeout(function() { closeClaimModal(); showDetail('directory', d.id, true); }, 900);
}

// ── Admin: Claims tab ──
async function loadAdminClaims() {
  var el = document.getElementById('admin-claims-list');
  if (!el || !isAdmin()) return;
  el.textContent = 'Loading...';
  var r = await _sb.from('listing_claims')
    .select('id, entry_id, contact_name, role, work_email, phone, message, status, created_at, directory_entries(organization_name, website_url, email)')
    .order('created_at', { ascending: false }).limit(100);
  if (r.error) { el.textContent = 'Error: ' + r.error.message; return; }
  var rows = r.data || [];
  if (!rows.length) { el.innerHTML = '<div class="admin-empty">No claim requests yet.</div>'; return; }
  el.innerHTML = rows.map(function(c) {
    var d = c.directory_entries || {};
    var emailDom = _domainOf(c.work_email.split('@')[1]);
    var match = emailDom && (emailDom === _domainOf(d.website_url) || (d.email && _domainOf(d.email.split('@')[1]) === emailDom));
    return '<div class="lrow" style="display:block;" id="cl-' + c.id + '">'
      + '<span class="ltag">' + esc(c.status) + '</span> '
      + '<a class="ltitle" href="/listing/' + esc(c.entry_id) + '" onclick="showDetail(\'directory\',\'' + esc(c.entry_id) + '\');return false;">' + esc(d.organization_name || 'listing') + '</a>'
      + '<div class="lmeta" style="display:block;margin-top:4px;">' + esc(c.contact_name) + ', ' + esc(c.role) + ' &middot; <a href="mailto:' + esc(c.work_email) + '">' + esc(c.work_email) + '</a>'
      + (c.phone ? ' &middot; ' + esc(c.phone) : '') + ' &middot; ' + esc(new Date(c.created_at).toLocaleDateString()) + '</div>'
      + '<div class="claim-hint">' + (match ? '&#10003; Email matches the listing\'s website or email domain' : 'Email domain does not match the listing (' + esc(_domainOf(d.website_url) || 'no website') + '): check before approving') + '</div>'
      + (c.message ? '<div class="claim-hint">"' + esc(c.message) + '"</div>' : '')
      + (c.status === 'pending' ? '<div style="margin-top:6px;display:flex;gap:8px;"><button class="btn-sm" onclick="adminDecideClaim(\'' + c.id + '\',true)">Approve</button><button class="btn-sm" onclick="adminDecideClaim(\'' + c.id + '\',false)">Reject</button></div>' : '')
      + '</div>';
  }).join('');
}

async function adminDecideClaim(id, approve) {
  if (!isAdmin()) return;
  var r = await _sb.rpc('admin_decide_claim', { claim_id: id, approve: approve });
  if (r.error) { scNotify('Error: ' + r.error.message); return; }
  loadAdminClaims();
}

// ── Claim by private link: /claim/<token> (owner, 2026-11-04) ──
// The invite email goes to the listing's own email address, so opening the link and signing in is the
// proof: the listing is theirs at once (claim_listing_with_token). The token waits in localStorage
// while they sign in or confirm a new account, then the box opens again.
var CLAIM_TOKEN_KEY = 'sc_claim_token';
function _claimTokenSaved(v) {
  try { if (v === undefined) return localStorage.getItem(CLAIM_TOKEN_KEY) || ''; if (v) localStorage.setItem(CLAIM_TOKEN_KEY, v); else localStorage.removeItem(CLAIM_TOKEN_KEY); } catch (e) {}
  return '';
}

async function openClaimLink(token) {
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(token || '')) { showSec('directory', true); return; }
  _claimTokenSaved(token);
  showSec('directory', true);
  try { history.replaceState(null, '', '/directory'); } catch (e) {}
  for (var i = 0; i < 25 && !sbReady(); i++) await new Promise(function (res) { setTimeout(res, 200); });   // the client may still be starting
  if (!sbReady()) { _claimModal('<p>' + esc(t('claim.link_offline', 'The site is busy right now. Please open the link again in a moment.')) + '</p>'); return; }
  var r = await _sb.rpc('claim_token_info', { p_token: token });
  var info = r.data && r.data[0];
  if (r.error || !info) { _claimTokenSaved(null); _claimModal('<h3>' + esc(t('claim.link_bad', 'This claim link is not valid')) + '</h3><p>' + esc(t('claim.link_bad_help', 'Please open the listing and use "Claim this listing", or email hello@sophiacommons.org.')) + '</p>'); return; }
  if (info.state !== 'ok') {
    _claimTokenSaved(null);
    var why = { used: t('claim.link_used', 'This claim link has already been used.'), expired: t('claim.link_expired', 'This claim link has expired.'),
      claimed: t('claim.link_claimed', 'This listing is already managed.') }[info.state] || '';
    _claimModal('<h3>' + esc(info.organization_name) + '</h3><p>' + esc(why) + '</p>' + _claimViewBtn(info.entry_id));
    return;
  }
  _claimLinkBox(info);
}

function _claimViewBtn(id) {
  return '<button type="button" class="claim-btn" onclick="closeClaimModal();showDetail(\'directory\',\'' + esc(id) + '\')">' + esc(t('claim.view_listing', 'View the listing')) + '</button>';
}

function _claimLinkBox(info) {
  var body = signedIn
    ? '<p>' + esc(t('claim.link_ready', 'Confirm and you can update the description, website, contact details and topics yourself, and post events for your group.')) + '</p>'
      + '<button type="button" class="claim-btn" onclick="confirmClaimLink()">' + esc(t('claim.link_confirm', 'Yes, I manage this listing')) + '</button>'
    : '<p>' + esc(t('claim.link_signin', 'Sign in, or create a free account, to manage this listing. It takes a minute, and this box opens again afterwards.')) + '</p>'
      + '<button type="button" class="claim-btn" onclick="closeClaimModal();openModal()">' + esc(t('claim.link_signin_btn', 'Sign in or create an account')) + '</button>';
  _claimModal('<h3>' + esc(t('claim.link_title', 'Manage your listing')) + '</h3><p class="claim-sub">' + esc(info.organization_name) + '</p>'
    + body + '<div id="cl-status" class="claim-hint" role="status"></div>');
}

async function confirmClaimLink() {
  var token = _claimTokenSaved(), st = document.getElementById('cl-status');
  if (!token) return;
  if (st) st.textContent = t('common.saving', 'Saving...');
  var r = await _sb.rpc('claim_listing_with_token', { p_token: token });
  if (r.error) { if (st) st.textContent = r.error.message; return; }
  _claimTokenSaved(null);
  _claimModal('<h3>' + esc(t('claim.link_done', 'Done: you now manage this listing')) + '</h3>'
    + '<p>' + esc(t('claim.link_done_help', 'Check the details and fix anything that is out of date. You can come back any time: the listing page has an "Edit listing details" button for you.')) + '</p>'
    + _claimViewBtn(r.data));
}

// Called after sign-in (from sophia_commons_v9.js): reopen a claim link that was waiting
function claimAuthChanged() {
  var token = _claimTokenSaved();
  if (!token || !signedIn || !sbReady()) return;
  _sb.rpc('claim_token_info', { p_token: token }).then(function (r) {
    var info = r.data && r.data[0];
    if (info && info.state === 'ok') _claimLinkBox(info); else _claimTokenSaved(null);
  });
}
