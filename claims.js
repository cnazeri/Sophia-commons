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
