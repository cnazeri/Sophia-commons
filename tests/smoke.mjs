// Sophia Commons smoke test: run before every deploy.
//   cd tests && npm install && npx playwright install chromium && npm test
// Serves the site folder locally (with the same SPA fallback as Netlify), opens it in headless
// Chromium against the live Supabase data, and fails on anything that broke users before:
// JavaScript errors, dead deep links, "Not Found" detail pages, horizontal scroll on phones,
// unescaped HTML, raw i18n keys, and the moon/today-date rendering bugs.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.xml': 'application/xml', '.txt': 'text/plain' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(ROOT, 'index.html');
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const BASE = `http://localhost:${server.address().port}`;

const failures = [];
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failures.push(msg); };

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  for (const vp of [{ name: 'desktop', width: 1366, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
    const ctx = await browser.newContext({ viewport: vp, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.dismiss());

    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    for (const sec of ['home', 'news', 'events', 'browse', 'podcasts', 'directory', 'books', 'memorial', 'eldercare', 'about', 'privacy', 'terms', 'chat']) {
      await page.evaluate(s => showSec(s), sec);
      await page.waitForTimeout(400);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      check(overflow <= 0, `[${vp.name}] ${sec}: no horizontal scroll (${overflow}px)`);
    }
    const rawKeys = await page.evaluate(() => (document.body.innerText.match(/\b(report|chat|marketplace|podcasts|newsletter|common|catpage|detail)\.[a-z_]{3,}\b/g) || []));
    check(rawKeys.length === 0, `[${vp.name}] no raw translation keys on screen ${rawKeys.slice(0, 3).join(' ')}`);
    check(errors.length === 0, `[${vp.name}] no JavaScript errors ${errors.slice(0, 2).join(' | ')}`);
    await ctx.close();
  }

  // Small phones (360px): a category page full of placeholders plus the listings most likely to
  // push the page sideways (longest name, web address, email, address). Names the widest culprit.
  {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 760 }, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    const culprit = () => {
      const over = [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1 && el.offsetParent);
      const el = over.sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)[0];
      return el ? `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} "${(el.textContent || '').trim().slice(0, 30)}"` : '';
    };
    const ids = await page.evaluate(async () => {
      if (typeof _sb === 'undefined' || !_sb) return [];
      const { data } = await _sb.from('directory_entries').select('id, organization_name, website_url, email, address')
        .eq('status', 'approved').order('updated_at', { ascending: false }).limit(1000);
      const by = f => [...(data || [])].sort((a, b) => (b[f] || '').length - (a[f] || '').length)[0]?.id;
      return [...new Set(['organization_name', 'website_url', 'email', 'address'].map(by).filter(Boolean))];
    });
    await page.evaluate(() => showCategory('waldorf & education'));
    await page.waitForTimeout(1500);
    let over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check(over <= 0, `[360px] category page: no horizontal scroll (${over}px) ${over > 0 ? await page.evaluate(culprit) : ''}`);
    for (const id of ids) {
      await page.evaluate(i => showDetail('directory', i), id);
      await page.waitForTimeout(1200);
      over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      check(over <= 0, `[360px] listing ${id.slice(0, 8)}: no horizontal scroll (${over}px) ${over > 0 ? await page.evaluate(culprit) : ''}`);
    }
    await ctx.close();
  }

  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  const page = await ctx.newPage();

  // Deep links must load the full app (relative asset paths broke these)
  for (const p of ['/event/test', '/category/waldorf-%26-education?q=kindergarten', '/region/europe', '/memorial/rudolf-steiner']) {
    await page.goto(BASE + p, { waitUntil: 'networkidle' });
    const ok = await page.evaluate(() => typeof showSec === 'function' && getComputedStyle(document.body).backgroundColor !== 'rgba(0, 0, 0, 0)');
    check(ok, `deep link ${p} loads styled app`);
  }

  // A real directory listing opens (a thrown error used to show "Not Found")
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  const firstId = await page.evaluate(async () => (typeof _sb !== 'undefined' && _sb) ? (await _sb.from('directory_entries').select('id').eq('status', 'approved').limit(1)).data?.[0]?.id : null);
  if (firstId) {
    await page.evaluate(id => showDetail('directory', id), firstId);
    await page.waitForTimeout(1500);
    const h1 = await page.evaluate(() => document.querySelector('#detail-content h1')?.textContent || '');
    check(h1 && !/not found/i.test(h1), `directory detail page renders ("${h1.slice(0, 40)}")`);
  } else check(false, 'could not reach Supabase to read a directory entry (network?)');

  // Escaping: hostile text must render as text
  const xss = await page.evaluate(() => {
    window.__x = 0;
    _mergeSupabaseEventsIntoCalendar([{ id: 't1', title: '<img src=x onerror="window.__x=1">T', start_date: new Date(Date.now() + 864e5).toISOString() }]);
    // Event lists now show real thumbnails, so look only for the injected element
    return document.querySelectorAll('#sidebar-upcoming img[onerror], #event-list img[onerror], #home-upcoming img[onerror], img[src="x"]').length;
  });
  await page.waitForTimeout(300);
  check(xss === 0 && (await page.evaluate(() => window.__x)) === 0, 'event titles are escaped');
  // Sections built on first open must actually render
  const secFill = await page.evaluate(async () => {
    showSec('events'); await new Promise(r => setTimeout(r, 300));
    const cal = document.querySelectorAll('#cal-grid .cal-day').length, list = document.querySelectorAll('#event-list .evrow, #event-list .empty-note').length;
    showSec('books'); await new Promise(r => setTimeout(r, 300));
    const books = document.querySelectorAll('#sec-books li, #sec-books .book-card, #sec-books a').length;
    showSec('home');
    return { cal, list, books };
  });
  check(secFill.cal >= 28 && secFill.list > 0 && secFill.books > 0, `events and books render when opened (${JSON.stringify(secFill)})`);
  check(await page.evaluate(() => safeUrl('javascript:alert(1)') === '#'), 'javascript: links are blocked');
  check(await page.evaluate(() => _evSourcesHtml({ cat: 'workshop', src: [['Join', 'javascript:alert(1)']] }).indexOf('javascript:') === -1
    && _evImageHtml({ img: { src: 'javascript:x', page: 'javascript:y', alt: 'a', credit: 'c' } }).indexOf('javascript:') === -1), 'event links and images block javascript: URLs');

  // Moon: the lit fraction drawn must match the label
  const moon = await page.evaluate(() => {
    const c = document.getElementById('moon-canvas'), ctx2 = c.getContext('2d');
    const d = ctx2.getImageData(0, 0, c.width, c.height).data; let lit = 0, all = 0;
    for (let y = 0; y < c.height; y += 3) for (let x = 0; x < c.width; x += 3) {
      const dx = x - c.width / 2, dy = y - c.height / 2; if (dx * dx + dy * dy > (c.width / 2 - 8) ** 2) continue;
      all++; const i = (y * c.width + x) * 4; if (d[i] > 150) lit++;
    }
    return { drawn: Math.round(100 * lit / all), label: parseInt(document.getElementById('moon-illumination').textContent, 10) };
  });
  check(Math.abs(moon.drawn - moon.label) <= 15, `moon drawing matches label (${moon.drawn}% drawn vs ${moon.label}%)`);

  // The right sidebar no longer has a mini calendar (removed v1.51); the upcoming list stays
  check(await page.$('#sidebar-upcoming') !== null, 'upcoming events list is in the right sidebar');
  await ctx.close();
} finally {
  await browser.close();
  server.close();
}
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nAll checks passed');
process.exit(failures.length ? 1 : 0);
