// Sophia Commons: organizers create, edit and share their own events (owner, 2026-11-01, Phase A).
//   /events/new          create an event (or ?edit=<id>, ?copy=<id>, ?listing=<directory id>)
//   /my-events           the member's events with status, sign-up counts and actions
//   event pages          sharing kit (copy links, email, WhatsApp, QR code as PNG)
//   listing pages        "Upcoming events" box (listed events linked to that listing)
// Saving goes through the event-save edge function (validation, status, picture upload).
// Uses globals from sophia_commons_v9.js and sb-init.js: _sb, sbReady, signedIn, isAdmin, esc, escUrl, escJs,
// t, localDate, showSec, showDetail, openModal, scNotify, SUPABASE_URL, SUPABASE_ANON_KEY.

var ORG_SITE = 'https://sophiacommons.org';
var ORG_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
var ORG_IMAGE_MAX_SIDE = 1600;
var ORG_QR_SRC = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
var ORG_QR_SRI = 'sha384-8FWZA6BGMXhsfO+BLtrJK0We6gg5o1JyO8xQm6peWDEUs17ACA5ziE/NIAkl9z2k';
var ORG_EVENT_TYPES = ['workshop', 'conference', 'study_group', 'festival', 'retreat', 'first_class', 'other'];
var ORG_ZONES = ['Pacific/Honolulu', 'America/Anchorage', 'America/Los_Angeles', 'America/Vancouver', 'America/Denver',
  'America/Phoenix', 'America/Chicago', 'America/Mexico_City', 'America/New_York', 'America/Toronto', 'America/Halifax',
  'America/Bogota', 'America/Lima', 'America/Santiago', 'America/Sao_Paulo', 'America/Argentina/Buenos_Aires',
  'Atlantic/Reykjavik', 'UTC', 'Europe/London', 'Europe/Dublin', 'Europe/Lisbon', 'Europe/Madrid', 'Europe/Paris',
  'Europe/Amsterdam', 'Europe/Brussels', 'Europe/Berlin', 'Europe/Zurich', 'Europe/Vienna', 'Europe/Rome', 'Europe/Prague',
  'Europe/Stockholm', 'Europe/Oslo', 'Europe/Copenhagen', 'Europe/Warsaw', 'Europe/Budapest', 'Europe/Athens',
  'Europe/Helsinki', 'Europe/Kyiv', 'Europe/Istanbul', 'Europe/Moscow', 'Africa/Johannesburg', 'Africa/Nairobi',
  'Asia/Jerusalem', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Kathmandu', 'Asia/Bangkok', 'Asia/Singapore', 'Asia/Shanghai',
  'Asia/Taipei', 'Asia/Manila', 'Asia/Seoul', 'Asia/Tokyo', 'Australia/Perth', 'Australia/Adelaide', 'Australia/Brisbane',
  'Australia/Melbourne', 'Australia/Sydney', 'Pacific/Auckland'];

var _evfState = { mode: 'new', id: null, image: null, removeImage: false, copyImageUrl: null, busy: false };
var _orgShareStore = {};

// The calendar keeps upcoming events in localStorage for a day; drop it after a change so it shows at once
function _orgDropEventCache() { try { localStorage.removeItem(typeof _EV_CACHE_KEY !== 'undefined' ? _EV_CACHE_KEY : 'sc_upcoming_events_v1'); } catch (e) {} }

function _orgMe() { return window._supabaseUser || null; }
function _orgZone() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; } }
function _orgZoneOk(z) { try { new Intl.DateTimeFormat('en-US', { timeZone: z }); return true; } catch (e) { return false; } }
function _orgParam(name) { try { return new URLSearchParams(location.search).get(name) || ''; } catch (e) { return ''; } }
function _orgUuid(s) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s || ''); }

// Opens an organizer page with its own query string (?edit=, ?copy=), keeping Back/Forward working
function orgGo(path) {
  var sec = path.indexOf('/my-events') === 0 ? 'my-events' : 'event-new';
  if (location.pathname + location.search !== path) history.pushState({ type: 'section', id: sec }, '', path);
  showSec(sec, true);
}

// The session can arrive after the page was drawn: draw the open organizer page again on sign-in
function organizerAuthChanged() {
  var open = document.querySelector('.pagesec.active');
  if (!open) return;
  if (open.id === 'sec-event-new') renderEventForm();
  if (open.id === 'sec-my-events') renderMyEvents();
}

// Waits for the stored session (sb-init.js restores it asynchronously), then calls back with the user or null
function _orgWithUser(cb) {
  if (_orgMe()) { cb(_orgMe()); return; }
  if (!sbReady()) { cb(null); return; }
  _sb.auth.getSession().then(function (r) {
    var s = r && r.data && r.data.session;
    if (s && s.user) window._supabaseUser = s.user;
    cb(s ? s.user : null);
  }).catch(function () { cb(null); });
}

function _orgGateHtml(text) {
  return '<div class="org-gate"><p>' + esc(text) + '</p>'
    + '<button type="button" class="org-btn" onclick="_orgSignIn()">' + esc(t('topbar.sign_in', 'sign in')) + '</button></div>';
}
function _orgSignIn() {
  openModal();
  var d = document.getElementById('modal-desc');
  if (d) d.textContent = t('org.signin_why', 'Please sign in (free) to create and manage your events.');
}

// ══════════════ CREATE / EDIT PAGE ══════════════

function renderEventForm() {
  var root = document.getElementById('evf-root');
  if (!root) return;
  var editId = _orgParam('edit'), copyId = _orgParam('copy');
  _evfState = { mode: editId ? 'edit' : 'new', id: editId || null, image: null, removeImage: false, copyImageUrl: null, busy: false };
  root.innerHTML = '<p class="org-empty">' + esc(t('common.loading', 'Loading...')) + '</p>';
  _orgWithUser(function (me) {
    if (!me) { root.innerHTML = _orgGateHtml(t('org.signin_create', 'Sign in to create an event page for your group. It is free.')); return; }
    var srcId = editId || copyId;
    if (srcId && !_orgUuid(srcId)) { root.innerHTML = '<p class="org-empty">' + esc(t('org.not_found', 'This event could not be found.')) + '</p>'; return; }
    Promise.all([_orgMyListings(me.id), srcId ? _orgLoadEvent(srcId) : Promise.resolve(null)]).then(function (res) {
      var listings = res[0], ev = res[1];
      if (srcId && !ev) { root.innerHTML = '<p class="org-empty">' + esc(t('org.not_found', 'This event could not be found.')) + '</p>'; return; }
      if (editId && ev.user_id !== me.id && !isAdmin()) { root.innerHTML = '<p class="org-empty">' + esc(t('org.not_yours', 'You can only edit your own events.')) + '</p>'; return; }
      root.innerHTML = _evfHtml(listings, !!editId);
      _evfFill(ev, !!copyId, listings);
    });
  });
}

function _orgMyListings(uid) {
  if (!sbReady()) return Promise.resolve([]);
  return _sb.from('directory_entries').select('id, organization_name, website_url').eq('claimed_by', uid).order('organization_name').limit(50)
    .then(function (r) { return r.error ? [] : (r.data || []); }, function () { return []; });
}

function _orgLoadEvent(id) {
  return _sb.from('events').select('*').eq('id', id).maybeSingle().then(function (r) {
    if (r.data) return r.data;
    return _sb.rpc('get_event', { p_id: id }).then(function (x) { return x && !x.error && x.data && x.data[0] ? x.data[0] : null; }, function () { return null; });
  }, function () { return null; });
}

function _evfField(name, label, input, hint) {
  return '<div class="evf-field" data-f="' + name + '"><label for="evf-' + name + '">' + esc(label) + '</label>' + input
    + (hint ? '<p class="evf-hint">' + esc(hint) + '</p>' : '') + '<p class="evf-err" id="evf-' + name + '-err" role="alert"></p></div>';
}
function _evfInput(name, type, attrs) {
  return '<input id="evf-' + name + '" name="' + name + '" type="' + type + '" aria-describedby="evf-' + name + '-err"' + (attrs || '') + '>';
}

function _evfZoneOptions(selected) {
  var zones = ORG_ZONES.filter(_orgZoneOk);
  if (selected && zones.indexOf(selected) === -1 && _orgZoneOk(selected)) zones.unshift(selected);
  return zones.map(function (z) {
    var off = '';
    try {
      var parts = new Intl.DateTimeFormat('en-US', { timeZone: z, timeZoneName: 'shortOffset' }).formatToParts(new Date());
      off = (parts.filter(function (p) { return p.type === 'timeZoneName'; })[0] || {}).value || '';
    } catch (e) {}
    return '<option value="' + esc(z) + '"' + (z === selected ? ' selected' : '') + '>' + esc(z.replace(/_/g, ' ') + (off ? ' (' + off + ')' : '')) + '</option>';
  }).join('');
}

function _evfTypeOptions() {
  var labels = { workshop: t('org.type_workshop', 'Workshop or course'), conference: t('org.type_conference', 'Conference'),
    study_group: t('org.type_study_group', 'Study group'), festival: t('org.type_festival', 'Festival'),
    retreat: t('org.type_retreat', 'Retreat'), first_class: t('firstclass.tag', 'Blue card admission'), other: t('org.type_other', 'Other') };
  return ORG_EVENT_TYPES.map(function (k) { return '<option value="' + k + '">' + esc(labels[k]) + '</option>'; }).join('');
}

function _evfQuestionHtml(i) {
  return '<div class="evf-q"><input type="text" id="evf-q' + i + '" maxlength="120" aria-label="' + esc(t('signup.q' + i + '_placeholder', 'Question ' + i + ' (optional)')) + '" placeholder="' + esc(t('signup.q' + i + '_placeholder', 'Question ' + i + ' (optional)')) + '">'
    + '<select id="evf-q' + i + 't" aria-label="' + esc(t('org.answer_type', 'Answer type')) + '" onchange="document.getElementById(\'evf-q' + i + 'o\').hidden=this.value!==\'choice\'">'
    + '<option value="yesno">' + esc(t('signup.type_yesno', 'Yes / No')) + '</option><option value="text">' + esc(t('signup.type_text', 'Short answer')) + '</option>'
    + '<option value="choice">' + esc(t('signup.type_choice', 'Choice list')) + '</option></select>'
    + '<input type="text" id="evf-q' + i + 'o" hidden maxlength="300" aria-label="' + esc(t('signup.choices_placeholder', 'Choices, separated by commas')) + '" placeholder="' + esc(t('signup.choices_placeholder', 'Choices, separated by commas')) + '"></div>';
}

function _evfHtml(listings, isEdit) {
  var listingSel = listings.length
    ? _evfField('listing', t('org.f_listing', 'Your listing on Sophia Commons'),
      '<select id="evf-listing" name="listing" onchange="_evfListingChanged()"><option value="">' + esc(t('org.no_listing', 'None')) + '</option>'
      + listings.map(function (l) { return '<option value="' + esc(l.id) + '">' + esc(l.organization_name) + '</option>'; }).join('') + '</select>',
      t('org.listing_hint', 'The event is shown on your listing page, and it is listed on the calendar right away.'))
    : '<p class="evf-hint evf-claim-hint">' + esc(t('org.claim_hint', 'Tip: if your group has a listing on Sophia Commons, claim it (on its page) and your events are listed right away, without waiting for approval.')) + '</p>';
  return '<form class="evf" id="evf" novalidate onsubmit="saveEventForm(event)">'
    + '<h2 class="evf-title">' + esc(isEdit ? t('org.edit_heading', 'Edit your event') : t('org.new_heading', 'Create your event page')) + '</h2>'
    + (isEdit ? '' : '<p class="evf-lead">' + esc(t('org.lead', 'Share it with your people right away. It appears on the public Sophia Commons calendar once it has been approved.')) + '</p>')
    + '<p class="evf-mine"><a href="/my-events" onclick="orgGo(\'/my-events\');return false;">' + esc(t('org.my_events_link_long', 'See all my events')) + ' &rarr;</a></p>'
    + '<fieldset><legend>' + esc(t('org.s_what', 'What')) + '</legend>'
    + _evfField('title', t('org.f_title', 'Event title') + ' *', _evfInput('title', 'text', ' maxlength="200" required'))
    + _evfField('type', t('org.f_type', 'Kind of event'), '<select id="evf-type" name="type">' + _evfTypeOptions() + '</select>')
    + _evfField('description', t('org.f_description', 'Description'), '<textarea id="evf-description" name="description" rows="6" maxlength="5000"></textarea>')
    + _evfField('price', t('org.f_price', 'Price'), _evfInput('price', 'text', ' maxlength="100" placeholder="' + esc(t('org.price_placeholder', 'Free, or for example $30 per family')) + '"'))
    + '</fieldset>'
    + '<fieldset><legend>' + esc(t('org.s_when', 'When')) + '</legend>'
    + '<div class="evf-row">' + _evfField('start_date', t('org.f_start_date', 'Start date') + ' *', _evfInput('start_date', 'date', ' required onchange="_evfRepeatLabels()"'))
    + _evfField('start_time', t('org.f_start_time', 'Start time'), _evfInput('start_time', 'time', '')) + '</div>'
    + '<div class="evf-row">' + _evfField('end_date', t('org.f_end_date', 'End date'), _evfInput('end_date', 'date', ''), t('org.end_date_hint', 'Only if it lasts more than one day.'))
    + _evfField('end_time', t('org.f_end_time', 'End time'), _evfInput('end_time', 'time', '')) + '</div>'
    + '<label class="evf-check"><input type="checkbox" id="evf-allday" onchange="_evfAllDay()"> ' + esc(t('org.f_all_day', 'All day (no set times)')) + '</label>'
    + _evfField('timezone', t('org.f_timezone', 'Time zone'), '<select id="evf-timezone" name="timezone"></select>', t('org.timezone_hint', 'Visitors see the time in their own time zone.'))
    + (isEdit ? '' : '<div class="evf-row">' + _evfField('repeat', t('org.f_repeat', 'Repeat'), '<select id="evf-repeat" onchange="_evfRepeatChanged()"><option value="none">' + esc(t('org.repeat_none', 'Does not repeat')) + '</option>'
      + '<option value="weekly"></option><option value="monthly"></option></select>')
      + _evfField('repeat_count', t('org.f_repeat_count', 'Number of dates'), '<select id="evf-repeat_count">' + [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(function (n) { return '<option>' + n + '</option>'; }).join('') + '</select>') + '</div>')
    + '</fieldset>'
    + '<fieldset><legend>' + esc(t('org.s_where', 'Where')) + '</legend>'
    + '<div class="evf-mode"><label class="evf-check"><input type="radio" name="evf-mode" value="place" checked onchange="_evfMode()"> ' + esc(t('org.in_person', 'In person')) + '</label>'
    + '<label class="evf-check"><input type="radio" name="evf-mode" value="online" onchange="_evfMode()"> ' + esc(t('event_detail.online', 'Online')) + '</label></div>'
    + '<div id="evf-place">' + _evfField('venue', t('org.f_venue', 'Venue'), _evfInput('venue', 'text', ' maxlength="200" placeholder="' + esc(t('org.venue_placeholder', 'For example: Rudolf Steiner House, main hall')) + '"'))
    + _evfField('address', t('org.f_address', 'Street address'), _evfInput('address', 'text', ' maxlength="300" autocomplete="street-address"'))
    + '<div class="evf-row">' + _evfField('city', t('org.f_city', 'City'), _evfInput('city', 'text', ' maxlength="120"'))
    + _evfField('region', t('org.f_region', 'State or region'), _evfInput('region', 'text', ' maxlength="120"')) + '</div>'
    + _evfField('country', t('org.f_country', 'Country'), _evfInput('country', 'text', ' maxlength="120" autocomplete="country-name"')) + '</div>'
    + '<div id="evf-online" hidden>' + _evfField('online_url', t('org.f_online_url', 'Link to join (Zoom, Meet, ...)'), _evfInput('online_url', 'url', ' maxlength="500" placeholder="https://"')) + '</div>'
    + '</fieldset>'
    + '<fieldset><legend>' + esc(t('org.s_who', 'Who and picture')) + '</legend>'
    + listingSel
    + _evfField('organizer', t('org.f_organizer', 'Organizer'), _evfInput('organizer', 'text', ' maxlength="200" autocomplete="organization"'))
    + _evfField('organizer_url', t('org.f_organizer_url', 'Organizer website'), _evfInput('organizer_url', 'url', ' maxlength="500" placeholder="https://"'))
    + _evfField('image', t('org.f_image', 'Picture'), '<input id="evf-image" name="image" type="file" accept="image/jpeg,image/png,image/webp" onchange="_evfImagePicked(this)" aria-describedby="evf-image-err">'
      + '<div id="evf-image-preview" class="evf-image-preview" hidden></div>', t('org.image_hint', 'JPG, PNG or WebP, up to 5 MB. A wide picture works best.'))
    + '</fieldset>'
    + '<fieldset><legend>' + esc(t('org.s_signups', 'Sign-ups')) + '</legend>'
    + '<label class="evf-check"><input type="checkbox" id="evf-signup" onchange="document.getElementById(\'evf-signup-qs\').hidden=!this.checked"> ' + esc(t('signup.collect', 'Collect sign-ups on Sophia Commons')) + '</label>'
    + '<div id="evf-signup-qs" hidden><p class="evf-hint">' + esc(t('signup.collect_hint', 'People sign up with their name, email and number attending. You get an email for each sign-up and see the list on your event page. Add up to 3 questions of your own:')) + '</p>'
    + _evfQuestionHtml(1) + _evfQuestionHtml(2) + _evfQuestionHtml(3)
    + _evfField('capacity', t('signup.capacity', 'Places'), _evfInput('capacity', 'number', ' min="1" max="10000" inputmode="numeric"'),
      t('signup.capacity_hint', 'Leave empty for no limit. When it is full, people can join a waitlist and move up automatically when someone cancels.'))
    + _evfField('close', t('signup.close', 'Sign-ups close'), '<select id="evf-close" name="close">'
      + '<option value="">' + esc(t('signup.close_end', 'When the event ends')) + '</option>'
      + '<option value="0">' + esc(t('signup.close_start', 'When the event starts')) + '</option>'
      + '<option value="24">' + esc(t('signup.close_1d', '1 day before')) + '</option>'
      + '<option value="48">' + esc(t('signup.close_2d', '2 days before')) + '</option>'
      + '<option value="168">' + esc(t('signup.close_1w', '1 week before')) + '</option></select>')
    + '</div>'
    + '</fieldset>'
    + '<button type="submit" class="org-btn evf-submit" id="evf-submit">' + esc(isEdit ? t('org.save', 'Save changes') : t('org.create', 'Create event')) + '</button>'
    + '<p class="evf-status" id="evf-status" role="status"></p>'
    + '</form>';
}

function _evfVal(name) { var el = document.getElementById('evf-' + name); return el ? String(el.value || '').trim() : ''; }
function _evfSet(name, v) { var el = document.getElementById('evf-' + name); if (el && v !== null && v !== undefined) el.value = v; }

// Wall-clock date and time of a UTC timestamp in a time zone: { day: 'YYYY-MM-DD', time: 'HH:MM' }
function _orgInZone(iso, tz) {
  var p = {};
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(iso)).forEach(function (x) { p[x.type] = x.value; });
  } catch (e) { return { day: String(iso).slice(0, 10), time: String(iso).slice(11, 16) }; }
  return { day: p.year + '-' + p.month + '-' + p.day, time: (p.hour === '24' ? '00' : p.hour) + ':' + p.minute };
}

function _evfFill(ev, isCopy, listings) {
  var tz = (ev && ev.timezone) || _orgZone();
  document.getElementById('evf-timezone').innerHTML = _evfZoneOptions(_orgZoneOk(tz) ? tz : 'UTC');
  var pre = _orgParam('listing');
  if (!ev) {
    if (pre && listings.some(function (l) { return l.id === pre; })) { _evfSet('listing', pre); _evfListingChanged(); }
    else if (listings.length === 1) { _evfSet('listing', listings[0].id); _evfListingChanged(); }
    _evfRepeatLabels(); _evfRepeatChanged();
    return;
  }
  _evfSet('title', ev.title); _evfSet('type', ORG_EVENT_TYPES.indexOf(ev.event_type) !== -1 ? ev.event_type : 'other');
  _evfSet('description', ev.description); _evfSet('price', ev.price_text || (ev.ticket_price ? String(ev.ticket_price) : ''));
  if (ev.is_all_day) {
    document.getElementById('evf-allday').checked = true;
    _evfSet('start_date', String(ev.start_date).slice(0, 10));
    if (ev.end_date && String(ev.end_date).slice(0, 10) !== String(ev.start_date).slice(0, 10)) _evfSet('end_date', String(ev.end_date).slice(0, 10));
  } else {
    var s = _orgInZone(ev.start_date, tz);
    _evfSet('start_date', s.day); _evfSet('start_time', s.time);
    if (ev.end_date) {
      var e = _orgInZone(ev.end_date, tz);
      if (e.day !== s.day) _evfSet('end_date', e.day);
      if (!(e.day !== s.day && e.time === '23:59')) _evfSet('end_time', e.time);
    }
  }
  _evfAllDay();
  if (ev.is_online) { document.querySelector('input[name="evf-mode"][value="online"]').checked = true; _evfSet('online_url', ev.online_url); }
  else { _evfSet('venue', ev.location_name === 'Online' ? '' : ev.location_name); _evfSet('address', ev.address); _evfSet('city', ev.city); _evfSet('region', ev.region); _evfSet('country', ev.country); }
  _evfMode();
  if (ev.directory_entry_id && listings.some(function (l) { return l.id === ev.directory_entry_id; })) _evfSet('listing', ev.directory_entry_id);
  _evfSet('organizer', ev.organizer_name); _evfSet('organizer_url', ev.organizer_url);
  if (ev.image_url && /^https:\/\//.test(ev.image_url)) {
    if (isCopy) _evfState.copyImageUrl = ev.image_url;
    _evfShowPreview(ev.image_url);
  }
  if (ev.signup_enabled) {
    document.getElementById('evf-signup').checked = true;
    document.getElementById('evf-signup-qs').hidden = false;
    (Array.isArray(ev.signup_questions) ? ev.signup_questions : []).slice(0, 3).forEach(function (q, i) {
      _evfSet('q' + (i + 1), q.label); _evfSet('q' + (i + 1) + 't', q.type);
      if (q.type === 'choice') { _evfSet('q' + (i + 1) + 'o', (q.options || []).join(', ')); document.getElementById('evf-q' + (i + 1) + 'o').hidden = false; }
    });
    if (ev.signup_capacity) _evfSet('capacity', ev.signup_capacity);
    if (ev.signup_close_hours != null) {
      var sel = document.getElementById('evf-close'), v = String(ev.signup_close_hours);
      // A value set elsewhere (not one of the choices) still shows and is kept
      if (sel && !sel.querySelector('option[value="' + v + '"]')) sel.insertAdjacentHTML('beforeend', '<option value="' + v + '">' + esc(t('signup.close_hours', '{n} hours before').replace('{n}', v)) + '</option>');
      _evfSet('close', v);
    }
  }
  if (document.getElementById('evf-repeat')) { _evfRepeatLabels(); _evfRepeatChanged(); }
}

function _evfAllDay() {
  var on = document.getElementById('evf-allday').checked;
  ['start_time', 'end_time', 'timezone'].forEach(function (n) {
    var f = document.querySelector('.evf-field[data-f="' + n + '"]'); if (f) f.hidden = on;
  });
}
function _evfMode() {
  var online = document.querySelector('input[name="evf-mode"]:checked').value === 'online';
  document.getElementById('evf-place').hidden = online;
  document.getElementById('evf-online').hidden = !online;
}
function _evfListingChanged() {
  var sel = document.getElementById('evf-listing');
  if (!sel || !sel.value || _evfVal('organizer')) return;
  _evfSet('organizer', sel.options[sel.selectedIndex].text);
}

// "Every month on the 2nd Tuesday", from the start date
function _evfRepeatLabels() {
  var sel = document.getElementById('evf-repeat');
  if (!sel) return;
  var d = _evfVal('start_date');
  var weekday = d ? localDate(d, { weekday: 'long' }) : '';
  var nth = d ? Math.ceil(parseInt(d.slice(8, 10), 10) / 7) : 0;
  var nthText = [t('org.nth_1', '1st'), t('org.nth_2', '2nd'), t('org.nth_3', '3rd'), t('org.nth_4', '4th'), t('org.nth_5', 'last')][nth - 1] || '';
  sel.options[1].text = d ? t('org.repeat_weekly_on', 'Every week on {weekday}').replace('{weekday}', weekday) : t('org.repeat_weekly', 'Every week');
  sel.options[2].text = d ? t('org.repeat_monthly_on', 'Every month on the {nth} {weekday}').replace('{nth}', nthText).replace('{weekday}', weekday) : t('org.repeat_monthly', 'Every month (same weekday)');
}
function _evfRepeatChanged() {
  var sel = document.getElementById('evf-repeat'), f = document.querySelector('.evf-field[data-f="repeat_count"]');
  if (sel && f) f.hidden = sel.value === 'none';
}

// ── Picture: checked and shrunk in the browser (longest side 1600 px, JPEG), checked again by event-save ──
function _evfImagePicked(input) {
  _evfErr('image', '');
  var file = input.files && input.files[0];
  _evfState.image = null;
  if (!file) return;
  if (['image/jpeg', 'image/png', 'image/webp'].indexOf(file.type) === -1) { input.value = ''; _evfErr('image', t('org.err_image_type', 'Please choose a JPG, PNG or WebP picture.')); return; }
  if (file.size > ORG_MAX_IMAGE_BYTES) { input.value = ''; _evfErr('image', t('org.err_image_size', 'The picture is larger than 5 MB.')); return; }
  var url = URL.createObjectURL(file), img = new Image();
  img.onload = function () {
    var scale = Math.min(1, ORG_IMAGE_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    var c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);   // transparent PNGs get a white background
    ctx.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    var data = c.toDataURL('image/jpeg', 0.85);
    if (data.length * 0.75 > ORG_MAX_IMAGE_BYTES) { input.value = ''; _evfErr('image', t('org.err_image_size', 'The picture is larger than 5 MB.')); return; }
    _evfState.image = data; _evfState.removeImage = false; _evfState.copyImageUrl = null;
    _evfShowPreview(data);
  };
  img.onerror = function () { URL.revokeObjectURL(url); input.value = ''; _evfErr('image', t('org.err_image_read', 'This picture could not be read. Please try another one.')); };
  img.src = url;
}
function _evfShowPreview(src) {
  var box = document.getElementById('evf-image-preview');
  box.innerHTML = '<img src="' + escUrl(src) + '" alt=""><button type="button" class="org-btn-secondary" onclick="_evfRemoveImage()">' + esc(t('org.remove_image', 'Remove picture')) + '</button>';
  box.hidden = false;
}
function _evfRemoveImage() {
  _evfState.image = null; _evfState.copyImageUrl = null; _evfState.removeImage = true;
  document.getElementById('evf-image').value = '';
  var box = document.getElementById('evf-image-preview'); box.innerHTML = ''; box.hidden = true;
}

function _evfErr(name, msg) {
  var p = document.getElementById('evf-' + name + '-err'), f = document.getElementById('evf-' + name);
  if (p) p.textContent = msg || '';
  if (f) { if (msg) f.setAttribute('aria-invalid', 'true'); else f.removeAttribute('aria-invalid'); }
  return !msg;
}
function _orgUrlOk(v) { return !v || /^(https?:\/\/)?[^\s\/]+\.[^\s]{2,}/i.test(v); }

// Reads and checks the form. Returns { event } or null after showing the messages next to the fields.
function _evfCollect() {
  var errs = [];
  var need = function (name, ok, msg) { if (!_evfErr(name, ok ? '' : msg)) errs.push(name); };
  var allDay = document.getElementById('evf-allday').checked;
  var online = document.querySelector('input[name="evf-mode"]:checked').value === 'online';
  var sd = _evfVal('start_date'), ed = _evfVal('end_date'), st = _evfVal('start_time'), et = _evfVal('end_time');
  need('title', _evfVal('title').length >= 3, t('org.err_title', 'Please give the event a title.'));
  need('start_date', /^\d{4}-\d{2}-\d{2}$/.test(sd), t('org.err_start_date', 'Please give the start date.'));
  need('start_time', allDay || /^\d{2}:\d{2}$/.test(st), t('org.err_start_time', 'Please give the start time, or tick All day.'));
  need('end_date', !ed || ed >= sd, t('org.err_end_date', 'The end date is before the start date.'));
  need('end_time', allDay || !et || (ed && ed > sd) || et > st, t('org.err_end_time', 'The end time is before the start time.'));
  need('online_url', !online || /^https?:\/\/\S+\.\S+/i.test(_evfVal('online_url')), t('org.err_online_url', 'Please give the full link to join, starting with https://'));
  need('city', online || _evfVal('city') || _evfVal('venue'), t('org.err_place', 'Please give the venue or the city.'));
  need('organizer_url', _orgUrlOk(_evfVal('organizer_url')), t('org.err_url', 'Please enter a valid web address, for example https://example.org'));
  var cap = _evfVal('capacity');
  need('capacity', !cap || (/^\d+$/.test(cap) && +cap >= 1 && +cap <= 10000), t('signup.err_capacity', 'Please enter a number of places from 1 to 10000, or leave it empty.'));
  if (errs.length) {
    var first = document.getElementById('evf-' + errs[0]); if (first) first.focus();
    return null;
  }
  var rep = document.getElementById('evf-repeat');
  var signup = document.getElementById('evf-signup').checked;
  return { event: {
    title: _evfVal('title'), event_type: _evfVal('type'), description: _evfVal('description'), price_text: _evfVal('price'),
    start_date: sd, start_time: allDay ? '' : st, end_date: ed, end_time: allDay ? '' : et, is_all_day: allDay,
    timezone: _evfVal('timezone') || _orgZone(),
    repeat: rep ? rep.value : 'none', repeat_count: rep ? parseInt(_evfVal('repeat_count'), 10) : 1,
    is_online: online, online_url: online ? _evfVal('online_url') : '',
    location_name: online ? '' : _evfVal('venue'), address: online ? '' : _evfVal('address'), city: online ? '' : _evfVal('city'),
    region: online ? '' : _evfVal('region'), country: online ? '' : _evfVal('country'),
    directory_entry_id: _evfVal('listing'), organizer_name: _evfVal('organizer'), organizer_url: _evfVal('organizer_url'),
    signup_enabled: signup,
    signup_questions: signup ? [1, 2, 3].map(function (i) {
      return { label: _evfVal('q' + i), type: _evfVal('q' + i + 't'), options: _evfVal('q' + i + 'o').split(',').map(function (o) { return o.trim(); }).filter(Boolean) };
    }).filter(function (q) { return q.label; }) : [],
    signup_capacity: signup ? _evfVal('capacity') : '',
    signup_close_hours: signup ? _evfVal('close') : ''
  } };
}

async function saveEventForm(e) {
  e.preventDefault();
  if (_evfState.busy) return;
  var status = document.getElementById('evf-status'), btn = document.getElementById('evf-submit');
  var data = _evfCollect();
  if (!data) { status.textContent = t('org.err_check', 'Please check the fields marked above.'); return; }
  var sess = sbReady() ? (await _sb.auth.getSession()).data.session : null;
  if (!sess) { _orgSignIn(); return; }
  var body = { event: data.event };
  if (_evfState.mode === 'edit') body.id = _evfState.id;
  if (_evfState.image) body.image = _evfState.image;
  else if (_evfState.copyImageUrl) body.copy_image_url = _evfState.copyImageUrl;
  if (_evfState.removeImage) body.remove_image = true;
  _evfState.busy = true; btn.disabled = true; status.textContent = t('org.saving', 'Saving...');
  try {
    var r = await fetch(SUPABASE_URL + '/functions/v1/event-save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + sess.access_token },
      body: JSON.stringify(body)
    });
    var out = await r.json().catch(function () { return {}; });
    if (r.status === 404) throw new Error(t('org.err_not_ready', 'Creating events is not switched on yet. Please try again later.'));
    if (!r.ok || !out.ok) throw new Error(out.error || out.msg || t('org.err_save', 'The event could not be saved. Please try again.'));
    _evfDone(out, data.event);
  } catch (err) {
    status.textContent = (err && err.message && !/Failed to fetch|NetworkError|Load failed/i.test(err.message)) ? err.message : t('org.err_save', 'The event could not be saved. Please try again.');
  } finally {
    _evfState.busy = false; btn.disabled = false;
  }
}

// After saving: what happens next, and the sharing kit for the (first) event
function _evfDone(out, ev) {
  var list = out.events || [], first = list[0];
  if (!first) return;
  _orgDropEventCache();
  var root = document.getElementById('evf-root'), edited = _evfState.mode === 'edit';
  var when = out.status === 'pending'
    ? t('org.done_pending', 'Share the link with your group now. It will appear on the public calendar once Sophia Commons approves it.')
    : t('org.done_listed', 'It is listed on the public Sophia Commons calendar.');
  var kitEv = { id: first.id, title: ev.title, start_date: first.start_date, is_all_day: ev.is_all_day, status: out.status,
    signup_enabled: !!first.signup, end_date: null };
  root.innerHTML = '<div class="evf-done"><h2 class="evf-title">' + esc(edited ? t('org.done_saved', 'Your changes are saved') : t('org.done_heading', 'Your event page is ready')) + '</h2>'
    + '<p>' + esc(when) + '</p>'
    + (list.length > 1 ? '<p>' + esc(t('org.done_dates', '{n} dates were created:').replace('{n}', list.length)) + '</p><ul class="evf-dates">'
      + list.map(function (x) { return '<li><a href="/event/' + esc(x.id) + '" onclick="showDetail(\'event\',\'' + escJs(x.id) + '\');return false;">' + esc(_orgWhen({ start_date: x.start_date, is_all_day: ev.is_all_day })) + '</a></li>'; }).join('') + '</ul>' : '')
    + '<div class="evf-done-actions"><a class="org-btn" href="/event/' + esc(first.id) + '" onclick="showDetail(\'event\',\'' + escJs(first.id) + '\');return false;">' + esc(t('org.view_page', 'View the event page')) + '</a>'
    + '<a class="org-btn-secondary" href="/my-events" onclick="orgGo(\'/my-events\');return false;">' + esc(t('org.label_mine', 'My events')) + '</a>'
    + '<a class="org-btn-secondary" href="/events/new" onclick="orgGo(\'/events/new\');return false;">' + esc(t('org.create_another', 'Create another event')) + '</a></div>'
    + '<div id="evf-share"></div></div>';
  _renderShareKit(document.getElementById('evf-share'), kitEv);
  window.scrollTo(0, 0);
}

function _orgWhen(ev) {
  var o = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
  if (ev.is_all_day) return localDate(String(ev.start_date).slice(0, 10), o);
  return localDate(ev.start_date, o) + ', ' + new Date(ev.start_date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ══════════════ MY EVENTS ══════════════

function renderMyEvents() {
  var root = document.getElementById('myev-root');
  if (!root) return;
  root.innerHTML = '<p class="org-empty">' + esc(t('common.loading', 'Loading...')) + '</p>';
  _orgWithUser(function (me) {
    if (!me) { root.innerHTML = _orgGateHtml(t('org.signin_mine', 'Sign in to see and manage the events you have created.')); return; }
    _sb.from('events').select('id, title, start_date, end_date, is_all_day, status, signup_enabled, series_id, is_online, city, country')
      .eq('user_id', me.id).order('start_date', { ascending: true }).limit(300)
      .then(function (r) {
        if (r.error) { root.innerHTML = '<p class="org-empty">' + esc(t('org.err_load', 'Your events could not be loaded. Please try again.')) + '</p>'; return; }
        _myEventsDraw(root, r.data || []);
      }, function () { root.innerHTML = '<p class="org-empty">' + esc(t('org.err_load', 'Your events could not be loaded. Please try again.')) + '</p>'; });
  });
}

function _orgIsOver(ev) { return new Date(ev.end_date || ev.start_date).getTime() < Date.now() - 864e5; }

function _orgStatus(ev) {
  if (ev.status === 'cancelled') return { key: 'cancelled', label: t('org.st_cancelled', 'Cancelled') };
  if (ev.status === 'rejected') return { key: 'rejected', label: t('org.st_rejected', 'Not approved') };
  if (ev.status === 'past' || _orgIsOver(ev)) return { key: 'past', label: t('org.st_past', 'Past') };
  if (ev.status === 'pending') return { key: 'pending', label: t('org.st_pending', 'Awaiting approval') };
  return { key: 'listed', label: t('org.st_listed', 'Listed') };
}

function _myEventsDraw(root, rows) {
  var head = '<div class="myev-head"><p>' + esc(t('org.mine_lead', 'Events you have created. Awaiting approval means the page works by its link but is not on the public calendar yet.')) + '</p>'
    + '<a class="org-btn" href="/events/new" onclick="orgGo(\'/events/new\');return false;">+ ' + esc(t('org.create', 'Create event')) + '</a></div>';
  if (!rows.length) { root.innerHTML = head + '<p class="org-empty">' + esc(t('org.mine_none', 'You have not created any events yet.')) + '</p>'; return; }
  var current = rows.filter(function (e) { var k = _orgStatus(e).key; return k === 'listed' || k === 'pending'; });
  var other = rows.filter(function (e) { return current.indexOf(e) === -1; }).reverse();
  var block = function (title, list) {
    return list.length ? '<h3 class="myev-h">' + esc(title) + ' (' + list.length + ')</h3><ul class="myev-list">' + list.map(_myEventItem).join('') + '</ul>' : '';
  };
  root.innerHTML = head + block(t('org.mine_upcoming', 'Coming up'), current) + block(t('org.mine_past', 'Past and cancelled'), other);
  current.filter(function (e) { return e.signup_enabled; }).forEach(function (e) {
    _sb.rpc('event_signup_count', { p_event: e.id }).then(function (r) {
      var c = document.getElementById('myev-c-' + e.id);
      if (c && r && !r.error) c.textContent = t('signup.count', '{n} signed up').replace('{n}', r.data || 0);
    });
  });
}

function _myEventItem(ev) {
  var st = _orgStatus(ev), id = escJs(ev.id);
  _orgShareStore[ev.id] = ev;
  var place = ev.is_online ? t('event_detail.online', 'Online') : [ev.city, ev.country].filter(Boolean).join(', ');
  var live = st.key === 'listed' || st.key === 'pending';
  return '<li class="myev-item"><div class="myev-main">'
    + '<span class="myev-status st-' + st.key + '">' + esc(st.label) + '</span>'
    + '<a class="myev-title" href="/event/' + esc(ev.id) + '" onclick="showDetail(\'event\',\'' + id + '\');return false;">' + esc(ev.title) + '</a>'
    + '<span class="myev-meta">' + esc(_orgWhen(ev)) + (place ? ' &middot; ' + esc(place) : '') + (ev.series_id ? ' &middot; ' + esc(t('org.repeating', 'repeating')) : '')
    + (ev.signup_enabled ? ' &middot; <span id="myev-c-' + esc(ev.id) + '">' + esc(t('org.signups_on', 'sign-ups on')) + '</span>' : '') + '</span></div>'
    + '<div class="myev-actions">'
    + '<a href="/event/' + esc(ev.id) + '" onclick="showDetail(\'event\',\'' + id + '\');return false;">' + esc(t('org.a_view', 'View')) + '</a>'
    + '<a href="/events/new?edit=' + esc(ev.id) + '" onclick="orgGo(\'/events/new?edit=' + id + '\');return false;">' + esc(t('org.a_edit', 'Edit')) + '</a>'
    + '<a href="/events/new?copy=' + esc(ev.id) + '" onclick="orgGo(\'/events/new?copy=' + id + '\');return false;">' + esc(t('org.a_copy', 'Copy as new')) + '</a>'
    + (live ? '<button type="button" onclick="_myEventShare(\'' + id + '\', this)" aria-expanded="false">' + esc(t('org.a_share', 'Share')) + '</button>'
      + '<button type="button" class="myev-cancel" onclick="cancelMyEvent(\'' + id + '\')">' + esc(t('org.a_cancel', 'Cancel event')) + '</button>' : '')
    + '</div><div class="myev-share" id="myev-s-' + esc(ev.id) + '" hidden></div></li>';
}

function _myEventShare(id, btn) {
  var box = document.getElementById('myev-s-' + id);
  if (!box) return;
  var open = box.hidden;
  box.hidden = !open; btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open && !box.innerHTML) _renderShareKit(box, _orgShareStore[id]);
}

// Owners may set their own event to 'cancelled' directly (RLS "events: owner update" allows pending/cancelled)
async function cancelMyEvent(id) {
  var ev = _orgShareStore[id];
  if (!ev || !confirm(t('org.cancel_confirm', 'Cancel "{title}"? It will be taken off the calendar and its page will say it is cancelled.').replace('{title}', ev.title))) return;
  var r = await _sb.from('events').update({ status: 'cancelled' }).eq('id', id).select('id');
  if (r.error || !r.data || !r.data.length) { scNotify(t('org.cancel_failed', 'The event could not be cancelled. Please try again.')); return; }
  _orgDropEventCache();
  scNotify(t('org.cancelled', 'The event is cancelled.'));
  renderMyEvents();
}

// ══════════════ SHARING KIT ══════════════

// On every event page (called from showDetail after renderEventDetail)
function initEventShareKit(ev) {
  var box = document.getElementById('ev-share');
  if (!box || ev.status === 'cancelled' || ev.status === 'rejected') return;
  _renderShareKit(box, ev);
}

function _orgSignupOpen(ev) {
  return ev.signup_enabled && ['pending', 'upcoming', 'ongoing'].indexOf(ev.status) !== -1 && !_orgIsOver(ev);
}

function _renderShareKit(box, ev) {
  if (!box || !ev) return;
  _orgShareStore[ev.id] = ev;
  var id = escJs(ev.id), page = ORG_SITE + '/event/' + ev.id, signup = _orgSignupOpen(ev) ? ORG_SITE + '/signup/' + ev.id : '';
  var msg = ev.title + ' (' + _orgWhen(ev) + ')\n' + (signup ? t('org.share_signup_line', 'Sign up here:') + ' ' + signup : page);
  var qrFor = signup || page;
  box.innerHTML = '<div class="ev-share"><h3>' + esc(t('org.share_heading', 'Share this event')) + '</h3>'
    + '<div class="ev-share-btns">'
    + '<button type="button" onclick="_orgCopy(\'' + escJs(page) + '\', this)">' + esc(t('org.copy_event', 'Copy event link')) + '</button>'
    + (signup ? '<button type="button" onclick="_orgCopy(\'' + escJs(signup) + '\', this)">' + esc(t('org.copy_signup', 'Copy sign-up link')) + '</button>' : '')
    + '<a href="mailto:?subject=' + encodeURIComponent(ev.title) + '&amp;body=' + encodeURIComponent(msg) + '">' + esc(t('org.share_email', 'Email')) + '</a>'
    + '<a href="https://wa.me/?text=' + encodeURIComponent(msg) + '" target="_blank" rel="noopener">WhatsApp</a>'
    + '</div>'
    + '<div class="ev-qr"><canvas id="qr-' + esc(ev.id) + '" width="220" height="220" role="img" aria-label="' + esc(t('org.qr_aria', 'QR code for the link')) + '"></canvas>'
    + '<div><p class="ev-qr-note">' + esc(signup ? t('org.qr_signup', 'QR code for the sign-up page. Print it on a flyer or poster.') : t('org.qr_event', 'QR code for the event page. Print it on a flyer or poster.')) + '</p>'
    + '<button type="button" onclick="_orgQrDownload(\'' + id + '\')">' + esc(t('org.qr_download', 'Download QR code (PNG)')) + '</button></div></div>'
    + '<p class="ev-share-msg" role="status" id="share-msg-' + esc(ev.id) + '"></p></div>';
  _orgDrawQr('qr-' + ev.id, qrFor);
}

function _orgCopy(text, btn) {
  var done = function () {
    var old = btn.textContent; btn.textContent = t('org.copied', 'Copied');
    setTimeout(function () { btn.textContent = old; }, 1800);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, function () { _orgCopyFallback(text) && done(); });
  } else if (_orgCopyFallback(text)) done();
}
function _orgCopyFallback(text) {
  var ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  var ok = false;
  try { ok = document.execCommand('copy'); } catch (e) {}
  ta.remove();
  if (!ok) prompt(t('org.copy_prompt', 'Copy this link:'), text);
  return ok;
}

// QR library (qrcode-generator, pinned version with integrity check), loaded only when a sharing kit is shown
var _orgQrLoading = null;
function _orgLoadQr() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  if (_orgQrLoading) return _orgQrLoading;
  _orgQrLoading = new Promise(function (resolve, reject) {
    var s = document.createElement('script');
    s.src = ORG_QR_SRC; s.integrity = ORG_QR_SRI; s.crossOrigin = 'anonymous'; s.async = true;
    s.onload = function () { window.qrcode ? resolve(window.qrcode) : reject(new Error('qr')); };
    s.onerror = function () { _orgQrLoading = null; reject(new Error('qr')); };
    document.head.appendChild(s);
  });
  return _orgQrLoading;
}

var ORG_QR_PRINT_PX = 1024;   // the downloaded PNG is big enough for a poster
function _orgDrawQr(canvasId, text) {
  _orgLoadQr().then(function (qrcode) {
    var c = document.getElementById(canvasId);
    if (!c) return;
    var qr = qrcode(0, 'M'); qr.addData(text); qr.make();
    var n = qr.getModuleCount(), quiet = 4, cell = Math.floor(ORG_QR_PRINT_PX / (n + 2 * quiet));
    c.width = c.height = cell * (n + 2 * quiet);
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#000000';
    for (var r = 0; r < n; r++) for (var k = 0; k < n; k++) if (qr.isDark(r, k)) ctx.fillRect((k + quiet) * cell, (r + quiet) * cell, cell, cell);
    c.setAttribute('data-ready', '1');
  }).catch(function () {
    var c = document.getElementById(canvasId);
    if (c && c.parentNode) c.parentNode.innerHTML = '<p class="ev-qr-note">' + esc(t('org.qr_failed', 'The QR code could not be made right now.')) + '</p>';
  });
}

function _orgQrDownload(id) {
  var c = document.getElementById('qr-' + id), ev = _orgShareStore[id] || {};
  if (!c || !c.getAttribute('data-ready')) return;
  var a = document.createElement('a');
  a.href = c.toDataURL('image/png');
  a.download = 'QR ' + String(ev.title || 'event').replace(/[^\w\- ]+/g, '').trim().slice(0, 50) + '.png';
  document.body.appendChild(a); a.click(); a.remove();
}

// ══════════════ LISTING PAGE: UPCOMING EVENTS ══════════════

// Listed events linked to this listing. Before the migration (no directory_entry_id column) the query
// fails and the box stays empty, so listing pages look as they did.
function loadListingEvents(d) {
  var box = document.getElementById('listing-events');
  if (!box || !d || !sbReady()) return;
  var since = new Date(Date.now() - 864e5).toISOString();
  var mine = d.claimed_by && _orgMe() && d.claimed_by === _orgMe().id;
  _sb.from('events').select('id, title, start_date, end_date, is_all_day, is_online, city, country')
    .eq('directory_entry_id', d.id).in('status', ['upcoming', 'ongoing']).gte('start_date', since)
    .order('start_date', { ascending: true }).limit(10)
    .then(function (r) {
      if (r.error) return;
      var rows = r.data || [];
      if (!rows.length && !mine) return;
      box.innerHTML = '<div class="listing-events"><h3>' + esc(t('org.listing_events', 'Upcoming events')) + '</h3>'
        + (rows.length ? '<ul>' + rows.map(function (ev) {
          var place = ev.is_online ? t('event_detail.online', 'Online') : [ev.city, ev.country].filter(Boolean).join(', ');
          return '<li><a href="/event/' + esc(ev.id) + '" onclick="showDetail(\'event\',\'' + escJs(ev.id) + '\');return false;">' + esc(ev.title) + '</a>'
            + '<span class="lmeta">' + esc(_orgWhen(ev)) + (place ? ' &middot; ' + esc(place) : '') + '</span></li>';
        }).join('') + '</ul>' : '<p class="lmeta">' + esc(t('org.listing_none', 'No upcoming events yet.')) + '</p>')
        + (mine ? '<a class="org-btn-secondary" href="/events/new?listing=' + esc(d.id) + '" onclick="orgGo(\'/events/new?listing=' + escJs(d.id) + '\');return false;">+ ' + esc(t('org.add_for_listing', 'Add an event')) + '</a>' : '')
        + '</div>';
    }, function () {});
}
