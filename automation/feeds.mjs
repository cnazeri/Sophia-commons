// Calendar (.ics) and news (RSS) feeds, served live by netlify/edge-functions/feeds.js (owner, 2026-10-29).
// Plain JS with no runtime-specific imports so Node (tests) and Deno (Netlify) can both load it.
import { SITE, esc } from './seo_html.mjs';

// ── iCalendar (RFC 5545) ──
// Text values escape backslash, semicolon, comma and newlines.
export const icsText = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// Lines longer than 75 octets continue on the next line after a space. Count UTF-8 bytes and never
// split a character.
export function icsFold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = '', bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const stamp = iso => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');   // 20261030T120000Z
// All-day events are stored at 12:00 UTC, so the UTC date is the event's own date.
const dateOnly = iso => new Date(iso).toISOString().slice(0, 10).replace(/-/g, '');
const nextDay = iso => dateOnly(new Date(new Date(iso).getTime() + 864e5).toISOString());
const plain = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

export function eventIcs(ev, now = new Date().toISOString()) {
  const url = `${SITE}/event/${ev.id}`;
  const where = ev.is_online ? ['Online', ev.online_url].filter(Boolean).join(': ')
    : [ev.location_name, ev.address, ev.city, ev.country].filter(Boolean).join(', ');
  const about = plain(ev.description);
  const desc = [about.length > 1500 ? about.slice(0, 1497) + '...' : about, ev.organizer_name ? 'Organizer: ' + ev.organizer_name : '', 'Details: ' + url]
    .filter(Boolean).join('\n\n');
  const lines = ['BEGIN:VEVENT', `UID:${ev.id}@sophiacommons.org`, `DTSTAMP:${stamp(ev.updated_at || now)}`];
  if (ev.is_all_day) {
    lines.push(`DTSTART;VALUE=DATE:${dateOnly(ev.start_date)}`, `DTEND;VALUE=DATE:${nextDay(ev.end_date || ev.start_date)}`);
  } else {
    const end = ev.end_date && ev.end_date > ev.start_date ? ev.end_date : new Date(new Date(ev.start_date).getTime() + 36e5).toISOString();
    lines.push(`DTSTART:${stamp(ev.start_date)}`, `DTEND:${stamp(end)}`);
  }
  lines.push(`SUMMARY:${icsText(ev.title)}`, `DESCRIPTION:${icsText(desc)}`, `URL:${url}`);
  if (where) lines.push(`LOCATION:${icsText(where)}`);
  if (ev.status === 'cancelled') lines.push('STATUS:CANCELLED');
  lines.push('END:VEVENT');
  return lines;
}

export function calendarIcs(events, now = new Date().toISOString()) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Sophia Commons//Events//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Sophia Commons events', 'X-WR-CALDESC:Anthroposophical events worldwide from sophiacommons.org',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H'];
  for (const ev of events) lines.push(...eventIcs(ev, now));
  lines.push('END:VCALENDAR');
  return lines.map(icsFold).join('\r\n') + '\r\n';
}

// ── RSS 2.0: news and blog posts, newest first ──
const rfc822 = iso => new Date(iso).toUTCString();

export function newsRss(news, posts = [], now = new Date().toISOString()) {
  const items = [
    ...news.map(n => ({ title: n.title, link: `${SITE}/article/${n.id}`, date: n.published_at || n.updated_at, text: plain(n.excerpt || n.body), source: n.source_name, guid: 'news-' + n.id })),
    ...posts.map(p => ({ title: p.title, link: `${SITE}/blog/${encodeURIComponent(p.slug)}`, date: p.published_at || p.created_at, text: plain(p.excerpt || p.body), source: p.author_name, guid: 'blog-' + p.id })),
  ].filter(i => i.title && i.date).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 50);
  const item = i => `    <item>\n      <title>${esc(i.title)}</title>\n      <link>${esc(i.link)}</link>\n      <guid isPermaLink="false">${esc(i.guid)}</guid>\n`
    + `      <pubDate>${rfc822(i.date)}</pubDate>\n` + (i.text ? `      <description>${esc(i.text.length > 600 ? i.text.slice(0, 597) + '...' : i.text)}</description>\n` : '')
    + (i.source ? `      <dc:creator>${esc(i.source)}</dc:creator>\n` : '') + '    </item>';
  return '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">\n  <channel>\n'
    + '    <title>Sophia Commons: news</title>\n    <link>https://sophiacommons.org/news</link>\n'
    + '    <description>News from the anthroposophical movement worldwide, collected by Sophia Commons.</description>\n    <language>en</language>\n'
    + `    <lastBuildDate>${rfc822(items[0] ? items[0].date : now)}</lastBuildDate>\n`
    + `    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>\n`
    + items.map(item).join('\n') + (items.length ? '\n' : '') + '  </channel>\n</rss>\n';
}
