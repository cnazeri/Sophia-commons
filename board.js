// ══════════════════════════════════════════
//  Community board (owner, 2026-11-27): the chat becomes a board of posts with comments.
//  Owner's choices: posts appear right away (members report and block, admins remove); the old chat rooms are
//  the topics; the old chat stays readable as "Earlier chat"; members only, like the chat.
//  Tables: board_posts, board_comments (backend/migrations/RUN_THIS_2026-11-27_board.sql), chat_messages (archive).
//  Lives in #sec-chat so /chat and the menu keep working. Uses globals from sophia_commons_v9.js:
//  _sb, sbReady, signedIn, esc, escJs, t, openModal, scNotify, showSec, openReportModal, viewReportedItem.
// ══════════════════════════════════════════

var BOARD_TOPICS = [
  ['general', 'General'], ['waldorf-education', 'Waldorf education'], ['biodynamic', 'Biodynamic'],
  ['study-groups', 'Study groups'], ['eurythmy-arts', 'Eurythmy and arts'], ['medicine', 'Medicine'],
  ['christian-community', 'The Christian Community'], ['meetups', 'Meetups'], ['new-members', 'New members']];
var BOARD_PAGE = 50, BOARD_ARCHIVE = 100, BOARD_TITLE_MAX = 140, BOARD_BODY_MAX = 5000, BOARD_COMMENT_MAX = 2000;
var _bd = { view: 'list', topic: 'all', postId: null, blocked: null };

function _bdT(k, f) { return typeof t === 'function' ? t('board.' + k, f) : f; }
function _bdTopicName(slug) {
  for (var i = 0; i < BOARD_TOPICS.length; i++) if (BOARD_TOPICS[i][0] === slug) return _bdT('topic.' + slug, BOARD_TOPICS[i][1]);
  return slug;
}
function _bdUser() { return window._supabaseUser || null; }
function _bdIsAdmin() { var u = _bdUser(); return !!(u && u.app_metadata && u.app_metadata.role === 'admin'); }
function _bdRoot() { return document.getElementById('board-root'); }
function _bdAgo(iso) {
  var s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return _bdT('just_now', 'just now');
  var units = [[86400 * 365, 'year'], [86400 * 30, 'month'], [86400 * 7, 'week'], [86400, 'day'], [3600, 'hour'], [60, 'minute']];
  for (var i = 0; i < units.length; i++) {
    if (s >= units[i][0]) {
      var n = Math.floor(s / units[i][0]);
      try { return new Intl.RelativeTimeFormat(document.documentElement.lang || 'en', { numeric: 'auto' }).format(-n, units[i][1]); }
      catch (e) { return n + ' ' + units[i][1] + (n === 1 ? '' : 's') + ' ago'; }
    }
  }
  return '';
}

// Members this person blocked (user_blocks, shared with the app); their posts and comments are hidden
async function _bdLoadBlocked() {
  if (_bd.blocked) return _bd.blocked;
  _bd.blocked = new Set();
  try {
    var r = await _sb.from('user_blocks').select('blocked_id');
    (r.data || []).forEach(function (x) { _bd.blocked.add(x.blocked_id); });
  } catch (e) { /* nothing hidden */ }
  return _bd.blocked;
}

// ── Drawing ──
function boardRender() {
  var root = _bdRoot(); if (!root) return;
  if (!signedIn || !_bdUser()) { root.innerHTML = _bdGate(); return; }
  if (_bd.view === 'post' && _bd.postId) return _bdDrawPost(_bd.postId);
  if (_bd.view === 'new') return _bdDrawNew();
  if (_bd.view === 'archive') return _bdDrawArchive();
  return _bdDrawList();
}
function _bdHead(sub, right) {
  return '<div class="bd-head"><div><h1 class="bd-title">' + esc(_bdT('title', 'Community board')) + '</h1>'
    + '<p class="bd-sub">' + esc(sub) + '</p></div>' + (right || '') + '</div>';
}
function _bdGate() {
  return _bdHead(_bdT('gate_sub', 'Posts and conversations from members around the world, by topic. Free membership required.'))
    + '<div class="bd-gate"><div class="bd-chips">' + BOARD_TOPICS.map(function (x) { return '<span class="bd-chip">' + esc(_bdTopicName(x[0])) + '</span>'; }).join('') + '</div>'
    + '<button type="button" class="bd-btn gold" onclick="openModal()">' + esc(_bdT('sign_in', 'Sign in to read and post')) + '</button></div>';
}
function _bdChips() {
  var all = [['all', _bdT('all', 'All topics')]].concat(BOARD_TOPICS.map(function (x) { return [x[0], _bdTopicName(x[0])]; }));
  return '<div class="bd-chips" role="tablist">' + all.map(function (x) {
    return '<button type="button" role="tab" aria-selected="' + (_bd.topic === x[0]) + '" class="bd-chip' + (_bd.topic === x[0] ? ' on' : '') + '" onclick="boardTopic(\'' + escJs(x[0]) + '\')">' + esc(x[1]) + '</button>';
  }).join('') + '</div>';
}
function _bdCard(p) {
  return '<article class="bd-card" tabindex="0" onclick="boardOpen(\'' + escJs(p.id) + '\')" onkeydown="if(event.key===\'Enter\')boardOpen(\'' + escJs(p.id) + '\')">'
    + '<div class="bd-meta"><span class="bd-topic">' + esc(_bdTopicName(p.topic)) + '</span>' + esc(p.username) + ' &middot; ' + esc(_bdAgo(p.created_at)) + '</div>'
    + '<h3>' + esc(p.title) + '</h3><p class="bd-excerpt">' + esc(p.body) + '</p>'
    + '<div class="bd-count">' + _bdIcon() + esc(p.comment_count === 1 ? _bdT('one_comment', '1 comment') : _bdT('n_comments', '{n} comments').replace('{n}', p.comment_count)) + '</div></article>';
}
function _bdIcon() { return '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v10H9l-5 4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>'; }

async function _bdDrawList() {
  var root = _bdRoot();
  var newBtn = '<button type="button" class="bd-btn gold" onclick="boardNew()">+ ' + esc(_bdT('new_post', 'New post')) + '</button>';
  root.innerHTML = _bdHead(_bdT('sub', 'Share a question, an idea or news with members around the world. Others can comment.'), newBtn)
    + _bdChips() + '<div id="bd-list" class="bd-list"><p class="bd-empty">' + esc(_bdT('loading', 'Loading...')) + '</p></div>'
    + (_bd.topic !== 'all' ? '<p class="bd-archive-link"><a href="#" onclick="boardArchive();return false;">' + esc(_bdT('earlier', 'Earlier chat in this topic')) + ' &rarr;</a></p>' : '');
  try {
    var blocked = await _bdLoadBlocked();
    var q = _sb.from('board_posts').select('id, user_id, username, topic, title, body, comment_count, last_activity, created_at')
      .order('last_activity', { ascending: false }).limit(BOARD_PAGE);
    if (_bd.topic !== 'all') q = q.eq('topic', _bd.topic);
    var r = await q;
    if (r.error && _bdMissing(r.error)) return _bdUseOldChat();
    if (r.error) throw r.error;
    var posts = (r.data || []).filter(function (p) { return !blocked.has(p.user_id); });
    var box = document.getElementById('bd-list'); if (!box) return;
    box.innerHTML = posts.length ? posts.map(_bdCard).join('')
      : '<div class="bd-empty"><p>' + esc(_bdT('empty', 'No posts here yet. Be the first to start a conversation.')) + '</p>' + newBtn + '</div>';
  } catch (e) {
    var b2 = document.getElementById('bd-list');
    if (b2) b2.innerHTML = '<p class="bd-empty">' + esc(_bdT('load_error', 'The board could not be loaded. Please try again.')) + '</p>';
  }
}

function _bdDrawNew() {
  var topic = _bd.topic !== 'all' ? _bd.topic : 'general';
  _bdRoot().innerHTML = '<p class="bd-back"><a href="#" onclick="boardBack();return false;">&larr; ' + esc(_bdT('back', 'Back to the board')) + '</a></p>'
    + '<div class="bd-form"><h2>' + esc(_bdT('new_post', 'New post')) + '</h2>'
    + '<label for="bd-topic">' + esc(_bdT('topic', 'Topic')) + '</label><select id="bd-topic">' + BOARD_TOPICS.map(function (x) {
        return '<option value="' + esc(x[0]) + '"' + (x[0] === topic ? ' selected' : '') + '>' + esc(_bdTopicName(x[0])) + '</option>'; }).join('') + '</select>'
    + '<label for="bd-title">' + esc(_bdT('post_title', 'Title')) + '</label><input id="bd-title" maxlength="' + BOARD_TITLE_MAX + '" placeholder="' + esc(_bdT('title_ph', 'What is it about?')) + '">'
    + '<label for="bd-body">' + esc(_bdT('post_body', 'Your post')) + '</label><textarea id="bd-body" rows="8" maxlength="' + BOARD_BODY_MAX + '" placeholder="' + esc(_bdT('body_ph', 'Write your question, idea or news...')) + '"></textarea>'
    + '<p class="bd-note">' + esc(_bdT('rules', 'Be kind. Posts appear right away; members can report anything that breaks the community guidelines.')) + '</p>'
    + '<p id="bd-form-msg" class="bd-msg" role="status"></p>'
    + '<button type="button" class="bd-btn gold" id="bd-post-btn" onclick="boardSubmitPost()">' + esc(_bdT('post_btn', 'Post')) + '</button></div>';
  var ti = document.getElementById('bd-title'); if (ti) ti.focus();
}

function _bdActions(kind, item) {
  var u = _bdUser(), mine = u && item.user_id === u.id, out = [];
  if (mine || _bdIsAdmin()) out.push('<button type="button" onclick="event.stopPropagation();boardDelete(\'' + kind + '\',\'' + escJs(item.id) + '\')">' + esc(_bdT('delete', 'Delete')) + '</button>');
  if (!mine) {
    out.push('<button type="button" onclick="event.stopPropagation();openReportModal(\'board_' + kind + '\',\'' + escJs(item.id) + '\')">' + esc(_bdT('report', 'Report')) + '</button>');
    out.push('<button type="button" onclick="event.stopPropagation();boardBlock(\'' + escJs(item.user_id) + '\',\'' + escJs(item.username) + '\')">' + esc(_bdT('block', 'Block')) + '</button>');
  }
  return '<div class="bd-acts">' + out.join('') + '</div>';
}

async function _bdDrawPost(id) {
  var root = _bdRoot();
  root.innerHTML = '<p class="bd-back"><a href="#" onclick="boardBack();return false;">&larr; ' + esc(_bdT('back', 'Back to the board')) + '</a></p><p class="bd-empty">' + esc(_bdT('loading', 'Loading...')) + '</p>';
  try {
    var blocked = await _bdLoadBlocked();
    var both = await Promise.all([
      _sb.from('board_posts').select('*').eq('id', id).maybeSingle(),
      _sb.from('board_comments').select('*').eq('post_id', id).order('created_at', { ascending: true }).limit(500)]);
    var p = both[0].data;
    if (!p) { root.innerHTML = root.firstChild.outerHTML + '<p class="bd-empty">' + esc(_bdT('gone', 'This post was removed.')) + '</p>'; return; }
    var comments = (both[1].data || []).filter(function (c) { return !blocked.has(c.user_id); });
    root.innerHTML = '<p class="bd-back"><a href="#" onclick="boardBack();return false;">&larr; ' + esc(_bdT('back', 'Back to the board')) + '</a></p>'
      + '<article class="bd-post"><div class="bd-meta"><span class="bd-topic">' + esc(_bdTopicName(p.topic)) + '</span>' + esc(p.username) + ' &middot; ' + esc(_bdAgo(p.created_at)) + '</div>'
      + '<h2>' + esc(p.title) + '</h2><div class="bd-body">' + esc(p.body) + '</div>' + _bdActions('post', p) + '</article>'
      + '<h3 class="bd-ch">' + esc(_bdT('comments', 'Comments')) + ' <span>' + comments.length + '</span></h3>'
      + '<div class="bd-comments">' + (comments.length ? comments.map(function (c) {
          return '<div class="bd-comment"><div class="bd-av" aria-hidden="true">' + esc((c.username || '?').charAt(0).toUpperCase()) + '</div><div>'
            + '<div class="bd-meta">' + esc(c.username) + ' &middot; ' + esc(_bdAgo(c.created_at)) + '</div><div class="bd-body">' + esc(c.body) + '</div>' + _bdActions('comment', c) + '</div></div>';
        }).join('') : '<p class="bd-empty">' + esc(_bdT('no_comments', 'No comments yet.')) + '</p>') + '</div>'
      + '<div class="bd-reply"><label for="bd-comment">' + esc(_bdT('add_comment', 'Add a comment')) + '</label>'
      + '<textarea id="bd-comment" rows="3" maxlength="' + BOARD_COMMENT_MAX + '"></textarea><p id="bd-comment-msg" class="bd-msg" role="status"></p>'
      + '<button type="button" class="bd-btn gold" id="bd-comment-btn" onclick="boardSubmitComment(\'' + escJs(p.id) + '\')">' + esc(_bdT('comment_btn', 'Comment')) + '</button></div>';
  } catch (e) {
    root.innerHTML = '<p class="bd-empty">' + esc(_bdT('load_error', 'The board could not be loaded. Please try again.')) + '</p>';
  }
}

// The old chat of a topic, read-only
async function _bdDrawArchive() {
  var root = _bdRoot();
  root.innerHTML = '<p class="bd-back"><a href="#" onclick="boardBack();return false;">&larr; ' + esc(_bdT('back', 'Back to the board')) + '</a></p>'
    + '<h2 class="bd-h2">' + esc(_bdT('earlier_title', 'Earlier chat')) + ': ' + esc(_bdTopicName(_bd.topic)) + '</h2>'
    + '<p class="bd-sub">' + esc(_bdT('earlier_sub', 'Messages from the community chat, kept for reading. New conversations happen on the board.')) + '</p><div id="bd-arch" class="bd-arch"></div>';
  try {
    var blocked = await _bdLoadBlocked();
    var r = await _sb.from('chat_messages').select('id, user_id, username, content, created_at').eq('room', _bd.topic)
      .order('created_at', { ascending: false }).limit(BOARD_ARCHIVE);
    var rows = (r.data || []).filter(function (m) { return !blocked.has(m.user_id); }).reverse();
    document.getElementById('bd-arch').innerHTML = rows.length ? rows.map(function (m) {
      return '<div class="bd-comment"><div class="bd-av" aria-hidden="true">' + esc((m.username || '?').charAt(0).toUpperCase()) + '</div><div><div class="bd-meta">'
        + esc(m.username) + ' &middot; ' + esc(new Date(m.created_at).toLocaleDateString()) + '</div><div class="bd-body">' + esc(m.content) + '</div></div></div>';
    }).join('') : '<p class="bd-empty">' + esc(_bdT('earlier_empty', 'No earlier messages in this topic.')) + '</p>';
  } catch (e) { /* the empty box stays */ }
}

// Until the board tables exist (RUN_THIS_2026-11-27_board.sql), members keep the old chat instead of an error
function _bdMissing(err) { return /PGRST205|42P01/.test(err.code || '') || /board_posts|schema cache|does not exist/i.test(err.message || ''); }
function _bdUseOldChat() {
  var root = _bdRoot(), old = document.getElementById('chat-legacy');
  if (!old) return;
  root.innerHTML = ''; old.hidden = false;
  var first = old.querySelector('.ritem.active') || old.querySelector('.ritem');
  if (first && typeof switchRoom === 'function' && !old.dataset.started) { old.dataset.started = '1'; first.click(); }
}

// ── Actions ──
function boardTopic(slug) { _bd.topic = slug; _bd.view = 'list'; boardRender(); }
function boardNew() { if (!signedIn) { openModal(); return; } _bd.view = 'new'; boardRender(); }
function boardOpen(id) { _bd.view = 'post'; _bd.postId = id; boardRender(); window.scrollTo(0, 0); }
function boardBack() { _bd.view = 'list'; _bd.postId = null; boardRender(); }
function boardArchive() { _bd.view = 'archive'; boardRender(); }

function _bdSay(id, text) { var el = document.getElementById(id); if (el) el.textContent = text; }

async function boardSubmitPost() {
  var topic = document.getElementById('bd-topic').value;
  var title = document.getElementById('bd-title').value.trim(), body = document.getElementById('bd-body').value.trim();
  if (title.length < 3) return _bdSay('bd-form-msg', _bdT('title_short', 'Please give your post a title (at least 3 letters).'));
  if (!body) return _bdSay('bd-form-msg', _bdT('body_empty', 'Please write something in your post.'));
  var btn = document.getElementById('bd-post-btn'); btn.disabled = true;
  try {
    var r = await _sb.from('board_posts').insert({ topic: topic, title: title.slice(0, BOARD_TITLE_MAX), body: body.slice(0, BOARD_BODY_MAX) }).select('id').single();
    if (r.error) throw r.error;
    _bd.topic = topic;
    boardOpen(r.data.id);
  } catch (e) {
    btn.disabled = false;
    _bdSay('bd-form-msg', _bdT('post_error', 'Your post could not be saved. Please try again.'));
  }
}

async function boardSubmitComment(postId) {
  var ta = document.getElementById('bd-comment'), body = ta.value.trim();
  if (!body) return _bdSay('bd-comment-msg', _bdT('comment_empty', 'Please write a comment first.'));
  var btn = document.getElementById('bd-comment-btn'); btn.disabled = true;
  try {
    var r = await _sb.from('board_comments').insert({ post_id: postId, body: body.slice(0, BOARD_COMMENT_MAX) });
    if (r.error) throw r.error;
    _bdDrawPost(postId);
  } catch (e) {
    btn.disabled = false;
    _bdSay('bd-comment-msg', _bdT('comment_error', 'Your comment could not be saved. Please try again.'));
  }
}

async function boardDelete(kind, id) {
  if (!confirmDelete(kind)) return;
  var table = kind === 'post' ? 'board_posts' : 'board_comments';
  var r = await _sb.from(table).delete().eq('id', id).select('id');
  if (r.error || !r.data || !r.data.length) { scNotify(_bdT('delete_error', 'This could not be deleted.')); return; }
  if (kind === 'post') boardBack(); else _bdDrawPost(_bd.postId);
}
function confirmDelete(kind) {
  return window.confirm(kind === 'post' ? _bdT('confirm_post', 'Delete this post and its comments?') : _bdT('confirm_comment', 'Delete this comment?'));
}

async function boardBlock(userId, name) {
  if (!window.confirm(_bdT('confirm_block', 'Block {name}? You will no longer see their posts and comments.').replace('{name}', name))) return;
  var r = await _sb.from('user_blocks').insert({ blocker_id: _bdUser().id, blocked_id: userId });
  if (r.error && !/duplicate/i.test(r.error.message)) { scNotify(_bdT('block_error', 'Could not block. Please try again.')); return; }
  (await _bdLoadBlocked()).add(userId);
  scNotify(_bdT('blocked', 'Blocked. Their posts and comments are hidden from you.'));
  boardBack();
}

// ── Wiring: draw when the section opens and when the sign-in changes; reported posts open here ──
(function () {
  var _show = window.showSec;
  if (typeof _show === 'function') window.showSec = function (id) {
    var r = _show.apply(this, arguments);
    if (id === 'chat') boardRender();
    return r;
  };
  var _auth = window.savedAuthChanged;
  if (typeof _auth === 'function') window.savedAuthChanged = function () {
    var r = _auth.apply(this, arguments);
    _bd.blocked = null; _bd.view = 'list';
    var sec = document.getElementById('sec-chat');
    if (sec && sec.classList.contains('active')) boardRender();
    return r;
  };
  var _view = window.viewReportedItem;
  if (typeof _view === 'function') window.viewReportedItem = async function (type, id) {
    if (type === 'board_post') { showSec('chat'); boardOpen(id); return; }
    if (type === 'board_comment') {
      var c = await _sb.from('board_comments').select('post_id').eq('id', id).maybeSingle();
      showSec('chat');
      if (c.data) boardOpen(c.data.post_id); else scNotify(_bdT('gone', 'This post was removed.'));
      return;
    }
    return _view.apply(this, arguments);
  };
  if (typeof rerenderForLang === 'function') {
    var _rl = window.rerenderForLang;
    window.rerenderForLang = function () { var r = _rl.apply(this, arguments); var s = document.getElementById('sec-chat'); if (s && s.classList.contains('active')) boardRender(); return r; };
  }
})();
