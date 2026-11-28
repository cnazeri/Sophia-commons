// Unit tests for the AI and data features (v1.99): calendar and RSS feeds, open data files, MCP server.
// No network: the MCP tests use a fake database.  Run: node --test tests/agent_api.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { icsText, icsFold, calendarIcs, newsRss } from '../automation/feeds.mjs';
import { directoryCsv, directoryJson, llmsFull, categoryLabel } from '../automation/agent_data.mjs';
import { handleHttp, handleMessage, countryCode, TOOLS } from '../automation/mcp_server.mjs';

const ev = { id: 'e1', title: 'Talk; with, commas', description: 'Line one\nLine two', start_date: '2026-11-05T19:00:00+00:00', end_date: null,
  is_all_day: false, location_name: 'Hall', city: 'Basel', country: 'Switzerland', is_online: false, status: 'upcoming', updated_at: '2026-10-01T00:00:00Z' };

test('ics text escaping', () => {
  assert.equal(icsText('a;b,c\\d\ne'), 'a\\;b\\,c\\\\d\\ne');
});

test('ics folding keeps lines within 75 bytes and never splits a character', () => {
  const folded = icsFold('DESCRIPTION:' + 'ü'.repeat(100));
  for (const line of folded.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
  assert.equal(folded.split('\r\n').map((l, i) => (i ? l.slice(1) : l)).join(''), 'DESCRIPTION:' + 'ü'.repeat(100));
});

test('calendar: timed event gets a one-hour default end, all-day event gets next-day DTEND', () => {
  const ics = calendarIcs([ev, { ...ev, id: 'e2', is_all_day: true, start_date: '2026-11-13T12:00:00+00:00', end_date: '2026-11-15T12:00:00+00:00' }]);
  assert.match(ics, /DTSTART:20261105T190000Z\r\nDTEND:20261105T200000Z/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261113\r\nDTEND;VALUE=DATE:20261116/);
  assert.match(ics, /SUMMARY:Talk\\; with\\, commas/);
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
});

test('rss escapes HTML and sorts newest first', () => {
  const xml = newsRss([{ id: 'n1', title: 'Old <b>', published_at: '2026-01-01T00:00:00Z', excerpt: 'x & y' },
    { id: 'n2', title: 'New', published_at: '2026-10-01T00:00:00Z' }]);
  assert.ok(xml.indexOf('New') < xml.indexOf('Old &lt;b&gt;'));
  assert.match(xml, /x &amp; y/);
});

const dir = [{ id: 'a', organization_name: 'School, "Sun"', description: 'Line\nbreak, write to info@school.ch.', category: 'waldorf', city: 'Bern', country: 'Switzerland',
  website_url: 'https://x.ch', email: 'secret@x.ch', phone: '123', latitude: '46.9', longitude: '7.4', is_verified: true, updated_at: '2026-10-01T10:00:00Z' }];

test('data files never contain email or phone, and CSV quotes awkward values', () => {
  const csv = directoryCsv(dir), json = directoryJson(dir), md = llmsFull(dir);
  for (const s of [csv, json, md]) { assert.ok(!s.includes('secret@x.ch') && !s.includes('info@school.ch')); assert.ok(!s.includes('123,')); }
  assert.match(csv, /"School, ""Sun"""/);
  assert.equal(JSON.parse(json).entries[0].latitude, 46.9);
  assert.match(md, /## Waldorf & Steiner education \(1\)/);
  assert.equal(categoryLabel('online'), 'Online resources');
});

test('country names map to the stored codes', () => {
  assert.equal(countryCode('United States'), 'USA');
  assert.equal(countryCode('england'), 'UK');
  assert.equal(countryCode('Germany'), 'Germany');
});

const fakeRest = calls => async (db, q) => { calls.push(q); return [{ id: '00000000-0000-0000-0000-000000000001', organization_name: 'Test', category: 'waldorf', latitude: 52.5, longitude: 13.4 }]; };
const post = (body) => new Request('https://x/mcp', { method: 'POST', body: JSON.stringify(body) });

test('mcp: initialize echoes a supported protocol version and lists read-only tools', async () => {
  const init = await handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } });
  assert.equal(init.result.protocolVersion, '2025-03-26');
  const unknown = await handleMessage({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } });
  assert.ok(unknown.result.protocolVersion >= '2025');
  assert.ok(TOOLS.every(t => t.annotations.readOnlyHint));
});

test('mcp: notifications get 202, unknown methods get -32601, bad JSON gets 400', async () => {
  assert.equal((await handleHttp(post({ jsonrpc: '2.0', method: 'notifications/initialized' }), async () => ({}), fakeRest([]))).status, 202);
  const r = await handleHttp(post({ jsonrpc: '2.0', id: 3, method: 'nope' }), async () => ({}), fakeRest([]));
  assert.equal((await r.json()).error.code, -32601);
  const bad = await handleHttp(new Request('https://x/mcp', { method: 'POST', body: '{' }), async () => ({}), fakeRest([]));
  assert.equal(bad.status, 400);
  assert.equal((await handleHttp(new Request('https://x/mcp'), async () => ({}), fakeRest([]))).status, 405);
});

test('mcp: search strips filter syntax from user text and asks only for approved listings', async () => {
  const calls = [];
  const r = await handleMessage({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'search_directory', arguments: { query: 'x),status.eq.rejected,(y*', country: 'United Kingdom' } } }, {}, fakeRest(calls));
  assert.ok(!r.result.isError);
  assert.ok(calls[0].includes('status=eq.approved'));
  const term = decodeURIComponent(calls[0].split('wfts(english).')[1]);
  assert.ok(!/[(),*]/.test(term), 'filter syntax characters are stripped: ' + term);
  assert.ok(calls[0].includes('country=ilike.UK'));
  assert.ok(!calls[0].includes('email') && !calls[0].includes('phone'));
});

test('mcp: invalid tool input comes back as a tool error, not a crash', async () => {
  const r = await handleMessage({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'get_listing', arguments: { id: 'abc' } } }, {}, fakeRest([]));
  assert.equal(r.result.isError, true);
  const c = await handleMessage({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'search_directory', arguments: { category: 'pizza' } } }, {}, fakeRest([]));
  assert.equal(c.result.isError, true);
});

// ── AI app tools (2026-11-25): Steiner's works, videos, link tagging ──
import { tagLinks, sourceOf } from '../automation/mcp_server.mjs';
const LECTURES = { items: [
  { d: '1923-11-26', t: 'On Bees', b: 'Bees', bu: null, c: 'Dornach', ga: '351', de: 'https://rsarchive.org/de', en: [{ u: 'https://rsarchive.org/Lectures/GA351/a.html', t: 'On Bees', by: '' }, { u: 'https://rsarchive.org/b', t: 'x', by: '' }] },
  { d: '1902-01-01', t: 'The Maccabees by Otto Ludwig', b: 'Misc', bu: null, c: 'Berlin', ga: '51', de: null, en: [{ u: 'https://rsarchive.org/c', t: 'x', by: '' }] },
  { d: '1924-06-07', t: 'Agriculture Course: Lecture I', b: 'Agriculture Course', bu: null, c: 'Koberwitz', ga: '327', de: null, en: [{ u: 'https://rsarchive.org/d', t: 'x', by: '' }] },
] };
const AUDIO = { items: [{ u: 'bees/bees.html', t: 'Bees', cw: '351', g: 'l', img: '' }, { u: 'pof/pof.html', t: 'The Philosophy of Freedom', cw: '4', g: 'w', img: '' }] };
const steinerCtx = src => ({ src, loadJson: async n => (n === 'steiner_lectures.json' ? LECTURES : n === 'steiner_audio.json' ? AUDIO : null) });
const call = (name, args, rest, ctx) => handleMessage({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name, arguments: args } }, {}, rest, ctx);

test('find_steiner_works: word-start match finds Bees, not Maccabees, with read and listen links', async () => {
  const calls = [];
  const r = await call('find_steiner_works', { query: 'bee' }, async (db, q) => { calls.push(q); return []; }, steinerCtx('claude'));
  const d = r.result.structuredContent;
  assert.deepEqual(d.lectures.map(l => l.title), ['On Bees']);
  assert.equal(d.lectures[0].read, 'https://rsarchive.org/Lectures/GA351/a.html');
  assert.equal(d.lectures[0].translations, 2);
  assert.equal(d.audio[0].listen, 'https://rudolfsteineraudio.com/bees/bees.html');
  assert.ok(calls[0].startsWith('steiner_books?') && calls[0].includes('title=ilike.*bee*'));
  assert.equal(d.more.books_page, 'https://sophiacommons.org/books?utm_source=claude&utm_medium=ai_app');
  assert.equal(d.more.archive, 'https://rsarchive.org/', 'outside links are left alone');
});

test('find_steiner_works: GA and year filters, bad input is a tool error', async () => {
  const r = await call('find_steiner_works', { ga: 'GA 004' }, async () => [], steinerCtx('mcp'));
  assert.deepEqual(r.result.structuredContent.audio.map(a => a.title), ['The Philosophy of Freedom']);
  const y = await call('find_steiner_works', { year: 1924 }, async () => { throw new Error('books are not queried for a year'); }, steinerCtx('mcp'));
  assert.deepEqual(y.result.structuredContent.lectures.map(l => l.place), ['Koberwitz']);
  assert.equal(y.result.structuredContent.audio.length, 0);
  const bad = await call('find_steiner_works', { ga: 'drop table' }, async () => [], steinerCtx('mcp'));
  assert.equal(bad.result.isError, true);
  const none = await call('find_steiner_works', {}, async () => [], steinerCtx('mcp'));
  assert.equal(none.result.isError, true);
});

test('find_steiner_works still answers when the index files are missing', async () => {
  const r = await call('find_steiner_works', { query: 'karma' }, async () => [{ ga_number: 'GA 235', title: 'Karmic Relationships', archive_url: 'https://rsarchive.org/k', steinerbooks_url: null, amazon_url: null }]);
  assert.ok(!r.result.isError);
  assert.equal(r.result.structuredContent.books[0].read, 'https://rsarchive.org/k');
  assert.deepEqual(r.result.structuredContent.lectures, []);
});

test('find_videos: every word filters, channel pages link back to Sophia Commons', async () => {
  const calls = [];
  const rest = async (db, q) => {
    calls.push(q);
    if (q.startsWith('youtube_videos')) return [{ video_id: 'v', channel_slug: 'goetheanum', title: 'Karma heute', title_en: 'Karma today', url: 'https://www.youtube.com/watch?v=v', published_at: '2026-10-21T11:00:00Z', lang: 'de' }];
    if (q.includes('slug=in.')) return [{ slug: 'goetheanum', name: 'Goetheanum' }];
    return [];
  };
  const r = await call('find_videos', { query: 'karma heute', language: 'de' }, rest, steinerCtx('chatgpt'));
  const v = r.result.structuredContent.videos[0];
  assert.equal(v.channel, 'Goetheanum');
  assert.equal(v.channel_page, 'https://sophiacommons.org/channel/goetheanum?utm_source=chatgpt&utm_medium=ai_app');
  assert.equal(v.watch, 'https://www.youtube.com/watch?v=v');
  assert.equal((calls[0].match(/&or=\(/g) || []).length, 2);
  assert.ok(calls[0].includes('lang=eq.de'));
  const bad = await call('find_videos', { query: '  ' }, rest, steinerCtx('mcp'));
  assert.equal(bad.result.isError, true);
});

test('link tagging: only sophiacommons.org links, source from the server URL', () => {
  assert.equal(sourceOf('https://sophiacommons.org/mcp?src=chatgpt'), 'chatgpt');
  assert.equal(sourceOf('https://sophiacommons.org/mcp?src=evil'), 'mcp');
  assert.equal(sourceOf('https://sophiacommons.org/mcp'), 'mcp');
  const out = tagLinks({ a: ['https://sophiacommons.org/listing/x'], b: 'https://sophiacommons.org.evil.com/', c: 3, d: null }, 'claude');
  assert.equal(out.a[0], 'https://sophiacommons.org/listing/x?utm_source=claude&utm_medium=ai_app');
  assert.equal(out.b, 'https://sophiacommons.org.evil.com/');
  assert.equal(out.c, 3);
});

test('existing tools also get tagged links through HTTP', async () => {
  const r = await handleHttp(new Request('https://sophiacommons.org/mcp?src=claude', { method: 'POST',
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search_directory', arguments: { query: 'school' } } }) }),
  async () => ({}), fakeRest([]));
  const body = await r.json();
  assert.match(body.result.structuredContent.results[0].url, /\?utm_source=claude&utm_medium=ai_app$/);
  assert.match(body.result.structuredContent.results[0].save, /\?save=1&utm_source=claude&utm_medium=ai_app$/);
});

// ── Topic search, on this day, German, calendar, rate limit, usage log (2026-11-25) ──
import { topicMatch, calendarLink, overLimit, RATE_PER_MINUTE, resultCount, logRow } from '../automation/mcp_server.mjs';
const TOPICS = { karma: { label: 'Karma and reincarnation', words: ['karma', 'reincarnation'] }, death: { label: 'Death', words: ['life after death', 'death'] } };
const TAGGED = { topics: TOPICS, items: [
  { d: '1924-02-16', t: 'Karmic Relationships I', b: 'Karmic Relationships', c: 'Dornach', ga: '235', de: 'https://rsarchive.org/de1', en: [{ u: 'https://rsarchive.org/en1' }], k: ['karma'] },
  { d: '1912-11-25', t: 'Lecture Two', b: 'Life Between Death and Rebirth', c: 'Berlin', ga: '140', de: null, en: [{ u: 'https://rsarchive.org/en2' }], k: ['karma', 'death'] },
  { d: '1923-11-25', t: 'On Comets', b: 'Nature', c: 'Dornach', ga: '351', de: null, en: [{ u: 'https://rsarchive.org/en3' }], k: [] },
] };
const taggedCtx = { src: 'mcp', loadJson: async n => (n === 'steiner_lectures.json' ? TAGGED : { items: [] }) };

test('topicMatch: phrases and word forms, and which words they use up', () => {
  const m = topicMatch(TOPICS, ['reincarnation', 'berlin']);
  assert.deepEqual([...m.ids], ['karma']);
  assert.deepEqual([...m.covered], ['reincarnation']);
  assert.deepEqual([...topicMatch(TOPICS, ['life', 'after', 'death']).ids], ['death']);
  assert.equal(topicMatch(TOPICS, ['bees']).ids.size, 0);
  assert.equal(topicMatch(null, ['karma']).ids.size, 0);
});

test('find_steiner_works: title matches first, then topic-tagged lectures; other words still filter', async () => {
  const r = await call('find_steiner_works', { query: 'reincarnation' }, async () => [], taggedCtx);
  const d = r.result.structuredContent;
  assert.deepEqual(d.lectures.map(l => l.ga), ['235', '140']);
  assert.deepEqual(d.topics, ['Karma and reincarnation']);
  const k = await call('find_steiner_works', { query: 'karma berlin' }, async () => [], taggedCtx);
  assert.deepEqual(k.result.structuredContent.lectures.map(l => l.ga), ['140']);
  assert.match(k.result.structuredContent.more.library, /\/library\?q=karma\+berlin/);
});

test('German: language de puts the German text first and keeps the English link', async () => {
  const r = await call('find_steiner_works', { query: 'karmic', language: 'de' }, async () => [], taggedCtx);
  const l = r.result.structuredContent.lectures[0];
  assert.equal(l.read, 'https://rsarchive.org/de1');
  assert.equal(l.english, 'https://rsarchive.org/en1');
});

test('steiner_on_this_day: month-day across years, bad dates rejected', async () => {
  const r = await call('steiner_on_this_day', { date: '11-25' }, async () => [], taggedCtx);
  assert.deepEqual(r.result.structuredContent.lectures.map(l => l.date), ['1912-11-25', '1923-11-25']);
  const full = await call('steiner_on_this_day', { date: '2026-11-25' }, async () => [], taggedCtx);
  assert.equal(full.result.structuredContent.count, 2);
  for (const bad of ['13-01', 'christmas', '11/25']) {
    const b = await call('steiner_on_this_day', { date: bad }, async () => [], taggedCtx);
    assert.equal(b.result.isError, true, bad);
  }
  const missing = await call('steiner_on_this_day', {}, async () => [], { src: 'mcp', loadJson: async () => null });
  assert.equal(missing.result.isError, true);
});

test('calendar links: timed events default to one hour, all-day events end the next day', () => {
  const timed = calendarLink({ title: 'Talk & tea', start_date: '2026-12-01T18:00:00Z', city: 'Basel', country: 'Switzerland' }, 'https://sophiacommons.org/event/1');
  assert.match(timed, /dates=20261201T180000Z\/20261201T190000Z/);
  assert.match(timed, /text=Talk%20%26%20tea/);
  assert.match(timed, /location=Basel%2C%20Switzerland/);
  const allDay = calendarLink({ title: 'Fair', start_date: '2026-12-05T00:00:00Z', end_date: '2026-12-06T00:00:00Z', is_all_day: true }, 'u');
  assert.match(allDay, /dates=20261205\/20261207/);
  assert.equal(calendarLink({ title: 'x', start_date: 'not a date' }, 'u'), null);
});

test('rate limit: allows the budget, then refuses, then recovers after a minute', () => {
  const key = 'test-' + Math.random();
  assert.equal(overLimit(key, RATE_PER_MINUTE, 1000), false);
  assert.equal(overLimit(key, 1, 1001), true);
  assert.equal(overLimit(key, 1, 1000 + 60001), false);
});

test('rate limit over HTTP returns 429 with a JSON-RPC error', async () => {
  const req = () => new Request('https://x/mcp', { method: 'POST', headers: { 'x-nf-client-connection-ip': '203.0.113.9' },
    body: JSON.stringify(Array.from({ length: 20 }, (_, i) => ({ jsonrpc: '2.0', id: i, method: 'tools/call', params: { name: 'search_directory', arguments: { query: 'x' } } }))) });
  let last;
  for (let i = 0; i < 13; i++) last = await handleHttp(req(), async () => ({}), fakeRest([]));
  assert.equal(last.status, 429);
  assert.equal((await last.json()).error.code, -32000);
});

test('usage log: one row per call with tool, source, short args and result count; never fails the call', async () => {
  const rows = [];
  const ctx = { ...taggedCtx, src: 'claude', log: async row => rows.push(row) };
  await call('find_steiner_works', { query: 'karma' }, async () => [], ctx);
  await call('steiner_on_this_day', { date: 'bad' }, async () => [], ctx);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].tool, 'find_steiner_works');
  assert.equal(rows[0].source, 'claude');
  assert.equal(rows[0].result_count, 2);
  assert.equal(rows[1].error, 'input');
  assert.ok(logRow({ name: 'x', arguments: { query: 'y'.repeat(999) } }, 'mcp', { count: 0, ms: 1 }).args.length <= 300);
  assert.equal(resultCount({ count: 7 }), 7);
  const broken = { ...taggedCtx, log: async () => { throw new Error('db down'); } };
  const r = await call('find_steiner_works', { query: 'karma' }, async () => [], broken);
  assert.ok(!r.result.isError);
});

// ── Lean crawler pages (v1.100) ──
import { crawlerView, isCrawler } from '../automation/crawler_view.mjs';
const shell = '<html><body><div id="page"><nav>menu</nav><main id="center" tabindex="-1">'
  + '<div class="pagesec active" id="sec-home"><div>home text</div></div><div class="pagesec" id="sec-books"><div><div>books text</div></div></div>'
  + '</main><aside id="rightbar"><p>sidebar</p></aside></div><div id="prerender" class="prerender-summary"><h1>Listing</h1></div>\n<footer>foot</footer>'
  + '<!-- Scripts are deferred: x --><script defer src="/app.js"></script></body></html>';

test('crawler view keeps the menu, the summary and the footer, and drops other sections and app scripts', () => {
  const v = crawlerView(shell);
  assert.match(v, /<main id="center" tabindex="-1">\n<div id="prerender"/);
  assert.ok(v.includes('menu') && v.includes('foot'));
  assert.ok(!v.includes('home text') && !v.includes('books text') && !v.includes('sidebar') && !v.includes('app.js'));
});

test('crawler view keeps the section a section route needs, shown as active', () => {
  const v = crawlerView(shell, 'sec-books');
  assert.ok(v.includes('<div class="pagesec active" id="sec-books"><div><div>books text</div></div></div>'));
  assert.ok(!v.includes('home text'));
});

test('crawler detection', () => {
  assert.ok(isCrawler('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'));
  assert.ok(isCrawler('Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0)'));
  assert.ok(!isCrawler('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'));
  assert.equal(crawlerView('<p>not the app</p>'), '<p>not the app</p>');
});

// ── German pages (v1.103) ──
import { placeFaqDe, entryListDe } from '../automation/seo_de.mjs';
import { applySeo } from '../automation/seo_html.mjs';
test('German Q&A uses singular for one and German numbers', () => {
  const f = placeFaqDe([{ organization_name: 'A', category: 'waldorf' }, { organization_name: 'B', category: 'biodynamic' }], 'in Bern', 'die Seite');
  assert.match(f.html, /1 Waldorfschule oder -kindergarten/);
  assert.match(f.html, /2 Einträge in Bern/);
  assert.equal(f.ld.inLanguage, 'de');
  assert.match(entryListDe([{ id: 'x', organization_name: 'S', city: 'Bern', website_url: 'https://s.ch' }]), />Website</);
});
test('applySeo sets the page language and hreflang links', () => {
  const tpl = '<html lang="en"><head><title>x</title><meta name="description" content=""><link rel="canonical" href="https://sophiacommons.org/"></head><body><footer></footer></body></html>';
  const h = applySeo(tpl, { route: '/de/country/germany', title: 't', desc: 'd', lang: 'de', alternates: [['en', 'https://sophiacommons.org/country/germany'], ['de', 'https://sophiacommons.org/de/country/germany']] });
  assert.match(h, /<html lang="de">/);
  assert.match(h, /hreflang="en" href="https:\/\/sophiacommons.org\/country\/germany"/);
  assert.match(h, /<link rel="canonical" href="https:\/\/sophiacommons.org\/de\/country\/germany">/);
  assert.ok(!h.includes('$1'));
});
