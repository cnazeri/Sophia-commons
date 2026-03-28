// ══════════════════════════════════════════
//  SOPHIA COMMONS v9 - Frontend Application
//  Backend: Supabase (see /backend/README.md)
// ══════════════════════════════════════════

let signedIn = false, username = '';
let previousSection = 'home'; // Track where user came from for back button

// Supabase guard - all _sb calls should check this first
function sbReady() { return typeof _sb !== 'undefined' && _sb !== null; }

// ══════════════════════════════════════════
//  DETAIL VIEW SYSTEM
//  Rich individual pages for every listing,
//  event, news article, and directory entry.
// ══════════════════════════════════════════

function goBack() {
  showSec(previousSection || 'home');
}

// Show a detail page by type and Supabase ID
async function showDetail(type, id) {
  // Track where we came from
  var activeSec = document.querySelector('.pagesec.active');
  if (activeSec && activeSec.id !== 'sec-detail') {
    previousSection = activeSec.id.replace('sec-', '');
  }

  var container = document.getElementById('detail-content');
  container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">Loading...</div>';
  showSec('detail');

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
      loadRelatedDirectory(data.category, data.id);
    } else if (type === 'event') {
      var { data, error } = await _sb.from('events')
        .select('*').eq('id', id).single();
      if (error || !data) { container.innerHTML = renderNotFound(); return; }
      container.innerHTML = renderEventDetail(data);
      loadRelatedEvents(data.category_id, data.id);
    } else if (type === 'news') {
      var { data, error } = await _sb.from('news')
        .select('*').eq('id', id).single();
      if (error || !data) { container.innerHTML = renderNotFound(); return; }
      container.innerHTML = renderNewsDetail(data);
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
  var activeSec = document.querySelector('.pagesec.active');
  if (activeSec && activeSec.id !== 'sec-detail') {
    previousSection = activeSec.id.replace('sec-', '');
  }
  var container = document.getElementById('detail-content');
  container.innerHTML = renderStaticDetail(data);
  showSec('detail');
}

// ── RENDERERS ──

function renderDirectoryDetail(d) {
  var badges = '';
  if (d.is_verified) badges += '<span class="detail-badge verified">Verified</span>';
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
  if (d.website_url) actions += '<a class="btn-primary-detail" href="' + esc(d.website_url) + '" target="_blank">Visit Website &#8599;</a>';
  if (d.email) actions += '<a class="btn-secondary-detail" href="mailto:' + esc(d.email) + '">Contact &#9993;</a>';
  if (d.phone) actions += '<a class="btn-secondary-detail" href="tel:' + esc(d.phone) + '">Call &#9742;</a>';

  return '<div class="detail-hero">'
    + badges
    + '<h1>' + esc(d.organization_name) + '</h1>'
    + '<div class="detail-meta">' + meta + '</div>'
    + '<div class="detail-body">' + esc(d.description || 'No description available.') + '</div>'
    + tags
    + '<div class="detail-actions">' + actions + '</div>'
    + '</div>'
    + '<div class="detail-sidebar"><h4>Quick Facts</h4>'
    + '<p><strong>Category:</strong> ' + esc(d.category || 'General') + '</p>'
    + (d.address ? '<p><strong>Address:</strong> ' + esc(d.address) + '</p>' : '')
    + (d.location ? '<p><strong>Location:</strong> ' + esc(d.location) + '</p>' : '')
    + (d.country ? '<p><strong>Country:</strong> ' + esc(d.country) + '</p>' : '')
    + (d.phone ? '<p><strong>Phone:</strong> <a href="tel:' + esc(d.phone) + '">' + esc(d.phone) + '</a></p>' : '')
    + (d.email ? '<p><strong>Email:</strong> <a href="mailto:' + esc(d.email) + '">' + esc(d.email) + '</a></p>' : '')
    + (d.website_url ? '<p><strong>Website:</strong> <a href="' + esc(d.website_url) + '" target="_blank">' + esc(d.website_url.replace('https://','').replace('http://','')) + '</a></p>' : '')
    + '<p><strong>Status:</strong> ' + (d.is_verified ? '<span style="color:var(--sage);font-weight:700;">&#10003; Verified</span>' : 'Listed') + '</p>'
    + '</div>'
    + '<div id="related-listings"></div>';
}

function renderEventDetail(ev) {
  var d = new Date(ev.start_date);
  var endStr = ev.end_date ? new Date(ev.end_date).toLocaleDateString('en-US', {weekday:'long', month:'long', day:'numeric', year:'numeric'}) : '';
  var dateStr = d.toLocaleDateString('en-US', {weekday:'long', month:'long', day:'numeric', year:'numeric'});
  var timeStr = ev.is_all_day ? 'All day' : d.toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit'});

  var badges = '';
  if (ev.featured) badges += '<span class="detail-badge category">Featured</span>';
  if (ev.event_type) badges += '<span class="detail-badge type">' + esc(ev.event_type) + '</span>';
  if (ev.is_free) badges += '<span class="detail-badge free">Free</span>';
  if (ev.is_online) badges += '<span class="detail-badge type">Online</span>';

  var meta = '';
  meta += '<span>&#128197; ' + esc(dateStr) + '</span>';
  if (endStr && endStr !== dateStr) meta += '<span>to ' + esc(endStr) + '</span>';
  meta += '<span>&#128336; ' + esc(timeStr) + '</span>';
  if (ev.city) meta += '<span>&#128205; ' + esc(ev.city) + (ev.country ? ', ' + esc(ev.country) : '') + '</span>';
  if (ev.organizer_name) meta += '<span>&#127915; ' + esc(ev.organizer_name) + '</span>';

  var actions = '';
  if (ev.ticket_url) actions += '<a class="btn-primary-detail" href="' + esc(ev.ticket_url) + '" target="_blank">Get Tickets &#8599;</a>';
  if (ev.online_url) actions += '<a class="btn-primary-detail" href="' + esc(ev.online_url) + '" target="_blank">Join Online &#8599;</a>';
  if (ev.organizer_url) actions += '<a class="btn-secondary-detail" href="' + esc(ev.organizer_url) + '" target="_blank">Organizer Website</a>';

  return '<div class="detail-hero">'
    + badges
    + '<h1>' + esc(ev.title) + '</h1>'
    + '<div class="detail-meta">' + meta + '</div>'
    + '<div class="detail-body">' + esc(ev.description || '') + '</div>'
    + (ev.ticket_price ? '<p style="font-size:14px;color:var(--gold);font-weight:700;margin-bottom:12px;">Ticket price: $' + ev.ticket_price + '</p>' : '')
    + '<div class="detail-actions">' + actions + '</div>'
    + '</div>'
    + '<div class="detail-sidebar"><h4>Event Details</h4>'
    + '<p><strong>Date:</strong> ' + esc(dateStr) + '</p>'
    + '<p><strong>Time:</strong> ' + esc(timeStr) + '</p>'
    + (ev.location_name ? '<p><strong>Venue:</strong> ' + esc(ev.location_name) + '</p>' : '')
    + (ev.city ? '<p><strong>City:</strong> ' + esc(ev.city) + '</p>' : '')
    + (ev.organizer_name ? '<p><strong>Organizer:</strong> ' + esc(ev.organizer_name) + '</p>' : '')
    + '</div>'
    + '<div id="related-listings"></div>';
}

function renderNewsDetail(n) {
  var pubDate = n.published_at ? new Date(n.published_at).toLocaleDateString('en-US', {month:'long', day:'numeric', year:'numeric'}) : '';

  var badges = '';
  if (n.featured) badges += '<span class="detail-badge category">Featured</span>';
  if (n.tags && n.tags.length) {
    n.tags.forEach(function(t) { badges += '<span class="detail-badge type">' + esc(t) + '</span>'; });
  }

  var meta = '';
  if (pubDate) meta += '<span>&#128197; ' + esc(pubDate) + '</span>';
  if (n.source_name) meta += '<span>&#128240; ' + esc(n.source_name) + '</span>';

  var actions = '';
  if (n.source_url) actions += '<a class="btn-primary-detail" href="' + esc(n.source_url) + '" target="_blank">Read at Source &#8599;</a>';

  return '<div class="detail-hero">'
    + badges
    + '<h1>' + esc(n.title) + '</h1>'
    + '<div class="detail-meta">' + meta + '</div>'
    + '<div class="detail-body">' + esc(n.body || n.excerpt || '') + '</div>'
    + '<div class="detail-actions">' + actions + '</div>'
    + '</div>';
}

function renderStaticDetail(d) {
  var badges = '';
  if (d.verified) badges += '<span class="detail-badge verified">Verified</span>';
  if (d.category) badges += '<span class="detail-badge category">' + esc(d.category) + '</span>';

  var meta = '';
  if (d.location) meta += '<span>&#128205; ' + esc(d.location) + '</span>';

  var actions = '';
  if (d.url) actions += '<a class="btn-primary-detail" href="' + esc(d.url) + '" target="_blank">Visit Website &#8599;</a>';
  if (d.amazon) actions += '<a class="btn-secondary-detail" href="' + esc(d.amazon) + '" target="_blank">Buy on Amazon</a>';

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
    + '<h2 style="font-family:Lora,serif;font-size:1.3rem;color:var(--text-primary);margin-bottom:8px;">Listing Not Found</h2>'
    + '<p style="color:var(--text-muted);font-size:14px;margin-bottom:20px;">This item may have been removed or is not yet available.</p>'
    + '<a href="#" onclick="goBack();return false;" style="color:var(--gold);font-weight:600;">&larr; Go back</a>'
    + '</div>';
}

function renderOfflineDetail() {
  return '<div style="text-align:center;padding:60px 20px;">'
    + '<h2 style="font-family:Lora,serif;font-size:1.3rem;color:var(--text-primary);margin-bottom:8px;">Detail View</h2>'
    + '<p style="color:var(--text-muted);font-size:14px;margin-bottom:20px;">Connect to the internet to view full listing details.</p>'
    + '<a href="#" onclick="goBack();return false;" style="color:var(--gold);font-weight:600;">&larr; Go back</a>'
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
    el.innerHTML = '<h4 style="font-family:Lora,serif;font-size:14px;font-weight:700;margin-bottom:12px;">Related in ' + esc(category) + '</h4>'
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
    el.innerHTML = '<h4 style="font-family:Lora,serif;font-size:14px;font-weight:700;margin-bottom:12px;">More Upcoming Events</h4>'
      + '<div class="detail-related">'
      + data.map(function(r) {
        var d = new Date(r.start_date);
        return '<div class="detail-related-card" onclick="showDetail(\'event\',\'' + r.id + '\')">'
          + '<h5>' + esc(r.title) + '</h5>'
          + '<p>' + d.toLocaleDateString('en-US', {month:'short', day:'numeric'}) + ' - ' + esc(r.city || '') + '</p>'
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
  'societies & organizations': { dirCat: 'societies', desc: 'National and international anthroposophical societies, branches, federations, and membership organizations.' }
};

function showCategory(name) {
  // Track where we came from for back button
  var activeSec = document.querySelector('.pagesec.active');
  if (activeSec && activeSec.id !== 'sec-category') {
    previousSection = activeSec.id.replace('sec-', '');
  }

  var displayName = name.charAt(0).toUpperCase() + name.slice(1);
  var key = name.toLowerCase();
  var meta = catMeta[key] || {};

  document.getElementById('cat-page-label').textContent = displayName;
  document.getElementById('cat-page-desc').textContent = meta.desc || 'Browse listings, organizations, and events in this category.';
  document.getElementById('cat-page-content').innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">Loading...</div>';
  showSec('category');

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
    html += '<div class="listblock-head"><h3>Organizations &amp; Directory</h3><span style="font-size:10.5px;color:var(--text-muted);">' + dirEntries.length + ' entries</span></div>';
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
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    html += '<div class="listblock" style="margin-bottom:16px;">';
    html += '<div class="listblock-head"><h3>Upcoming Events</h3><span style="font-size:10.5px;color:var(--text-muted);">' + events.length + ' events</span></div>';
    html += '<div class="listblock-body">';
    events.forEach(function(ev) {
      var d = new Date(ev.start_date);
      var loc = [ev.city, ev.country].filter(Boolean).join(', ');
      html += '<div class="evrow" style="cursor:pointer;" onclick="showDetail(\'event\',\'' + ev.id + '\')">'
        + '<div class="evdate"><div class="mo">' + months[d.getMonth()] + '</div><div class="dy">' + d.getDate() + '</div></div>'
        + '<div class="evinfo">'
        + '<div class="etag">' + esc(ev.event_type || '') + (ev.is_free ? ' &middot; Free' : '') + '</div>'
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
    html += '<div class="listblock-head"><h3>Related News</h3></div>';
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
      + '<h3 style="font-family:Lora,serif;font-size:1.1rem;color:var(--text-primary);margin-bottom:8px;">This category is growing</h3>'
      + '<p style="color:var(--text-muted);font-size:13px;max-width:400px;margin:0 auto 16px;line-height:1.6;">We are building out this section. Be the first to contribute a listing, event, or resource.</p>'
      + '</div>';
  }

  // ── 5. Submit CTA ──
  html += '<div style="text-align:center;margin-top:20px;padding:20px;background:var(--surface);border:1px solid var(--border);border-radius:12px;">'
    + '<p style="font-size:14px;color:var(--text-secondary);margin-bottom:12px;">Know of an organization, event, or resource for this category?</p>'
    + '<button onclick="showSubmitForm()" style="padding:11px 28px;background:var(--gold);color:var(--text-inverse);border:none;border-radius:50px;font-family:Nunito Sans,sans-serif;font-size:14px;font-weight:600;cursor:pointer;">+ Submit a Listing</button>'
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
function showSec(id) {
  document.querySelectorAll('.pagesec').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('#mainnav button').forEach(b => b.classList.remove('active'));
  document.getElementById('sec-' + id).classList.add('active');
  const btn = document.getElementById('nav-' + id);
  if (btn) btn.classList.add('active');
  window.scrollTo(0,0);
  if (id === 'directory' && !mapLoaded) loadMap();
  // Close mobile menu if open
  const leftbar = document.getElementById('leftbar');
  const hamburger = document.getElementById('hamburger-btn');
  if (leftbar) leftbar.classList.remove('mobile-open');
  if (hamburger) hamburger.classList.remove('active');
}

function handleChat() {
  showSec('chat');
  if (!signedIn) openModal();
}

// ── MOBILE MENU ──
function toggleMobileMenu() {
  document.getElementById('leftbar').classList.toggle('mobile-open');
  document.getElementById('hamburger-btn').classList.toggle('active');
}

// ── STICKY NAV SCROLL ──
window.addEventListener('scroll', () => {
  const header = document.getElementById('site-header');
  if (header) header.classList.toggle('scrolled', window.scrollY > 50);
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
    document.getElementById('modal-title').textContent = 'Create account';
    document.getElementById('modal-desc').textContent = 'Join the Sophia Commons community.';
    document.getElementById('auth-btn').textContent = 'Create account';
    document.getElementById('toggle-signup').style.display = 'none';
    document.getElementById('toggle-signin').style.display = 'inline';
  } else {
    authMode = 'signin';
    document.getElementById('modal-title').textContent = 'Sign in';
    document.getElementById('modal-desc').textContent = 'Access community chat and member features.';
    document.getElementById('auth-btn').textContent = 'Sign in';
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
    errEl.textContent = 'Password must be at least 6 characters.';
    errEl.style.display = 'block';
    return;
  }

  if (!sbReady()) {
    errEl.textContent = 'Authentication service is temporarily unavailable. Please try again later.';
    errEl.style.display = 'block';
    return;
  }

  const btn = document.getElementById('auth-btn');
  btn.disabled = true;
  btn.textContent = authMode === 'signin' ? 'Signing in...' : 'Creating account...';

  let result;
  if (authMode === 'signup') {
    result = await _sb.auth.signUp({ email, password });
  } else {
    result = await _sb.auth.signInWithPassword({ email, password });
  }

  btn.disabled = false;
  btn.textContent = authMode === 'signin' ? 'Sign in' : 'Create account';

  if (result.error) {
    errEl.textContent = result.error.message;
    errEl.style.display = 'block';
    return;
  }

  if (authMode === 'signup' && !result.data.session) {
    errEl.style.display = 'none';
    document.getElementById('modal-desc').textContent = 'Check your email for a confirmation link, then sign in.';
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
  document.getElementById('chat-input').placeholder = 'message # general as ' + username + '...';
  scrollMsgs();
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
  showSec('home');
}

async function doPasswordReset(e) {
  if (e) e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const errEl = document.getElementById('auth-error');
  if (!email || !email.includes('@')) {
    errEl.textContent = 'Enter your email address above, then click Forgot password.';
    errEl.style.display = 'block';
    return;
  }
  if (!sbReady()) return;
  await _sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin
  });
  errEl.style.display = 'none';
  document.getElementById('modal-desc').textContent = 'Password reset email sent. Check your inbox.';
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

async function switchRoom(el, name, desc, count) {
  document.querySelectorAll('.ritem').forEach(r => r.classList.remove('active'));
  el.classList.add('active');
  const b = el.querySelector('.unread'); if (b) b.remove();
  currentRoom = name;
  document.getElementById('room-title').textContent = '# ' + name;
  document.getElementById('room-desc').textContent = desc;
  document.getElementById('online-ct').textContent = String.fromCharCode(9679) + ' ' + count + ' online';
  document.getElementById('chat-input').placeholder = 'message # ' + name + ' as ' + username + '...';
  const msgs = document.getElementById('messages');

  let hist = [];
  try {
    const { data, error } = await _sb
      .from('chat_messages')
      .select('*')
      .eq('room', name)
      .order('created_at', { ascending: true })
      .limit(50);
    if (!error && data && data.length > 0) {
      hist = data.map(m => ({
        av: (m.username || 'U')[0].toUpperCase(),
        nm: m.username || 'User',
        t: new Date(m.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}),
        txt: m.content
      }));
    } else {
      hist = roomHistory[name] || [];
    }
  } catch(e) {
    hist = roomHistory[name] || [];
  }

  msgs.innerHTML = hist.map(m =>
    `<div class="msg"><div class="av">${m.av}</div><div class="bub"><div class="bmeta"><span class="nm">${m.nm}</span>${m.t}</div><div class="btxt">${esc(m.txt)}</div></div></div>`
  ).join('') + `<div class="msg sys"><div class="av">&middot;</div><div class="bub"><div class="btxt">you joined # ${name}</div></div></div>`;
  scrollMsgs();

  if (chatSubscription) {
    _sb.removeChannel(chatSubscription);
  }
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
      const t = new Date(m.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
      const av = (m.username || 'U')[0].toUpperCase();
      document.getElementById('messages').innerHTML +=
        `<div class="msg"><div class="av">${av}</div><div class="bub"><div class="bmeta"><span class="nm">${esc(m.username || 'User')}</span>${t}</div><div class="btxt">${esc(m.content)}</div></div></div>`;
      scrollMsgs();
    })
    .subscribe();
}

async function sendMsg() {
  const inp = document.getElementById('chat-input');
  const txt = inp.value.trim(); if (!txt) return;
  const msgs = document.getElementById('messages');
  const time = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});

  msgs.innerHTML += `<div class="msg mine"><div class="av">${username[0].toUpperCase()}</div><div class="bub"><div class="bmeta"><span class="nm">${esc(username)}</span>${time}</div><div class="btxt">${esc(txt)}</div></div></div>`;
  inp.value = ''; scrollMsgs();

  try {
    await _sb.from('chat_messages').insert({
      room: currentRoom,
      username: username,
      content: txt
    });
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
  document.getElementById('memorial-count').textContent = 'Showing ' + visible + ' memorial' + (visible !== 1 ? 's' : '');
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

    const heading = '<hr class="soft"><div class="seclabel" style="margin-bottom:14px;">Community Tributes &nbsp;·&nbsp; ' + data.length + ' memorials</div>';
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

    grid.innerHTML = heading + '<div class="catgrid" style="grid-template-columns:repeat(3,1fr);">' + cards + '</div>';

    // Update count
    const total = document.querySelectorAll('.memorial-card').length;
    document.getElementById('memorial-count').textContent = 'Showing ' + total + ' memorials';
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
    alert('Please fill in the name and a brief tribute.');
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
async function doSignup() {
  const v = document.getElementById('signup-email').value.trim();
  if (!v.includes('@')) return;
  try {
    await _sb.from('newsletter_subscribers').insert({ email: v });
  } catch(e) { /* duplicate is fine */ }
  document.getElementById('signup-email').style.display='none';
  document.querySelector('.signup-box button').style.display='none';
  document.getElementById('rsignup-ok').style.display='block';
}
async function doFtSignup() {
  const v = document.getElementById('ft-email').value.trim();
  if (!v.includes('@')) return;
  try {
    await _sb.from('newsletter_subscribers').insert({ email: v });
  } catch(e) { /* duplicate is fine */ }
  document.getElementById('ft-email').style.display='none';
  document.querySelector('.ftnl button').style.display='none';
  document.getElementById('ft-ok').style.display='block';
}

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

function loadMap() {
  mapLoaded = true;
  var lnk = document.createElement('link');
  lnk.rel = 'stylesheet';
  lnk.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  document.head.appendChild(lnk);
  var script = document.createElement('script');
  script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  script.onload = function() { initMap(); };
  script.onerror = function() {
    var el = document.getElementById('dir-map');
    el.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:20px;';
    el.innerHTML = '<div style="font-family:Lora,serif;font-size:14px;color:var(--text-muted);">Map unavailable</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:5px;justify-content:center;margin-top:6px;max-width:580px;">' +
      mapLocs.slice(0,16).map(function(l){return '<span style="font-size:12px;background:#fff;border:1px solid var(--border-subtle);padding:4px 10px;border-radius:50px;color:var(--text-secondary);">'+l.name+'<span style="color:var(--text-muted);font-size:11px;"> · '+l.city+'</span></span>';}).join('') + '</div>';
  };
  document.head.appendChild(script);
}
function initMap() {
  var el = document.getElementById('dir-map');
  map = L.map(el, {scrollWheelZoom:false}).setView([30,0],2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom:18
  }).addTo(map);
  renderMarkers('all');
}
function renderMarkers(filter) {
  markers.forEach(function(m){map.removeLayer(m);}); markers=[];
  var locs = filter==='all' ? mapLocs : mapLocs.filter(function(l){return l.cat===filter;});
  locs.forEach(function(loc) {
    var color = catColors[loc.cat]||'#888';
    var icon = L.divIcon({
      className:'',
      html:'<div style="width:14px;height:14px;border-radius:50%;background:'+color+';border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3);"></div>',
      iconSize:[14,14],iconAnchor:[7,7]
    });
    var m = L.marker([loc.lat,loc.lng],{icon:icon,title:loc.name}).addTo(map);
    m.bindPopup('<div style="font-family:Nunito Sans,sans-serif;padding:4px;max-width:200px;"><div style="font-weight:700;font-size:13px;margin-bottom:3px;">'+loc.name+'</div><div style="font-size:12px;color:#6B5E50;">'+loc.city+'</div></div>');
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
    alert('Please fill in the organization name and category.');
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
  const q = document.getElementById('searchinput').value.trim().toLowerCase();
  if (!q) return;
  showSec('browse');

  (async () => {
    try {
      const { data, error } = await _sb.rpc('search_all', { query: q, limit_n: 30 });
      if (!error && data && data.length > 0) {
        const results = data.map(r =>
          `<div style="padding:12px 0;border-bottom:1px solid var(--border-subtle);">
            <span style="font-size:10px;text-transform:uppercase;color:var(--gold);font-weight:700;letter-spacing:0.05em;">${r.item_type}</span>
            <div style="font-family:Lora,serif;font-weight:700;font-size:15px;margin-top:3px;">${r.title}</div>
            <div style="font-size:13px;color:var(--text-muted);margin-top:4px;">${r.excerpt || ''}</div>
          </div>`
        ).join('');
        const sec = document.getElementById('sec-browse');
        const existing = sec.querySelector('.search-results');
        if (existing) existing.remove();
        sec.insertAdjacentHTML('afterbegin',
          `<div class="search-results" style="background:var(--elevated);border:1px solid var(--border);border-radius:12px;padding:20px 24px;margin-bottom:20px;">
            <div style="font-size:13px;color:var(--text-muted);margin-bottom:10px;">Search results for "${q}" (${data.length} found)
              <a href="#" onclick="this.closest('.search-results').remove();return false;" style="float:right;font-size:12px;">close</a>
            </div>
            ${results}
          </div>`
        );
        return;
      }
    } catch(e) { /* Supabase not available, fall back to local */ }

    setTimeout(() => {
      const links = document.querySelectorAll('#sec-browse a, #sec-directory a');
      let found = 0;
      links.forEach(a => {
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
        const dirLinks = document.querySelectorAll('#sec-directory a');
        dirLinks.forEach(a => {
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
      }
    }, 100);
  })();
}

// ══════════════════════════════════════════
//  SUPABASE DATA LOADERS
//  Load live data from the backend and render
//  into the static page sections.
// ══════════════════════════════════════════

// ── EVENTS: Load from Supabase ──
async function loadEventsFromSupabase() {
  if (!sbReady()) return;
  try {
    const { data, error } = await _sb.rpc('get_upcoming_events', { days_ahead: 365, limit_n: 20 });
    if (error || !data || data.length === 0) return;

    const container = document.querySelector('#sec-events .evlist, #sec-events');
    if (!container) return;

    // Find or create the events list area
    let evList = document.getElementById('sb-events-list');
    if (!evList) {
      evList = document.createElement('div');
      evList.id = 'sb-events-list';
      // Insert after the section label
      const label = container.querySelector('.seclabel');
      if (label) label.insertAdjacentElement('afterend', evList);
      else container.prepend(evList);
    }

    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const today = new Date().toDateString();

    evList.innerHTML = data.map(ev => {
      const d = new Date(ev.start_date);
      const isToday = d.toDateString() === today;
      const loc = [ev.city, ev.country].filter(Boolean).join(', ');
      const tag = ev.category_name || ev.event_type || '';
      const org = ev.organizer_name || '';
      return `<div class="evrow reveal visible">
        <div class="evdate${isToday ? ' today' : ''}">
          <div class="mo">${months[d.getMonth()]}</div>
          <div class="dy">${d.getDate()}</div>
        </div>
        <div class="evinfo">
          <div class="etag">${esc(tag)}</div>
          <h5><a href="#" onclick="showDetail('event','${ev.id}');return false;">${esc(ev.title)}</a></h5>
          <div class="emeta">${esc(loc)}${org ? ' &middot; ' + esc(org) : ''}${ev.is_free ? ' &middot; Free' : ''}</div>
        </div>
      </div>`;
    }).join('');

    // Update count
    const label = container.querySelector('.seclabel');
    if (label) {
      label.innerHTML = 'Events &amp; Calendar &nbsp;&middot;&nbsp; ' + data.length + ' upcoming events';
    }
    console.log('Loaded ' + data.length + ' events from Supabase');
  } catch(e) {
    console.warn('Events load failed:', e);
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
        <div class="trendblock-head"><h3>Featured</h3><span class="tlabel">${ago}</span></div>
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
        <div class="listblock-head"><h3>Latest Stories</h3></div>
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
      label.innerHTML = 'News &amp; Announcements &nbsp;&middot;&nbsp; ' + data.length + ' articles';
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
      societies: 'Societies & Organizations',
      waldorf: 'Waldorf Schools & Training',
      biodynamic: 'Biodynamic Agriculture',
      medicine: 'Anthroposophic Medicine',
      camphill: 'Camphill & Communities',
      eurythmy: 'Arts & Eurythmy',
      eldercare: 'Eldercare',
      community: 'Community Centers',
      online: 'Online Resources',
      other: 'Other'
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
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff < 7) return diff + ' days ago';
  if (diff < 30) return Math.floor(diff / 7) + ' weeks ago';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

var calMonth = new Date().getMonth();
var calYear = new Date().getFullYear();
var mcMonth = new Date().getMonth();
var mcYear = new Date().getFullYear();

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
  var label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

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
  upcoming.forEach(function(ev) {
    var d = new Date(ev.date + 'T12:00:00');
    var mo = d.toLocaleString('en-US', { month: 'short' });
    var dy = d.getDate();
    var isToday = (d.toDateString() === new Date().toDateString());
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
    var mo = d.toLocaleString('en-US', { month: 'short' });
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

  dayEl.textContent = now.toLocaleDateString('en-US', { weekday: 'long' });
  dateEl.textContent = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  var todayStr = now.toISOString().split('T')[0];
  var futureCount = calEvents.filter(function(e) { return e.date >= todayStr; }).length;
  upEl.textContent = futureCount + ' upcoming events';
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
  if (!title || !date) { alert('Please fill in at least the title and start date.'); return; }

  var ev = {
    date: date,
    title: title,
    cat: document.getElementById('esm-cat').value,
    loc: document.getElementById('esm-loc').value || 'TBD',
    org: document.getElementById('esm-org').value || '',
    time: document.getElementById('esm-time').value || ''
  };

  calEvents.push(ev);
  renderCalendar();
  renderEventList();
  renderMiniCal();
  renderSidebarUpcoming();
  updateHeaderCalendar();
  closeEventForm();

  // Clear form
  document.getElementById('esm-title').value = '';
  document.getElementById('esm-date').value = '';
  document.getElementById('esm-end').value = '';
  document.getElementById('esm-time').value = '';
  document.getElementById('esm-loc').value = '';
  document.getElementById('esm-org').value = '';
  document.getElementById('esm-desc').value = '';
  document.getElementById('esm-url').value = '';

  // If Supabase is available, also persist
  if (sbReady()) {
    _sb.from('events').insert([{
      title: ev.title,
      event_date: ev.date,
      category: ev.cat,
      location: ev.loc,
      organizer: ev.org,
      description: document.getElementById('esm-desc').value
    }]).then(function() { console.log('Event submitted to Supabase'); });
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

// ── INIT: Load all data on page ready ──
(function initSupabaseData() {
  // Wait a tick to ensure _sb is initialized
  setTimeout(function() {
    if (sbReady()) {
      loadEventsFromSupabase();
      loadNewsFromSupabase();
      loadDirectoryFromSupabase();
    }
  }, 100);
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

// ── Directory alllink scroll ──
document.querySelectorAll('#sec-directory .alllink').forEach(function(el) {
  el.style.cursor = 'pointer';
  el.addEventListener('click', function(e) {
    e.preventDefault();
    var block = el.closest('.catblock');
    if (block) block.scrollIntoView({behavior:'smooth',block:'start'});
  });
});
