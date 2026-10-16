// ══════════════════════════════════════════
//  This week's Calendar of the Soul verse for the weekly digest.
//  Same week rule as the site's sidebar (cotsWeek in sophia_commons_v9.js): the days from one
//  Easter to the next are split into 52 equal periods, one per verse, as on rsarchive.org.
// ══════════════════════════════════════════

import { VERSES } from "./calendar_of_the_soul.ts";

const DAY_MS = 864e5;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Anonymous Gregorian algorithm (same as _computeEaster on the site), at noon UTC
export function easter(yr: number): Date {
  const a = yr % 19, b = Math.floor(yr / 100), c = yr % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(yr, month - 1, day, 12));
}

export function soulWeek(now: Date): { week: number; from: Date; to: Date } {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12));
  let start = easter(d.getUTCFullYear());
  if (d < start) start = easter(d.getUTCFullYear() - 1);
  const end = easter(start.getUTCFullYear() + 1);
  const period = (end.getTime() - start.getTime()) / 52;
  const week = Math.min(52, Math.floor((d.getTime() - start.getTime()) / period) + 1);
  return {
    week,
    from: new Date(start.getTime() + (week - 1) * period),
    to: new Date(start.getTime() + week * period - DAY_MS),
  };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const short = (d: Date) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;

// Uses only tags the site's News view keeps, like the rest of the digest body.
export function soulVerseHtml(now: Date): string {
  const { week, from, to } = soulWeek(now);
  const v = VERSES[week];
  if (!v) return "";
  const url = `https://rsarchive.org/COTS/index.php?northern_week=${week}&hemisphere=northern#hemisphere`;
  return `<div style="margin:28px 0 0;padding:20px 22px;background:#FBF8F2;border:1px solid #E8E2DA;border-radius:10px">`
    + `<div style="font-size:12px;letter-spacing:.06em;color:#7F6116;font-weight:bold">CALENDAR OF THE SOUL &middot; WEEK ${week} &middot; ${short(from)} - ${short(to)}</div>`
    + `<p style="font-family:Georgia,serif;font-size:16px;line-height:1.6;color:#1E1810;margin:12px 0 10px">${v.en.map(esc).join("<br>")}</p>`
    + `<p style="font-family:Georgia,serif;font-style:italic;font-size:14px;line-height:1.55;color:#6F665B;margin:0 0 10px">${v.de.map(esc).join("<br>")}</p>`
    + `<div style="font-size:12px;color:#6F665B">Rudolf Steiner, from the Calendar of the Soul (1912). English rendering: Sophia Commons. `
    + `<a href="${url}" style="color:#7F6116;font-weight:bold;text-decoration:none">Other translations at the Rudolf Steiner Archive</a></div>`
    + `</div>`;
}
