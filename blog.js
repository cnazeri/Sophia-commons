// Sophia Commons blog: published articles, member submissions (pending until the admin
// publishes them) and the admin review tab. Uses globals from sophia_commons_v9.js:
// _sb, sbReady, signedIn, username, isAdmin, esc, escUrl, t, showSec, openModal, updateSEOMeta.

var BLOG_FIELDS = 'id, author_name, title, slug, excerpt, body, cover_url, tags, status, created_at, published_at';

function _blogSlug(title) {
  var base = String(title || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90) || 'article';
  return base + '-' + Math.random().toString(36).slice(2, 6);
}

function _blogDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

// Plain text to safe HTML: paragraphs, "## " subheadings, **bold**, *italic* and https links.
function _blogBodyHtml(body) {
  return String(body || '').replace(/\r/g, '').split(/\n{2,}/).map(function(block) {
    var b = block.trim();
    if (!b) return '';
    var heading = /^##\s+/.test(b);
    var h = esc(b.replace(/^##\s+/, ''))
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>')
      .replace(/(https:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" target="_blank" rel="noopener nofollow ugc">$1</a>')
      .replace(/\n/g, '<br>');
    return heading ? '<h3 class="blog-h">' + h + '</h3>' : '<p>' + h + '</p>';
  }).join('');
}

function _blogCard(p) {
  var cover = p.cover_url ? '<img class="blog-cover" src="' + escUrl(p.cover_url) + '" alt="" loading="lazy" decoding="async">' : '';
  var excerpt = p.excerpt || String(p.body || '').replace(/\s+/g, ' ').slice(0, 220) + (String(p.body || '').length > 220 ? '...' : '');
  return '<article class="blog-card">' + cover
    + '<div class="blog-card-text"><h3><a href="/blog/' + encodeURIComponent(p.slug) + '" onclick="showBlogPost(\'' + esc(p.slug) + '\');return false;">' + esc(p.title) + '</a></h3>'
    + '<div class="blog-meta">' + esc(p.author_name) + ' &middot; ' + esc(_blogDate(p.published_at || p.created_at)) + '</div>'
    + '<p>' + esc(excerpt) + '</p></div></article>';
}

async function loadBlogList() {
  var el = document.getElementById('blog-list');
  if (!el) return;
  var write = document.getElementById('blog-write-btn');
  if (write) write.textContent = '+ ' + t('blog.write', 'Write an article');
  if (!sbReady()) { el.innerHTML = '<div class="empty-note">' + esc(t('blog.offline', 'Articles could not be loaded.')) + '</div>'; return; }
  el.innerHTML = '<div class="empty-note">' + esc(t('common.loading', 'Loading...')) + '</div>';
  var r = await _sb.from('blog_posts').select(BLOG_FIELDS).eq('status', 'published').order('published_at', { ascending: false }).limit(60);
  if (r.error) { el.innerHTML = '<div class="empty-note">' + esc(t('blog.offline', 'Articles could not be loaded.')) + '</div>'; return; }
  el.innerHTML = (r.data && r.data.length)
    ? r.data.map(_blogCard).join('')
    : '<div class="empty-note">' + esc(t('blog.none', 'No articles yet. Be the first to write one.')) + '</div>';
}

async function showBlogPost(slug, skipPush) {
  var c = document.getElementById('blog-article');
  showSec('blog-post', true);
  if (!skipPush && window.location.pathname !== '/blog/' + slug) history.pushState({ type: 'blog', slug: slug }, '', '/blog/' + encodeURIComponent(slug));
  if (!c || !sbReady()) return;
  c.innerHTML = '<div class="empty-note">' + esc(t('common.loading', 'Loading...')) + '</div>';
  var r = await _sb.from('blog_posts').select(BLOG_FIELDS).eq('slug', slug).maybeSingle();
  var p = r.data;
  if (!p) { c.innerHTML = '<div class="empty-note">' + esc(t('blog.not_found', 'This article was not found.')) + '</div>'; return; }
  var note = p.status !== 'published' ? '<div class="blog-pending">' + esc(t('blog.pending_note', 'Waiting for review. Only you and the editor can see this article.')) + '</div>' : '';
  c.innerHTML = '<a href="/blog" class="blog-back" onclick="showSec(\'blog\');return false;">&larr; ' + esc(t('blog.all', 'All articles')) + '</a>'
    + note + '<h1 class="blog-title">' + esc(p.title) + '</h1>'
    + '<div class="blog-meta">' + esc(p.author_name) + ' &middot; ' + esc(_blogDate(p.published_at || p.created_at)) + '</div>'
    + (p.cover_url ? '<img class="blog-hero" src="' + escUrl(p.cover_url) + '" alt="">' : '')
    + '<div class="blog-body">' + _blogBodyHtml(p.body) + '</div>'
    + ((p.tags || []).length ? '<div class="blog-tags">' + p.tags.map(function(x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</div>' : '');
  updateSEOMeta(p.title + ' | Sophia Commons Blog', p.excerpt || String(p.body).slice(0, 155), '/blog/' + p.slug);
}

function showBlogForm() {
  if (!signedIn) { openModal(); return; }
  var f = document.getElementById('blog-form');
  if (f) { f.style.display = 'block'; f.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
}

async function submitBlogPost(ev) {
  if (ev) ev.preventDefault();
  if (!signedIn) { openModal(); return; }
  var g = function(id) { return (document.getElementById(id).value || '').trim(); };
  var msg = document.getElementById('blog-form-msg');
  var title = g('blog-title-in'), body = g('blog-body-in'), cover = g('blog-cover-in');
  if (title.length < 3) { msg.textContent = t('blog.err_title', 'Please add a title.'); return; }
  if (body.length < 50) { msg.textContent = t('blog.err_body', 'The article needs at least 50 characters.'); return; }
  if (cover && !/^https:\/\//.test(cover)) { msg.textContent = t('blog.err_cover', 'The picture link must start with https://'); return; }
  var tags = g('blog-tags-in').split(',').map(function(x) { return x.trim().toLowerCase(); }).filter(Boolean).slice(0, 8);
  var row = { author_name: (username || 'Member').slice(0, 80), title: title.slice(0, 200), slug: _blogSlug(title),
    excerpt: g('blog-excerpt-in').slice(0, 400) || null, body: body.slice(0, 60000), cover_url: cover || null, tags: tags };
  if (isAdmin()) row.status = 'published';
  msg.textContent = t('common.saving', 'Saving...');
  var r = await _sb.from('blog_posts').insert(row).select('slug, status').single();
  if (r.error) { msg.textContent = t('blog.err_save', 'Could not save: ') + r.error.message; return; }
  document.getElementById('blog-form').reset();
  msg.textContent = r.data.status === 'published'
    ? t('blog.published', 'Published.')
    : t('blog.submitted', 'Thank you. Your article will appear after the editor reviews it.');
  if (r.data.status === 'published') loadBlogList();
}

// ── Admin: Blog tab ──
async function loadAdminBlog() {
  var el = document.getElementById('admin-blog-list');
  if (!el || !isAdmin()) return;
  el.innerHTML = 'Loading...';
  var r = await _sb.from('blog_posts').select(BLOG_FIELDS).in('status', ['pending', 'published']).order('created_at', { ascending: false }).limit(100);
  if (r.error) { el.textContent = 'Error: ' + r.error.message; return; }
  var rows = r.data || [];
  if (!rows.length) { el.innerHTML = '<div class="empty-note">No articles yet.</div>'; return; }
  el.innerHTML = rows.map(function(p) {
    var pending = p.status === 'pending';
    return '<div class="lrow" id="ab-' + p.id + '" style="display:block;">'
      + '<span class="ltag">' + esc(p.status) + '</span> <a class="ltitle" href="/blog/' + encodeURIComponent(p.slug) + '" onclick="showBlogPost(\'' + esc(p.slug) + '\');return false;">' + esc(p.title) + '</a>'
      + '<span class="lmeta"> ' + esc(p.author_name) + ' &middot; ' + esc(_blogDate(p.created_at)) + '</span>'
      + '<div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap;">'
      + (pending ? '<button class="btn-sm" onclick="adminBlogSet(\'' + p.id + '\',\'published\')">Publish</button>' : '<button class="btn-sm" onclick="adminBlogSet(\'' + p.id + '\',\'pending\')">Unpublish</button>')
      + '<button class="btn-sm" onclick="adminBlogSet(\'' + p.id + '\',\'rejected\')">Reject</button>'
      + '<button class="btn-sm" onclick="adminBlogDelete(\'' + p.id + '\')">Delete</button></div></div>';
  }).join('');
}

async function adminBlogSet(id, status) {
  if (!isAdmin()) return;
  var patch = { status: status };
  if (status === 'published') patch.published_at = new Date().toISOString();
  var r = await _sb.from('blog_posts').update(patch).eq('id', id);
  if (r.error) { scNotify('Error: ' + r.error.message); return; }
  loadAdminBlog();
}

async function adminBlogDelete(id) {
  if (!isAdmin() || !confirm('Delete this article for good?')) return;
  var r = await _sb.from('blog_posts').delete().eq('id', id);
  if (r.error) { scNotify('Error: ' + r.error.message); return; }
  var row = document.getElementById('ab-' + id); if (row) row.remove();
}
