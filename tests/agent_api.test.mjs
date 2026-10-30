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
