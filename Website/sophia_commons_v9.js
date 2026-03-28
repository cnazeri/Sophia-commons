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
  if (d.location) meta += '<span>&#128205; ' + esc(d.location) + '</span>';
  if (d.country) meta += '<span>&#127758; ' + esc(d.country) + '</span>';

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
    + (d.location ? '<p><strong>Location:</strong> ' + esc(d.location) + '</p>' : '')
    + (d.country ? '<p><strong>Country:</strong> ' + esc(d.country) + '</p>' : '')
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
        .select('id, organization_name, description, website_url, location, country, is_verified')
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
      html += '<div class="lrow" style="cursor:pointer;padding:8px 0;" onclick="showDetail(\'directory\',\'' + d.id + '\')">'
        + v
        + '<a class="ltitle" href="#" onclick="return false;" style="font-size:14px;">' + esc(d.organization_name) + '</a>'
        + '<span class="lmeta">' + esc(loc) + '</span>'
        + '</div>';
      if (d.description) {
        html += '<div style="font-size:12px;color:var(--text-muted);padding:0 0 6px 20px;margin-top:-4px;line-height:1.5;">' + esc(d.description.substring(0, 160)) + (d.description.length > 160 ? '...' : '') + '</div>';
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
  {name:'Anthroposophical Society USA',cat:'societies',lat:42.28,lng:-83.74,city:'Ann Arbor, MI'},
  {name:'Anthroposophy NYC',cat:'societies',lat:40.75,lng:-73.99,city:'New York, NY'},
  {name:'ASA Bay Area Branch',cat:'societies',lat:37.77,lng:-122.42,city:'San Francisco, CA'},
  {name:'Anth. Society in Great Britain',cat:'societies',lat:51.51,lng:-0.12,city:'London, UK'},
  {name:'Alanus University',cat:'societies',lat:50.73,lng:7.10,city:'Alfter, Germany'},
  {name:'Green Meadow Waldorf School',cat:'waldorf',lat:41.09,lng:-74.01,city:'Spring Valley, NY',url:'https://www.greenmeadow.org'},
  {name:'Great Lakes Waldorf Institute',cat:'waldorf',lat:43.04,lng:-87.91,city:'Milwaukee, WI'},
  {name:'Bay Area Waldorf Teacher Training',cat:'waldorf',lat:37.77,lng:-122.44,city:'San Francisco, CA'},
  {name:"St. Paul's Steiner School",cat:'waldorf',lat:51.54,lng:-0.10,city:'London, UK'},
  {name:'South Devon Steiner School',cat:'waldorf',lat:50.43,lng:-3.72,city:'Devon, UK'},
  {name:'Hawthorne Valley Farm',cat:'biodynamic',lat:42.29,lng:-73.64,city:'Ghent, NY'},
  {name:'Kimberton CSA',cat:'biodynamic',lat:40.11,lng:-75.58,city:'Kimberton, PA'},
  {name:'Genesis Farm CSA',cat:'biodynamic',lat:40.97,lng:-74.95,city:'Blairstown, NJ'},
  {name:'Apricot Lane Farms',cat:'biodynamic',lat:34.28,lng:-118.89,city:'Moorpark, CA'},
  {name:'Dottenfelderhof',cat:'biodynamic',lat:50.18,lng:8.70,city:'Bad Vilbel, Germany'},
  {name:'Klinik Arlesheim',cat:'medicine',lat:47.49,lng:7.61,city:'Arlesheim, Switzerland'},
  {name:'Filderklinik',cat:'medicine',lat:48.65,lng:9.22,city:'Filderstadt, Germany'},
  {name:'Raphael Hospital',cat:'medicine',lat:50.83,lng:-0.14,city:'Brighton, UK'},
  {name:'Park Attwood Clinic',cat:'medicine',lat:52.39,lng:-2.21,city:'Worcestershire, UK'},
  {name:'Camphill Village USA',cat:'camphill',lat:42.10,lng:-73.87,city:'Copake, NY'},
  {name:'Camphill Communities CA',cat:'camphill',lat:36.99,lng:-121.97,city:'Soquel, CA'},
  {name:'Heartbeet Camphill',cat:'camphill',lat:44.55,lng:-72.57,city:'Hardwick, VT'},
  {name:'Triform Camphill',cat:'camphill',lat:42.26,lng:-73.78,city:'Hudson, NY'},
  {name:'Eurythmy Spring Valley',cat:'eurythmy',lat:41.07,lng:-74.04,city:'Chestnut Ridge, NY'},
  {name:'American Eurythmy School',cat:'eurythmy',lat:41.49,lng:-122.38,city:'Weed, CA'},
  {name:'London Eurythmy School',cat:'eurythmy',lat:51.52,lng:-0.09,city:'London, UK'},
  {name:'Sound Circle Eurythmy',cat:'eurythmy',lat:40.01,lng:-105.27,city:'Boulder, CO'},
  {name:'CC - New York City',cat:'cc',lat:40.78,lng:-73.98,city:'New York, NY'},
  {name:'CC - San Francisco',cat:'cc',lat:37.77,lng:-122.44,city:'San Francisco, CA'},
  {name:'CC - Chicago',cat:'cc',lat:41.96,lng:-87.68,city:'Chicago, IL'},
  {name:'CC - Sacramento',cat:'cc',lat:38.65,lng:-121.27,city:'Fair Oaks, CA'},
  {name:'CC International HQ',cat:'cc',lat:48.78,lng:9.18,city:'Stuttgart, Germany'},
];
const catColors = {societies:'#b04522',waldorf:'#8c3a28',biodynamic:'#5a7a3a',medicine:'#3a6a8a',camphill:'#7a5a9a',eurythmy:'#c49030',cc:'#6a4a3a'};
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
