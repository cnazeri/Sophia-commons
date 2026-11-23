// The year's festivals, anniversaries and memorial days (copied from the website by scripts, data/yearly-dates.json),
// and the Calendar of the Soul week (same calculation as sophiacommons.org and rsarchive.org).
import dates from '@/data/yearly-dates.json';

export type YearDay = { key: string; date: Date; title: string; desc: string; img?: { src: string; alt: string } | null; kind: 'festival' | 'anniversary' | 'memorial';
  link?: { label: string; url: string } | null };

export function easter(y: number): Date {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}

function forYear(y: number): YearDay[] {
  const out: YearDay[] = [];
  for (const f of dates.fixed) {
    const link = 'link' in f ? (f as { link?: { label: string; url: string } }).link : null;
    out.push({ key: f.key, date: new Date(y, f.month - 1, f.day), title: f.title, desc: f.desc, img: f.img, kind: 'festival', link });
  }
  // The four Advent Sundays (the Sundays before 25 December), as on the website
  const xmas = new Date(y, 11, 25), back = xmas.getDay() === 0 ? 7 : xmas.getDay();
  // Each Sunday its own picture: the same wreath with one more candle lit each week, the rose candle on the third
  // (owner, 2026-11-22; PHILIP Janos, CC0, Wikimedia Commons)
  const lit = ['', 'one violet candle lit', 'two violet candles lit', 'two violet candles and the rose candle lit', 'all four candles lit'];
  for (let i = 0; i < 4; i++) {
    const n = 4 - i;
    out.push({ key: 'advent' + n, date: new Date(y, 11, 25 - back - 7 * i), title: 'Advent Sunday ' + n, kind: 'festival',
      desc: 'The four Sundays before Christmas: a season of waiting and preparation. Many Waldorf communities hold an Advent Spiral.',
      img: { src: 'https://bnrvgitzbpocratvszgk.supabase.co/storage/v1/object/public/event-images/festivals/advent' + n + '.jpg', alt: 'Advent wreath with violet and rose candles, ' + lit[n] } });
  }
  const e = easter(y);
  for (const f of dates.easter) out.push({ key: f.key, date: new Date(y, e.getMonth(), e.getDate() + f.offset), title: f.title, desc: f.desc, img: f.img, kind: 'festival' });
  for (const a of dates.anniversaries) out.push({ key: a.key, date: new Date(y, a.month - 1, a.day), title: `${a.title} (${y - a.year} yrs)`, desc: a.desc, img: a.img, kind: 'anniversary' });
  for (const m of dates.memorials) {
    out.push({ key: `${m.name}-${m.type}`, date: new Date(y, m.month - 1, m.day), kind: 'memorial', img: m.img, desc: m.desc,
      title: m.type === 'birth' ? `${m.name}, born ${m.year} (${y - m.year} yrs)` : `Remembering ${m.name} (${y - m.year} yrs)` });
  }
  return out;
}

/** One yearly day for its own page: the key plus the day it falls on (yyyy-mm-dd, local). */
export function findYearDay(key: string, day: string): YearDay | null {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return null;
  return forYear(y).find((x) => x.key === key && x.date.getMonth() === m - 1 && x.date.getDate() === d) || null;
}

/** yyyy-mm-dd in local time, for links to a day's page */
export function dayParam(d: Date): string {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// Today's and the next few yearly days
export function upcomingYearDays(n = 4, from = new Date()): YearDay[] {
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  return [...forYear(today.getFullYear()), ...forYear(today.getFullYear() + 1)]
    .filter((d) => d.date >= today)
    .sort((a, b) => a.date.getTime() - b.date.getTime() || (a.kind === 'festival' ? -1 : 1))
    .slice(0, n);
}

export function cotsWeek(date = new Date()) {
  const d = new Date(date); d.setHours(12, 0, 0, 0);
  let start = easter(d.getFullYear());
  if (d < start) start = easter(d.getFullYear() - 1);
  const end = easter(start.getFullYear() + 1);
  const period = (end.getTime() - start.getTime()) / 52;
  const week = Math.min(52, Math.floor((d.getTime() - start.getTime()) / period) + 1);
  return {
    week, mirror: 53 - week, southern: ((week + 25) % 52) + 1,
    from: new Date(start.getTime() + (week - 1) * period), to: new Date(start.getTime() + week * period - 864e5),
    url: (n: number) => `https://rsarchive.org/COTS/index.php?northern_week=${n}&hemisphere=northern#hemisphere`,
  };
}
