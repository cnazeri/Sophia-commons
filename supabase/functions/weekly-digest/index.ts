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
import { englishOnly } from "./translate.ts";

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

type Digest = Awaited<ReturnType<typeof gather>>;

// Email-safe HTML: inline styles and absolute links, built only from tags the site's News view
// keeps (h3, p, div, span, a, strong, br; images just drop out there), so the same body reads well
// on the site and in the inbox. send-newsletter wraps it in the email frame (logo, footer).
const INK = "#1E1810", MUTED_C = "#6F665B", GOLD = "#7F6116", GOLD_FILL = "#C9A035", RULE = "#E8E2DA";
const H3 = `style="font-family:Georgia,serif;font-size:20px;font-weight:normal;color:${INK};margin:32px 0 14px;padding-bottom:8px;border-bottom:1px solid ${RULE}"`;
const ITEM = `style="margin:0 0 18px"`;
const LINK = `style="color:${GOLD};font-weight:bold;text-decoration:none"`;
const MUTED = `style="color:${MUTED_C};font-size:13px"`;
const BODY = `style="font-size:14px;color:#3A332A;margin-top:2px"`;
const CATEGORY_LABEL: Record<string, string> = {
  waldorf: "Waldorf education", biodynamic: "Biodynamic farming", camphill: "Camphill",
  christian_community: "The Christian Community", medicine: "Anthroposophic medicine",
  eurythmy: "Eurythmy", eldercare: "Eldercare", societies: "Anthroposophical society",
};

function plural(n: number, one: string, many: string) { return `${n} ${n === 1 ? one : many}`; }

function videoHtml(v: Digest["videos"][number]): string {
  // mqdefault is YouTube's 16:9 thumbnail; hqdefault is 4:3 with black bars top and bottom
  const src = (v.thumbnail_url || "").replace(/\/(hq|sd|)default\.jpg$/, "/mqdefault.jpg");
  const thumb = src
    ? `<a href="${esc(v.url)}"><img class="vthumb" src="${esc(src)}" width="160" height="90" align="left" alt="" style="display:block;float:left;width:160px;height:90px;object-fit:cover;border:0;border-radius:6px;margin:2px 16px 6px 0"></a>`
    : "";
  return `<div ${ITEM}>${thumb}<a href="${esc(v.url)}" ${LINK}>${esc(v.title)}</a>`
    + `<div ${MUTED}>${esc(v.channel)} &middot; ${esc(shortDate(v.published_at))}</div>`
    + (v.summary ? `<div ${BODY}>${esc(v.summary)}</div>` : "")
    + `<div style="clear:both;font-size:0;line-height:0">&nbsp;</div></div>`;
}

function eventHtml(e: Digest["events"][number]): string {
  const d = new Date(e.start_date);
  const where = e.is_online ? "Online" : (e.location_name || [e.city, e.country].filter(Boolean).join(", "));
  return `<div ${ITEM}>`
    + `<span style="display:inline-block;vertical-align:top;width:50px;margin-right:14px;padding:5px 0;text-align:center;border:1px solid ${RULE};border-radius:8px;background:#FBF8F2">`
    + `<span style="display:block;font-size:11px;letter-spacing:.06em;color:${GOLD};font-weight:bold">${MONTHS[d.getUTCMonth()].slice(0, 3).toUpperCase()}</span>`
    + `<span style="display:block;font-family:Georgia,serif;font-size:20px;line-height:1.1;color:${INK}">${d.getUTCDate()}</span></span>`
    + `<span style="display:inline-block;vertical-align:top;max-width:420px">`
    + `<a href="${SITE}/event/${esc(e.id)}" ${LINK}>${esc(e.title)}</a>`
    + (where ? `<br><span ${MUTED}>${esc(where)}</span>` : "")
    + `</span></div>`;
}

function listingHtml(l: Digest["listings"][number]): string {
  const where = [l.city, l.country].filter(Boolean).join(", ");
  const meta = [CATEGORY_LABEL[l.category] ?? "", where].filter(Boolean).join(" \u00b7 ");
  return `<div style="margin:0 0 12px"><a href="${SITE}/listing/${esc(l.id)}" ${LINK}>${esc(l.organization_name)}</a>`
    + (meta ? `<br><span ${MUTED}>${esc(meta)}</span>` : "") + `</div>`;
}

export function buildHtml(d: Digest): string {
  const parts = [
    d.videos.length ? plural(d.videos.length, "new video", "new videos") : "",
    d.events.length ? plural(d.events.length, "event coming up", "events coming up") : "",
    d.listings.length ? plural(d.listings.length, "new place in the directory", "new places in the directory") : "",
  ].filter(Boolean);
  let h = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:${INK}">`;
  h += `<p style="font-family:Georgia,serif;font-size:19px;line-height:1.45;margin:0 0 6px;color:${INK}">This week across the anthroposophical world</p>`;
  h += `<p style="margin:0;color:#3A332A">${parts.length ? `Here's what's new: ${parts.join(", ").replace(/, ([^,]*)$/, " and $1")}. Videos in other languages are marked; their titles and summaries are translated.` : "A quiet week."}</p>`;

  if (d.events.length) {
    h += `<h3 ${H3}>Coming up</h3>` + d.events.map(eventHtml).join("");
    h += `<p style="margin:4px 0 0;font-size:14px"><a href="${SITE}/events" ${LINK}>See the full calendar &rarr;</a></p>`;
  }
  if (d.videos.length) h += `<h3 ${H3}>New videos</h3>` + d.videos.map(videoHtml).join("");
  if (d.listings.length) {
    h += `<h3 ${H3}>New in the directory</h3>` + d.listings.map(listingHtml).join("");
  }
  if (d.news.length) {
    h += `<h3 ${H3}>News</h3>` + d.news.map((n) => `<div ${ITEM}><a href="${SITE}/article/${esc(n.id)}" ${LINK}>${esc(n.title)}</a>`
      + (n.excerpt ? `<div ${BODY}>${esc(shortDescription(n.excerpt, 160))}</div>` : "") + `</div>`).join("");
  }
  if (!d.videos.length && !d.events.length && !d.listings.length && !d.news.length) {
    h += `<p>Browse the <a href="${SITE}/directory" ${LINK}>directory</a> or the <a href="${SITE}/events" ${LINK}>calendar</a>.</p>`;
  }
  h += `<div style="margin:32px 0 4px;text-align:center"><a href="${SITE}" style="display:inline-block;background:${GOLD_FILL};color:${INK};font-weight:bold;text-decoration:none;padding:12px 26px;border-radius:999px">Explore Sophia Commons</a></div>`;
  h += `</div>`;
  return h;
}

async function adminUserId(sb: SupabaseClient): Promise<string | null> {
  const { data } = await sb.auth.admin.listUsers({ perPage: 200 });
  const u = (data?.users ?? []).find((x) => x.app_metadata?.role === "admin");
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
    // Role only: an admin-looking email is not proof while sign-ups can be auto-confirmed.
    const ok = user.app_metadata?.role === "admin";
    if (!ok) return jsonResponse({ error: "Forbidden: admin access required" }, 403);
    callerId = user.id;
  }

  let preview = false;
  try { preview = !!(await req.json()).preview; } catch (_) { /* empty body */ }

  try {
    const { digest: data, translated, reason } = await englishOnly(await gather(sb), Deno.env.get("ANTHROPIC_API_KEY"));
    const html = buildHtml(data);
    const counts = `${data.videos.length} videos, ${data.events.length} events, ${data.listings.length} new listings`
      + (translated ? "" : `; NOT translated to English (${reason})`);
    const title = `Sophia Commons weekly: ${data.weekOf}`;
    if (preview) return jsonResponse({ title, html, counts, translated });

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
