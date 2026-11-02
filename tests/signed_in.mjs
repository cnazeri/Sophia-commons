// Signed-in smoke test (2026-11-01): the plain smoke test only visits as a guest, so it never saw that a
// stored session stopped sophia_commons_v9.js halfway (empty calendar, "Loading events..." on the home page).
// Creates a throwaway member with the service key from ../.env, signs in through a magic link, reloads (the
// stored-session path), checks the pages, then deletes the member. Skips when no service key is available.
//   node signed_in.mjs                 (serves the local folder)
//   SITE=https://sophiacommons.org node signed_in.mjs   (checks a deployed site)
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = {};
try {
  for (const l of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
    const i = l.indexOf('=');
    if (i > 0 && !l.startsWith('#')) env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
} catch (e) { /* no .env: skipped below */ }
const SVC = process.env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
if (!SVC) { console.log('SKIP  signed-in checks (no service key)'); process.exit(0); }

const SB = 'https://bnrvgitzbpocratvszgk.supabase.co';
const H = { apikey: SVC, Authorization: 'Bearer ' + SVC, 'Content-Type': 'application/json' };
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.xml': 'application/xml', '.txt': 'text/plain' };

let server = null, BASE = process.env.SITE;
if (!BASE) {
  server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let f = path.join(ROOT, p === '/' ? 'index.html' : p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(ROOT, 'index.html');
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  }).listen(0);
  BASE = `http://localhost:${server.address().port}`;
}

const failures = [];
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failures.push(msg); };
const email = `sc-smoke-${Date.now()}@example.com`;
let uid = null;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const u = await (await fetch(SB + '/auth/v1/admin/users', { method: 'POST', headers: H,
    body: JSON.stringify({ email, password: 'Smoke-' + Date.now() + '-x', email_confirm: true }) })).json();
  uid = u.id;
  const g = await (await fetch(SB + '/auth/v1/admin/generate_link', { method: 'POST', headers: H, body: JSON.stringify({ type: 'magiclink', email }) })).json();
  const loc = (await fetch(g.action_link || g.properties.action_link, { redirect: 'manual' })).headers.get('location') || '';
  check(loc.includes('#access_token='), 'magic link gives a session');

  for (const vp of [{ name: 'desktop', width: 1366, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
    const ctx = await browser.newContext({ viewport: vp, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.dismiss());
    const go = async (p) => { await page.goto(BASE + p, { waitUntil: 'load' }); await page.waitForTimeout(3500); };
    await go('/' + loc.slice(loc.indexOf('#')));
    for (let i = 0; i < 2; i++) await go('/');   // reloads: the stored-session path that used to crash

    check(await page.locator('#user-chip').isVisible(), `${vp.name}: shows as signed in`);
    check(await page.locator('#account-link').isVisible() && await page.locator('#myevents-link').isVisible(), `${vp.name}: settings and my events links show`);
    const homeEv = await page.evaluate(() => { const c = document.querySelector('#sec-home .listblock-body'); return c ? c.textContent.trim().slice(0, 30) : ''; });
    check(homeEv && !/^Loading/.test(homeEv), `${vp.name}: home events loaded ("${homeEv}")`);
    check(await page.locator('#home-cc-block').isVisible(), `${vp.name}: home Christian Community card shows`);
    await go('/events');
    const cells = await page.evaluate(() => (document.getElementById('cal-grid') || { children: [] }).children.length);
    check(cells >= 28, `${vp.name}: events calendar drawn (${cells} cells)`);
    await go('/directory');
    check(await page.evaluate(() => document.querySelectorAll('#sec-directory .leaflet-marker-icon, #sec-directory .marker-cluster, #sec-directory canvas').length) > 0, `${vp.name}: directory map draws`);
    await go('/');
    check(await page.evaluate(() => { const c = document.getElementById('moon-canvas'); if (!c) return false; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0) return true; return false; }), `${vp.name}: moon is drawn`);
    await go('/account');
    check(/Change password/.test(await page.locator('#acc-root').textContent()), `${vp.name}: account settings page works`);
    check(errors.length === 0, `${vp.name}: no JavaScript errors while signed in${errors.length ? ' (' + errors.slice(0, 2).join(' | ') + ')' : ''}`);
    await ctx.close();
  }
} finally {
  if (uid) await fetch(SB + '/auth/v1/admin/users/' + uid, { method: 'DELETE', headers: H });
  await browser.close();
  if (server) server.close();
}
console.log(failures.length ? `\n${failures.length} signed-in check(s) failed` : '\nAll signed-in checks passed');
process.exit(failures.length ? 1 : 0);
