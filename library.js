// Rudolf Steiner Library page (owner, 2026-11-25): search Steiner's lectures (steiner_lectures.json, from
// rsarchive.org), books (steiner_books table) and free audio (steiner_audio.json) by words, topic, year and
// GA volume. Titles and links only: the texts stay on rsarchive.org and rudolfsteineraudio.com.
// The search is kept in the address (?q=karma&topic=karma&year=1924&ga=233&day=12-25) so it can be shared,
// and the AI app links here with the same parameters.
(function () {
  'use strict';
  var AUDIO_BASE = 'https://rudolfsteineraudio.com/';
  var SB_URL = 'https://bnrvgitzbpocratvszgk.supabase.co';
  var SB_KEY = 'sb_publishable_Quj2NdNaaDKJOe4UT5Y5nw_1Sog2yjI';   // public key, same as sb-init.js
  var PAGE = 40;

  var state = { lectures: [], topics: {}, audio: [], books: [], shown: PAGE };
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  var safeUrl = function (u) { return /^https:\/\//.test(u || '') ? esc(u) : ''; };
  var fold = function (s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };
  var wordsOf = function (q) { return fold(q).replace(/[^\p{L}\p{N}\s'-]/gu, ' ').split(/\s+/).filter(function (w) { return w.length > 1; }); };
  // Each word must start a word in the text ("bee" finds "Bees", not "Maccabees")
  var hasAll = function (hay, words) {
    var h = ' ' + fold(hay);
    return words.every(function (w) { return new RegExp('[^\\p{L}\\p{N}]' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u').test(h); });
  };
  var gaNorm = function (v) { var m = String(v || '').trim().match(/^(?:ga|cw)?\s*0*(\d{1,3}[a-z]?)$/i); return m ? m[1].toLowerCase() : ''; };
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var niceDate = function (d) {
    var m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? (+m[3]) + ' ' + MONTHS[+m[2] - 1] + ' ' + m[1] : esc(d);
  };

  // Topics the search words name (same rule as the AI app): "reincarnation" -> karma
  function topicIds(words) {
    var ids = {}, covered = {};
    Object.keys(state.topics).forEach(function (id) {
      (state.topics[id].words || []).forEach(function (phrase) {
        var p = fold(phrase).split(/\s+/).filter(Boolean);
        if (!p.length || (p.length === 1 && p[0].length < 3)) return;
        for (var i = 0; i + p.length <= words.length; i++) {
          var ok = p.every(function (pw, j) {
            var w = words[i + j];
            return w === pw || (w.length >= 4 && (w.indexOf(pw) === 0 || pw.indexOf(w) === 0));
          });
          if (ok) { ids[id] = 1; p.forEach(function (_, j) { covered[words[i + j]] = 1; }); }
        }
      });
    });
    return { ids: ids, covered: covered };
  }

  function readForm() {
    return { q: $('lib-q').value.trim(), topic: $('lib-topic').value, year: $('lib-year').value, ga: gaNorm($('lib-ga').value),
      day: state.day || '' };
  }
  function writeUrl(f) {
    var u = new URL(location.href);
    ['q', 'topic', 'year', 'ga', 'day'].forEach(function (k) { if (f[k]) u.searchParams.set(k, f[k]); else u.searchParams.delete(k); });
    ['utm_source', 'utm_medium'].forEach(function (k) { u.searchParams.delete(k); });
    history.replaceState(null, '', u.pathname + u.search);
  }

  function search(f) {
    var words = wordsOf(f.q);
    var tm = topicIds(words);
    var restWords = words.filter(function (w) { return !tm.covered[w]; });
    var topicSet = Object.keys(tm.ids);
    var base = state.lectures.filter(function (l) {
      return (!f.year || String(l.d).indexOf(f.year) === 0) && (!f.ga || fold(l.ga) === f.ga)
        && (!f.topic || (l.k || []).indexOf(f.topic) >= 0) && (!f.day || String(l.d).slice(5, 10) === f.day);
    });
    var byTitle = base.filter(function (l) { return hasAll(l.t + ' ' + l.b + ' ' + l.c, words); });
    var seen = new Set(byTitle);
    var byTopic = topicSet.length ? base.filter(function (l) {
      return !seen.has(l) && (l.k || []).some(function (k) { return tm.ids[k]; }) && hasAll(l.t + ' ' + l.b + ' ' + l.c, restWords);
    }) : [];
    var lectures = byTitle.concat(byTopic);
    var audio = f.year || f.topic || f.day ? [] : state.audio.filter(function (i) { return (!f.ga || fold(i.cw) === f.ga) && hasAll(i.t, words); });
    var books = f.year || f.topic || f.day ? [] : state.books.filter(function (b) { return (!f.ga || gaNorm(b.ga_number) === f.ga) && hasAll(b.title, words); });
    return { lectures: lectures, audio: audio, books: books, topics: topicSet };
  }

  function lectureRow(l) {
    var en = (l.en || [])[0];
    var tags = (l.k || []).map(function (k) {
      return state.topics[k] ? '<button type="button" class="lib-tag" data-topic="' + esc(k) + '">' + esc(state.topics[k].label) + '</button>' : '';
    }).join('');
    return '<div class="lib-row"><div class="lib-title">' + esc(l.t) + '</div>'
      + '<div class="lib-meta">' + niceDate(l.d) + (l.c ? ', ' + esc(l.c) : '') + (l.b ? ' &middot; ' + esc(l.b) : '')
      + (l.ga ? ' &middot; GA ' + esc(l.ga) : '') + '</div>'
      + '<div class="lib-links">' + (en && safeUrl(en.u) ? '<a href="' + safeUrl(en.u) + '" target="_blank" rel="noopener">Read in English</a>' : '')
      + (l.de && safeUrl(l.de) ? '<a href="' + safeUrl(l.de) + '" target="_blank" rel="noopener">German original</a>' : '')
      + ((l.en || []).length > 1 ? '<span class="lib-meta">' + (l.en.length - 1) + ' more translation' + (l.en.length > 2 ? 's' : '') + '</span>' : '')
      + '</div>' + (tags ? '<div>' + tags + '</div>' : '') + '</div>';
  }
  function bookRow(b) {
    var read = safeUrl(b.archive_url), buy = safeUrl(b.steinerbooks_url) || safeUrl(b.amazon_url);
    return '<div class="lib-row"><div class="lib-title">' + esc(b.title) + '</div>'
      + '<div class="lib-meta">' + (b.ga_number ? esc(b.ga_number) : '') + (b.author && b.author !== 'Rudolf Steiner' ? ' &middot; ' + esc(b.author) : '') + '</div>'
      + '<div class="lib-links">' + (read ? '<a href="' + read + '" target="_blank" rel="noopener">Read free</a>' : '')
      + (buy ? '<a href="' + buy + '" target="_blank" rel="noopener">Buy the book</a>' : '') + '</div></div>';
  }
  function audioRow(i) {
    var href = esc(AUDIO_BASE + String(i.u || '').replace(/^\/+/, ''));
    return '<div class="lib-row"><div class="lib-title">' + esc(i.t) + '</div>'
      + '<div class="lib-meta">' + (i.cw ? 'GA ' + esc(i.cw) + ' &middot; ' : '') + 'read by Dale Brunsvold</div>'
      + '<div class="lib-links"><a href="' + href + '" target="_blank" rel="noopener">Listen free</a></div></div>';
  }

  function render() {
    var f = readForm();
    writeUrl(f);
    var any = f.q || f.topic || f.year || f.ga || f.day;
    // "Given on this day" is a starting point: shown only before a search
    if ($('lib-today-list').innerHTML) $('lib-today').hidden = !!any;
    if (!any) {
      $('lib-results').innerHTML = '';
      $('lib-status').textContent = state.lectures.length.toLocaleString() + ' lectures, ' + state.books.length + ' books and '
        + state.audio.length + ' recordings. Type a topic or pick a year to begin.';
      return;
    }
    var r = search(f);
    var parts = [];
    if (r.books.length) parts.push('<section class="lib-group"><h2>Books (' + r.books.length + ')</h2>' + r.books.slice(0, 20).map(bookRow).join('') + '</section>');
    if (r.lectures.length) {
      parts.push('<section class="lib-group"><h2>Lectures (' + r.lectures.length.toLocaleString() + ')</h2>'
        + r.lectures.slice(0, state.shown).map(lectureRow).join('')
        + (r.lectures.length > state.shown ? '<button type="button" class="lib-more" id="lib-more">Show more lectures</button>' : '') + '</section>');
    }
    if (r.audio.length) parts.push('<section class="lib-group"><h2>Free audio (' + r.audio.length + ')</h2>' + r.audio.slice(0, 20).map(audioRow).join('') + '</section>');
    $('lib-results').innerHTML = parts.join('');
    var total = r.books.length + r.lectures.length + r.audio.length;
    $('lib-status').textContent = total ? 'Found ' + total.toLocaleString() + (r.topics.length ? ', including lectures on '
      + r.topics.map(function (k) { return state.topics[k].label; }).join(', ') : '') + '.' : 'Nothing found. Try fewer or different words.';
  }

  function drawToday() {
    var md = new Date().toISOString().slice(5, 10);
    var hits = state.lectures.filter(function (l) { return String(l.d).slice(5, 10) === md; });
    if (!hits.length) return;
    $('lib-today-list').innerHTML = hits.slice(0, 5).map(lectureRow).join('')
      + (hits.length > 5 ? '<button type="button" class="lib-more" id="lib-today-all">All ' + hits.length + ' lectures given on this day</button>' : '');
  }

  function fillControls() {
    var topicSel = $('lib-topic');
    Object.keys(state.topics).sort(function (a, b) { return state.topics[a].label.localeCompare(state.topics[b].label); }).forEach(function (id) {
      var o = document.createElement('option'); o.value = id; o.textContent = state.topics[id].label; topicSel.appendChild(o);
    });
    var years = {};
    state.lectures.forEach(function (l) { years[String(l.d).slice(0, 4)] = 1; });
    Object.keys(years).sort().forEach(function (y) {
      var o = document.createElement('option'); o.value = y; o.textContent = y; $('lib-year').appendChild(o);
    });
    var p = new URL(location.href).searchParams;
    $('lib-q').value = p.get('q') || '';
    if (p.get('topic') && state.topics[p.get('topic')]) topicSel.value = p.get('topic');
    if (/^\d{4}$/.test(p.get('year') || '')) $('lib-year').value = p.get('year');
    $('lib-ga').value = gaNorm(p.get('ga'));
    if (/^\d{2}-\d{2}$/.test(p.get('day') || '')) state.day = p.get('day');
  }

  function wire() {
    var timer;
    $('lib-form').addEventListener('submit', function (e) { e.preventDefault(); state.shown = PAGE; render(); });
    $('lib-form').addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(function () { state.shown = PAGE; render(); }, 200); });
    $('lib-form').addEventListener('change', function () { state.day = ''; state.shown = PAGE; render(); });
    $('lib-clear').addEventListener('click', function () {
      $('lib-form').reset(); state.day = ''; state.shown = PAGE; render(); $('lib-q').focus();
    });
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (t.id === 'lib-more') { state.shown += PAGE; render(); }
      else if (t.id === 'lib-today-all') { state.day = new Date().toISOString().slice(5, 10); state.shown = PAGE; render(); }
      else if (t.classList && t.classList.contains('lib-tag')) {
        $('lib-topic').value = t.getAttribute('data-topic'); $('lib-q').value = ''; state.day = ''; state.shown = PAGE; render();
        window.scrollTo({ top: $('lib-form').offsetTop - 10, behavior: 'smooth' });
      }
    });
  }

  function getJson(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); }); }

  Promise.all([
    getJson('/steiner_lectures.json'),
    getJson('/steiner_audio.json').catch(function () { return { items: [] }; }),
    fetch(SB_URL + '/rest/v1/steiner_books?select=ga_number,title,author,archive_url,steinerbooks_url,amazon_url&order=ga_number.asc&limit=1000',
      { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } }).then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; }),
  ]).then(function (res) {
    state.lectures = res[0].items || [];
    state.topics = res[0].topics || {};
    state.audio = res[1].items || [];
    state.books = res[2] || [];
    fillControls();
    wire();
    drawToday();
    render();
  }).catch(function (err) {
    console.error('library', err);
    $('lib-status').textContent = 'The library could not be loaded just now. Please reload the page in a minute.';
  });
})();
