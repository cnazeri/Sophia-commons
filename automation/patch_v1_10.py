#!/usr/bin/env python3
"""
One-shot patch: Sophia Commons v1.9.1 -> v1.10.0
  * Video of the Week sidebar (rotating weekly over the curated YouTube channels)
  * YouTube channels block on Podcasts & Media
  * Top 50 Anthroposophical Books (Amazon Associates links) on Books & Library
  * mobile fixes (page-title i18n fallback, nav tap targets, spotlight near top on phones)
Idempotent: refuses to run twice. Run from the project root:  python3 automation/patch_v1_10.py
"""
import io, os, re, sys, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def P(*a): return os.path.join(ROOT, *a)
def rd(p): return io.open(p, encoding="utf-8").read()
def wr(p, s): io.open(p, "w", encoding="utf-8").write(s)

html, css, js = rd(P("index.html")), rd(P("sophia_commons_v9.css")), rd(P("sophia_commons_v9.js"))
if "video-spotlight" in html or "VIDEO OF THE WEEK" in js:
    sys.exit("already patched")

def must_replace(s, old, new, label, count=1):
    if s.count(old) != count:
        sys.exit("patch anchor not found (%s): %r" % (label, old[:60]))
    return s.replace(old, new)

# ─────────────────────────── index.html ───────────────────────────
# 1. sidebar: video of the week, right under the calendar
html = must_replace(html,
    '  <div id="sidebar-upcoming" class="sb-upcoming"></div>\n  </section>\n',
    '  <div id="sidebar-upcoming" class="sb-upcoming"></div>\n  </section>\n\n'
    '  <section class="rb-sec rb-video">\n'
    '  <h5 data-i18n="rightbar.video_of_week">video of the week</h5>\n'
    '  <div id="video-spotlight" class="video-spotlight" aria-live="polite"></div>\n'
    '  </section>\n', "rightbar")

# 2. home: phones get the spotlight above Main Sections (desktop hides this copy)
html = must_replace(html,
    '  <div class="seclabel" data-i18n="home.main_sections">Main Sections</div>',
    '  <div id="home-video-spotlight" class="video-spotlight mobile-only"></div>\n\n'
    '  <div class="seclabel" data-i18n="home.main_sections">Main Sections</div>', "home")

# 3. podcasts: channels block right under the section label
html = must_replace(html,
    '<div class="pagesec" id="sec-podcasts">\n  <div class="seclabel" style="margin-bottom:10px;">Podcasts &amp; Media &nbsp;·&nbsp; 23 shows, channels, and platforms</div>\n',
    '<div class="pagesec" id="sec-podcasts">\n  <div class="seclabel" style="margin-bottom:10px;">Podcasts &amp; Media &nbsp;·&nbsp; 23 shows, channels, and platforms</div>\n'
    '  <div id="yt-channels-block"></div>\n', "podcasts")

# 4. books: Top 50 under the section label
html = must_replace(html,
    '<div class="pagesec" id="sec-books">\n  <div class="seclabel">Books &amp; Library &middot; Complete Rudolf Steiner Catalog &middot; 350+ volumes</div>\n',
    '<div class="pagesec" id="sec-books">\n  <div class="seclabel">Books &amp; Library &middot; Complete Rudolf Steiner Catalog &middot; 350+ volumes</div>\n'
    '  <div id="top50-books"></div>\n', "books")

# 5. version
html = must_replace(html, 'v1.9.1 &nbsp;', 'v1.10.0 &nbsp;', "version")
wr(P("index.html"), html)

sw = rd(P("sw.js"))
sw = must_replace(sw, "sophia-commons-v1.9.1", "sophia-commons-v1.10.0", "sw version")
wr(P("sw.js"), sw)

# ─────────────────────────── CSS ───────────────────────────
css += r'''

/* ══════════════════ v1.10: Video of the Week ══════════════════ */
.video-spotlight { margin-bottom: 4px; }
.video-card {
  display: block; background: var(--surface); border: 1px solid var(--border);
  border-radius: 10px; overflow: hidden; margin-bottom: 8px;
  transition: transform .2s, box-shadow .2s;
}
.video-card:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(44,36,24,.10); }
.video-thumb { position: relative; display: block; aspect-ratio: 16/9; background: var(--muted-bg, #eee); }
.video-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.video-thumb::after {
  content: ''; position: absolute; left: 50%; top: 50%; width: 38px; height: 38px; margin: -19px 0 0 -19px;
  border-radius: 50%; background: rgba(255,255,255,.92) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23b8862b' d='M8 5v14l11-7z'/%3E%3C/svg%3E") center/20px no-repeat;
  box-shadow: 0 2px 8px rgba(0,0,0,.25); transition: transform .2s;
}
.video-card:hover .video-thumb::after { transform: scale(1.08); }
.video-body { padding: 9px 11px 10px; }
.video-kicker { font-size: 9.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--gold-text); margin-bottom: 3px; }
.video-title { display: block; font-weight: 700; font-size: 12.5px; line-height: 1.35; color: var(--text-primary); margin-bottom: 4px;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.video-channel { font-size: 11px; color: var(--text-secondary); }
.video-channel b { color: var(--text-primary); }
.video-meta { font-size: 10.5px; color: var(--text-muted); margin-top: 2px; }
.video-actions { display: flex; flex-wrap: wrap; gap: 6px 12px; font-size: 11px; margin-top: 2px; }
.video-actions a { color: var(--gold-text); font-weight: 600; }
.video-actions a:hover { color: var(--gold-text-hover); }
.video-actions a.quiet { color: var(--text-muted); font-weight: 500; }
.mobile-only { display: none; }
@media (max-width: 768px) {
  .mobile-only { display: block; margin-bottom: 14px; }
  #rightbar .rb-video { display: none; }   /* phones show it near the top of Home instead */
  .mobile-only .video-card { max-width: 420px; }
  /* finger-sized tabs */
  #mainnav button { min-height: 44px; }
}

/* ══════════════════ v1.10: YouTube channels (Podcasts & Media) ══════════════════ */
.yt-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px 14px; }
.yt-cat h4 { font-family: 'Lora', Georgia, serif; font-size: 12px; font-weight: 700; letter-spacing: .06em;
  text-transform: uppercase; color: var(--text-muted); border-bottom: 1px solid var(--border-subtle); padding-bottom: 4px; margin: 0 0 6px; }
.yt-cat h4 span { font-weight: 500; letter-spacing: 0; text-transform: none; color: var(--text-muted); font-family: inherit; font-size: 11px; }
.yt-row { display: flex; align-items: baseline; gap: 6px; padding: 4px 0; border-bottom: 1px dashed var(--border-subtle); font-size: 13px; }
.yt-row:last-child { border-bottom: 0; }
.yt-row a.ltitle { flex: 1 1 auto; min-width: 0; }
.yt-row .lmeta { flex: 0 0 auto; font-size: 10.5px; }
.yt-row.is-week .ltitle::after { content: ' \2605'; color: var(--gold); }
.yt-toolbar { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; font-size: 12px; color: var(--text-muted); margin: 2px 0 10px; }
.yt-toolbar a { color: var(--gold-text); font-weight: 600; }

/* ══════════════════ v1.10: Top 50 books ══════════════════ */
.top50-intro { font-size: 13.5px; color: var(--text-secondary); line-height: 1.65; margin: 0 0 10px; }
.top50-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 12px; }
.top50-chips button { font: 600 11px 'Nunito Sans', sans-serif; letter-spacing: .03em; padding: 6px 11px; border-radius: 999px;
  border: 1px solid var(--border); background: var(--surface); color: var(--text-secondary); cursor: pointer; min-height: 32px; }
.top50-chips button.active { background: var(--gold); border-color: var(--gold); color: var(--on-gold); }
.top50-list { counter-reset: top50; display: grid; grid-template-columns: 1fr 1fr; gap: 0 22px; }
.top50-item { display: grid; grid-template-columns: 30px 1fr; gap: 8px; padding: 8px 0; border-bottom: 1px dashed var(--border-subtle); }
.top50-item.hidden { display: none; }
.top50-rank { font-family: 'Lora', Georgia, serif; font-size: 15px; font-weight: 700; color: var(--gold-text); line-height: 1.2; text-align: right; }
.top50-title { font-weight: 700; font-size: 13.5px; line-height: 1.35; color: var(--text-primary); }
.top50-title a { color: inherit; }
.top50-title a:hover { color: var(--gold-text); }
.top50-author { font-size: 12px; color: var(--text-secondary); }
.top50-blurb { font-size: 11.5px; color: var(--text-muted); line-height: 1.5; margin-top: 2px; }
.top50-links { font-size: 11px; margin-top: 4px; display: flex; flex-wrap: wrap; gap: 4px 10px; }
.top50-links a { color: var(--gold-text); font-weight: 600; }
.top50-links .ltag { font-size: 9.5px; }
.top50-amz { display: inline-block; padding: 3px 9px; border-radius: 999px; background: var(--gold-light); border: 1px solid var(--border); }
@media (max-width: 768px) { .top50-list { grid-template-columns: 1fr; } }
'''
wr(P("sophia_commons_v9.css"), css)

# ─────────────────────────── JS ───────────────────────────
# a. page titles must not show raw i18n keys on a cold deep link
js = must_replace(js,
    "    books:     { title: t('meta.books_title'), desc: t('meta.books_desc') },\n"
    "    podcasts:  { title: t('meta.podcasts_title'), desc: t('meta.podcasts_desc') },",
    "    books:     { title: t('meta.books_title', 'Books & Library | Sophia Commons'), desc: t('meta.books_desc', 'Rudolf Steiner catalog and the top 50 anthroposophical books.') },\n"
    "    podcasts:  { title: t('meta.podcasts_title', 'Podcasts & Media | Sophia Commons'), desc: t('meta.podcasts_desc', 'Anthroposophical podcasts, YouTube channels, archives and media.') },", "meta")
for k, dflt in (("meta.title", "Sophia Commons | Anthroposophical Community Directory"),
                ("meta.news_title", "News | Sophia Commons"), ("meta.events_title", "Events & Calendar | Sophia Commons"),
                ("meta.browse_title", "Browse Categories | Sophia Commons"), ("meta.directory_title", "Global Directory | Sophia Commons"),
                ("meta.memorial_title", "In Memoriam | Sophia Commons"), ("meta.marketplace_title", "Marketplace | Sophia Commons")):
    js = js.replace("t('%s')" % k, "t('%s', %s)" % (k, json.dumps(dflt)), 1)

# b. Supabase book catalog renders *after* the Top 50 block
js = must_replace(js,
    "      var label = container.querySelector('.seclabel');\n      if (label) label.insertAdjacentElement('afterend', sbBooksList);",
    "      var label = document.getElementById('top50-books') || container.querySelector('.seclabel');\n      if (label) label.insertAdjacentElement('afterend', sbBooksList);", "books anchor")

# c. language switch re-renders the new blocks
js = must_replace(js,
    "  if (id === 'podcasts') { renderPodcastSection(); }",
    "  if (id === 'podcasts') { renderPodcastSection(); renderYouTubeChannels(); }\n  if (id === 'books') { renderTop50Books(); }", "rerender")

books = json.load(io.open(P("automation", "top50_books.json"), encoding="utf-8"))
channels = json.load(io.open(P("automation", "youtube_channels.json"), encoding="utf-8"))
seed = [{k: c[k] for k in ("slug", "name", "url", "language", "category")} for c in channels["channels"]]

js += "\n\n// ═══════════════════════ v1.10: VIDEO OF THE WEEK + YOUTUBE CHANNELS + TOP 50 BOOKS ═══════════════════════\n"
js += "var YT_CATEGORIES = " + json.dumps(channels["categories"], ensure_ascii=False) + ";\n"
js += "var YT_CHANNELS_SEED = " + json.dumps(seed, ensure_ascii=False, separators=(",", ":")) + ";\n"
js += "var TOP50_BOOKS = " + json.dumps(books, ensure_ascii=False, separators=(",", ":")) + ";\n"
js += r'''
var AMAZON_TAG = 'sophiacom-20';
function amazonSearchUrl(q) { return 'https://www.amazon.com/s?k=' + encodeURIComponent(q) + '&i=stripbooks&tag=' + AMAZON_TAG; }

// ISO-8601 week number: the rotation key. Same week => same channel for every visitor.
function isoWeekKey(d) {
  d = d ? new Date(d) : new Date();
  var u = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  var day = u.getUTCDay() || 7;
  u.setUTCDate(u.getUTCDate() + 4 - day);
  var y = u.getUTCFullYear();
  var week = Math.ceil(((u - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return y * 100 + week;
}
function ytAgo(iso) {
  if (!iso) return '';
  var days = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  if (days < 1) return t('video.today', 'today');
  if (days < 30) return days + ' ' + t('video.days_ago', 'days ago');
  if (days < 365) return Math.floor(days / 30) + ' ' + t('video.months_ago', 'months ago');
  return Math.floor(days / 365) + ' ' + t('video.years_ago', 'years ago');
}

var _ytLatest = null;      // rows from the youtube_channel_latest view (or the seed)
var _ytOffset = 0;         // "another one" nudges within the same week

async function _ytFetchLatest() {
  if (_ytLatest) return _ytLatest;
  if (sbReady()) {
    try {
      var r = await _sb.from('youtube_channel_latest').select('*').order('name');
      if (!r.error && r.data && r.data.length) { _ytLatest = r.data; return _ytLatest; }
    } catch (e) { console.warn('youtube feed unavailable, using seed list', e); }
  }
  _ytLatest = YT_CHANNELS_SEED.map(function (c) { return { slug: c.slug, name: c.name, channel_url: c.url, language: c.language, category: c.category }; });
  return _ytLatest;
}

function weeklyChannel(rows, offset) {
  // prefer channels that actually have a video; rotate by ISO week so it changes every Monday
  var pool = rows.filter(function (r) { return r.video_id; });
  if (!pool.length) pool = rows;
  var i = (isoWeekKey() + (offset || 0)) % pool.length;
  return pool[(i + pool.length) % pool.length];
}

function renderVideoCard(ch) {
  var isVideo = !!ch.video_id;
  var href = isVideo ? ch.video_url : ch.channel_url;
  var thumb = ch.video_thumbnail || ch.channel_thumbnail;
  var html = '<div class="video-card">';
  if (thumb) html += '<a class="video-thumb" href="' + escUrl(href) + '" target="_blank" rel="noopener"><img src="' + escUrl(thumb) + '" alt="" loading="lazy"></a>';
  html += '<div class="video-body">'
    + '<div class="video-kicker">' + t('video.kicker', 'This week') + ' &middot; ' + esc(YT_CATEGORIES[ch.category] || ch.category || '') + '</div>'
    + '<a class="video-title" href="' + escUrl(href) + '" target="_blank" rel="noopener">' + esc(isVideo ? ch.video_title : ch.name) + '</a>'
    + '<div class="video-channel">' + (isVideo ? '<b>' + esc(ch.name) + '</b>' : esc(ch.description || '')) + (ch.language ? ' &middot; ' + esc(ch.language) : '') + '</div>'
    + (isVideo && ch.published_at ? '<div class="video-meta">' + esc(ytAgo(ch.published_at)) + '</div>' : '')
    + '<div class="video-actions">'
    + '<a href="' + escUrl(ch.channel_url) + '" target="_blank" rel="noopener">' + t('video.channel', 'Channel') + ' &rarr;</a>'
    + '<a href="/podcasts" onclick="showSec(\'podcasts\');return false;">' + t('video.all_channels', 'All channels') + '</a>'
    + '<a href="#" class="quiet" onclick="_ytOffset++;renderVideoSpotlight();return false;">' + t('video.another', 'another') + ' &#8635;</a>'
    + '</div></div></div>';
  return html;
}

async function renderVideoSpotlight() {
  var targets = [document.getElementById('video-spotlight'), document.getElementById('home-video-spotlight')].filter(Boolean);
  if (!targets.length) return;
  var rows = await _ytFetchLatest();
  var ch = weeklyChannel(rows, _ytOffset);
  var html = renderVideoCard(ch)
    + '<div class="video-actions" style="padding:0 2px;"><a href="#" class="quiet" onclick="suggestYouTubeChannel();return false;">+ ' + t('video.suggest', 'suggest a channel') + '</a></div>';
  targets.forEach(function (el) { el.innerHTML = html; });
}

async function renderYouTubeChannels() {
  var el = document.getElementById('yt-channels-block');
  if (!el) return;
  var rows = await _ytFetchLatest();
  var week = weeklyChannel(rows, 0);
  var groups = {};
  rows.forEach(function (r) { (groups[r.category] = groups[r.category] || []).push(r); });
  var order = Object.keys(YT_CATEGORIES).filter(function (k) { return groups[k]; }).concat(Object.keys(groups).filter(function (k) { return !YT_CATEGORIES[k]; }));
  var html = '<div class="listblock reveal"><div class="listblock-head"><h3>' + t('podcasts.youtube_heading', 'YouTube Channels') + '</h3>'
    + '<span class="podcast-count">' + rows.length + ' ' + t('podcasts.channels', 'channels') + '</span></div><div class="listblock-body">'
    + '<div class="yt-toolbar"><span>' + t('podcasts.youtube_note', 'Curated anthroposophical channels, refreshed weekly. &#9733; = this week\'s featured channel.') + '</span>'
    + '<a href="#" onclick="suggestYouTubeChannel();return false;">+ ' + t('video.suggest', 'suggest a channel') + '</a></div>'
    + '<div class="yt-grid">';
  order.forEach(function (cat) {
    html += '<div class="yt-cat"><h4>' + esc(YT_CATEGORIES[cat] || cat) + ' <span>' + groups[cat].length + '</span></h4>';
    groups[cat].sort(function (a, b) { return (b.published_at || '').localeCompare(a.published_at || '') || a.name.localeCompare(b.name); });
    groups[cat].forEach(function (r) {
      html += '<div class="yt-row' + (week && r.slug === week.slug ? ' is-week' : '') + '">'
        + '<a class="ltitle" href="' + escUrl(r.channel_url) + '" target="_blank" rel="noopener" title="' + esc(r.description || '') + '">' + esc(r.name) + '</a>'
        + (r.verified ? '<span class="lv">&#10003;</span>' : '')
        + '<span class="lmeta">' + esc(r.language || '') + (r.published_at ? ' &middot; ' + esc(ytAgo(r.published_at)) : '') + '</span></div>';
    });
    html += '</div>';
  });
  html += '</div></div></div>';
  el.innerHTML = html;
}

async function suggestYouTubeChannel() {
  var url = prompt(t('video.suggest_prompt', 'Paste the YouTube channel link (youtube.com/@...):'));
  if (!url) return;
  url = url.trim();
  if (!/^https:\/\/(www\.|m\.)?youtube\.com\//i.test(url)) { alert(t('video.suggest_invalid', 'Please paste a youtube.com channel link.')); return; }
  if (!sbReady()) { location.href = 'mailto:hello@sophiacommons.org?subject=' + encodeURIComponent('YouTube channel suggestion') + '&body=' + encodeURIComponent(url); return; }
  var note = prompt(t('video.suggest_note', 'Anything we should know? (optional)')) || null;
  var r = await _sb.from('youtube_channels_pending').insert({ url: url, note: note, source: 'visitor' });
  alert(r.error ? t('video.suggest_dupe', 'Thanks! That channel is already on our list to review.') : t('video.suggest_ok', 'Thank you! We review suggestions within a week.'));
}

// ── Top 50 books ──
var _top50Filter = 'all';
function renderTop50Books() {
  var el = document.getElementById('top50-books');
  if (!el) return;
  var cats = [];
  TOP50_BOOKS.forEach(function (b) { if (cats.indexOf(b.category) < 0) cats.push(b.category); });
  var html = '<div class="listblock" style="margin-bottom:16px;"><div class="listblock-head"><h3>' + t('books.top50_heading', 'Top 50 Anthroposophical Books') + '</h3>'
    + '<span style="font-size:10.5px;color:var(--text-muted);">' + t('books.top50_sub', 'a reading canon for newcomers and old hands') + '</span></div><div class="listblock-body">'
    + '<p class="top50-intro">' + t('books.top50_intro', 'Rudolf Steiner\'s essential works plus the most-read books by the anthroposophists who built on them: education, farming, medicine, meditation, the arts and social life. Amazon links support Sophia Commons; where a free edition exists we link that too.') + '</p>'
    + '<div class="top50-chips" role="tablist">'
    + '<button class="' + (_top50Filter === 'all' ? 'active' : '') + '" onclick="_top50Filter=\'all\';renderTop50Books()">' + t('books.all', 'All 50') + '</button>'
    + '<button class="' + (_top50Filter === 'steiner' ? 'active' : '') + '" onclick="_top50Filter=\'steiner\';renderTop50Books()">Rudolf Steiner</button>';
  cats.forEach(function (c) { html += '<button class="' + (_top50Filter === c ? 'active' : '') + '" onclick="_top50Filter=' + JSON.stringify(c).replace(/"/g, '&quot;') + ';renderTop50Books()">' + esc(c) + '</button>'; });
  html += '</div><div class="top50-list">';
  TOP50_BOOKS.forEach(function (b) {
    var show = _top50Filter === 'all' || (_top50Filter === 'steiner' ? /^Rudolf Steiner/.test(b.author) : b.category === _top50Filter);
    var q = b.isbn13 || (b.title.replace(/:.*$/, '') + ' ' + b.author.replace(/\s*\(.*\)$/, ''));
    html += '<div class="top50-item' + (show ? '' : ' hidden') + '"><div class="top50-rank">' + b.rank + '</div><div>'
      + '<div class="top50-title"><a href="' + escUrl(amazonSearchUrl(q)) + '" target="_blank" rel="sponsored noopener">' + esc(b.title) + '</a></div>'
      + '<div class="top50-author">' + esc(b.author) + (b.ga_number ? ' &middot; ' + esc(b.ga_number) : '') + '</div>'
      + '<div class="top50-blurb">' + esc(b.blurb) + '</div>'
      + '<div class="top50-links"><a class="top50-amz" href="' + escUrl(amazonSearchUrl(q)) + '" target="_blank" rel="sponsored noopener">' + t('books.buy_amazon', 'Amazon') + ' &rarr;</a>'
      + (b.free_online_url ? '<a href="' + escUrl(b.free_online_url) + '" target="_blank" rel="noopener">' + t('books.free_online', 'free online') + '</a>' : '')
      + '<span class="ltag">' + esc(b.category) + '</span></div>'
      + '</div></div>';
  });
  html += '</div></div></div>';
  el.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', function () {
  renderTop50Books();
  renderVideoSpotlight();
  renderYouTubeChannels();
});
'''
wr(P("sophia_commons_v9.js"), js)

# ─────────────────────────── lang/en.json ───────────────────────────
en_path = P("lang", "en.json")
en = json.load(io.open(en_path, encoding="utf-8"))
en.update({
  "rightbar.video_of_week": "video of the week",
  "video.kicker": "This week", "video.channel": "Channel", "video.all_channels": "All channels", "video.another": "another",
  "video.suggest": "suggest a channel", "video.suggest_prompt": "Paste the YouTube channel link (youtube.com/@...):",
  "video.suggest_note": "Anything we should know? (optional)", "video.suggest_invalid": "Please paste a youtube.com channel link.",
  "video.suggest_ok": "Thank you! We review suggestions within a week.", "video.suggest_dupe": "Thanks! That channel is already on our list to review.",
  "video.today": "today", "video.days_ago": "days ago", "video.months_ago": "months ago", "video.years_ago": "years ago",
  "podcasts.youtube_heading": "YouTube Channels", "podcasts.channels": "channels",
  "podcasts.youtube_note": "Curated anthroposophical channels, refreshed weekly. ★ = this week's featured channel.",
  "books.top50_heading": "Top 50 Anthroposophical Books", "books.top50_sub": "a reading canon for newcomers and old hands",
  "books.top50_intro": "Rudolf Steiner's essential works plus the most-read books by the anthroposophists who built on them: education, farming, medicine, meditation, the arts and social life. Amazon links support Sophia Commons; where a free edition exists we link that too.",
  "books.all": "All 50", "books.buy_amazon": "Amazon", "books.free_online": "free online",
  "meta.books_desc": "Rudolf Steiner's complete catalog and the top 50 anthroposophical books, with free online editions where they exist.",
  "meta.podcasts_desc": "Anthroposophical podcasts, YouTube channels, archives and media, with a new featured video every week."
})
io.open(en_path, "w", encoding="utf-8").write(json.dumps(en, ensure_ascii=False, indent=2) + "\n")
print("patched: index.html, sophia_commons_v9.css, sophia_commons_v9.js, lang/en.json, sw.js -> v1.10.0")
