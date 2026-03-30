// ══════════════════════════════════════════
//  SOPHIA COMMONS v9 - Frontend Application
//  Backend: Supabase (see /backend/README.md)
// ══════════════════════════════════════════

let signedIn = false, username = '';
let previousSection = 'home';
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function sbReady() { return typeof _sb !== 'undefined' && _sb !== null; }

function captureCurrentSection(excludeId) {
  var activeSec = document.querySelector('.pagesec.active');
  if (activeSec && activeSec.id !== 'sec-' + excludeId) {
    previousSection = activeSec.id.replace('sec-', '');
  }
}

// ══════════════════════════════════════════
//  DETAIL VIEW SYSTEM
//  Rich individual pages for every listing,
//  event, news article, and directory entry.
// ══════════════════════════════════════════

function goBack() {
  showSec(previousSection || 'home');
}

// Show a detail page by type and Supabase ID
async function showDetail(type, id, skipPush) {
  captureCurrentSection('detail');

  var container = document.getElementById('detail-content');
  container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">' + t('detail.loading') + '</div>';
  showSec('detail', true);

  // Push SEO-friendly detail URL
  if (!skipPush) {
    var detailPaths = { directory: '/listing/', event: '/event/', news: '/article/', listing: '/classified/' };
    var prefix = detailPaths[type];
    if (prefix) {
      var path = prefix + id;
      if (window.location.pathname !== path) {
        history.pushState({ type: 'detail', detailType: type, detailId: id }, '', path);
      }
    }
  }

  if (!sbReady()) {
    container.innerHTML = renderOfflineDetail(type, id);
    return;
  }

  try {
    if (type === 'directory') {
      var { data, error } = await _sb.from('directory_entries')
        .select('*').eq('id', id).single();
      if (error || !data) { container.innerHTML = renderNotFound(); return; }
      container.innerHTML = renderDirectoryDetail(data);
      updateSEOMeta(data.organization_name + ' | Sophia Commons', (data.description || '').substring(0, 160), '/listing/' + id);
      loadRelatedDirectory(data.category, data.id);
      _trackView('directory', id);
    } else if (type === 'event') {
      var { data, error } = await _sb.from('events')
        .select('*').eq('id', id).single();
      if (error || !data) { container.innerHTML = renderNotFound(); return; }
      container.innerHTML = renderEventDetail(data);
      updateSEOMeta(data.title + ' | Sophia Commons Events', (data.description || '').substring(0, 160), '/event/' + id);
      loadRelatedEvents(data.category_id, data.id);
      _trackView('event', id);
    } else if (type === 'news') {
      var { data, error } = await _sb.from('news')
        .select('*').eq('id', id).single();
      if (error || !data) { container.innerHTML = renderNotFound(); return; }
      container.innerHTML = renderNewsDetail(data);
      updateSEOMeta(data.title + ' | Sophia Commons News', (data.excerpt || data.body || '').substring(0, 160), '/article/' + id);
      _trackView('news', id);
    } else if (type === 'listing') {
      var { data, error } = await _sb.from('listings')
        .select('*, profiles(username), categories(name,slug)')
        .eq('id', id).single();
      if (error || !data) { container.innerHTML = renderNotFound(); return; }
      container.innerHTML = renderListingDetail(data);
      updateSEOMeta(data.title + ' | Sophia Commons Marketplace', (data.description || '').substring(0, 160), '/classified/' + id);
      _trackView('listing', id);
    } else {
      container.innerHTML = renderNotFound();
    }
  } catch(e) {
    console.warn('Detail load error:', e);
    container.innerHTML = renderNotFound();
  }
}

// Show a detail page from static data (no Supabase ID needed)
function showStaticDetail(data) {
  captureCurrentSection('detail');
  var container = document.getElementById('detail-content');
  container.innerHTML = renderStaticDetail(data);
  showSec('detail');
}

// ── RENDERERS ──

function renderDirectoryDetail(d) {
  var badges = '';
  if (d.is_verified) badges += '<span class="detail-badge verified">' + t('detail.verified') + '</span>';
  if (d.category) badges += '<span class="detail-badge category">' + esc(d.category) + '</span>';

  var meta = '';
  if (d.address) meta += '<span>&#128205; ' + esc(d.address) + ', ' + esc(d.location || '') + '</span>';
  else if (d.location) meta += '<span>&#128205; ' + esc(d.location) + '</span>';
  if (d.country) meta += '<span>&#127758; ' + esc(d.country) + '</span>';
  if (d.phone) meta += '<span>&#9742; ' + esc(d.phone) + '</span>';

  var tags = '';
  if (d.tags && d.tags.length) {
    tags = '<div style="margin-top:12px;">' + d.tags.map(function(t) {
      return '<span style="display:inline-block;background:var(--surface);border:1px solid var(--border);padding:3px 10px;border-radius:50px;font-size:11px;color:var(--text-muted);margin:2px 4px 2px 0;">' + esc(t) + '</span>';
    }).join('') + '</div>';
  }

  var actions = '';
  if (d.website_url) actions += '<a class="btn-primary-detail" href="' + esc(d.website_url) + '" target="_blank">' + t('detail.visit_website') + ' &#8599;</a>';
  if (d.email) actions += '<a class="btn-secondary-detail" href="mailto:' + esc(d.email) + '">' + t('detail.contact') + ' &#9993;</a>';
  if (d.phone) actions += '<a class="btn-secondary-detail" href="tel:' + esc(d.phone) + '">' + t('detail.call') + ' &#9742;</a>';

  return '<div class="detail-hero">'
    + badges
    + '<h1>' + esc(d.organization_name) + '</h1>'
    + '<div class="detail-meta">' + meta + '</div>'
    + '<div class="detail-body">' + esc(d.description || t('detail.no_description')) + '</div>'
    + tags
    + '<div class="detail-actions">' + actions + '</div>'
    + '</div>'
    + '<div class="detail-sidebar"><h4>' + t('detail.quick_facts') + '</h4>'
    + '<p><strong>' + t('detail.category') + ':</strong> ' + esc(d.category || t('common.general')) + '</p>'
    + (d.address ? '<p><strong>' + t('detail.address') + ':</strong> ' + esc(d.address) + '</p>' : '')
    + (d.location ? '<p><strong>' + t('detail.location') + ':</strong> ' + esc(d.location) + '</p>' : '')
    + (d.country ? '<p><strong>' + t('detail.country') + ':</strong> ' + esc(d.country) + '</p>' : '')
    + (d.phone ? '<p><strong>' + t('detail.phone') + ':</strong> <a href="tel:' + esc(d.phone) + '">' + esc(d.phone) + '</a></p>' : '')
    + (d.email ? '<p><strong>' + t('detail.email') + ':</strong> <a href="mailto:' + esc(d.email) + '">' + esc(d.email) + '</a></p>' : '')
    + (d.website_url ? '<p><strong>' + t('detail.website') + ':</strong> <a href="' + esc(d.website_url) + '" target="_blank">' + esc(d.website_url.replace('https://','').replace('http://','')) + '</a></p>' : '')
    + '<p><strong>' + t('detail.status') + ':</strong> ' + (d.is_verified ? '<span style="color:var(--sage);font-weight:700;">&#10003; ' + t('detail.verified') + '</span>' : t('detail.listed')) + '</p>'
    + (signedIn ? '<button class="btn-report" onclick="openReportModal(\'directory\',\'' + d.id + '\')">' + t('report.flag_btn') + '</button>' : '')
    + '</div>'
    + '<div id="related-listings"></div>';
}

function renderEventDetail(ev) {
  var d = new Date(ev.start_date);
  var endStr = ev.end_date ? localDate(ev.end_date, {weekday:'long', month:'long', day:'numeric', year:'numeric'}) : '';
  var dateStr = localDate(ev.start_date, {weekday:'long', month:'long', day:'numeric', year:'numeric'});
  var timeStr = ev.is_all_day ? t('event_detail.all_day') : d.toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit'});

  var badges = '';
  if (ev.featured) badges += '<span class="detail-badge category">' + t('event_detail.featured') + '</span>';
  if (ev.event_type) badges += '<span class="detail-badge type">' + esc(ev.event_type) + '</span>';
  if (ev.is_free) badges += '<span class="detail-badge free">' + t('event_detail.free') + '</span>';
  if (ev.is_online) badges += '<span class="detail-badge type">' + t('event_detail.online') + '</span>';

  var meta = '';
  meta += '<span>&#128197; ' + esc(dateStr) + '</span>';
  if (endStr && endStr !== dateStr) meta += '<span>to ' + esc(endStr) + '</span>';
  meta += '<span>&#128336; ' + esc(timeStr) + '</span>';
  if (ev.city) meta += '<span>&#128205; ' + esc(ev.city) + (ev.country ? ', ' + esc(ev.country) : '') + '</span>';
  if (ev.organizer_name) meta += '<span>&#127915; ' + esc(ev.organizer_name) + '</span>';

  var actions = '';
  if (ev.ticket_url) actions += '<a class="btn-primary-detail" href="' + esc(ev.ticket_url) + '" target="_blank">' + t('event_detail.get_tickets') + ' &#8599;</a>';
  if (ev.online_url) actions += '<a class="btn-primary-detail" href="' + esc(ev.online_url) + '" target="_blank">' + t('event_detail.join_online') + ' &#8599;</a>';
  if (ev.organizer_url) actions += '<a class="btn-secondary-detail" href="' + esc(ev.organizer_url) + '" target="_blank">' + t('event_detail.organizer_website') + '</a>';

  return '<div class="detail-hero">'
    + badges
    + '<h1>' + esc(ev.title) + '</h1>'
    + '<div class="detail-meta">' + meta + '</div>'
    + '<div class="detail-body">' + esc(ev.description || '') + '</div>'
    + (ev.ticket_price ? '<p style="font-size:14px;color:var(--gold);font-weight:700;margin-bottom:12px;">' + t('event_detail.ticket_price').replace('${price}', ev.ticket_price) + '</p>' : '')
    + '<div class="detail-actions">' + actions + '</div>'
    + '</div>'
    + '<div class="detail-sidebar"><h4>' + t('event_detail.title') + '</h4>'
    + '<p><strong>' + t('event_detail.date') + ':</strong> ' + esc(dateStr) + '</p>'
    + '<p><strong>' + t('event_detail.time') + ':</strong> ' + esc(timeStr) + '</p>'
    + (ev.location_name ? '<p><strong>' + t('event_detail.venue') + ':</strong> ' + esc(ev.location_name) + '</p>' : '')
    + (ev.city ? '<p><strong>' + t('event_detail.city') + ':</strong> ' + esc(ev.city) + '</p>' : '')
    + (ev.organizer_name ? '<p><strong>' + t('event_detail.organizer') + ':</strong> ' + esc(ev.organizer_name) + '</p>' : '')
    + (signedIn ? '<button class="btn-report" onclick="openReportModal(\'event\',\'' + ev.id + '\')">' + t('report.flag_btn') + '</button>' : '')
    + '</div>'
    + '<div id="related-listings"></div>';
}

function renderNewsDetail(n) {
  var pubDate = n.published_at ? localDate(n.published_at, {month:'long', day:'numeric', year:'numeric'}) : '';

  var badges = '';
  if (n.featured) badges += '<span class="detail-badge category">' + t('news_detail.featured') + '</span>';
  if (n.tags && n.tags.length) {
    n.tags.forEach(function(t) { badges += '<span class="detail-badge type">' + esc(t) + '</span>'; });
  }

  var meta = '';
  if (pubDate) meta += '<span>&#128197; ' + esc(pubDate) + '</span>';
  if (n.source_name) meta += '<span>&#128240; ' + esc(n.source_name) + '</span>';

  var actions = '';
  if (n.source_url) actions += '<a class="btn-primary-detail" href="' + esc(n.source_url) + '" target="_blank">' + t('news_detail.read_at_source') + ' &#8599;</a>';

  return '<div class="detail-hero">'
    + badges
    + '<h1>' + esc(n.title) + '</h1>'
    + '<div class="detail-meta">' + meta + '</div>'
    + '<div class="detail-body">' + esc(n.body || n.excerpt || '') + '</div>'
    + '<div class="detail-actions">' + actions + (signedIn ? '<button class="btn-report" onclick="openReportModal(\'news\',\'' + n.id + '\')">' + t('report.flag_btn') + '</button>' : '') + '</div>'
    + '</div>';
}

function renderStaticDetail(d) {
  var badges = '';
  if (d.verified) badges += '<span class="detail-badge verified">' + t('detail.verified') + '</span>';
  if (d.category) badges += '<span class="detail-badge category">' + esc(d.category) + '</span>';

  var meta = '';
  if (d.location) meta += '<span>&#128205; ' + esc(d.location) + '</span>';

  var actions = '';
  if (d.url) actions += '<a class="btn-primary-detail" href="' + esc(d.url) + '" target="_blank">' + t('detail.visit_website') + ' &#8599;</a>';
  if (d.amazon) actions += '<a class="btn-secondary-detail" href="' + esc(d.amazon) + '" target="_blank">' + t('detail.buy_on_amazon') + '</a>';

  return '<div class="detail-hero">'
    + badges
    + '<h1>' + esc(d.title) + '</h1>'
    + '<div class="detail-meta">' + meta + '</div>'
    + '<div class="detail-body">' + (d.description || '') + '</div>'
    + '<div class="detail-actions">' + actions + '</div>'
    + '</div>';
}

function renderNotFound() {
  return '<div style="text-align:center;padding:60px 20px;">'
    + '<div style="font-size:3rem;margin-bottom:12px;">&#128214;</div>'
    + '<h2 style="font-family:Lora,serif;font-size:1.3rem;color:var(--text-primary);margin-bottom:8px;">' + t('detail.not_found_title') + '</h2>'
    + '<p style="color:var(--text-muted);font-size:14px;margin-bottom:20px;">' + t('detail.not_found_desc') + '</p>'
    + '<a href="#" onclick="goBack();return false;" style="color:var(--gold);font-weight:600;">&larr; ' + t('detail.go_back') + '</a>'
    + '</div>';
}

function renderOfflineDetail() {
  return '<div style="text-align:center;padding:60px 20px;">'
    + '<h2 style="font-family:Lora,serif;font-size:1.3rem;color:var(--text-primary);margin-bottom:8px;">' + t('detail.offline_title') + '</h2>'
    + '<p style="color:var(--text-muted);font-size:14px;margin-bottom:20px;">' + t('detail.offline_desc') + '</p>'
    + '<a href="#" onclick="goBack();return false;" style="color:var(--gold);font-weight:600;">&larr; ' + t('detail.go_back') + '</a>'
    + '</div>';
}

// ── RELATED ITEMS ──

async function loadRelatedDirectory(category, excludeId) {
  if (!sbReady()) return;
  try {
    var { data } = await _sb.from('directory_entries')
      .select('id, organization_name, description, category, location, is_verified')
      .eq('status', 'approved')
      .eq('category', category)
      .neq('id', excludeId)
      .limit(4);
    if (!data || data.length === 0) return;
    var el = document.getElementById('related-listings');
    if (!el) return;
    el.innerHTML = '<h4 style="font-family:Lora,serif;font-size:14px;font-weight:700;margin-bottom:12px;">' + t('detail.related_in').replace('{category}', esc(category)) + '</h4>'
      + '<div class="detail-related">'
      + data.map(function(r) {
        return '<div class="detail-related-card" onclick="showDetail(\'directory\',\'' + r.id + '\')">'
          + '<h5>' + esc(r.organization_name) + (r.is_verified ? ' <span style="color:var(--sage);">&#10003;</span>' : '') + '</h5>'
          + '<p>' + esc((r.description || '').substring(0, 100)) + (r.description && r.description.length > 100 ? '...' : '') + '</p>'
          + '<p style="color:var(--gold);font-size:11px;margin-top:4px;">' + esc(r.location || '') + '</p>'
          + '</div>';
      }).join('')
      + '</div>';
  } catch(e) {}
}

async function loadRelatedEvents(categoryId, excludeId) {
  if (!sbReady()) return;
  try {
    var { data } = await _sb.from('events')
      .select('id, title, start_date, city, country')
      .in('status', ['upcoming', 'ongoing'])
      .neq('id', excludeId)
      .order('start_date')
      .limit(4);
    if (!data || data.length === 0) return;
    var el = document.getElementById('related-listings');
    if (!el) return;
    el.innerHTML = '<h4 style="font-family:Lora,serif;font-size:14px;font-weight:700;margin-bottom:12px;">' + t('event_detail.more_upcoming') + '</h4>'
      + '<div class="detail-related">'
      + data.map(function(r) {
        var d = new Date(r.start_date);
        return '<div class="detail-related-card" onclick="showDetail(\'event\',\'' + r.id + '\')">'
          + '<h5>' + esc(r.title) + '</h5>'
          + '<p>' + localDate(r.start_date, {month:'short', day:'numeric'}) + ' - ' + esc(r.city || '') + '</p>'
          + '</div>';
      }).join('')
      + '</div>';
  } catch(e) {}
}

// ══════════════════════════════════════════
//  CATEGORY PAGES
//  Each category gets its own full page with
//  directory entries, events, news, and actions.
// ══════════════════════════════════════════

const catMeta = {
  'waldorf & education':     { dirCat: 'waldorf',    desc: 'Waldorf and Steiner schools, teacher training institutes, homeschool resources, curriculum materials, and professional development for educators worldwide.' },
  'biodynamic agriculture':  { dirCat: 'biodynamic', desc: 'Demeter-certified biodynamic farms, CSA programs, apprenticeships, seed suppliers, training courses, and agricultural research in the tradition of Rudolf Steiner.' },
  'esoteric studies':        { dirCat: null,          desc: 'Study groups, lecture cycles, meditation practices, courses in spiritual science, and resources for the independent study of Rudolf Steiner\'s work.' },
  'arts & eurythmy':         { dirCat: 'eurythmy',   desc: 'Eurythmy schools and performances, visual arts, music, speech formation, drama, and artistic practices rooted in anthroposophical principles.' },
  'anthroposophic medicine': { dirCat: 'medicine',    desc: 'Anthroposophic physicians, clinics, hospitals, therapeutic eurythmy, art therapy, Weleda and WALA remedies, and nurse training programs.' },
  'community & camphill':    { dirCat: 'camphill',    desc: 'Camphill communities, intentional living, co-worker positions, volunteer programs, and inclusive communities for people with disabilities.' },
  'free & sharing':          { dirCat: null,          desc: 'Free items, giveaways, seed exchanges, skill shares, tool lending, and community barter within the anthroposophical world.' },
  'marketplace':             { dirCat: null,          desc: 'Buy, sell, and trade anthroposophical books, biodynamic products, handcrafts, musical instruments, art, and educational materials.' },
  'housing & room rent':     { dirCat: null,          desc: 'Rooms, apartments, and community housing near Waldorf schools, Camphill communities, and biodynamic farms. Land for intentional communities.' },
  'jobs & volunteering':     { dirCat: null,          desc: 'Waldorf teaching positions, biodynamic farm apprenticeships, Camphill co-worker roles, administrative jobs, and volunteer opportunities across the movement.' },
  'groups & circles':        { dirCat: null,          desc: 'Study circles, meditation groups, reading groups, local branch meetings, youth groups, and working groups in the anthroposophical tradition.' },
  'online resources':        { dirCat: 'online',      desc: 'Websites, archives, podcasts, video channels, online courses, and digital tools for the anthroposophical community.' },
  'societies & organizations': { dirCat: 'societies', desc: 'National and international anthroposophical societies, branches, federations, and membership organizations.' },
  'social media':              { dirCat: 'social_media', desc: 'Facebook groups, YouTube channels, X/Twitter accounts, Instagram pages, Discord communities, and other social media for the anthroposophical movement.' }
};

function showCategory(name, skipPush) {
  captureCurrentSection('category');

  var displayName = name.charAt(0).toUpperCase() + name.slice(1);
  var key = name.toLowerCase();
  var meta = catMeta[key] || {};

  document.getElementById('cat-page-label').textContent = displayName;
  var catI18nKey = 'catmeta.' + key.replace(/[^a-z]/g, '_') + '_desc';
  document.getElementById('cat-page-desc').textContent = t(catI18nKey) !== catI18nKey ? t(catI18nKey) : (meta.desc || t('catpage.default_browse_desc'));
  document.getElementById('cat-page-content').innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">' + t('common.loading') + '</div>';
  showSec('category', true);
  updateSEOMeta(displayName + ' | Sophia Commons Directory', meta.desc || t('catpage.default_seo_desc'), '/category/' + encodeURIComponent(name));

  // Push SEO-friendly category URL
  if (!skipPush) {
    var slug = encodeURIComponent(key.replace(/\s+/g, '-'));
    var path = '/category/' + slug;
    if (window.location.pathname !== path) {
      history.pushState({ type: 'category', name: name }, '', path);
    }
  }

  loadCategoryPage(key, meta.dirCat);
}

async function loadCategoryPage(catKey, dirCat) {
  var container = document.getElementById('cat-page-content');
  var html = '';

  // ── 1. Directory Entries ──
  var dirEntries = [];
  if (sbReady() && dirCat) {
    try {
      var { data } = await _sb.from('directory_entries')
        .select('id, organization_name, description, website_url, location, country, is_verified, address, phone, email')
        .eq('status', 'approved').eq('category', dirCat)
        .order('is_verified', { ascending: false }).order('organization_name')
        .limit(50);
      if (data) dirEntries = data;
    } catch(e) {}
  }

  if (dirEntries.length > 0) {
    html += '<div class="listblock" style="margin-bottom:16px;">';
    html += '<div class="listblock-head"><h3>' + t('catpage.organizations_heading') + '</h3><span style="font-size:10.5px;color:var(--text-muted);">' + t('directory.entries_label').replace('{count}', dirEntries.length) + '</span></div>';
    html += '<div class="listblock-body">';
    dirEntries.forEach(function(d) {
      var v = d.is_verified ? '<span style="color:var(--verified);font-weight:700;margin-right:4px;">&#10003;</span>' : '';
      var loc = [d.location, d.country].filter(Boolean).join(', ');
      var addr = d.address ? esc(d.address) + ', ' + esc(loc) : esc(loc);
      html += '<div class="lrow" style="cursor:pointer;padding:8px 0;" onclick="showDetail(\'directory\',\'' + d.id + '\')">'
        + v
        + '<a class="ltitle" href="#" onclick="return false;" style="font-size:14px;">' + esc(d.organization_name) + '</a>'
        + '<span class="lmeta">' + addr + '</span>'
        + '</div>';
      if (d.description) {
        html += '<div style="font-size:12px;color:var(--text-muted);padding:0 0 6px 20px;margin-top:-4px;line-height:1.5;">' + esc(d.description.substring(0, 160)) + (d.description.length > 160 ? '...' : '') + '</div>';
      }
      if (d.phone || d.email) {
        html += '<div style="font-size:11px;color:var(--text-muted);padding:0 0 8px 20px;">' + (d.phone ? '&#9742; ' + esc(d.phone) + ' ' : '') + (d.email ? '&#9993; ' + esc(d.email) : '') + '</div>';
      }
    });
    html += '</div></div>';
  }

  // ── 2. Related Events ──
  var events = [];
  if (sbReady()) {
    try {
      var { data } = await _sb.from('events')
        .select('id, title, description, start_date, city, country, organizer_name, is_free, event_type')
        .in('status', ['upcoming', 'ongoing']).order('start_date').limit(30);
      if (data) {
        var keywords = catKey.split(/[\s&,]+/).filter(function(w) { return w.length > 3; });
        data.forEach(function(ev) {
          var text = (ev.title + ' ' + (ev.description || '') + ' ' + (ev.organizer_name || '')).toLowerCase();
          if (keywords.some(function(kw) { return text.includes(kw); })) {
            events.push(ev);
          }
        });
      }
    } catch(e) {}
  }

  if (events.length > 0) {
    html += '<div class="listblock" style="margin-bottom:16px;">';
    html += '<div class="listblock-head"><h3>' + t('catpage.upcoming_events_heading') + '</h3><span style="font-size:10.5px;color:var(--text-muted);">' + events.length + ' events</span></div>';
    html += '<div class="listblock-body">';
    events.forEach(function(ev) {
      var d = new Date(ev.start_date);
      var loc = [ev.city, ev.country].filter(Boolean).join(', ');
      html += '<div class="evrow" style="cursor:pointer;" onclick="showDetail(\'event\',\'' + ev.id + '\')">'
        + '<div class="evdate"><div class="mo">' + MONTHS_SHORT[d.getMonth()] + '</div><div class="dy">' + d.getDate() + '</div></div>'
        + '<div class="evinfo">'
        + '<div class="etag">' + esc(ev.event_type || '') + (ev.is_free ? ' &middot; ' + t('common.free') : '') + '</div>'
        + '<h5>' + esc(ev.title) + '</h5>'
        + '<div class="emeta">' + esc(loc) + (ev.organizer_name ? ' &middot; ' + esc(ev.organizer_name) : '') + '</div>'
        + '</div></div>';
    });
    html += '</div></div>';
  }

  // ── 3. Related News ──
  var news = [];
  if (sbReady()) {
    try {
      var { data } = await _sb.from('news')
        .select('id, title, excerpt, source_name, published_at, tags')
        .eq('status', 'published').order('published_at', { ascending: false }).limit(20);
      if (data) {
        var keywords = catKey.split(/[\s&,]+/).filter(function(w) { return w.length > 3; });
        data.forEach(function(n) {
          var text = (n.title + ' ' + (n.excerpt || '') + ' ' + (n.tags || []).join(' ')).toLowerCase();
          if (keywords.some(function(kw) { return text.includes(kw); })) {
            news.push(n);
          }
        });
      }
    } catch(e) {}
  }

  if (news.length > 0) {
    html += '<div class="listblock" style="margin-bottom:16px;">';
    html += '<div class="listblock-head"><h3>' + t('catpage.related_news_heading') + '</h3></div>';
    html += '<div class="listblock-body">';
    news.forEach(function(n) {
      var ago = timeAgo(n.published_at);
      html += '<div class="lrow" style="cursor:pointer;" onclick="showDetail(\'news\',\'' + n.id + '\')">'
        + '<a class="ltitle" href="#" onclick="return false;">' + esc(n.title) + '</a>'
        + '<span class="lmeta">' + esc(n.source_name || '') + ' &middot; ' + ago + '</span>'
        + '</div>';
    });
    html += '</div></div>';
  }

  // ── 4. Empty state ──
  if (dirEntries.length === 0 && events.length === 0 && news.length === 0) {
    html += '<div style="text-align:center;padding:48px 20px;background:var(--surface);border:1px solid var(--border);border-radius:12px;">'
      + '<div style="font-size:2.5rem;margin-bottom:12px;">&#128218;</div>'
      + '<h3 style="font-family:Lora,serif;font-size:1.1rem;color:var(--text-primary);margin-bottom:8px;">' + t('catpage.empty_title') + '</h3>'
      + '<p style="color:var(--text-muted);font-size:13px;max-width:400px;margin:0 auto 16px;line-height:1.6;">' + t('catpage.empty_desc') + '</p>'
      + '</div>';
  }

  // ── 5. Submit CTA ──
  html += '<div style="text-align:center;margin-top:20px;padding:20px;background:var(--surface);border:1px solid var(--border);border-radius:12px;">'
    + '<p style="font-size:14px;color:var(--text-secondary);margin-bottom:12px;">' + t('catpage.submit_cta') + '</p>'
    + '<button onclick="showSubmitForm()" style="padding:11px 28px;background:var(--gold);color:var(--text-inverse);border:none;border-radius:50px;font-family:Nunito Sans,sans-serif;font-size:14px;font-weight:600;cursor:pointer;">' + t('catpage.submit_btn') + '</button>'
    + '</div>';

  container.innerHTML = html;
}

// Room message history (simulated, replace with Supabase realtime)
const roomHistory = {
  'general': [
    {av:'M',nm:'Maren H.',t:'9:14 AM',txt:'Good morning - has anyone attended any of the Goetheanum online study weekends? Considering the spring session.'},
    {av:'T',nm:'Thomas R.',t:'9:22 AM',txt:'Yes! I did the October session last year. Recorded lectures plus live discussion groups - format worked really well.'},
    {av:'A',nm:'Aria S.',t:'9:31 AM',txt:'The Rudolf Steiner Archive just released new English translations. Worth checking if you are studying the agriculture lectures.'},
    {av:'J',nm:'Johannes K.',t:'9:44 AM',txt:'Anyone in the Bay Area interested in starting a local study circle? Working through Philosophy of Freedom this spring.'},
  ],
  'waldorf-education': [
    {av:'C',nm:'Clara W.',t:'8:50 AM',txt:'Has anyone used the updated AWSNA curriculum frameworks? We are revising our grade 6 program.'},
    {av:'T',nm:'Thomas R.',t:'9:05 AM',txt:'Yes - the new frameworks have much better guidance for main lesson books. Highly recommend the teacher renewal section.'},
  ],
  'biodynamic': [
    {av:'A',nm:'Aria S.',t:'7:30 AM',txt:'Planting calendar reminder: root days this week are Tuesday and Friday. Good time for root crops.'},
    {av:'M',nm:'Maren H.',t:'7:45 AM',txt:'Thank you! Also - anyone sourcing Demeter-certified seeds for summer planting in the Northeast?'},
  ],
  'study-groups': [
    {av:'J',nm:'Johannes K.',t:'10:00 AM',txt:'Our NYC branch is reading Theosophy chapter 3 this Thursday at 7pm. All welcome - message me for the Zoom link.'},
  ],
  'meetups': [
    {av:'C',nm:'Clara W.',t:'Yesterday',txt:'Wonderful turnout at the Bay Area biodynamic farm tour last weekend - thanks to everyone who came!'},
    {av:'M',nm:'Maren H.',t:'Yesterday',txt:'Next meetup: Waldorf parents coffee morning in Spring Valley, March 28. See the Events tab for details.'},
  ],
  'medicine': [],
  'eurythmy-arts': [],
  'christian-community': [],
  'new-members': [
    {av:'J',nm:'Johannes K.',t:'Yesterday',txt:'Welcome to all new members this week! Feel free to introduce yourself here - where are you from and what brings you to Sophia Commons?'},
  ],
};

// ── NAVIGATION ──
// Section-to-path mapping for SEO-friendly URLs
const SEC_PATHS = {
  home: '/', news: '/news', events: '/events', browse: '/browse',
  directory: '/directory', books: '/books', podcasts: '/podcasts',
  memorial: '/memorial', marketplace: '/marketplace'
};
const PATH_TO_SEC = {};
Object.keys(SEC_PATHS).forEach(function(k) { PATH_TO_SEC[SEC_PATHS[k]] = k; });

function _getSecMeta() {
  return {
    home:      { title: t('meta.title'), desc: t('meta.og_description') },
    news:      { title: t('meta.news_title'), desc: t('meta.news_desc') },
    events:    { title: t('meta.events_title'), desc: t('meta.events_desc') },
    browse:    { title: t('meta.browse_title'), desc: t('meta.browse_desc') },
    directory: { title: t('meta.directory_title'), desc: t('meta.directory_desc') },
    books:     { title: t('meta.books_title'), desc: t('meta.books_desc') },
    podcasts:  { title: t('meta.podcasts_title'), desc: t('meta.podcasts_desc') },
    memorial:  { title: t('meta.memorial_title'), desc: t('meta.memorial_desc') },
    marketplace: { title: t('meta.marketplace_title'), desc: t('meta.marketplace_desc') }
  };
}
var SEC_META = null;

function updateSEOMeta(title, desc, path) {
  document.title = title;
  var metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute('content', desc);
  var ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute('content', title);
  var ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogDesc) ogDesc.setAttribute('content', desc);
  var twTitle = document.querySelector('meta[name="twitter:title"]');
  if (twTitle) twTitle.setAttribute('content', title);
  var twDesc = document.querySelector('meta[name="twitter:description"]');
  if (twDesc) twDesc.setAttribute('content', desc);
  var canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) canonical.setAttribute('href', 'https://sophiacommons.org' + (path || '/'));
}

function showSec(id, skipPush) {
  document.querySelectorAll('.pagesec').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('#mainnav button').forEach(b => b.classList.remove('active'));
  document.getElementById('sec-' + id).classList.add('active');
  const btn = document.getElementById('nav-' + id);
  if (btn) btn.classList.add('active');
  window.scrollTo(0,0);
  if (id === 'directory' && !mapLoaded) loadMap();
  if (id === 'admin') { if (!isAdmin()) { showSec('home'); return; } initAdminPanel(); }
  const leftbar = document.getElementById('leftbar');
  const hamburger = document.getElementById('hamburger-btn');
  const ov = document.getElementById('menu-overlay');
  if (leftbar) leftbar.classList.remove('mobile-open');
  if (hamburger) hamburger.classList.remove('active');
  if (ov) ov.classList.remove('active');
  // Update SEO meta
  var secMeta = _getSecMeta();
  var meta = secMeta[id];
  if (meta) updateSEOMeta(meta.title, meta.desc, SEC_PATHS[id] || '/');
  // Push SEO-friendly URL
  if (!skipPush && SEC_PATHS.hasOwnProperty(id)) {
    var path = SEC_PATHS[id];
    if (window.location.pathname !== path) {
      history.pushState({ type: 'section', id: id }, '', path);
    }
  }
}

function handleChat() {
  showSec('chat');
  if (!signedIn) openModal();
}

// ── MOBILE MENU ──
function toggleMobileMenu() {
  var lb = document.getElementById('leftbar');
  var hb = document.getElementById('hamburger-btn');
  var ov = document.getElementById('menu-overlay');
  lb.classList.toggle('mobile-open');
  hb.classList.toggle('active');
  if (ov) ov.classList.toggle('active');
  var expanded = lb.classList.contains('mobile-open');
  hb.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  hb.setAttribute('aria-label', expanded ? t('a11y.close_nav') : t('a11y.open_nav'));
}

// ── STICKY NAV SCROLL ──
var _scrollTicking = false;
window.addEventListener('scroll', () => {
  if (!_scrollTicking) {
    _scrollTicking = true;
    requestAnimationFrame(() => {
      const header = document.getElementById('site-header');
      if (header) header.classList.toggle('scrolled', window.scrollY > 50);
      _scrollTicking = false;
    });
  }
});

// ── SCROLL ANIMATIONS ──
document.addEventListener('DOMContentLoaded', () => {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
});

// ── SPA ROUTER (SEO-friendly URLs) ──
function routeFromPath(pathname, isPopstate) {
  var p = pathname || '/';
  var skip = true; // never pushState when routing from URL

  // Section routes
  if (PATH_TO_SEC[p]) {
    showSec(PATH_TO_SEC[p], skip);
    return;
  }

  // Category route: /category/:slug
  var catMatch = p.match(/^\/category\/([^\/]+)$/);
  if (catMatch) {
    var catName = decodeURIComponent(catMatch[1]).replace(/-/g, ' ');
    showCategory(catName, skip);
    return;
  }

  // Detail routes: /listing/:id, /event/:id, /article/:id
  var detailMatch = p.match(/^\/(listing|event|article)\/([^\/]+)$/);
  if (detailMatch) {
    var typeMap = { listing: 'directory', event: 'event', article: 'news' };
    showDetail(typeMap[detailMatch[1]], detailMatch[2], skip);
    return;
  }

  // Fallback: show home
  showSec('home', skip);
}

// Handle browser back/forward
window.addEventListener('popstate', function(e) {
  if (e.state) {
    if (e.state.type === 'section') {
      showSec(e.state.id, true);
    } else if (e.state.type === 'detail') {
      showDetail(e.state.detailType, e.state.detailId, true);
    } else if (e.state.type === 'category') {
      showCategory(e.state.name, true);
    }
  } else {
    routeFromPath(window.location.pathname, true);
  }
});

// Route on initial page load
document.addEventListener('DOMContentLoaded', function() {
  // Replace current state so back button works from the initial page
  var p = window.location.pathname;
  if (PATH_TO_SEC[p]) {
    history.replaceState({ type: 'section', id: PATH_TO_SEC[p] }, '', p);
  }
  // Only route if not on root (home is default)
  if (p !== '/') {
    routeFromPath(p, false);
  }
});

// ── MODAL ──
function openModal() {
  document.getElementById('modal-overlay').classList.add('open');
  setTimeout(() => document.getElementById('login-email').focus(), 80);
}
function closeModal() { document.getElementById('modal-overlay').classList.remove('open'); }
document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
});

// ── AUTH ──
let authMode = 'signin';

function toggleAuthMode(e) {
  if (e) e.preventDefault();
  const errEl = document.getElementById('auth-error');
  errEl.style.display = 'none';
  if (authMode === 'signin') {
    authMode = 'signup';
    document.getElementById('modal-title').textContent = t('modal.title_signup');
    document.getElementById('modal-desc').textContent = t('modal.desc_signup');
    document.getElementById('auth-btn').textContent = t('modal.btn_signup');
    document.getElementById('toggle-signup').style.display = 'none';
    document.getElementById('toggle-signin').style.display = 'inline';
  } else {
    authMode = 'signin';
    document.getElementById('modal-title').textContent = t('modal.title_signin');
    document.getElementById('modal-desc').textContent = t('modal.desc_signin');
    document.getElementById('auth-btn').textContent = t('modal.btn_signin');
    document.getElementById('toggle-signup').style.display = 'inline';
    document.getElementById('toggle-signin').style.display = 'none';
  }
}

async function doSignIn() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-pass').value;
  const errEl = document.getElementById('auth-error');
  errEl.style.display = 'none';

  if (!email) { document.getElementById('login-email').focus(); return; }
  if (!password || password.length < 6) {
    errEl.textContent = t('auth.password_min');
    errEl.style.display = 'block';
    return;
  }

  if (!sbReady()) {
    errEl.textContent = t('auth.service_unavailable');
    errEl.style.display = 'block';
    return;
  }

  const btn = document.getElementById('auth-btn');
  btn.disabled = true;
  btn.textContent = authMode === 'signin' ? t('auth.signing_in') : t('auth.creating_account');

  let result;
  if (authMode === 'signup') {
    result = await _sb.auth.signUp({ email, password });
  } else {
    result = await _sb.auth.signInWithPassword({ email, password });
  }

  btn.disabled = false;
  btn.textContent = authMode === 'signin' ? t('modal.btn_signin') : t('modal.btn_signup');

  if (result.error) {
    errEl.textContent = result.error.message;
    errEl.style.display = 'block';
    return;
  }

  if (authMode === 'signup' && !result.data.session) {
    errEl.style.display = 'none';
    document.getElementById('modal-desc').textContent = t('auth.check_email');
    document.getElementById('auth-btn').style.display = 'none';
    return;
  }

  username = email.split('@')[0];
  signedIn = true;
  closeModal();
  applySignedInState();
}

function applySignedInState() {
  document.getElementById('uname').textContent = username;
  document.getElementById('user-chip').style.display = 'inline';
  document.getElementById('signin-link').style.display = 'none';
  document.getElementById('nav-chat').classList.remove('locked');
  document.getElementById('chat-uname').textContent = username;
  document.getElementById('chat-signedin').classList.add('vis');
  document.getElementById('chat-gate-wrap').style.display = 'none';
  document.getElementById('chat-app').classList.add('vis');
  document.getElementById('chat-input').placeholder = t('chat.input_placeholder').replace('{room}', 'general').replace('{username}', username);
  scrollMsgs();
  updateAdminVisibility();
}

async function doSignOut() {
  if (sbReady()) await _sb.auth.signOut();
  signedIn = false; username = '';
  document.getElementById('user-chip').style.display = 'none';
  document.getElementById('signin-link').style.display = 'inline';
  document.getElementById('nav-chat').classList.add('locked');
  document.getElementById('chat-signedin').classList.remove('vis');
  document.getElementById('chat-gate-wrap').style.display = 'block';
  document.getElementById('chat-app').classList.remove('vis');
  updateAdminVisibility();
  showSec('home');
}

async function doPasswordReset(e) {
  if (e) e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const errEl = document.getElementById('auth-error');
  if (!email || !email.includes('@')) {
    errEl.textContent = t('auth.reset_prompt');
    errEl.style.display = 'block';
    return;
  }
  if (!sbReady()) return;
  await _sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin
  });
  errEl.style.display = 'none';
  document.getElementById('modal-desc').textContent = t('auth.reset_sent');
}

// Auto-restore session on page load
window.addEventListener('supabase-auth-ready', function(e) {
  username = e.detail.username;
  signedIn = true;
  applySignedInState();
});

// ── CHAT ──
let currentRoom = 'general';
let chatSubscription = null;
let presenceChannel = null;
let typingTimeout = null;
let typingUsers = {};

function _renderMsg(m, isMine, msgId) {
  var deleteBtn = isMine && msgId ? '<button class="msg-delete" onclick="deleteMsg(\'' + msgId + '\',this)" title="Delete">&times;</button>' : '';
  var cls = isMine ? 'msg mine' : 'msg';
  return '<div class="' + cls + '" data-msg-id="' + (msgId || '') + '"><div class="av">' + m.av + '</div><div class="bub"><div class="bmeta"><span class="nm">' + esc(m.nm) + '</span>' + m.t + deleteBtn + '</div><div class="btxt">' + esc(m.txt) + '</div></div></div>';
}

async function switchRoom(el, name, desc, count) {
  document.querySelectorAll('.ritem').forEach(r => r.classList.remove('active'));
  el.classList.add('active');
  const b = el.querySelector('.unread'); if (b) b.remove();
  currentRoom = name;
  document.getElementById('room-title').textContent = '# ' + name;
  document.getElementById('room-desc').textContent = desc;
  document.getElementById('chat-input').placeholder = t('chat.input_placeholder').replace('{room}', name).replace('{username}', username);
  const msgs = document.getElementById('messages');
  var typingEl = document.getElementById('typing-indicator');
  if (typingEl) typingEl.textContent = '';
  typingUsers = {};

  let hist = [];
  try {
    const { data, error } = await _sb
      .from('chat_messages')
      .select('*')
      .eq('room', name)
      .order('created_at', { ascending: true })
      .limit(50);
    if (!error && data && data.length > 0) {
      var uid = window._supabaseUser ? window._supabaseUser.id : null;
      hist = data.map(m => ({
        av: (m.username || 'U')[0].toUpperCase(),
        nm: m.username || 'User',
        t: new Date(m.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}),
        txt: m.content,
        id: m.id,
        mine: uid && m.user_id === uid
      }));
    } else {
      hist = (roomHistory[name] || []).map(m => Object.assign({}, m, {id: null, mine: false}));
    }
  } catch(e) {
    hist = (roomHistory[name] || []).map(m => Object.assign({}, m, {id: null, mine: false}));
  }

  msgs.innerHTML = hist.map(m => _renderMsg(m, m.mine, m.id)).join('')
    + '<div class="msg sys"><div class="av">&middot;</div><div class="bub"><div class="btxt">' + t('chat.you_joined').replace('{room}', name) + '</div></div></div>';
  scrollMsgs();

  // Clean up previous subscriptions
  if (chatSubscription && sbReady()) { _sb.removeChannel(chatSubscription); }
  if (presenceChannel && sbReady()) { _sb.removeChannel(presenceChannel); }
  if (!sbReady()) return;

  // Real-time messages (INSERT + DELETE)
  chatSubscription = _sb
    .channel('room-' + name)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'chat_messages',
      filter: 'room=eq.' + name
    }, (payload) => {
      const m = payload.new;
      if (m.user_id && window._supabaseUser && m.user_id === window._supabaseUser.id) return;
      var msg = {
        av: (m.username || 'U')[0].toUpperCase(),
        nm: m.username || 'User',
        t: new Date(m.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}),
        txt: m.content
      };
      document.getElementById('messages').innerHTML += _renderMsg(msg, false, m.id);
      scrollMsgs();
    })
    .on('postgres_changes', {
      event: 'DELETE',
      schema: 'public',
      table: 'chat_messages',
      filter: 'room=eq.' + name
    }, (payload) => {
      var el = document.querySelector('[data-msg-id="' + payload.old.id + '"]');
      if (el) el.remove();
    })
    .subscribe();

  // Presence tracking (real online count)
  presenceChannel = _sb.channel('presence-' + name, { config: { presence: { key: username || 'anon' } } });
  presenceChannel.on('presence', { event: 'sync' }, () => {
    var state = presenceChannel.presenceState();
    var onlineCount = Object.keys(state).length;
    document.getElementById('online-ct').textContent = String.fromCharCode(9679) + ' ' + t('chat.online_count').replace('{count}', onlineCount);
  });
  // Typing indicator via broadcast
  presenceChannel.on('broadcast', { event: 'typing' }, (payload) => {
    var who = payload.payload.username;
    if (who === username) return;
    typingUsers[who] = Date.now();
    _updateTypingIndicator();
    setTimeout(function() { delete typingUsers[who]; _updateTypingIndicator(); }, 3000);
  });
  presenceChannel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await presenceChannel.track({ username: username, online_at: new Date().toISOString() });
    }
  });
}

function _updateTypingIndicator() {
  var el = document.getElementById('typing-indicator');
  if (!el) return;
  var names = Object.keys(typingUsers);
  if (names.length === 0) { el.textContent = ''; return; }
  if (names.length === 1) { el.textContent = names[0] + ' ' + t('chat.is_typing'); return; }
  if (names.length === 2) { el.textContent = names[0] + ' ' + t('chat.and') + ' ' + names[1] + ' ' + t('chat.are_typing'); return; }
  el.textContent = t('chat.several_typing');
}

function broadcastTyping() {
  if (!presenceChannel || !username) return;
  if (typingTimeout) clearTimeout(typingTimeout);
  presenceChannel.send({ type: 'broadcast', event: 'typing', payload: { username: username } });
  typingTimeout = setTimeout(function() { typingTimeout = null; }, 2000);
}

async function deleteMsg(msgId, btn) {
  if (!msgId || !sbReady()) return;
  try {
    await _sb.from('chat_messages').delete().eq('id', msgId);
    var row = btn.closest('.msg');
    if (row) row.remove();
  } catch(e) { console.warn('Delete failed:', e); }
}

async function sendMsg() {
  const inp = document.getElementById('chat-input');
  const txt = inp.value.trim(); if (!txt) return;
  const msgs = document.getElementById('messages');
  const time = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  var uid = window._supabaseUser ? window._supabaseUser.id : null;

  var tmpMsg = {av: username[0].toUpperCase(), nm: username, t: time, txt: txt};
  msgs.innerHTML += _renderMsg(tmpMsg, true, 'pending');
  inp.value = ''; scrollMsgs();

  try {
    var { data } = await _sb.from('chat_messages').insert({
      room: currentRoom,
      username: username,
      user_id: uid,
      content: txt
    }).select().single();
    // Update pending message with real ID
    var pending = document.querySelector('[data-msg-id="pending"]');
    if (pending && data) pending.setAttribute('data-msg-id', data.id);
  } catch(e) {
    console.warn('Chat insert failed:', e);
  }
}
function scrollMsgs() { const m = document.getElementById('messages'); m.scrollTop = m.scrollHeight; }
function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── MEMORIAL SEARCH & DIRECTORY ──
function filterMemorials() {
  const q = document.getElementById('memorial-search').value.trim().toLowerCase();
  const cards = document.querySelectorAll('.memorial-card');
  let visible = 0;
  cards.forEach(card => {
    const name = (card.getAttribute('data-name') || '').toLowerCase();
    const text = card.textContent.toLowerCase();
    if (!q || name.includes(q) || text.includes(q)) {
      card.style.display = '';
      visible++;
    } else {
      card.style.display = 'none';
    }
  });
  document.getElementById('memorial-count').textContent = t('memorial.showing_count').replace('{count}', visible);
}

// Load community-submitted memorials from Supabase
async function loadCommunityMemorials() {
  try {
    const { data, error } = await _sb
      .from('memorials')
      .select('name, years, location, bio, photo_url')
      .eq('status', 'approved')
      .order('name')
      .limit(100);
    if (error || !data || data.length === 0) return;

    const grid = document.getElementById('community-memorials');
    if (!grid) return;

    const heading = '<hr class="soft"><div class="seclabel" style="margin-bottom:14px;">' + t('memorial.community_tributes') + ' &nbsp;·&nbsp; ' + t('memorial.showing_count').replace('{count}', data.length) + '</div>';
    const cards = data.map(m => {
      const initials = m.name.split(' ').map(w => w[0]).join('').substring(0,2).toUpperCase();
      const avatar = m.photo_url
        ? '<img src="' + esc(m.photo_url) + '" alt="' + esc(m.name) + '" style="width:100%;height:100%;object-fit:cover;">'
        : '<span style="font-family:Lora,serif;font-size:2rem;color:var(--text-muted);">' + initials + '</span>';
      return '<div class="catblock reveal memorial-card visible" data-name="' + esc(m.name) + '" style="text-align:center;padding:20px 16px;">'
        + '<div style="width:90px;height:90px;border-radius:50%;background:var(--surface);border:2px solid var(--border);margin:0 auto 12px;overflow:hidden;display:flex;align-items:center;justify-content:center;">' + avatar + '</div>'
        + '<h3 style="font-family:Lora,Georgia,serif;font-size:1rem;font-weight:700;color:var(--text-primary);margin-bottom:4px;">' + esc(m.name) + '</h3>'
        + (m.years ? '<div style="font-size:12px;color:var(--gold);font-weight:600;margin-bottom:4px;">' + esc(m.years) + '</div>' : '')
        + (m.location ? '<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;">' + esc(m.location) + '</div>' : '')
        + '<p style="font-size:13px;color:var(--text-secondary);line-height:1.55;">' + esc(m.bio) + '</p>'
        + '</div>';
    }).join('');

    grid.innerHTML = heading + '<div class="catgrid">' + cards + '</div>';

    // Update count
    const total = document.querySelectorAll('.memorial-card').length;
    document.getElementById('memorial-count').textContent = t('memorial.showing_count').replace('{count}', total);
  } catch(e) {
    // Supabase not configured yet
  }
}
loadCommunityMemorials();

// ── MEMORIAL SUBMISSION ──
async function submitMemorial() {
  const name = document.getElementById('mem-name').value.trim();
  const bio = document.getElementById('mem-bio').value.trim();
  if (!name || !bio) {
    alert(t('error.fill_name_tribute'));
    return;
  }

  const memorial = {
    name: name,
    years: document.getElementById('mem-years').value.trim() || null,
    location: document.getElementById('mem-location').value.trim() || null,
    bio: bio,
    photo_url: document.getElementById('mem-photo').value.trim() || null,
    contact_email: document.getElementById('mem-email').value.trim() || null
  };

  try {
    const { error } = await _sb.from('memorials_pending').insert(memorial);
    if (error) console.warn('Memorial submit error:', error);
  } catch(e) {
    console.warn('Memorial submit failed:', e);
  }

  document.getElementById('mem-ok').style.display = 'block';
  // Clear form
  ['mem-name','mem-years','mem-location','mem-bio','mem-photo','mem-email'].forEach(id => {
    document.getElementById(id).value = '';
  });
}

// ── SIGNUPS (Newsletter) ──
function _isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function handleNewsletterSignup(emailId, btnSelector, confirmId) {
  var inp = document.getElementById(emailId);
  var v = inp.value.trim();
  var errId = emailId + '-err';
  var errEl = document.getElementById(errId);

  // Clear previous error
  if (errEl) errEl.style.display = 'none';
  inp.classList.remove('input-error');

  if (!v) {
    inp.classList.add('input-error');
    if (errEl) { errEl.textContent = t('newsletter.error_empty'); errEl.style.display = 'block'; }
    return;
  }
  if (!_isValidEmail(v)) {
    inp.classList.add('input-error');
    if (errEl) { errEl.textContent = t('newsletter.error_invalid'); errEl.style.display = 'block'; }
    return;
  }

  if (!sbReady()) {
    if (errEl) { errEl.textContent = t('error.service_unavailable'); errEl.style.display = 'block'; }
    return;
  }

  var btn = document.querySelector(btnSelector);
  if (btn) { btn.disabled = true; btn.textContent = t('newsletter.subscribing'); }

  try {
    var { error } = await _sb.from('newsletter_subscribers').insert({ email: v, confirmed: true });
    if (error && error.code === '23505') {
      // Already subscribed (duplicate)
    } else if (error) {
      throw error;
    }
    inp.style.display = 'none';
    if (btn) btn.style.display = 'none';
    document.getElementById(confirmId).style.display = 'block';
  } catch(e) {
    if (btn) { btn.disabled = false; btn.textContent = t('newsletter.subscribe_btn'); }
    if (errEl) { errEl.textContent = t('newsletter.error_failed'); errEl.style.display = 'block'; }
    console.warn('Newsletter signup error:', e);
  }
}
function doSignup() { handleNewsletterSignup('signup-email', '.signup-box button', 'rsignup-ok'); }
function doFtSignup() { handleNewsletterSignup('ft-email', '.ftnl button', 'ft-ok'); }

// ── DIRECTORY MAP ──
const mapLocs = [
  // ── Societies & Organizations ──
  {name:'Goetheanum / General Anthroposophical Society',cat:'societies',lat:47.48,lng:7.62,city:'Dornach, Switzerland'},
  {name:'Anthroposophical Society in America',cat:'societies',lat:42.28,lng:-83.74,city:'Ann Arbor, MI'},
  {name:'Rudolf Steiner House - Ann Arbor',cat:'societies',lat:42.28,lng:-83.73,city:'Ann Arbor, MI'},
  {name:'Anthroposophy NYC',cat:'societies',lat:40.75,lng:-73.99,city:'New York, NY'},
  {name:'ASA - Los Angeles Branch',cat:'societies',lat:34.05,lng:-118.24,city:'Los Angeles, CA'},
  {name:'Anthroposophy Bay Area',cat:'societies',lat:37.77,lng:-122.42,city:'San Francisco, CA'},
  {name:'The Sojourner Branch',cat:'societies',lat:42.37,lng:-72.52,city:'Western Massachusetts'},
  {name:'Rudolf Steiner House - London',cat:'societies',lat:51.53,lng:-0.15,city:'London, UK'},
  {name:'Anth. Society in Great Britain',cat:'societies',lat:51.51,lng:-0.12,city:'London, UK'},
  {name:'Anth. Society in Canada',cat:'societies',lat:43.65,lng:-79.38,city:'Toronto, Canada'},
  {name:'Anth. Society in Australia',cat:'societies',lat:-33.87,lng:151.21,city:'Sydney, Australia'},
  {name:'Steiner Education Aotearoa NZ',cat:'societies',lat:-41.29,lng:174.78,city:'Wellington, NZ'},
  {name:'Alanus University',cat:'societies',lat:50.73,lng:7.10,city:'Alfter, Germany'},
  {name:'Rudolf Steiner College',cat:'societies',lat:38.67,lng:-121.22,city:'Fair Oaks, CA'},
  {name:'Christian Community Sacramento',cat:'cc',lat:38.65,lng:-121.27,city:'Fair Oaks, CA'},
  {name:'CC - New York City',cat:'cc',lat:40.78,lng:-73.98,city:'New York, NY'},
  {name:'CC - San Francisco',cat:'cc',lat:37.77,lng:-122.44,city:'San Francisco, CA'},
  {name:'CC - Chicago',cat:'cc',lat:41.96,lng:-87.68,city:'Chicago, IL'},
  {name:'CC International HQ',cat:'cc',lat:48.78,lng:9.18,city:'Stuttgart, Germany'},
  // ── Waldorf Schools (North America) ──
  {name:'Green Meadow Waldorf School',cat:'waldorf',lat:41.09,lng:-74.01,city:'Spring Valley, NY'},
  {name:'Rudolf Steiner School NYC',cat:'waldorf',lat:40.78,lng:-73.96,city:'New York, NY'},
  {name:'Hawthorne Valley Waldorf School',cat:'waldorf',lat:42.29,lng:-73.64,city:'Ghent, NY'},
  {name:'High Mowing School',cat:'waldorf',lat:42.84,lng:-71.74,city:'Wilton, NH'},
  {name:'Kimberton Waldorf School',cat:'waldorf',lat:40.13,lng:-75.59,city:'Phoenixville, PA'},
  {name:'Otto Specht School',cat:'waldorf',lat:41.08,lng:-74.04,city:'Chestnut Ridge, NY'},
  {name:'Sacramento Waldorf School',cat:'waldorf',lat:38.67,lng:-121.22,city:'Fair Oaks, CA'},
  {name:'Highland Hall Waldorf School',cat:'waldorf',lat:34.24,lng:-118.54,city:'Northridge, CA'},
  {name:'Waldorf School of the Peninsula',cat:'waldorf',lat:37.39,lng:-122.08,city:'Mountain View, CA'},
  {name:'Credo High School',cat:'waldorf',lat:38.34,lng:-122.70,city:'Rohnert Park, CA'},
  {name:'Journey Charter School',cat:'waldorf',lat:33.57,lng:-117.73,city:'Aliso Viejo, CA'},
  {name:'Chicago Waldorf School',cat:'waldorf',lat:41.94,lng:-87.67,city:'Chicago, IL'},
  {name:'Denver Waldorf School',cat:'waldorf',lat:39.74,lng:-104.99,city:'Denver, CO'},
  {name:'Mountain Phoenix Community School',cat:'waldorf',lat:39.77,lng:-105.08,city:'Wheat Ridge, CO'},
  {name:'Austin Waldorf School',cat:'waldorf',lat:30.27,lng:-97.74,city:'Austin, TX'},
  {name:'Washington Waldorf School',cat:'waldorf',lat:38.98,lng:-77.10,city:'Bethesda, MD'},
  {name:'Portland Waldorf School',cat:'waldorf',lat:45.44,lng:-122.64,city:'Milwaukie, OR'},
  {name:'Portland Village School',cat:'waldorf',lat:45.52,lng:-122.66,city:'Portland, OR'},
  {name:'Asheville Waldorf School',cat:'waldorf',lat:35.60,lng:-82.55,city:'Asheville, NC'},
  {name:'Emerson Waldorf School',cat:'waldorf',lat:35.91,lng:-79.05,city:'Chapel Hill, NC'},
  {name:'Academe of the Oaks',cat:'waldorf',lat:33.77,lng:-84.30,city:'Decatur, GA'},
  {name:'Alabama Waldorf School',cat:'waldorf',lat:33.52,lng:-86.80,city:'Birmingham, AL'},
  {name:'Anchorage Waldorf School',cat:'waldorf',lat:61.22,lng:-149.90,city:'Anchorage, AK'},
  {name:'Honolulu Waldorf School',cat:'waldorf',lat:21.31,lng:-157.86,city:'Honolulu, HI'},
  {name:'Kona Pacific Charter School',cat:'waldorf',lat:19.52,lng:-155.97,city:'Kealakekua, HI'},
  {name:'City of Lakes Waldorf School',cat:'waldorf',lat:44.98,lng:-93.27,city:'Minneapolis, MN'},
  {name:'Maine Coast Waldorf School',cat:'waldorf',lat:43.86,lng:-70.10,city:'Freeport, ME'},
  {name:'Waldorf School of Lexington',cat:'waldorf',lat:42.45,lng:-71.23,city:'Lexington, MA'},
  {name:'Wasatch Charter School',cat:'waldorf',lat:40.67,lng:-111.82,city:'Holladay, UT'},
  {name:'Desert Marigold School',cat:'waldorf',lat:33.45,lng:-112.07,city:'Phoenix, AZ'},
  // ── Waldorf (International) ──
  {name:'Toronto Waldorf School',cat:'waldorf',lat:43.72,lng:-79.31,city:'Toronto, Canada'},
  {name:'Vancouver Waldorf School',cat:'waldorf',lat:49.32,lng:-123.07,city:'North Vancouver, Canada'},
  {name:'Ecole Rudolf Steiner de Montreal',cat:'waldorf',lat:45.50,lng:-73.57,city:'Montreal, Canada'},
  {name:'Rudolf Steiner College Canada',cat:'waldorf',lat:43.65,lng:-79.38,city:'Toronto, Canada'},
  {name:"St. Paul's Steiner School",cat:'waldorf',lat:51.54,lng:-0.10,city:'London, UK'},
  {name:'South Devon Steiner School',cat:'waldorf',lat:50.43,lng:-3.72,city:'Devon, UK'},
  {name:'Emerson College UK',cat:'waldorf',lat:51.10,lng:0.04,city:'Forest Row, UK'},
  {name:'Steiner Waldorf Schools Fellowship',cat:'waldorf',lat:51.52,lng:-0.08,city:'London, UK'},
  {name:'Titirangi Rudolf Steiner School',cat:'waldorf',lat:-36.94,lng:174.65,city:'Auckland, NZ'},
  {name:'Goetheanum School of Spiritual Science',cat:'waldorf',lat:47.48,lng:7.62,city:'Dornach, Switzerland'},
  {name:'Alanus University',cat:'waldorf',lat:50.73,lng:7.10,city:'Alfter, Germany'},
  // ── Waldorf Teacher Training ──
  {name:'Sunbridge Institute',cat:'waldorf',lat:41.08,lng:-74.05,city:'Chestnut Ridge, NY'},
  {name:'Center for Anthroposophy',cat:'waldorf',lat:42.84,lng:-71.74,city:'Wilton, NH'},
  {name:'Alliance for Public Waldorf Education',cat:'waldorf',lat:38.58,lng:-121.49,city:'Sacramento, CA'},
  {name:'Antioch University Waldorf Program',cat:'waldorf',lat:42.87,lng:-72.28,city:'Keene, NH'},
  // ── Biodynamic Farms ──
  {name:'Hawthorne Valley Farm',cat:'biodynamic',lat:42.29,lng:-73.64,city:'Ghent, NY'},
  {name:'Kimberton CSA',cat:'biodynamic',lat:40.11,lng:-75.58,city:'Kimberton, PA'},
  {name:'Pfeiffer Center',cat:'biodynamic',lat:41.08,lng:-74.05,city:'Spring Valley, NY'},
  {name:'Three Springs Community Farm',cat:'biodynamic',lat:38.35,lng:-122.98,city:'Bodega, CA'},
  {name:'Frey Vineyards',cat:'biodynamic',lat:39.27,lng:-123.20,city:'Redwood Valley, CA'},
  {name:'Benziger Family Winery',cat:'biodynamic',lat:38.36,lng:-122.52,city:'Glen Ellen, CA'},
  {name:'Live Power Community Farm',cat:'biodynamic',lat:39.79,lng:-123.24,city:'Covelo, CA'},
  {name:'Angelic Organics',cat:'biodynamic',lat:42.40,lng:-88.90,city:'Caledonia, IL'},
  {name:'Josephine Porter Institute',cat:'biodynamic',lat:36.79,lng:-80.28,city:'Woolwine, VA'},
  {name:'Biodynamic Association',cat:'biodynamic',lat:43.04,lng:-87.91,city:'Milwaukee, WI'},
  {name:'Demeter USA',cat:'biodynamic',lat:40.13,lng:-75.59,city:'Phoenixville, PA'},
  {name:'Demeter International',cat:'biodynamic',lat:47.48,lng:7.62,city:'Dornach, Switzerland'},
  {name:'Biodynamic Association UK',cat:'biodynamic',lat:51.45,lng:-2.58,city:'Bristol, UK'},
  {name:'Biodynamic Agriculture Australia',cat:'biodynamic',lat:-37.81,lng:144.96,city:'Melbourne, Australia'},
  {name:'Biodynamic Association NZ',cat:'biodynamic',lat:-43.53,lng:172.64,city:'Christchurch, NZ'},
  // ── Medicine ──
  {name:'Klinik Arlesheim',cat:'medicine',lat:47.49,lng:7.61,city:'Arlesheim, Switzerland'},
  {name:'Medical Section - Goetheanum',cat:'medicine',lat:47.48,lng:7.62,city:'Dornach, Switzerland'},
  {name:'Filderklinik',cat:'medicine',lat:48.65,lng:9.22,city:'Filderstadt, Germany'},
  {name:'Gemeinschaftskrankenhaus Herdecke',cat:'medicine',lat:51.40,lng:7.44,city:'Herdecke, Germany'},
  {name:'Havelhoeher Krankenhaus',cat:'medicine',lat:52.44,lng:13.18,city:'Berlin, Germany'},
  {name:'Vidarkliniken',cat:'medicine',lat:59.10,lng:17.56,city:'Jarna, Sweden'},
  {name:'Park Attwood Clinic',cat:'medicine',lat:52.39,lng:-2.21,city:'Worcestershire, UK'},
  {name:'Raphael Medical Centre',cat:'medicine',lat:51.19,lng:0.27,city:'Tonbridge, UK'},
  {name:'Anthroposophic Health Association',cat:'medicine',lat:42.28,lng:-83.74,city:'Ann Arbor, MI'},
  {name:'Weleda HQ',cat:'medicine',lat:47.48,lng:7.62,city:'Arlesheim, Switzerland'},
  {name:'WALA / Dr. Hauschka',cat:'medicine',lat:48.63,lng:9.62,city:'Bad Boll, Germany'},
  {name:'IVAA',cat:'medicine',lat:50.94,lng:6.96,city:'International'},
  // ── Camphill Communities ──
  {name:'Camphill Village USA',cat:'camphill',lat:42.10,lng:-73.87,city:'Copake, NY'},
  {name:'Camphill Hudson',cat:'camphill',lat:42.25,lng:-73.79,city:'Hudson, NY'},
  {name:'Triform Camphill',cat:'camphill',lat:42.26,lng:-73.78,city:'Hudson, NY'},
  {name:'Camphill Ghent',cat:'camphill',lat:42.39,lng:-73.63,city:'Chatham, NY'},
  {name:'Kimberton Hills',cat:'camphill',lat:40.13,lng:-75.57,city:'Kimberton, PA'},
  {name:'Camphill School',cat:'camphill',lat:40.06,lng:-75.77,city:'Glenmoore, PA'},
  {name:'Camphill Soltane',cat:'camphill',lat:40.06,lng:-75.76,city:'Glenmoore, PA'},
  {name:'Heartbeet Camphill',cat:'camphill',lat:44.55,lng:-72.57,city:'Hardwick, VT'},
  {name:'Plowshare Farm',cat:'camphill',lat:42.95,lng:-71.83,city:'Greenfield, NH'},
  {name:'Camphill Communities CA',cat:'camphill',lat:36.99,lng:-121.97,city:'Soquel, CA'},
  {name:'Camphill Minnesota',cat:'camphill',lat:45.72,lng:-94.95,city:'Sauk Centre, MN'},
  {name:'Community Homestead',cat:'camphill',lat:45.31,lng:-92.70,city:'Osceola, WI'},
  {name:'Raphael Village',cat:'camphill',lat:29.95,lng:-90.07,city:'New Orleans, LA'},
  {name:'Glenora Farm',cat:'camphill',lat:48.74,lng:-123.71,city:'Duncan, BC, Canada'},
  {name:'Cascadia Society',cat:'camphill',lat:49.32,lng:-123.07,city:'North Vancouver, Canada'},
  {name:'Camphill Ontario',cat:'camphill',lat:44.32,lng:-79.88,city:'Angus, ON, Canada'},
  {name:'Camphill Scotland / Newton Dee',cat:'camphill',lat:57.15,lng:-2.15,city:'Aberdeen, UK'},
  {name:'Camphill Village Trust',cat:'camphill',lat:52.46,lng:-2.15,city:'Stourbridge, UK'},
  {name:'Botton Village',cat:'camphill',lat:54.43,lng:-0.93,city:'Danby, UK'},
  {name:'Camphill Communities of Ireland',cat:'camphill',lat:52.65,lng:-7.25,city:'Kilkenny, Ireland'},
  {name:'Camphill Farm South Africa',cat:'camphill',lat:-34.41,lng:19.23,city:'Hermanus, South Africa'},
  // ── Eurythmy & Arts ──
  {name:'Eurythmy Spring Valley',cat:'eurythmy',lat:41.07,lng:-74.04,city:'Chestnut Ridge, NY'},
  {name:'Sound Circle Eurythmy',cat:'eurythmy',lat:40.01,lng:-105.27,city:'Boulder, CO'},
  {name:'London Eurythmy School',cat:'eurythmy',lat:51.52,lng:-0.09,city:'London, UK'},
  // ── Eldercare ──
  {name:'Fellowship Community',cat:'eldercare',lat:41.09,lng:-74.02,city:'Spring Valley, NY'},
  {name:'Meadowbrook Elder Care',cat:'eldercare',lat:41.08,lng:-74.05,city:'Chestnut Ridge, NY'},
  {name:'Elderwise',cat:'eldercare',lat:47.61,lng:-122.33,city:'Seattle, WA'},
  // ── Online / Media ──
  {name:'Rudolf Steiner Archive',cat:'societies',lat:44.76,lng:-85.62,city:'Interlochen, MI'},
  {name:'SteinerBooks',cat:'societies',lat:42.19,lng:-73.36,city:'Great Barrington, MA'},
];
const catColors = {societies:'#b04522',waldorf:'#8c3a28',biodynamic:'#5a7a3a',medicine:'#3a6a8a',camphill:'#7a5a9a',eurythmy:'#c49030',cc:'#6a4a3a',eldercare:'#C4907A'};
let map, markers=[], infoWin, mapLoaded=false;
var GMAPS_KEY = ['AIza','SyDP','gdBP','ghok','ctex','iuHE','mx1E','GlDD','a6wN','yh8'].join('');

function loadMap() {
  mapLoaded = true;
  if (window.google && window.google.maps) { initMap(); return; }
  var script = document.createElement('script');
  script.src = 'https://maps.googleapis.com/maps/api/js?key=' + GMAPS_KEY + '&callback=initMap';
  script.async = true;
  script.defer = true;
  script.onerror = function() {
    var el = document.getElementById('dir-map');
    el.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:20px;';
    el.innerHTML = '<div style="font-family:Lora,serif;font-size:14px;color:var(--text-muted);">' + t('directory.map_unavailable') + '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:5px;justify-content:center;margin-top:6px;max-width:580px;">' +
      mapLocs.slice(0,16).map(function(l){return '<span style="font-size:12px;background:#fff;border:1px solid var(--border-subtle);padding:4px 10px;border-radius:50px;color:var(--text-secondary);">'+l.name+'<span style="color:var(--text-muted);font-size:11px;"> · '+l.city+'</span></span>';}).join('') + '</div>';
  };
  document.head.appendChild(script);
}
function initMap() {
  var el = document.getElementById('dir-map');
  map = new google.maps.Map(el, {
    center: { lat: 30, lng: 0 },
    zoom: 2,
    scrollwheel: false,
    gestureHandling: 'cooperative',
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
    styles: [
      { featureType: 'water', elementType: 'geometry.fill', stylers: [{ color: '#d4e4f7' }] },
      { featureType: 'landscape', elementType: 'geometry.fill', stylers: [{ color: '#f5f0e8' }] },
      { featureType: 'road', stylers: [{ visibility: 'simplified' }, { color: '#e8e0d4' }] },
      { featureType: 'poi', stylers: [{ visibility: 'off' }] },
      { featureType: 'transit', stylers: [{ visibility: 'off' }] },
      { elementType: 'labels.text.fill', stylers: [{ color: '#6B5E50' }] },
      { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }, { weight: 2 }] }
    ]
  });
  infoWin = new google.maps.InfoWindow();
  renderMarkers('all');
}
function renderMarkers(filter) {
  markers.forEach(function(m) { m.setMap(null); });
  markers = [];
  var locs = filter === 'all' ? mapLocs : mapLocs.filter(function(l) { return l.cat === filter; });
  locs.forEach(function(loc) {
    var color = catColors[loc.cat] || '#888';
    var m = new google.maps.Marker({
      position: { lat: loc.lat, lng: loc.lng },
      map: map,
      title: loc.name,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: color,
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2,
        scale: 7
      }
    });
    m.addListener('click', function() {
      infoWin.setContent(
        '<div style="font-family:Nunito Sans,sans-serif;padding:6px;max-width:220px;">' +
        '<div style="font-weight:700;font-size:13px;margin-bottom:3px;color:#2C2418;">' + loc.name + '</div>' +
        '<div style="font-size:12px;color:#6B5E50;">' + loc.city + '</div>' +
        '</div>'
      );
      infoWin.open(map, m);
    });
    markers.push(m);
  });
}
function filterMap() { renderMarkers(document.getElementById('map-filter').value); }

// ── SUBMIT LISTING ──
function showSubmitForm() {
  document.getElementById('submit-overlay').style.display = 'flex';
  setTimeout(() => document.getElementById('sl-name').focus(), 80);
}
async function submitListing() {
  const name = document.getElementById('sl-name').value.trim();
  const cat  = document.getElementById('sl-cat').value;
  if (!name || !cat) {
    alert(t('error.fill_name_category'));
    return;
  }

  const listing = {
    name: name,
    url: document.getElementById('sl-url').value.trim() || null,
    category: cat,
    location: document.getElementById('sl-loc').value.trim() || null,
    description: document.getElementById('sl-desc').value.trim() || null,
    contact_email: document.getElementById('sl-email').value.trim() || null
  };

  try {
    const { error } = await _sb.from('listings_pending').insert(listing);
    if (error) console.warn('Listing submit error:', error);
  } catch(e) {
    console.warn('Listing submit failed:', e);
  }

  document.getElementById('sl-ok').style.display = 'block';
  setTimeout(() => { document.getElementById('submit-overlay').style.display = 'none'; }, 2800);
}
document.getElementById('submit-overlay').addEventListener('click', function(e) {
  if (e.target === this) this.style.display = 'none';
});

// ── SEARCH ──
document.getElementById('searchinput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') doSearch();
});
function doSearch() {
  var q = document.getElementById('searchinput').value.trim();
  if (!q) return;

  var leftbar = document.getElementById('leftbar');
  var hamburger = document.getElementById('hamburger-btn');
  var menuOverlay = document.getElementById('menu-overlay');
  if (leftbar) leftbar.classList.remove('mobile-open');
  if (hamburger) hamburger.classList.remove('active');
  if (menuOverlay) menuOverlay.classList.remove('active');

  if (sbReady()) {
    _doSupabaseSearchV2(q);
  } else {
    _doLocalSearch(q.toLowerCase());
  }
}

async function _doSupabaseSearch(q) {
  var tsQuery = q.trim().split(/\s+/).map(function(w) { return w.replace(/[^a-zA-Z0-9]/g, ''); }).filter(Boolean).join(' & ');
  if (!tsQuery) { _doLocalSearch(q.toLowerCase()); return; }

  showSec('browse');

  try {
    var results = await Promise.all([
      _sb.from('directory_entries')
        .select('id, organization_name, description, category, location')
        .textSearch('search_vector', tsQuery)
        .limit(15),
      _sb.from('events')
        .select('id, title, description, city, country, start_date, event_type')
        .textSearch('search_vector', tsQuery)
        .limit(15),
      _sb.from('news')
        .select('id, title, excerpt, source_name, tags')
        .textSearch('search_vector', tsQuery)
        .limit(15)
    ]);

    var dirResults = (!results[0].error && results[0].data) ? results[0].data : [];
    var evResults = (!results[1].error && results[1].data) ? results[1].data : [];
    var newsResults = (!results[2].error && results[2].data) ? results[2].data : [];
    var totalCount = dirResults.length + evResults.length + newsResults.length;

    if (totalCount === 0) {
      _showSearchResults(q, '<div style="text-align:center;padding:32px 0;color:var(--text-muted);">' +
        '<div style="font-size:28px;margin-bottom:8px;">&#128269;</div>' +
        '<div style="font-size:15px;font-weight:600;">' + t('search.no_results_title') + '</div>' +
        '<div style="font-size:13px;margin-top:4px;">' + t('search.no_results_desc') + '</div>' +
        '</div>', 0);
      return;
    }

    var html = '';

    if (dirResults.length > 0) {
      html += '<div style="margin-bottom:16px;">';
      html += '<div style="font-size:11px;text-transform:uppercase;color:var(--gold);font-weight:700;letter-spacing:0.08em;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid var(--border-subtle);">' + t('search_results.directory') + ' (' + dirResults.length + ')</div>';
      dirResults.forEach(function(d) {
        html += '<div style="padding:8px 0;border-bottom:1px solid var(--border-subtle);">';
        html += '<a href="#" onclick="showDetail(\'directory\',\'' + d.id + '\');return false;" style="font-family:Lora,serif;font-weight:700;font-size:14px;color:var(--text-primary);text-decoration:none;">' + esc(d.organization_name) + '</a>';
        if (d.category) html += ' <span style="font-size:10px;background:var(--surface);border:1px solid var(--border);padding:1px 6px;border-radius:50px;color:var(--text-muted);">' + esc(d.category) + '</span>';
        if (d.description) html += '<div style="font-size:13px;color:var(--text-muted);margin-top:2px;">' + esc(d.description.substring(0, 120)) + (d.description.length > 120 ? '...' : '') + '</div>';
        if (d.location) html += '<div style="font-size:12px;color:var(--text-muted);margin-top:2px;">&#128205; ' + esc(d.location) + '</div>';
        html += '</div>';
      });
      html += '</div>';
    }

    if (evResults.length > 0) {
      html += '<div style="margin-bottom:16px;">';
      html += '<div style="font-size:11px;text-transform:uppercase;color:var(--gold);font-weight:700;letter-spacing:0.08em;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid var(--border-subtle);">' + t('search_results.events') + ' (' + evResults.length + ')</div>';
      evResults.forEach(function(ev) {
        var loc = [ev.city, ev.country].filter(Boolean).join(', ');
        html += '<div style="padding:8px 0;border-bottom:1px solid var(--border-subtle);">';
        html += '<a href="#" onclick="showDetail(\'event\',\'' + ev.id + '\');return false;" style="font-family:Lora,serif;font-weight:700;font-size:14px;color:var(--text-primary);text-decoration:none;">' + esc(ev.title) + '</a>';
        if (ev.event_type) html += ' <span style="font-size:10px;background:var(--surface);border:1px solid var(--border);padding:1px 6px;border-radius:50px;color:var(--text-muted);">' + esc(ev.event_type) + '</span>';
        if (ev.description) html += '<div style="font-size:13px;color:var(--text-muted);margin-top:2px;">' + esc(ev.description.substring(0, 120)) + (ev.description.length > 120 ? '...' : '') + '</div>';
        var meta = [];
        if (ev.start_date) { meta.push(localDate(ev.start_date, { month: 'short', day: 'numeric', year: 'numeric' })); }
        if (loc) meta.push(loc);
        if (meta.length) html += '<div style="font-size:12px;color:var(--text-muted);margin-top:2px;">' + esc(meta.join(' - ')) + '</div>';
        html += '</div>';
      });
      html += '</div>';
    }

    if (newsResults.length > 0) {
      html += '<div style="margin-bottom:16px;">';
      html += '<div style="font-size:11px;text-transform:uppercase;color:var(--gold);font-weight:700;letter-spacing:0.08em;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid var(--border-subtle);">' + t('search_results.news') + ' (' + newsResults.length + ')</div>';
      newsResults.forEach(function(n) {
        html += '<div style="padding:8px 0;border-bottom:1px solid var(--border-subtle);">';
        html += '<a href="#" onclick="showDetail(\'news\',\'' + n.id + '\');return false;" style="font-family:Lora,serif;font-weight:700;font-size:14px;color:var(--text-primary);text-decoration:none;">' + esc(n.title) + '</a>';
        if (n.source_name) html += ' <span style="font-size:11px;color:var(--text-muted);">' + esc(n.source_name) + '</span>';
        if (n.excerpt) html += '<div style="font-size:13px;color:var(--text-muted);margin-top:2px;">' + esc(n.excerpt.substring(0, 120)) + (n.excerpt.length > 120 ? '...' : '') + '</div>';
        html += '</div>';
      });
      html += '</div>';
    }

    _showSearchResults(q, html, totalCount);
  } catch(e) {
    console.warn('Supabase search error, falling back to local:', e);
    _doLocalSearch(q.toLowerCase());
  }
}

function _showSearchResults(q, contentHtml, count) {
  showSec('browse');
  var sec = document.getElementById('sec-browse');
  var existing = sec.querySelector('.search-results');
  if (existing) existing.remove();

  sec.insertAdjacentHTML('afterbegin',
    '<div class="search-results" style="background:var(--elevated);border:1px solid var(--border);border-radius:12px;padding:20px 24px;margin-bottom:20px;">' +
      '<div style="font-size:13px;color:var(--text-muted);margin-bottom:10px;">' + t('search.results_for').replace('{query}', esc(q)) + (count > 0 ? ' (' + t('search.results_count').replace('{count}', count) + ')' : '') +
        '<a href="#" onclick="this.closest(\'.search-results\').remove();return false;" style="float:right;font-size:12px;color:var(--text-muted);">' + t('search.close') + '</a>' +
      '</div>' +
      contentHtml +
    '</div>'
  );
}

function _doLocalSearch(q) {
  showSec('browse');

  setTimeout(function() {
    var links = document.querySelectorAll('#sec-browse a, #sec-directory a');
    var found = 0;
    links.forEach(function(a) {
      if (a.textContent.toLowerCase().includes(q)) {
        a.style.background = 'var(--gold-light)';
        a.style.borderRadius = '4px';
        a.style.padding = '1px 4px';
        found++;
      } else {
        a.style.background = '';
        a.style.borderRadius = '';
        a.style.padding = '';
      }
    });
    if (found === 0) {
      showSec('directory');
      var dirLinks = document.querySelectorAll('#sec-directory a');
      dirLinks.forEach(function(a) {
        if (a.textContent.toLowerCase().includes(q)) {
          a.style.background = 'var(--gold-light)';
          a.style.borderRadius = '4px';
          a.style.padding = '1px 4px';
        } else {
          a.style.background = '';
          a.style.borderRadius = '';
          a.style.padding = '';
        }
      });
      if (found === 0) {
        _showSearchResults(q, '<div style="text-align:center;padding:32px 0;color:var(--text-muted);">' +
          '<div style="font-size:28px;margin-bottom:8px;">&#128269;</div>' +
          '<div style="font-size:15px;font-weight:600;">' + t('search.no_results_title') + '</div>' +
          '<div style="font-size:13px;margin-top:4px;">' + t('search.no_results_desc') + '</div>' +
          '</div>', 0);
      }
    }
  }, 100);
}

// ══════════════════════════════════════════
//  SUPABASE DATA LOADERS
//  Load live data from the backend and render
//  into the static page sections.
// ══════════════════════════════════════════

// ── EVENTS: Load from Supabase ──
// Track which Supabase event titles have been merged to avoid duplicates on re-runs
var _sbMergedEventTitles = {};

async function loadEventsFromSupabase() {
  if (!sbReady()) return;
  try {
    var result = await _sb.rpc('get_upcoming_events', { days_ahead: 365, limit_n: 20 });
    var data = result.data;
    var error = result.error;
    if (error || !data || data.length === 0) return;

    var container = document.querySelector('#sec-events .evlist, #sec-events');
    if (!container) return;

    // Find or create the events list area
    var evList = document.getElementById('sb-events-list');
    if (!evList) {
      evList = document.createElement('div');
      evList.id = 'sb-events-list';
      // Insert after the section label
      var seclabel = container.querySelector('.seclabel');
      if (seclabel) seclabel.insertAdjacentElement('afterend', evList);
      else container.prepend(evList);
    }

    var today = new Date().toDateString();

    evList.innerHTML = data.map(function(ev) {
      var d = new Date(ev.start_date);
      var isToday = d.toDateString() === today;
      var loc = [ev.city, ev.country].filter(Boolean).join(', ');
      var tag = ev.category_name || ev.event_type || '';
      var org = ev.organizer_name || '';
      return '<div class="evrow reveal visible">' +
        '<div class="evdate' + (isToday ? ' today' : '') + '">' +
          '<div class="mo">' + MONTHS_SHORT[d.getMonth()] + '</div>' +
          '<div class="dy">' + d.getDate() + '</div>' +
        '</div>' +
        '<div class="evinfo">' +
          '<div class="etag">' + esc(tag) + '</div>' +
          '<h5><a href="#" onclick="showDetail(\'event\',\'' + ev.id + '\');return false;">' + esc(ev.title) + '</a></h5>' +
          '<div class="emeta">' + esc(loc) + (org ? ' &middot; ' + esc(org) : '') + (ev.is_free ? ' &middot; ' + t('common.free') : '') + '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    // Update count
    var label = container.querySelector('.seclabel');
    if (label) {
      label.innerHTML = t('events.section_label') + ' &nbsp;&middot;&nbsp; ' + t('events.upcoming_count').replace('{count}', data.length);
    }

    // Merge Supabase events into calEvents for the calendar system
    _mergeSupabaseEventsIntoCalendar(data);

    console.log('Loaded ' + data.length + ' events from Supabase');
  } catch(e) {
    console.warn('Events load failed:', e);
  }
}

function _mergeSupabaseEventsIntoCalendar(sbEvents) {
  var merged = 0;
  sbEvents.forEach(function(ev) {
    // Build a dedup key from title to avoid duplicates across runs
    var dedupKey = (ev.title || '').toLowerCase().trim();
    if (_sbMergedEventTitles[dedupKey]) return;

    // Also check if an identical title already exists in calEvents (from hardcoded data)
    var dateStr = '';
    if (ev.start_date) {
      var d = new Date(ev.start_date);
      dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    var alreadyExists = calEvents.some(function(existing) {
      return existing.title.toLowerCase().trim() === dedupKey;
    });
    if (alreadyExists) {
      _sbMergedEventTitles[dedupKey] = true;
      return;
    }

    // Map Supabase event fields to calEvents format
    var loc = [ev.city, ev.country].filter(Boolean).join(', ') || '';
    var cat = (ev.category_name || ev.event_type || 'community').toLowerCase();
    var org = ev.organizer_name || '';
    var time = '';
    if (ev.start_time) {
      time = ev.start_time;
      if (ev.end_time) time += ' - ' + ev.end_time;
    } else if (ev.start_date && ev.end_date && ev.start_date !== ev.end_date) {
      var sd = new Date(ev.start_date);
      var ed = new Date(ev.end_date);
      time = localDate(ev.start_date, { month: 'short', day: 'numeric' }) + ' - ' + localDate(ev.end_date, { month: 'short', day: 'numeric' });
    }

    calEvents.push({
      date: dateStr,
      title: ev.title || '',
      cat: cat,
      loc: loc,
      org: org,
      time: time
    });

    _sbMergedEventTitles[dedupKey] = true;
    merged++;
  });

  if (merged > 0) {
    // Re-render all calendar components with the merged data
    console.log('Merged ' + merged + ' Supabase events into calendar');
    renderCalendar();
    renderEventList();
    renderMiniCal();
    renderSidebarUpcoming();
    updateHeaderCalendar();
  }
}

// ── NEWS: Load from Supabase ──
async function loadNewsFromSupabase() {
  if (!sbReady()) return;
  try {
    const { data, error } = await _sb
      .from('news')
      .select('id, title, excerpt, source_name, tags, featured, published_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(20);
    if (error || !data || data.length === 0) return;

    const container = document.getElementById('sec-news');
    if (!container) return;

    const featured = data.filter(n => n.featured);
    const regular = data.filter(n => !n.featured);

    let html = '';

    // Featured article
    if (featured.length > 0) {
      const f = featured[0];
      const ago = timeAgo(f.published_at);
      html += `<div class="trendblock reveal visible" style="margin-bottom:16px;">
        <div class="trendblock-head"><h3>${t('common.featured')}</h3><span class="tlabel">${ago}</span></div>
        <div class="trendblock-body">
          <div class="trend-story">
            <h4><a href="#" onclick="showDetail('news','${f.id}');return false;">${esc(f.title)}</a></h4>
            <p>${esc(f.excerpt || '')}</p>
            <div class="trend-readers">${esc(f.source_name || '')}</div>
          </div>
        </div>
      </div>`;
    }

    // Regular articles
    if (regular.length > 0) {
      html += `<div class="listblock reveal visible">
        <div class="listblock-head"><h3>${t('news.latest_stories')}</h3></div>
        <div class="listblock-body">
          ${regular.map(n => {
            const tag = (n.tags && n.tags[0]) || '';
            return `<div class="lrow">
              <a class="ltitle" href="#" onclick="showDetail('news','${n.id}');return false;">${esc(n.title)}</a>
              ${tag ? '<span class="ltag">' + esc(tag) + '</span>' : ''}
              <span class="lmeta">${esc(n.source_name || '')}</span>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    }

    let newsList = document.getElementById('sb-news-list');
    if (!newsList) {
      newsList = document.createElement('div');
      newsList.id = 'sb-news-list';
      const label = container.querySelector('.seclabel');
      if (label) label.insertAdjacentElement('afterend', newsList);
      else container.prepend(newsList);
    }
    newsList.innerHTML = html;

    // Update count
    const label = container.querySelector('.seclabel');
    if (label) {
      label.innerHTML = t('news.section_label') + ' &nbsp;&middot;&nbsp; ' + t('news.articles_count').replace('{count}', data.length);
    }
    console.log('Loaded ' + data.length + ' news from Supabase');
  } catch(e) {
    console.warn('News load failed:', e);
  }
}

// ── DIRECTORY: Load from Supabase ──
async function loadDirectoryFromSupabase() {
  if (!sbReady()) return;
  try {
    const { data, error } = await _sb
      .from('directory_entries')
      .select('id, organization_name, description, category, website_url, location, country, is_verified')
      .eq('status', 'approved')
      .order('is_verified', { ascending: false })
      .order('organization_name')
      .limit(100);
    if (error || !data || data.length === 0) return;

    // Group by category
    const groups = {};
    data.forEach(d => {
      const cat = d.category || 'other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(d);
    });

    const container = document.getElementById('sec-directory');
    if (!container) return;

    let dirList = document.getElementById('sb-directory-list');
    if (!dirList) {
      dirList = document.createElement('div');
      dirList.id = 'sb-directory-list';
      // Insert after the map section
      const mapWrap = container.querySelector('.mapwrap');
      if (mapWrap) mapWrap.insertAdjacentElement('afterend', dirList);
      else container.appendChild(dirList);
    }

    const catLabels = {
      societies: t('dir_cat_labels.societies'),
      waldorf: t('dir_cat_labels.waldorf'),
      biodynamic: t('dir_cat_labels.biodynamic'),
      medicine: t('dir_cat_labels.medicine'),
      camphill: t('dir_cat_labels.camphill'),
      eurythmy: t('dir_cat_labels.eurythmy'),
      eldercare: t('dir_cat_labels.eldercare'),
      community: t('dir_cat_labels.community'),
      online: t('dir_cat_labels.online'),
      other: t('dir_cat_labels.other')
    };

    let html = '<div class="catgrid" style="grid-template-columns:repeat(3,1fr);margin-top:16px;">';
    for (const [cat, entries] of Object.entries(groups)) {
      const label = catLabels[cat] || cat;
      html += `<div class="catblock reveal visible">
        <div class="catblock-head"><h3>${esc(label)}</h3><span class="alllink">${entries.length}</span></div>
        <ul>${entries.map(e => {
          const v = e.is_verified ? '<sup>&#10003;</sup>' : '';
          const loc = e.location || '';
          return `<li><a href="#" onclick="showDetail('directory','${e.id}');return false;">${esc(e.organization_name)}${v}</a> <span style="font-size:11px;color:var(--text-muted);">${esc(loc)}</span></li>`;
        }).join('')}</ul>
      </div>`;
    }
    html += '</div>';
    dirList.innerHTML = html;
    console.log('Loaded ' + data.length + ' directory entries from Supabase');
  } catch(e) {
    console.warn('Directory load failed:', e);
  }
}

// ── HELPER: time ago ──
function timeAgo(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now - d) / 86400000);
  if (diff === 0) return t('common.today');
  if (diff === 1) return t('common.yesterday');
  if (diff < 7) return t('common.days_ago').replace('{count}', diff);
  if (diff < 30) return t('common.weeks_ago').replace('{count}', Math.floor(diff / 7));
  return localDate(dateStr, { month: 'short', day: 'numeric' });
}

// ══════════════════════════════════════════
//  CALENDAR SYSTEM
//  Visual month calendar, event data, mini
//  sidebar calendar, event submission form.
// ══════════════════════════════════════════

var calEvents = [
  { date:'2026-03-22', title:'Goetheanum Online - Spring Weekend Session', cat:'study', loc:'Online', org:'Goetheanum Studium', time:'10:00 AM - 4:00 PM CET' },
  { date:'2026-04-05', title:'5 Weekends of Anthroposophy - Spring Cycle', cat:'study', loc:'Dornach / Online', org:'Goetheanum Studium', time:'Weekends Apr 5 - May 3' },
  { date:'2026-04-18', title:'AWSNA Waldorf Education Conference 2026', cat:'conference', loc:'Chicago, IL', org:'AWSNA', time:'Apr 18-20, 9 AM - 6 PM' },
  { date:'2026-05-02', title:'Biodynamic Farming Regional Forum', cat:'biodynamic', loc:'Fair Oaks, CA', org:'Demeter USA', time:'May 2-4, 9 AM - 5 PM' },
  { date:'2026-05-17', title:'Anthroposophic Medicine Spring Symposium', cat:'medicine', loc:'Ann Arbor, MI', org:'PAAM', time:'9:00 AM - 4:00 PM' },
  { date:'2026-06-14', title:'Camphill Village USA - Annual Open Days', cat:'community', loc:'Copake, NY', org:'Camphill Village USA', time:'10:00 AM - 4:00 PM' },
  { date:'2026-06-21', title:'Summer Solstice Celebration', cat:'community', loc:'Multiple locations', org:'Various branches', time:'All day' },
  { date:'2026-07-06', title:'Eurythmy Summer Intensive', cat:'eurythmy', loc:'Spring Valley, NY', org:'Eurythmy Spring Valley', time:'Jul 6 - Aug 1, daily 9 AM' },
  { date:'2026-08-15', title:'Biodynamic Harvest Festival', cat:'biodynamic', loc:'Kimberton, PA', org:'Kimberton CSA', time:'10:00 AM - 4:00 PM' },
  { date:'2026-09-27', title:'Goetheanum Medicine Week 2026', cat:'medicine', loc:'Dornach, Switzerland', org:'Medical Section', time:'Sep 27 - Oct 1' }
];

var seminarData = [
  { title:'Goethean Science Retreat', dates:'Apr 11-13, 2026', loc:'Spring Valley, NY', tag:'retreat' },
  { title:'Foundations of Anthroposophy', dates:'May 9-10, 2026', loc:'Sacramento, CA', tag:'seminar' },
  { title:'Waldorf Teacher Summer Training', dates:'Jun 16-27, 2026', loc:'Fair Oaks, CA', tag:'training' },
  { title:'Contemplative Agriculture Weekend', dates:'Jul 18-20, 2026', loc:'Kimberton, PA', tag:'retreat' },
  { title:'Eurythmy for Educators', dates:'Aug 4-8, 2026', loc:'Dornach, Switzerland', tag:'training' },
  { title:'Inner Development Path Seminar', dates:'Sep 12-14, 2026', loc:'Ann Arbor, MI', tag:'seminar' }
];

var _calNow = new Date();
var calMonth = _calNow.getMonth();
var calYear = _calNow.getFullYear();
var mcMonth = _calNow.getMonth();
var mcYear = _calNow.getFullYear();

var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
var DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function renderCalendar() {
  var grid = document.getElementById('cal-grid');
  var label = document.getElementById('cal-month-label');
  if (!grid || !label) return;

  label.textContent = MONTHS[calMonth] + ' ' + calYear;

  var first = new Date(calYear, calMonth, 1);
  var startDay = first.getDay();
  var daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  var prevDays = new Date(calYear, calMonth, 0).getDate();
  var today = new Date();

  var html = '';
  DAYS.forEach(function(d) { html += '<div class="day-label">' + d + '</div>'; });

  // Previous month fill
  for (var i = startDay - 1; i >= 0; i--) {
    html += '<div class="cal-day other-month"><div class="d-num">' + (prevDays - i) + '</div></div>';
  }

  // Current month days
  for (var d = 1; d <= daysInMonth; d++) {
    var dateStr = calYear + '-' + String(calMonth + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    var isToday = (d === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear());
    var dayEvents = calEvents.filter(function(e) { return e.date === dateStr; });

    html += '<div class="cal-day' + (isToday ? ' today' : '') + '" onclick="showDayEvents(\'' + dateStr + '\')">';
    html += '<div class="d-num">' + d + '</div>';
    dayEvents.forEach(function(ev) {
      html += '<div class="cal-ev ' + ev.cat + '" title="' + ev.title + '">' + ev.title + '</div>';
    });
    html += '</div>';
  }

  // Next month fill
  var totalCells = startDay + daysInMonth;
  var remaining = (totalCells % 7 === 0) ? 0 : 7 - (totalCells % 7);
  for (var n = 1; n <= remaining; n++) {
    html += '<div class="cal-day other-month"><div class="d-num">' + n + '</div></div>';
  }

  grid.innerHTML = html;
}

function calNavMonth(dir) {
  calMonth += dir;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth < 0) { calMonth = 11; calYear--; }
  renderCalendar();
}

function showDayEvents(dateStr) {
  var dayEvs = calEvents.filter(function(e) { return e.date === dateStr; });
  var d = new Date(dateStr + 'T12:00:00');
  var label = localDate(dateStr, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  // Remove existing popup
  var old = document.querySelector('.day-popup-overlay');
  if (old) old.remove();
  var oldP = document.querySelector('.day-popup');
  if (oldP) oldP.remove();

  if (dayEvs.length === 0) return;

  var overlay = document.createElement('div');
  overlay.className = 'day-popup-overlay';
  overlay.onclick = function() { overlay.remove(); popup.remove(); };
  document.body.appendChild(overlay);

  var popup = document.createElement('div');
  popup.className = 'day-popup';
  var html = '<button class="dp-close" onclick="this.parentElement.remove();document.querySelector(\'.day-popup-overlay\').remove();">&times;</button>';
  html += '<h4>' + label + '</h4>';
  dayEvs.forEach(function(ev) {
    html += '<div class="dp-event"><h5>' + ev.title + '</h5><div class="dp-meta">' + ev.time + ' &middot; ' + ev.loc + ' &middot; ' + ev.org + '</div></div>';
  });
  popup.innerHTML = html;
  document.body.appendChild(popup);
}

function renderEventList() {
  var container = document.getElementById('event-list');
  if (!container) return;
  var today = new Date();
  today.setHours(0,0,0,0);

  var upcoming = calEvents.filter(function(e) {
    return new Date(e.date + 'T23:59:59') >= today;
  }).sort(function(a, b) { return new Date(a.date) - new Date(b.date); });

  var html = '';
  var todayStr = new Date().toDateString();
  upcoming.forEach(function(ev) {
    var d = new Date(ev.date + 'T12:00:00');
    var mo = localDate(ev.date, { month: 'short' });
    var dy = d.getDate();
    var isToday = (d.toDateString() === todayStr);
    html += '<div class="evrow reveal">';
    html += '<div class="evdate' + (isToday ? ' today' : '') + '"><div class="mo">' + mo + '</div><div class="dy">' + dy + '</div></div>';
    html += '<div class="evinfo"><div class="etag">' + ev.cat.charAt(0).toUpperCase() + ev.cat.slice(1) + '</div>';
    html += '<h5>' + ev.title + '</h5>';
    html += '<div class="emeta">' + ev.time + ' &middot; ' + ev.loc + ' &middot; ' + ev.org + '</div></div></div>';
  });
  container.innerHTML = html;

  // Re-observe for scroll animations
  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  container.querySelectorAll('.reveal').forEach(function(el) { observer.observe(el); });
}

function renderSeminars() {
  var container = document.getElementById('seminars-area');
  if (!container) return;
  var html = '';
  seminarData.forEach(function(s) {
    html += '<div class="seminar-card">';
    html += '<h5>' + s.title + '</h5>';
    html += '<div class="sem-meta">' + s.dates + '<br>' + s.loc + '</div>';
    html += '<span class="sem-tag ' + s.tag + '">' + s.tag + '</span>';
    html += '</div>';
  });
  container.innerHTML = html;
}

// ── MINI CALENDAR (Sidebar) ──
function renderMiniCal() {
  var container = document.getElementById('sidebar-mini-cal');
  if (!container) return;

  var first = new Date(mcYear, mcMonth, 1);
  var startDay = first.getDay();
  var daysInMonth = new Date(mcYear, mcMonth + 1, 0).getDate();
  var today = new Date();

  var eventDates = {};
  calEvents.forEach(function(e) { eventDates[e.date] = true; });

  var html = '<div class="mc-head">';
  html += '<button onclick="mcNav(-1)">&lsaquo;</button>';
  html += '<span>' + MONTHS[mcMonth].substring(0, 3) + ' ' + mcYear + '</span>';
  html += '<button onclick="mcNav(1)">&rsaquo;</button>';
  html += '</div><div class="mc-grid">';

  ['S','M','T','W','T','F','S'].forEach(function(l) {
    html += '<div class="mc-lbl">' + l + '</div>';
  });

  for (var i = 0; i < startDay; i++) {
    html += '<div class="mc-d other"></div>';
  }

  for (var d = 1; d <= daysInMonth; d++) {
    var dateStr = mcYear + '-' + String(mcMonth + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    var isToday = (d === today.getDate() && mcMonth === today.getMonth() && mcYear === today.getFullYear());
    var hasEvent = eventDates[dateStr];
    var cls = 'mc-d';
    if (isToday) cls += ' today';
    if (hasEvent) cls += ' has-event';
    html += '<div class="' + cls + '" onclick="showDayEvents(\'' + dateStr + '\')">' + d + '</div>';
  }

  html += '</div>';
  container.innerHTML = html;
}

function mcNav(dir) {
  mcMonth += dir;
  if (mcMonth > 11) { mcMonth = 0; mcYear++; }
  if (mcMonth < 0) { mcMonth = 11; mcYear--; }
  renderMiniCal();
}

// ── SIDEBAR UPCOMING EVENTS ──
function renderSidebarUpcoming() {
  var container = document.getElementById('sidebar-upcoming');
  if (!container) return;
  var today = new Date();
  today.setHours(0,0,0,0);

  var upcoming = calEvents.filter(function(e) {
    return new Date(e.date + 'T23:59:59') >= today;
  }).sort(function(a, b) { return new Date(a.date) - new Date(b.date); }).slice(0, 4);

  var html = '';
  upcoming.forEach(function(ev) {
    var d = new Date(ev.date + 'T12:00:00');
    var mo = localDate(ev.date, { month: 'short' });
    var dy = d.getDate();
    html += '<div class="sb-ev">';
    html += '<div class="sb-ev-date">' + mo + '<br>' + dy + '</div>';
    html += '<div class="sb-ev-info"><h6>' + ev.title + '</h6><span>' + ev.loc + '</span></div>';
    html += '</div>';
  });
  container.innerHTML = html;
}

// ── HEADER CALENDAR WIDGET ──
function updateHeaderCalendar() {
  var now = new Date();
  var dayEl = document.getElementById('cw-day');
  var dateEl = document.getElementById('cw-date-str');
  var upEl = document.getElementById('cw-upcoming');
  if (!dayEl) return;

  dayEl.textContent = localDate(now, { weekday: 'long' });
  dateEl.textContent = localDate(now, { month: 'long', day: 'numeric', year: 'numeric' });

  var todayStr = now.toISOString().split('T')[0];
  var futureCount = calEvents.filter(function(e) { return e.date >= todayStr; }).length;
  upEl.textContent = t('header.upcoming_events').replace('{count}', futureCount);
}

// ── EVENT FORM ──
function showEventForm() {
  document.getElementById('event-submit-overlay').classList.add('open');
}
function closeEventForm() {
  document.getElementById('event-submit-overlay').classList.remove('open');
}

function submitEvent() {
  var title = document.getElementById('esm-title').value.trim();
  var date = document.getElementById('esm-date').value;
  if (!title || !date) { alert(t('error.fill_title_date')); return; }

  var description = document.getElementById('esm-desc').value.trim();
  var endDate = document.getElementById('esm-end').value;
  var time = document.getElementById('esm-time').value || '';
  var cat = document.getElementById('esm-cat').value;
  var loc = document.getElementById('esm-loc').value || 'TBD';
  var org = document.getElementById('esm-org').value || '';
  var url = document.getElementById('esm-url').value.trim();

  var catToEventType = {
    'study': 'study_group', 'conference': 'conference', 'community': 'other',
    'eurythmy': 'workshop', 'biodynamic': 'workshop', 'medicine': 'workshop'
  };

  var ev = { date: date, title: title, cat: cat, loc: loc, org: org, time: time };
  calEvents.push(ev);
  renderCalendar();
  renderEventList();
  renderMiniCal();
  renderSidebarUpcoming();
  updateHeaderCalendar();
  closeEventForm();

  ['esm-title','esm-date','esm-end','esm-time','esm-loc','esm-org','esm-desc','esm-url'].forEach(function(id) {
    document.getElementById(id).value = '';
  });

  if (sbReady()) {
    var userId = window._supabaseUser ? window._supabaseUser.id : null;
    var startDate = time ? date + 'T' + time + ':00' : date + 'T00:00:00';
    var row = {
      title: title,
      description: description || 'No description provided.',
      event_type: catToEventType[cat] || 'other',
      start_date: startDate,
      location_name: loc,
      organizer_name: org,
      status: 'upcoming',
      is_free: true
    };
    if (userId) row.user_id = userId;
    if (endDate) row.end_date = endDate + 'T23:59:59';
    if (url) row.organizer_url = url;

    _sb.from('events').insert([row]).then(function(res) {
      if (res.error) console.warn('Event submit error:', res.error.message);
      else console.log('Event saved to Supabase');
    });
  }
}

// Google Calendar sync (placeholder)
function syncGoogleCalendar() {
  console.log('Google Calendar sync: connect via Settings to enable.');
}

// ── INIT CALENDAR ON PAGE LOAD ──
document.addEventListener('DOMContentLoaded', function() {
  renderCalendar();
  renderEventList();
  renderSeminars();
  renderMiniCal();
  renderSidebarUpcoming();
  updateHeaderCalendar();
});

// ── BOOKS: Load from Supabase ──
async function loadBooksFromSupabase() {
  if (!sbReady()) return;
  try {
    var { data, error } = await _sb.from('steiner_books')
      .select('ga_number, title, category, author, archive_url, steinerbooks_url, amazon_url, price')
      .order('title')
      .limit(400);
    if (error || !data || data.length === 0) return;

    var container = document.getElementById('sec-books');
    if (!container) return;

    var catLabels = {
      foundational: 'Foundational Works', philosophy: 'Philosophy', christology: 'Christology & Gospels',
      cosmology: 'Cosmology & Spiritual Hierarchies', esoteric: 'Esoteric & Inner Development',
      karma: 'Karma & Reincarnation', education: 'Education (Steiner)', waldorf_education: 'Waldorf Education',
      medicine: 'Medicine & Health', agriculture: 'Agriculture & Biodynamics', biodynamic: 'Biodynamic Farming',
      arts: 'Arts, Eurythmy & Architecture', social: 'Social & Economic Life', science: 'Natural Science',
      spiritual: 'Spiritual & Esoteric Authors', children: 'Children\'s Books', biography: 'Biography'
    };

    var groups = {};
    data.forEach(function(b) {
      var cat = b.category || 'other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(b);
    });

    var sbBooksList = document.getElementById('sb-books-list');
    if (!sbBooksList) {
      sbBooksList = document.createElement('div');
      sbBooksList.id = 'sb-books-list';
      var label = container.querySelector('.seclabel');
      if (label) label.insertAdjacentElement('afterend', sbBooksList);
      else container.prepend(sbBooksList);
    }

    var html = '';
    var catOrder = ['foundational','philosophy','education','waldorf_education','christology','cosmology','esoteric','spiritual','karma','medicine','biodynamic','agriculture','arts','social','science','children','biography'];
    catOrder.forEach(function(cat) {
      var books = groups[cat];
      if (!books || books.length === 0) return;
      var label = catLabels[cat] || cat;
      html += '<div class="listblock" style="margin-bottom:14px;">';
      html += '<div class="listblock-head"><h3>' + esc(label) + '</h3><span style="font-size:10.5px;color:var(--text-muted);">' + books.length + ' titles</span></div>';
      html += '<div class="listblock-body">';
      books.forEach(function(b) {
        var ga = b.ga_number ? '<span class="ltag">' + esc(b.ga_number) + '</span>' : '';
        var authorTag = (b.author && b.author !== 'Rudolf Steiner') ? '<span style="font-size:11px;color:var(--text-muted);"> - ' + esc(b.author) + '</span>' : '';
        var links = '';
        if (b.amazon_url) links += '<a href="' + esc(b.amazon_url) + '" target="_blank" rel="noopener">Amazon</a>';
        if (b.steinerbooks_url) links += (links ? ' &middot; ' : '') + '<a href="' + esc(b.steinerbooks_url) + '" target="_blank" rel="noopener">' + (b.price ? esc(b.price) + ' SteinerBooks' : 'SteinerBooks') + '</a>';
        if (b.archive_url) links += (links ? ' &middot; ' : '') + '<span class="lv"><a href="' + esc(b.archive_url) + '" target="_blank" rel="noopener">free online</a></span>';
        html += '<div class="lrow">' + ga + '<a class="ltitle" href="' + esc(b.amazon_url || b.archive_url || '#') + '" target="_blank">' + esc(b.title) + '</a>' + authorTag + '<span class="lmeta">' + links + '</span></div>';
      });
      html += '</div></div>';
    });

    var secLabel = container.querySelector('.seclabel');
    if (secLabel) secLabel.innerHTML = t('books.section_label') + ' &nbsp;&middot;&nbsp; ' + t('books.titles_count').replace('{count}', data.length);
    sbBooksList.innerHTML = html;
    console.log('Loaded ' + data.length + ' books from Supabase');
  } catch(e) {
    console.warn('Books load failed:', e);
  }
}

// ── RERENDER FOR LANGUAGE CHANGE ──
function rerenderForLang() {
  var activeSection = document.querySelector('.pagesec.active');
  if (!activeSection) return;
  var id = activeSection.id.replace('sec-', '');
  if (id === 'events') { renderCalendar(); renderEventList(); renderSidebarUpcoming(); }
  if (id === 'books') { typeof renderBookResults === 'function' && renderBookResults(); }
  if (id === 'memorial') { loadCommunityMemorials(); }
  if (id === 'marketplace') { renderMarketplace(); }
  if (id === 'podcasts') { renderPodcastSection(); }
  if (id === 'directory') { _loadAllSupabaseData(); }
  if (typeof updateHeaderCalendar === 'function') updateHeaderCalendar();
  if (typeof SC_I18N !== 'undefined') SC_I18N.applyTranslations();
}

// ── INIT: Load all data once Supabase AND i18n are ready ──
function _loadAllSupabaseData() {
  if (!sbReady()) return;
  Promise.all([
    loadEventsFromSupabase(),
    loadNewsFromSupabase(),
    loadDirectoryFromSupabase(),
    loadBooksFromSupabase(),
    loadMarketplace()
  ]).catch(function(e) { console.warn('Data load error:', e); });
  renderPodcastSection();
}

// Defer data load until i18n is ready so t() calls resolve properly
(function initSupabaseData() {
  function tryLoad() {
    if (typeof SC_I18N !== 'undefined' && SC_I18N._ready) {
      _loadAllSupabaseData();
    } else {
      // i18n not ready yet, wait for it
      window.addEventListener('i18n-ready', function() { _loadAllSupabaseData(); });
      // Fallback: if i18n never fires (e.g. offline), load after 500ms anyway
      setTimeout(function() { _loadAllSupabaseData(); }, 500);
    }
  }
  if (sbReady()) { tryLoad(); }
  else { setTimeout(tryLoad, 150); }
})();

// ── AUTO-HIDE PAST EVENTS ──
(function() {
  var today = new Date();
  today.setHours(23,59,59,999);
  document.querySelectorAll('.evrow[data-event-date]').forEach(function(row) {
    var eventDate = new Date(row.getAttribute('data-event-date') + 'T23:59:59');
    if (eventDate < today) {
      row.style.display = 'none';
    }
  });
  document.querySelectorAll('.evdate.today').forEach(function(el) {
    var row = el.closest('.evrow');
    if (row) {
      var d = new Date(row.getAttribute('data-event-date'));
      var now = new Date();
      if (d.toDateString() !== now.toDateString()) {
        el.classList.remove('today');
      }
    }
  });
})();

// ── GLOBAL: Handle href="#" links ──
// Makes all internal placeholder links clickable by triggering a search
// for the link text, navigating to the relevant section, or scrolling.
document.addEventListener('click', function(e) {
  var link = e.target.closest('a[href="#"]');
  if (!link) return;
  if (link.getAttribute('onclick')) return;
  e.preventDefault();

  // Home page catblocks -> go to browse
  if (link.closest('.catblock') && link.closest('#sec-home')) {
    showSec('browse');
    return;
  }
  // News/trend links -> go to news
  if (link.closest('#sec-news') || link.closest('.trendblock')) {
    showSec('news');
    return;
  }
  // Event links -> stay on events
  if (link.closest('#sec-events') || link.closest('.evinfo')) {
    showSec('events');
    return;
  }
  // Directory links -> stay
  if (link.closest('#sec-directory')) {
    return;
  }

  // Browse page subcategory links -> search for that term
  if (link.closest('#sec-browse') || link.closest('#sec-books') || link.closest('#sec-eldercare')) {
    var term = link.textContent.trim();
    if (term && term.length > 2 && !term.includes('→')) {
      document.getElementById('searchinput').value = term;
      doSearch();
    }
    return;
  }

  // Catblock "all X" links -> go to browse
  if (link.classList.contains('alllink')) {
    showSec('browse');
    return;
  }
});

// ══════════════════════════════════════════
//  ADMIN PANEL
// ══════════════════════════════════════════

var ADMIN_EMAILS = ['cameron@sophiacommons.org', 'admin@sophiacommons.org'];

function isAdmin() {
  return signedIn && window._supabaseUser && window._supabaseUser.email &&
    ADMIN_EMAILS.indexOf(window._supabaseUser.email.toLowerCase()) !== -1;
}

function updateAdminVisibility() {
  var btn = document.getElementById('nav-admin');
  if (btn) btn.style.display = isAdmin() ? 'inline-block' : 'none';
}

function adminSwitchTab(tab) {
  document.querySelectorAll('.admin-tab').forEach(function(t) { t.classList.remove('active'); });
  document.querySelectorAll('.admin-tab-content').forEach(function(c) { c.classList.remove('active'); });
  document.querySelector('.admin-tab[onclick*="' + tab + '"]').classList.add('active');
  document.getElementById('admin-' + tab).classList.add('active');
  if (tab === 'listings') loadAdminListings();
  else if (tab === 'events') loadAdminEvents();
  else if (tab === 'memorials') loadAdminMemorials();
  else if (tab === 'newsletter') loadNewsletterSubscriberCount();
}

function adminEsc(s) { if (!s) return ''; var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

async function loadAdminListings() {
  var el = document.getElementById('admin-listings-list');
  if (!sbReady()) { el.innerHTML = '<div class="admin-empty">' + t('error.supabase_not_connected') + '</div>'; return; }
  try {
    var { data, error } = await _sb.from('listings_pending').select('*').eq('status', 'pending').order('created_at', { ascending: false });
    if (error) { el.innerHTML = '<div class="admin-empty">' + t('error.loading_listings') + '</div>'; return; }
    if (!data || data.length === 0) { el.innerHTML = '<div class="admin-empty">' + t('admin.no_pending_listings') + '</div>'; return; }
    el.innerHTML = data.map(function(d) {
      return '<div class="admin-card" id="admin-listing-' + d.id + '">'
        + '<h4>' + adminEsc(d.name) + '</h4>'
        + '<div class="admin-meta">'
        + (d.category ? '<span><strong>' + t('admin.category_label') + '</strong> ' + adminEsc(d.category) + '</span>' : '')
        + (d.location ? '<span><strong>' + t('admin.location_label') + '</strong> ' + adminEsc(d.location) + '</span>' : '')
        + (d.url ? '<span><strong>' + t('admin.url_label') + '</strong> ' + adminEsc(d.url) + '</span>' : '')
        + (d.contact_email ? '<span><strong>' + t('admin.email_label') + '</strong> ' + adminEsc(d.contact_email) + '</span>' : '')
        + '</div>'
        + (d.description ? '<p style="font-size:13px;color:var(--text-secondary);line-height:1.55;margin-bottom:10px;">' + adminEsc(d.description) + '</p>' : '')
        + '<div class="admin-actions">'
        + '<button class="admin-btn-approve" onclick="adminApproveListing(\'' + d.id + '\')">' + t('admin.approve') + '</button>'
        + '<button class="admin-btn-reject" onclick="adminRejectListing(\'' + d.id + '\')">' + t('admin.reject') + '</button>'
        + '</div></div>';
    }).join('');
  } catch(e) { el.innerHTML = '<div class="admin-empty">Error: ' + e.message + '</div>'; }
}

async function adminApproveListing(id) {
  if (!sbReady()) return;
  try {
    // Fetch the pending listing
    var { data, error } = await _sb.from('listings_pending').select('*').eq('id', id).single();
    if (error || !data) { alert(t('error.could_not_find_listing')); return; }
    // Insert into directory_entries
    var entry = {
      name: data.name,
      category: data.category || 'Other',
      location: data.location || null,
      url: data.url || null,
      description: data.description || null,
      contact_email: data.contact_email || null
    };
    var { error: insertErr } = await _sb.from('directory_entries').insert(entry);
    if (insertErr) { alert('Error adding to directory: ' + insertErr.message); return; }
    // Update status
    await _sb.from('listings_pending').update({ status: 'approved' }).eq('id', id);
    var card = document.getElementById('admin-listing-' + id);
    if (card) card.remove();
    // Check if empty
    if (!document.querySelector('#admin-listings-list .admin-card')) {
      document.getElementById('admin-listings-list').innerHTML = '<div class="admin-empty">' + t('admin.no_pending_listings') + '</div>';
    }
  } catch(e) { alert('Error: ' + e.message); }
}

async function adminRejectListing(id) {
  if (!sbReady()) return;
  if (!confirm(t('admin.confirm_reject_listing'))) return;
  try {
    await _sb.from('listings_pending').update({ status: 'rejected' }).eq('id', id);
    var card = document.getElementById('admin-listing-' + id);
    if (card) card.remove();
    if (!document.querySelector('#admin-listings-list .admin-card')) {
      document.getElementById('admin-listings-list').innerHTML = '<div class="admin-empty">' + t('admin.no_pending_listings') + '</div>';
    }
  } catch(e) { alert('Error: ' + e.message); }
}

async function loadAdminEvents() {
  var el = document.getElementById('admin-events-list');
  if (!sbReady()) { el.innerHTML = '<div class="admin-empty">' + t('error.supabase_not_connected') + '</div>'; return; }
  try {
    var { data, error } = await _sb.from('events').select('*').eq('status', 'pending').order('created_at', { ascending: false });
    if (error) { el.innerHTML = '<div class="admin-empty">' + t('error.loading_events') + '</div>'; return; }
    if (!data || data.length === 0) { el.innerHTML = '<div class="admin-empty">' + t('admin.no_pending_events') + '</div>'; return; }
    el.innerHTML = data.map(function(d) {
      return '<div class="admin-card" id="admin-event-' + d.id + '">'
        + '<h4>' + adminEsc(d.title) + '</h4>'
        + '<div class="admin-meta">'
        + (d.event_type ? '<span><strong>' + t('admin.type_label') + '</strong> ' + adminEsc(d.event_type) + '</span>' : '')
        + (d.start_date ? '<span><strong>' + t('admin.date_label') + '</strong> ' + adminEsc(d.start_date.substring(0,10)) + '</span>' : '')
        + (d.location_name ? '<span><strong>' + t('admin.location_label') + '</strong> ' + adminEsc(d.location_name) + '</span>' : '')
        + (d.organizer_name ? '<span><strong>' + t('admin.organizer_label') + '</strong> ' + adminEsc(d.organizer_name) + '</span>' : '')
        + '</div>'
        + (d.description ? '<p style="font-size:13px;color:var(--text-secondary);line-height:1.55;margin-bottom:10px;">' + adminEsc(d.description) + '</p>' : '')
        + '<div class="admin-actions">'
        + '<button class="admin-btn-approve" onclick="adminApproveEvent(\'' + d.id + '\')">' + t('admin.approve') + '</button>'
        + '<button class="admin-btn-reject" onclick="adminRejectEvent(\'' + d.id + '\')">' + t('admin.reject') + '</button>'
        + '</div></div>';
    }).join('');
  } catch(e) { el.innerHTML = '<div class="admin-empty">Error: ' + e.message + '</div>'; }
}

async function adminApproveEvent(id) {
  if (!sbReady()) return;
  try {
    await _sb.from('events').update({ status: 'upcoming' }).eq('id', id);
    var card = document.getElementById('admin-event-' + id);
    if (card) card.remove();
    if (!document.querySelector('#admin-events-list .admin-card')) {
      document.getElementById('admin-events-list').innerHTML = '<div class="admin-empty">' + t('admin.no_pending_events') + '</div>';
    }
  } catch(e) { alert('Error: ' + e.message); }
}

async function adminRejectEvent(id) {
  if (!sbReady()) return;
  if (!confirm(t('admin.confirm_reject_event'))) return;
  try {
    await _sb.from('events').update({ status: 'rejected' }).eq('id', id);
    var card = document.getElementById('admin-event-' + id);
    if (card) card.remove();
    if (!document.querySelector('#admin-events-list .admin-card')) {
      document.getElementById('admin-events-list').innerHTML = '<div class="admin-empty">' + t('admin.no_pending_events') + '</div>';
    }
  } catch(e) { alert('Error: ' + e.message); }
}

async function loadAdminMemorials() {
  var el = document.getElementById('admin-memorials-list');
  if (!sbReady()) { el.innerHTML = '<div class="admin-empty">' + t('error.supabase_not_connected') + '</div>'; return; }
  try {
    var { data, error } = await _sb.from('memorials_pending').select('*').eq('status', 'pending').order('created_at', { ascending: false });
    if (error) { el.innerHTML = '<div class="admin-empty">' + t('error.loading_memorials') + '</div>'; return; }
    if (!data || data.length === 0) { el.innerHTML = '<div class="admin-empty">' + t('admin.no_pending_memorials') + '</div>'; return; }
    el.innerHTML = data.map(function(d) {
      return '<div class="admin-card" id="admin-memorial-' + d.id + '">'
        + '<h4>' + adminEsc(d.name) + '</h4>'
        + '<div class="admin-meta">'
        + (d.years ? '<span><strong>' + t('admin.years_label') + '</strong> ' + adminEsc(d.years) + '</span>' : '')
        + (d.location ? '<span><strong>' + t('admin.location_label') + '</strong> ' + adminEsc(d.location) + '</span>' : '')
        + (d.contact_email ? '<span><strong>' + t('admin.email_label') + '</strong> ' + adminEsc(d.contact_email) + '</span>' : '')
        + '</div>'
        + (d.bio ? '<p style="font-size:13px;color:var(--text-secondary);line-height:1.55;margin-bottom:10px;">' + adminEsc(d.bio) + '</p>' : '')
        + '<div class="admin-actions">'
        + '<button class="admin-btn-approve" onclick="adminApproveMemorial(\'' + d.id + '\')">' + t('admin.approve') + '</button>'
        + '<button class="admin-btn-reject" onclick="adminRejectMemorial(\'' + d.id + '\')">' + t('admin.reject') + '</button>'
        + '</div></div>';
    }).join('');
  } catch(e) { el.innerHTML = '<div class="admin-empty">Error: ' + e.message + '</div>'; }
}

async function adminApproveMemorial(id) {
  if (!sbReady()) return;
  try {
    await _sb.from('memorials_pending').update({ status: 'approved' }).eq('id', id);
    var card = document.getElementById('admin-memorial-' + id);
    if (card) card.remove();
    if (!document.querySelector('#admin-memorials-list .admin-card')) {
      document.getElementById('admin-memorials-list').innerHTML = '<div class="admin-empty">' + t('admin.no_pending_memorials') + '</div>';
    }
  } catch(e) { alert('Error: ' + e.message); }
}

async function adminRejectMemorial(id) {
  if (!sbReady()) return;
  if (!confirm(t('admin.confirm_reject_memorial'))) return;
  try {
    await _sb.from('memorials_pending').update({ status: 'rejected' }).eq('id', id);
    var card = document.getElementById('admin-memorial-' + id);
    if (card) card.remove();
    if (!document.querySelector('#admin-memorials-list .admin-card')) {
      document.getElementById('admin-memorials-list').innerHTML = '<div class="admin-empty">' + t('admin.no_pending_memorials') + '</div>';
    }
  } catch(e) { alert('Error: ' + e.message); }
}

// Load admin data when admin section is shown
function initAdminPanel() {
  if (!isAdmin()) return;
  loadAdminListings();
}

// ── NEWSLETTER SEND ──

var _newsletterSubscriberCount = 0;

async function loadNewsletterSubscriberCount() {
  var el = document.getElementById('newsletter-subscriber-count');
  if (!sbReady()) { el.textContent = t('error.supabase_not_connected'); return; }
  try {
    var { count, error } = await _sb.from('newsletter_subscribers').select('id', { count: 'exact', head: true }).eq('confirmed', true);
    if (error) { el.textContent = t('error.loading_subscriber_count'); return; }
    _newsletterSubscriberCount = count || 0;
    el.innerHTML = '<strong>' + _newsletterSubscriberCount + '</strong> confirmed subscriber' + (_newsletterSubscriberCount !== 1 ? 's' : '') + ' will receive this email.';
  } catch(e) {
    el.textContent = 'Error: ' + e.message;
  }
}

async function sendNewsletter() {
  if (!isAdmin()) { alert(t('error.admin_required')); return; }
  if (!sbReady()) { alert(t('error.supabase_not_connected')); return; }

  var subject = (document.getElementById('newsletter-subject').value || '').trim();
  var htmlContent = (document.getElementById('newsletter-html').value || '').trim();

  if (!subject) { alert(t('error.enter_subject')); return; }
  if (!htmlContent) { alert(t('error.enter_html')); return; }

  if (_newsletterSubscriberCount === 0) {
    alert(t('error.no_subscribers'));
    return;
  }

  if (!confirm(t('admin.newsletter_confirm').replace('{count}', _newsletterSubscriberCount).replace('{subject}', subject))) {
    return;
  }

  var btn = document.getElementById('newsletter-send-btn');
  var statusEl = document.getElementById('newsletter-status');
  var resultEl = document.getElementById('newsletter-result');

  btn.disabled = true;
  btn.textContent = t('admin.newsletter_sending');
  statusEl.textContent = t('admin.newsletter_please_wait');
  resultEl.style.display = 'none';

  try {
    var { data: { session } } = await _sb.auth.getSession();
    if (!session || !session.access_token) {
      throw new Error(t('error.no_active_session'));
    }

    var response = await fetch(SUPABASE_URL + '/functions/v1/send-newsletter', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + session.access_token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ subject: subject, html_content: htmlContent }),
    });

    var result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Server returned ' + response.status);
    }

    resultEl.style.display = 'block';
    resultEl.className = 'newsletter-result newsletter-result-success';
    resultEl.innerHTML = '<strong>' + t('admin.newsletter_success') + '</strong><br>'
      + t('admin.newsletter_sent_stats').replace('{sent}', result.sent).replace('{failed}', result.failed).replace('{total}', result.total);

    if (result.errors && result.errors.length > 0) {
      resultEl.className = 'newsletter-result newsletter-result-warning';
      resultEl.innerHTML += '<br><br><strong>' + t('admin.newsletter_errors') + '</strong><br>'
        + result.errors.map(function(e) { return adminEsc(e.email) + ': ' + adminEsc(e.error); }).join('<br>');
    }

    statusEl.textContent = '';
  } catch(e) {
    resultEl.style.display = 'block';
    resultEl.className = 'newsletter-result newsletter-result-error';
    resultEl.innerHTML = '<strong>' + t('admin.newsletter_failed') + '</strong><br>' + adminEsc(e.message);
    statusEl.textContent = '';
  } finally {
    btn.disabled = false;
    btn.textContent = t('admin.newsletter_send_btn');
  }
}

// ── VIEW TRACKING ──
var _viewedItems = {};
function _trackView(type, id) {
  if (!sbReady()) return;
  var key = type + ':' + id;
  if (_viewedItems[key]) return; // only once per session
  _viewedItems[key] = true;
  if (type === 'listing') {
    _sb.rpc('increment_view_count', { listing_id: id }).catch(function() {});
  }
  // For directory, events, news - log to analytics table if it exists
  _sb.from('view_logs').insert({ item_type: type, item_id: id }).catch(function() {});
}

// ── CONTENT REPORTING / FLAGGING ──
function openReportModal(itemType, itemId) {
  if (!signedIn) { openModal(); return; }
  var modal = document.getElementById('report-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  document.getElementById('report-item-type').value = itemType;
  document.getElementById('report-item-id').value = itemId;
  document.getElementById('report-reason').value = '';
  document.getElementById('report-details').value = '';
  document.getElementById('report-status').style.display = 'none';
}

function closeReportModal() {
  var modal = document.getElementById('report-modal');
  if (modal) modal.style.display = 'none';
}

async function submitReport() {
  if (!sbReady() || !signedIn) return;
  var itemType = document.getElementById('report-item-type').value;
  var itemId = document.getElementById('report-item-id').value;
  var reason = document.getElementById('report-reason').value;
  var details = (document.getElementById('report-details').value || '').trim();
  var statusEl = document.getElementById('report-status');

  if (!reason) {
    statusEl.textContent = t('report.select_reason');
    statusEl.className = 'report-status report-status-error';
    statusEl.style.display = 'block';
    return;
  }

  var btn = document.getElementById('report-submit-btn');
  btn.disabled = true;
  btn.textContent = t('report.submitting');

  try {
    var uid = window._supabaseUser ? window._supabaseUser.id : null;
    if (!uid) throw new Error('Not authenticated');
    var { error } = await _sb.from('reports').insert({
      reporter_id: uid,
      item_type: itemType,
      item_id: itemId,
      reason: reason,
      details: details || null
    });
    if (error) throw error;
    statusEl.textContent = t('report.success');
    statusEl.className = 'report-status report-status-success';
    statusEl.style.display = 'block';
    setTimeout(closeReportModal, 2000);
  } catch(e) {
    statusEl.textContent = t('report.error') + ': ' + e.message;
    statusEl.className = 'report-status report-status-error';
    statusEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = t('report.submit_btn');
  }
}

// ── MARKETPLACE / CLASSIFIEDS ──
var _marketplaceData = [];
var _marketplaceFilter = 'all';

async function loadMarketplace() {
  if (!sbReady()) return;
  try {
    var { data, error } = await _sb.from('listings')
      .select('*, profiles(username), categories(name,slug)')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(50);
    if (!error && data) {
      _marketplaceData = data;
      renderMarketplace();
    }
  } catch(e) { console.warn('Marketplace load error:', e); }
}

function filterMarketplace(type) {
  _marketplaceFilter = type;
  document.querySelectorAll('.mp-filter-btn').forEach(function(b) { b.classList.remove('active'); });
  var activeBtn = document.querySelector('.mp-filter-btn[data-filter="' + type + '"]');
  if (activeBtn) activeBtn.classList.add('active');
  renderMarketplace();
}

function renderMarketplace() {
  var container = document.getElementById('marketplace-listings');
  if (!container) return;
  var items = _marketplaceFilter === 'all' ? _marketplaceData : _marketplaceData.filter(function(l) { return l.listing_type === _marketplaceFilter; });

  if (items.length === 0) {
    container.innerHTML = '<div class="mp-empty"><div style="font-size:28px;margin-bottom:8px;">&#128722;</div><div>' + t('marketplace.no_listings') + '</div></div>';
    return;
  }

  container.innerHTML = items.map(function(l) {
    var typeLabel = {for_sale: t('marketplace.type_for_sale'), wanted: t('marketplace.type_wanted'), offering: t('marketplace.type_offering'), seeking: t('marketplace.type_seeking'), announcement: t('marketplace.type_announcement')};
    var typeCls = 'mp-type-' + l.listing_type;
    var price = l.price ? ('$' + Number(l.price).toFixed(2)) : '';
    var poster = (l.profiles && l.profiles.username) ? l.profiles.username : t('marketplace.anonymous');
    var catName = (l.categories && l.categories.name) ? l.categories.name : '';
    var loc = [l.location, l.country].filter(Boolean).join(', ');
    var ago = _timeAgo(l.created_at);
    var views = l.view_count || 0;

    return '<div class="mp-card" onclick="showDetail(\'listing\',\'' + l.id + '\')">'
      + '<div class="mp-card-header">'
      + '<span class="mp-type ' + typeCls + '">' + (typeLabel[l.listing_type] || l.listing_type) + '</span>'
      + (price ? '<span class="mp-price">' + esc(price) + '</span>' : '')
      + '</div>'
      + '<h4 class="mp-title">' + esc(l.title) + '</h4>'
      + '<p class="mp-desc">' + esc((l.description || '').substring(0, 120)) + (l.description && l.description.length > 120 ? '...' : '') + '</p>'
      + '<div class="mp-meta">'
      + (catName ? '<span>' + esc(catName) + '</span>' : '')
      + (loc ? '<span>&#128205; ' + esc(loc) + '</span>' : '')
      + '<span>' + esc(poster) + ' &middot; ' + ago + '</span>'
      + '<span>' + views + ' ' + t('marketplace.views') + '</span>'
      + '</div></div>';
  }).join('');
}

function renderListingDetail(d) {
  var typeLabel = {for_sale: t('marketplace.type_for_sale'), wanted: t('marketplace.type_wanted'), offering: t('marketplace.type_offering'), seeking: t('marketplace.type_seeking'), announcement: t('marketplace.type_announcement')};
  var price = d.price ? ('$' + Number(d.price).toFixed(2)) : '';
  var poster = (d.profiles && d.profiles.username) ? d.profiles.username : t('marketplace.anonymous');
  var catName = (d.categories && d.categories.name) ? d.categories.name : '';
  var loc = [d.location, d.region, d.country].filter(Boolean).join(', ');
  var tags = (d.tags || []).map(function(tg) { return '<span class="detail-badge category">' + esc(tg) + '</span>'; }).join('');

  var actions = '';
  if (d.website_url) actions += '<a class="btn-primary-detail" href="' + esc(d.website_url) + '" target="_blank">' + t('detail.visit_website') + ' &#8599;</a>';
  if (d.contact_email) actions += '<a class="btn-secondary-detail" href="mailto:' + esc(d.contact_email) + '">' + t('detail.contact') + ' &#9993;</a>';
  if (d.contact_phone) actions += '<a class="btn-secondary-detail" href="tel:' + esc(d.contact_phone) + '">' + t('detail.call') + ' &#9742;</a>';

  var reportBtn = signedIn ? '<button class="btn-report" onclick="event.stopPropagation();openReportModal(\'listing\',\'' + d.id + '\')">' + t('report.flag_btn') + '</button>' : '';

  return '<div class="detail-card">'
    + '<div class="detail-header">'
    + '<h1>' + esc(d.title) + '</h1>'
    + '<div class="detail-badges">'
    + '<span class="detail-badge mp-type mp-type-' + d.listing_type + '">' + (typeLabel[d.listing_type] || d.listing_type) + '</span>'
    + (price ? '<span class="detail-badge" style="background:var(--gold);color:#fff;">' + esc(price) + '</span>' : '')
    + tags + '</div>'
    + (actions ? '<div class="detail-actions">' + actions + '</div>' : '')
    + '</div>'
    + '<div class="detail-body">' + esc(d.description || t('detail.no_description')) + '</div>'
    + '<div class="detail-sidebar"><h4>' + t('detail.quick_facts') + '</h4>'
    + '<p><strong>' + t('marketplace.posted_by') + ':</strong> ' + esc(poster) + '</p>'
    + (catName ? '<p><strong>' + t('detail.category') + ':</strong> ' + esc(catName) + '</p>' : '')
    + (loc ? '<p><strong>' + t('detail.location') + ':</strong> ' + esc(loc) + '</p>' : '')
    + '<p><strong>' + t('marketplace.views') + ':</strong> ' + (d.view_count || 0) + '</p>'
    + '<p><strong>' + t('marketplace.posted') + ':</strong> ' + localDate(d.created_at, {month:'short',day:'numeric',year:'numeric'}) + '</p>'
    + '<p><strong>' + t('marketplace.expires') + ':</strong> ' + localDate(d.expires_at, {month:'short',day:'numeric',year:'numeric'}) + '</p>'
    + reportBtn
    + '</div></div>';
}

function showSubmitListingForm() {
  if (!signedIn) { openModal(); return; }
  var overlay = document.getElementById('listing-submit-overlay');
  if (overlay) overlay.style.display = 'flex';
}

function closeListingForm() {
  var overlay = document.getElementById('listing-submit-overlay');
  if (overlay) overlay.style.display = 'none';
}

async function submitClassifiedListing() {
  if (!sbReady() || !signedIn) return;
  var title = (document.getElementById('cl-title').value || '').trim();
  var desc = (document.getElementById('cl-desc').value || '').trim();
  var listingType = document.getElementById('cl-type').value;
  var price = (document.getElementById('cl-price').value || '').trim();
  var location = (document.getElementById('cl-location').value || '').trim();
  var country = (document.getElementById('cl-country').value || '').trim();
  var contactEmail = (document.getElementById('cl-email').value || '').trim();
  var tags = (document.getElementById('cl-tags').value || '').trim();

  if (!title || !desc || !listingType) {
    alert(t('marketplace.error_required'));
    return;
  }

  var uid = window._supabaseUser ? window._supabaseUser.id : null;
  if (!uid) { alert(t('error.not_authenticated')); return; }

  try {
    var { error } = await _sb.from('listings').insert({
      user_id: uid,
      category_id: 1,
      title: title,
      description: desc,
      listing_type: listingType,
      price: price ? parseFloat(price) : null,
      location: location || null,
      country: country || null,
      contact_email: contactEmail || null,
      tags: tags ? tags.split(',').map(function(t) { return t.trim(); }) : []
    });
    if (error) throw error;
    document.getElementById('cl-success').style.display = 'block';
    setTimeout(function() { closeListingForm(); document.getElementById('cl-success').style.display = 'none'; }, 2500);
    loadMarketplace();
  } catch(e) {
    alert(t('marketplace.error_submit') + ': ' + e.message);
  }
}

// ── PODCASTS & MEDIA (enhanced) ──
var podcastData = {
  podcasts: [
    {title:'ASA Official Podcast', url:'https://anthroposophy.org/podcast/', platform:'Spotify / RSS', desc:'Official podcast of the Anthroposophical Society in America. Interviews, lectures, and community highlights.', lang:'EN', verified:true},
    {title:'Goetheanum Podcast', url:'https://goetheanum.transistor.fm/', platform:'Transistor', desc:'News and perspectives from the Goetheanum in Dornach, Switzerland.', lang:'EN/DE', verified:true},
    {title:'Inner Work Path: Lisa Romero', url:'https://www.innerworkpath.com/category/podcast/', platform:'Australia', desc:'Guided meditations and inner development exercises rooted in anthroposophy.', lang:'EN', verified:true},
    {title:'Rudolf Steiner Audio Podcast', url:'https://www.rudolfsteiner.podbean.com/', platform:'Podbean', desc:'Audio readings of Rudolf Steiner lectures and written works. Free access.', lang:'EN', verified:true},
    {title:'New Thinking Allowed', url:'https://newthinkingallowed.org/rudolf-steiner-anthroposophy/', platform:'Video', desc:'Jeffrey Mishlove interviews scholars and practitioners on anthroposophy and spiritual science.', lang:'EN', verified:true},
    {title:'Anthroposophy on Spotify', url:'https://open.spotify.com/show/0M4QfnyYevp54XnlERAPTf', platform:'Spotify', desc:'Curated playlists and episodes exploring anthroposophical themes.', lang:'EN', verified:true}
  ],
  video: [
    {title:'Goetheanum TV', url:'https://goetheanum.tv', platform:'Streaming', desc:'Live and recorded events from the Goetheanum world center.', lang:'DE/EN', verified:true},
    {title:'Das Goetheanum Weekly', url:'https://dasgoetheanum.com/en', platform:'Online', desc:'Weekly digital magazine covering anthroposophical news and culture.', lang:'DE/EN', verified:true},
    {title:'ASA YouTube Channel', url:'https://www.youtube.com/@AnthroposophyUSA', platform:'YouTube', desc:'Video lectures, conferences, and community events from ASA.', lang:'EN', verified:true},
    {title:'Anthroposophy.Social', url:'https://anthroposophysocial.com', platform:'Platform', desc:'Community platform for anthroposophical discussions and media sharing.', lang:'EN', verified:true},
    {title:'Goetheanum Studium - Instagram', url:'https://www.instagram.com/goetheanum_studium/', platform:'Instagram', desc:'Visual insights into studies and events at the Goetheanum.', lang:'DE/EN', verified:true},
    {title:'ASA Facebook Page', url:'https://www.facebook.com/AnthroposophyUSA/', platform:'Facebook', desc:'Official ASA page with event announcements and community news.', lang:'EN', verified:true},
    {title:'Anthroposophy Community Group', url:'https://www.facebook.com/groups/anthroposophy/', platform:'Facebook', desc:'Global discussion group for anthroposophical topics and questions.', lang:'EN', verified:true},
    {title:'Rudolf Steiner Archive - Facebook', url:'https://www.facebook.com/RudolfSteinerArchive/', platform:'Facebook', desc:'Updates from the Rudolf Steiner Archive in Interlochen, MI.', lang:'EN', verified:true}
  ],
  archives: [
    {title:'Rudolf Steiner Archive', url:'https://rsarchive.org', platform:'rsarchive.org', desc:'Complete archive of Steiner lectures and writings. The largest online collection.', lang:'EN', verified:true},
    {title:'Rudolf Steiner Audio', url:'https://www.rudolfsteineraudio.com', platform:'Audio', desc:'Professional audio recordings of Steiner lectures and books.', lang:'EN', verified:true},
    {title:'Waldorf Library', url:'https://www.waldorflibrary.org', platform:'Library', desc:'Digital library of Waldorf education resources and research papers.', lang:'EN', verified:true},
    {title:'Steiner Books', url:'https://www.steinerbooks.org', platform:'Publisher', desc:'Leading publisher of English-language anthroposophical books and journals.', lang:'EN', verified:true}
  ]
};

function renderPodcastSection() {
  var container = document.getElementById('podcasts-dynamic');
  if (!container) return;

  var totalCount = podcastData.podcasts.length + podcastData.video.length + podcastData.archives.length;
  document.getElementById('podcasts-count').textContent = totalCount + ' ' + t('podcasts.shows_label');

  function renderBlock(items, heading) {
    var html = '<div class="listblock reveal"><div class="listblock-head"><h3>' + heading + '</h3><span class="podcast-count">' + items.length + ' ' + t('podcasts.items') + '</span></div><div class="listblock-body">';
    items.forEach(function(p) {
      html += '<div class="lrow podcast-row">'
        + '<div class="podcast-info">'
        + '<a class="ltitle" href="' + esc(p.url) + '" target="_blank">' + esc(p.title) + '</a>'
        + (p.verified ? '<span class="lv">&#10003;</span>' : '')
        + '<span class="lmeta">' + esc(p.platform) + (p.lang ? ' &middot; ' + esc(p.lang) : '') + '</span>'
        + '<div class="podcast-desc">' + esc(p.desc) + '</div>'
        + '</div></div>';
    });
    html += '</div></div>';
    return html;
  }

  container.innerHTML = '<div class="twocol">'
    + renderBlock(podcastData.podcasts, t('podcasts.podcasts_heading'))
    + renderBlock(podcastData.video, t('podcasts.video_social_heading'))
    + '</div>'
    + renderBlock(podcastData.archives, t('podcasts.archives_heading'));
}

// ── UPGRADED FULL-TEXT SEARCH ──
async function _doSupabaseSearchV2(q) {
  if (!sbReady()) { _doLocalSearch(q.toLowerCase()); return; }
  showSec('browse');

  try {
    // Try RPC search_all first (better ranking)
    var { data, error } = await _sb.rpc('search_all', { search_term: q, limit_n: 30 });
    if (!error && data && data.length > 0) {
      var dirResults = data.filter(function(r) { return r.type === 'directory'; });
      var evResults = data.filter(function(r) { return r.type === 'event'; });
      var newsResults = data.filter(function(r) { return r.type === 'news'; });
      var listResults = data.filter(function(r) { return r.type === 'listing'; });
      var totalCount = data.length;

      var html = '';
      if (dirResults.length > 0) {
        html += _renderSearchGroup(t('search_results.directory'), dirResults, function(d) {
          return '<a href="#" onclick="showDetail(\'directory\',\'' + d.id + '\');return false;" style="font-family:Lora,serif;font-weight:700;font-size:14px;color:var(--text-primary);text-decoration:none;">' + esc(d.title) + '</a>'
            + (d.description ? '<div style="font-size:13px;color:var(--text-muted);margin-top:2px;">' + esc(d.description.substring(0, 120)) + '</div>' : '');
        });
      }
      if (evResults.length > 0) {
        html += _renderSearchGroup(t('search_results.events'), evResults, function(d) {
          return '<a href="#" onclick="showDetail(\'event\',\'' + d.id + '\');return false;" style="font-family:Lora,serif;font-weight:700;font-size:14px;color:var(--text-primary);text-decoration:none;">' + esc(d.title) + '</a>'
            + (d.description ? '<div style="font-size:13px;color:var(--text-muted);margin-top:2px;">' + esc(d.description.substring(0, 120)) + '</div>' : '');
        });
      }
      if (newsResults.length > 0) {
        html += _renderSearchGroup(t('search_results.news'), newsResults, function(d) {
          return '<a href="#" onclick="showDetail(\'news\',\'' + d.id + '\');return false;" style="font-family:Lora,serif;font-weight:700;font-size:14px;color:var(--text-primary);text-decoration:none;">' + esc(d.title) + '</a>'
            + (d.description ? '<div style="font-size:13px;color:var(--text-muted);margin-top:2px;">' + esc(d.description.substring(0, 120)) + '</div>' : '');
        });
      }
      if (listResults.length > 0) {
        html += _renderSearchGroup(t('search_results.marketplace'), listResults, function(d) {
          return '<a href="#" onclick="showDetail(\'listing\',\'' + d.id + '\');return false;" style="font-family:Lora,serif;font-weight:700;font-size:14px;color:var(--text-primary);text-decoration:none;">' + esc(d.title) + '</a>'
            + (d.description ? '<div style="font-size:13px;color:var(--text-muted);margin-top:2px;">' + esc(d.description.substring(0, 120)) + '</div>' : '');
        });
      }

      if (totalCount === 0) {
        _showSearchResults(q, '<div style="text-align:center;padding:32px 0;color:var(--text-muted);">'
          + '<div style="font-size:28px;margin-bottom:8px;">&#128269;</div>'
          + '<div style="font-size:15px;font-weight:600;">' + t('search.no_results_title') + '</div>'
          + '<div style="font-size:13px;margin-top:4px;">' + t('search.no_results_desc') + '</div>'
          + '</div>', 0);
      } else {
        _showSearchResults(q, html, totalCount);
      }
      return;
    }
  } catch(e) {
    console.warn('search_all RPC not available, using v1 search:', e);
  }
  // Fall back to original search
  _doSupabaseSearch(q);
}

function _renderSearchGroup(label, items, renderItem) {
  var html = '<div style="margin-bottom:16px;">';
  html += '<div style="font-size:11px;text-transform:uppercase;color:var(--gold);font-weight:700;letter-spacing:0.08em;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid var(--border-subtle);">' + label + ' (' + items.length + ')</div>';
  items.forEach(function(d) {
    html += '<div style="padding:8px 0;border-bottom:1px solid var(--border-subtle);">' + renderItem(d) + '</div>';
  });
  html += '</div>';
  return html;
}

// ── HELPER: Time ago ──
function _timeAgo(dateStr) {
  var now = Date.now();
  var then = new Date(dateStr).getTime();
  var diff = Math.floor((now - then) / 1000);
  if (diff < 60) return t('time.just_now');
  if (diff < 3600) return Math.floor(diff / 60) + t('time.minutes_ago');
  if (diff < 86400) return Math.floor(diff / 3600) + t('time.hours_ago');
  if (diff < 2592000) return Math.floor(diff / 86400) + t('time.days_ago');
  return localDate(dateStr, {month:'short', day:'numeric'});
}

// ── Directory alllink scroll ──
document.querySelectorAll('#sec-directory .alllink').forEach(function(el) {
  el.style.cursor = 'pointer';
  el.addEventListener('click', function(e) {
    e.preventDefault();
    var block = el.closest('.catblock');
    if (block) block.scrollIntoView({behavior:'smooth',block:'start'});
  });
});

// ── INIT I18N ──
if (typeof SC_I18N !== 'undefined') SC_I18N.init();
