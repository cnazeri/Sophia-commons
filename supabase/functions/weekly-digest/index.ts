// ══════════════════════════════════════════
//  Sophia Commons - Weekly Digest Draft
//  POST /functions/v1/weekly-digest
//  Body: { preview?: boolean }
//  Auth: an admin's session token (the "Generate draft" button), or a server secret key
//        (the Monday GitHub Action). Deploy with --no-verify-jwt; auth is checked here.
//
//  Builds an email-safe digest (new videos with short descriptions, upcoming events, new
//  listings, news) and saves it as a pending News item tagged weekly-digest. Nothing is
//  emailed until an admin approves it; send-newsletter does the sending.
// ══════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const ADMIN_EMAILS = ["cameron.nazeri@gmail.com", "cameron@sophiacommons.org", "admin@sophiacommons.org"];  // keep in sync with sophia_commons_v9.js
const SITE = "https://sophiacommons.org";
const FROM_ADDRESS = "Sophia Commons <newsletter@sophiacommons.org>";
const DAY = 86400000;

const corsHeaders = {
  "Access-Control-Allow-Origin": SITE,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Every server secret key Supabase injects (JSON by key name), plus the legacy service_role key.
function secretKeys(): string[] {
  const keys: string[] = [];
  try {
    const parsed = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    for (const v of Object.values(parsed)) if (typeof v === "string" && v) keys.push(v);
  } catch (_) { /* none */ }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) keys.push(legacy);
  const cron = Deno.env.get("DIGEST_CRON_KEY");
  if (cron) keys.push(cron);
  return keys;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// A one or two sentence summary of a YouTube description: drop links, hashtags, timestamps
// and promo lines, then cut at a sentence or word boundary.
export function shortDescription(text: string | null, max = 180): string {
  if (!text) return "";
  const PROMO = /(subscribe|abonnier|follow us|instagram|facebook|patreon|paypal|donat|spende|unterst(ü|ue)tzen sie|(ü|ue)berweisung|anmeldung|weitere info|more info|register|tickets|sign up|newsletter)/i;
  const lines = text.split(/\n+/).map((l) => l.trim()).filter((l) =>
    l && !/^(https?:\/\/|www\.|#|\d{1,2}:\d{2})/i.test(l)
  );
  const joined = lines.join(" ").replace(/https?:\/\/\S+/g, "").replace(/#\w+/g, "")
    .replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, "").replace(/\s+/g, " ").trim();
  // drop promo sentences and dangling "More:" style endings
  const sentences = (joined.match(/[^.!?]+[.!?]*/g) ?? []).map((x) => x.trim())
    .filter((x) => x && !PROMO.test(x) && !/:\s*$/.test(x));
  const s = sentences.join(" ");
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  if (stop > max * 0.5) return cut.slice(0, stop + 1);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:\-]$/, "") + "...";
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function longDate(d: Date) { return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`; }
function shortDate(iso: string) { const d = new Date(iso); return `${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}`; }

async function gather(sb: SupabaseClient) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * DAY).toISOString();
  const threeWeeks = new Date(now.getTime() + 21 * DAY).toISOString();

  const [videos, channels, events, listings, news] = await Promise.all([
    sb.from("youtube_videos").select("video_id, channel_slug, title, url, thumbnail_url, published_at, description")
      .gte("published_at", weekAgo).order("published_at", { ascending: false }).limit(40),
    sb.from("youtube_channels").select("slug, name").eq("active", true),
    sb.from("events").select("id, title, start_date, location_name, city, country, is_online, featured")
      .in("status", ["upcoming", "ongoing"]).gte("start_date", now.toISOString().slice(0, 10)).lte("start_date", threeWeeks)
      .order("start_date", { ascending: true }).limit(40),
    sb.from("directory_entries").select("id, organization_name, category, city, country")
      .eq("status", "approved").gte("created_at", weekAgo).order("created_at", { ascending: false }).limit(12),
    sb.from("news").select("id, title, excerpt, tags, published_at")
      .eq("status", "published").gte("published_at", weekAgo).order("published_at", { ascending: false }).limit(10),
  ]);
  for (const r of [videos, channels, events, listings, news]) if (r.error) throw new Error(r.error.message);

  const names: Record<string, string> = {};
  for (const c of channels.data ?? []) names[c.slug] = c.name;
  // one video per channel, so a channel that uploaded ten clips does not crowd out the others
  const seen = new Set<string>();
  const vids = (videos.data ?? []).filter((v) => names[v.channel_slug] && !seen.has(v.channel_slug) && seen.add(v.channel_slug)).slice(0, 8);
  // the same series (e.g. a weekly webinar) appears once, with its next date
  const evSeen = new Set<string>();
  const evs = (events.data ?? []).filter((e) => {
    const key = e.title.replace(/\s*[:(-].*$/, "").toLowerCase();
    if (evSeen.has(key)) return false;
    evSeen.add(key);
    return true;
  }).slice(0, 10);
  return {
    weekOf: longDate(now),
    videos: vids.map((v) => ({ ...v, channel: names[v.channel_slug], summary: shortDescription(v.description) })),
    events: evs,
    listings: listings.data ?? [],
    news: (news.data ?? []).filter((n) => !(n.tags ?? []).includes("weekly-digest")).slice(0, 5),
  };
}

// Email-safe HTML: inline styles, absolute links, no tables (the site's News view keeps only
// simple tags, so the same body reads well on the site and in the inbox).
const H3 = 'style="font-family:Georgia,serif;font-size:18px;color:#2E2A24;margin:28px 0 10px;padding-bottom:6px;border-bottom:1px solid #E8E2DA"';
const LI = 'style="margin:0 0 14px;padding:0;list-style:none"';
const LINK = 'style="color:#7F6116;font-weight:bold;text-decoration:none"';
const MUTED = 'style="color:#6F665B;font-size:13px"';

export function buildHtml(d: Awaited<ReturnType<typeof gather>>): string {
  let h = `<div style="max-width:600px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#2E2A24">`;
  h += `<h2 style="font-family:Georgia,serif;font-size:24px;margin:0 0 4px">Sophia Commons: the week of ${esc(d.weekOf)}</h2>`;
  h += `<p ${MUTED}>New videos, upcoming events and new listings from the anthroposophical world.</p>`;

  if (d.videos.length) {
    h += `<h3 ${H3}>New videos</h3><ul style="padding:0;margin:0">`;
    for (const v of d.videos) {
      h += `<li ${LI}><a href="${esc(v.url)}" ${LINK}>${esc(v.title)}</a><br><span ${MUTED}>${esc(v.channel)} &middot; ${esc(shortDate(v.published_at))}</span>`;
      if (v.summary) h += `<br><span style="font-size:14px">${esc(v.summary)}</span>`;
      h += `</li>`;
    }
    h += `</ul>`;
  }
  if (d.events.length) {
    h += `<h3 ${H3}>Coming up</h3><ul style="padding:0;margin:0">`;
    for (const e of d.events) {
      const where = e.is_online ? "Online" : (e.location_name || [e.city, e.country].filter(Boolean).join(", "));
      h += `<li ${LI}><strong style="color:#7F6116">${esc(shortDate(e.start_date))}</strong> &nbsp;<a href="${SITE}/event/${esc(e.id)}" ${LINK}>${esc(e.title)}</a>`;
      if (where) h += `<br><span ${MUTED}>${esc(where)}</span>`;
      h += `</li>`;
    }
    h += `</ul><p style="font-size:14px"><a href="${SITE}/events" ${LINK}>See the full calendar</a></p>`;
  }
  if (d.listings.length) {
    h += `<h3 ${H3}>New in the directory</h3><ul style="padding:0;margin:0">`;
    for (const l of d.listings) {
      const where = [l.city, l.country].filter(Boolean).join(", ");
      h += `<li ${LI}><a href="${SITE}/listing/${esc(l.id)}" ${LINK}>${esc(l.organization_name)}</a>${where ? `<br><span ${MUTED}>${esc(where)}</span>` : ""}</li>`;
    }
    h += `</ul>`;
  }
  if (d.news.length) {
    h += `<h3 ${H3}>News</h3><ul style="padding:0;margin:0">`;
    for (const n of d.news) {
      h += `<li ${LI}><a href="${SITE}/article/${esc(n.id)}" ${LINK}>${esc(n.title)}</a>${n.excerpt ? `<br><span style="font-size:14px">${esc(shortDescription(n.excerpt, 160))}</span>` : ""}</li>`;
    }
    h += `</ul>`;
  }
  if (!d.videos.length && !d.events.length && !d.listings.length && !d.news.length) {
    h += `<p>A quiet week. Browse the <a href="${SITE}/directory" ${LINK}>directory</a> or the <a href="${SITE}/events" ${LINK}>calendar</a>.</p>`;
  }
  h += `<p style="margin-top:28px"><a href="${SITE}" ${LINK}>Visit Sophia Commons</a></p></div>`;
  return h;
}

async function adminUserId(sb: SupabaseClient): Promise<string | null> {
  const { data } = await sb.auth.admin.listUsers({ perPage: 200 });
  const u = (data?.users ?? []).find((x) => x.email && ADMIN_EMAILS.includes(x.email.toLowerCase()) && x.email_confirmed_at);
  return u?.id ?? null;
}

async function notifyAdmins(title: string, counts: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [ADMIN_EMAILS[0]],
      subject: `Ready for your approval: ${title}`,
      html: `<p>This week's digest draft is ready (${esc(counts)}).</p>
<p>Open <a href="${SITE}">sophiacommons.org</a>, sign in, then Admin &gt; Weekly Digest to preview it.
Click <b>Approve &amp; email</b> to send it to subscribers, or Delete to skip this week.</p>`,
    }),
  }).catch(() => { /* a missed notice must not fail the draft */ });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return jsonResponse({ error: "Missing authorization header" }, 401);

  const keys = secretKeys();
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, keys[0]);
  const isCron = keys.some((k) => timingSafeEqual(token, k));
  let callerId: string | null = null;
  if (!isCron) {
    const { data: { user }, error } = await sb.auth.getUser(token);
    if (error || !user) return jsonResponse({ error: "Invalid or expired token" }, 401);
    const ok = user.app_metadata?.role === "admin" ||
      (!!user.email && ADMIN_EMAILS.includes(user.email.toLowerCase()) && !!user.email_confirmed_at);
    if (!ok) return jsonResponse({ error: "Forbidden: admin access required" }, 403);
    callerId = user.id;
  }

  let preview = false;
  try { preview = !!(await req.json()).preview; } catch (_) { /* empty body */ }

  try {
    const data = await gather(sb);
    const html = buildHtml(data);
    const counts = `${data.videos.length} videos, ${data.events.length} events, ${data.listings.length} new listings`;
    const title = `Sophia Commons weekly: ${data.weekOf}`;
    if (preview) return jsonResponse({ title, html, counts });

    // one draft per week: the Monday run and a manual click do not stack up drafts
    const { data: existing } = await sb.from("news").select("id, title").eq("status", "pending")
      .contains("tags", ["weekly-digest"]).gte("created_at", new Date(Date.now() - 5 * DAY).toISOString()).limit(1);
    if (existing && existing.length && isCron) return jsonResponse({ message: "Draft already waiting", id: existing[0].id });

    const userId = callerId ?? await adminUserId(sb);
    if (!userId) return jsonResponse({ error: "No admin account found to own the draft" }, 500);
    const { data: row, error } = await sb.from("news").insert({
      title, body: html, email_subject: title,
      excerpt: `This week: ${counts}.`,
      source_name: "Sophia Commons", tags: ["weekly-digest"], featured: false,
      user_id: userId, status: "pending", published_at: null,
    }).select("id").single();
    if (error) throw new Error(error.message);
    if (isCron) await notifyAdmins(title, counts);
    return jsonResponse({ message: "Draft created", id: row.id, title, counts });
  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
