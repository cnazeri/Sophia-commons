// event-follow: "Get an email when this group adds an event" on listing pages (owner, 2026-11-02, Phase C).
//   follow    public: { email, entry_id } -> sends a confirm email (double opt-in); nothing else is sent until confirmed
//   confirm   public: { token } from the confirm link (/listing/<id>?follow=confirm&t=...)
//   stop      public: { token } from the unsubscribe link in every email (/listing/<id>?follow=stop&t=...)
//   notify    a server key (daily GitHub workflow): one email per newly listed event to that listing's confirmed followers
// The links open the listing page, which POSTs here, so mail scanners that prefetch links cannot confirm or
// unsubscribe anyone. Only this function touches event_follows (service role; the table has no public policies).
// Deploy with --no-verify-jwt.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SITE = "https://sophiacommons.org";
const FROM_ADDRESS = "Sophia Commons <hello@sophiacommons.org>";
const REPLY_TO = "hello@sophiacommons.org";
const ORIGINS = [SITE, "https://www.sophiacommons.org"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RESEND_AFTER_MS = 10 * 60 * 1000;   // one confirm email per address and listing per 10 minutes
const FOLLOWS_PER_HOUR = 300;             // across the whole site, against scripted sign-ups
const NOTIFY_WINDOW_DAYS = 14;            // only events listed in the last two weeks are announced

type Row = Record<string, any>;
type Mail = { from: string; reply_to: string; to: string[]; subject: string; html: string; headers?: Record<string, string> };

const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && (ORIGINS.includes(origin) || /--sophia-commons-6ce169\.netlify\.app$/.test(origin)) ? origin : SITE,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Every server secret key Supabase injects, plus the legacy service_role key and the cron key (as weekly-digest)
function serverKeys(): string[] {
  const keys: string[] = [];
  try {
    for (const v of Object.values(JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}"))) if (typeof v === "string" && v) keys.push(v);
  } catch (_) { /* none */ }
  for (const n of ["SUPABASE_SERVICE_ROLE_KEY", "DIGEST_CRON_KEY"]) { const v = Deno.env.get(n); if (v) keys.push(v); }
  return keys;
}
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function when(ev: Row) {
  const d = new Date(ev.start_date), tz = ev.timezone || "UTC";
  const o: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: ev.is_all_day ? "UTC" : tz };
  const day = d.toLocaleDateString("en-US", o);
  return ev.is_all_day ? day : `${day}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz, timeZoneName: "short" })}`;
}

function mail(title: string, body: string, stopUrl = "") {
  return `<!doctype html><html><body style="margin:0;background:#FDFBF7;font-family:Georgia,serif;color:#2d2a26">
<div style="max-width:560px;margin:0 auto;padding:28px 22px">
<div style="font-size:20px;font-weight:bold;margin-bottom:4px">Sophia Commons</div>
<div style="font-size:13px;color:#7a7368;margin-bottom:20px">${esc(title)}</div>
<div style="background:#fff;border:1px solid #ece6da;border-radius:10px;padding:22px;font-size:15px;line-height:1.55">${body}</div>
<div style="font-size:12px;color:#7a7368;margin-top:16px">Sophia Commons, the anthroposophical directory and calendar: <a href="${SITE}" style="color:#8a6d1f">sophiacommons.org</a>`
    + (stopUrl ? `<br>You follow this group on Sophia Commons. <a href="${stopUrl}" style="color:#8a6d1f">Stop these emails</a>.` : "")
    + `</div></div></body></html>`;
}
const BTN = `style="display:inline-block;background:#C9A035;color:#1E1810;font-weight:bold;text-decoration:none;padding:11px 22px;border-radius:999px"`;

async function send(messages: Mail[]): Promise<number> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key || !messages.length) return 0;
  let sent = 0;
  for (let i = 0; i < messages.length; i += 100) {   // Resend takes at most 100 emails per batch
    const chunk = messages.slice(i, i + 100);
    try {
      const r = await fetch("https://api.resend.com/emails/batch", {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(chunk),
      });
      if (r.ok) sent += chunk.length;
      else console.error("resend", r.status, (await r.text()).slice(0, 200));
    } catch (e) { console.error("resend", String(e)); }
  }
  if (sent) await createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!).rpc("email_quota_note", { p_n: sent });   // the shared daily count
  return sent;
}

const link = (entryId: string, action: string, token: string) => `${SITE}/listing/${entryId}?follow=${action}&t=${token}`;

async function follow(db: any, input: Row): Promise<[Row, number]> {
  const email = String(input.email ?? "").trim().toLowerCase().slice(0, 254);
  const entryId = String(input.entry_id ?? "");
  if (input.website) return [{ ok: true }, 200];   // honeypot field: pretend it worked
  if (!EMAIL.test(email)) return [{ error: "Please enter a valid email address." }, 400];
  if (!UUID.test(entryId)) return [{ error: "Unknown listing." }, 400];
  const { data: entry } = await db.from("directory_entries").select("id, organization_name").eq("id", entryId).eq("status", "approved").maybeSingle();
  if (!entry) return [{ error: "Unknown listing." }, 404];
  const hourAgo = new Date(Date.now() - 3600e3).toISOString();
  const { count } = await db.from("event_follows").select("id", { count: "exact", head: true }).gte("confirm_sent_at", hourAgo);
  if ((count ?? 0) >= FOLLOWS_PER_HOUR) return [{ error: "Too many requests right now. Please try again in an hour." }, 429];

  const { data: rows } = await db.from("event_follows").select("*").eq("directory_entry_id", entryId).eq("email", email).limit(1);
  let row: Row | null = rows?.[0] ?? null;
  if (row?.confirmed && !row.stopped_at) return [{ ok: true, already: true }, 200];
  if (row?.confirm_sent_at && Date.now() - new Date(row.confirm_sent_at).getTime() < RESEND_AFTER_MS) return [{ ok: true }, 200];
  const now = new Date().toISOString();
  if (row) {
    const r = await db.from("event_follows").update({ confirmed: false, stopped_at: null, confirm_sent_at: now }).eq("id", row.id).select().single();
    row = r.data;
  } else {
    const r = await db.from("event_follows").insert({ email, directory_entry_id: entryId, confirm_sent_at: now }).select().single();
    if (r.error) return [{ error: "Could not save. Please try again." }, 500];
    row = r.data;
  }
  const name = entry.organization_name;
  await send([{ from: FROM_ADDRESS, reply_to: REPLY_TO, to: [email], subject: `Confirm: new events from ${name}`,
    html: mail("Please confirm", `<p>Someone (we hope you) asked to get an email when <b>${esc(name)}</b> adds an event on Sophia Commons.</p>`
      + `<p><a href="${link(entryId, "confirm", row!.token)}" ${BTN}>Yes, email me new events</a></p>`
      + `<p style="color:#7a7368;font-size:13px">If this wasn't you, ignore this email and nothing more will be sent.</p>`) }]);
  return [{ ok: true }, 200];
}

async function byToken(db: any, input: Row): Promise<Row | null> {
  const token = String(input.token ?? "");
  if (!UUID.test(token)) return null;
  const { data } = await db.from("event_follows").select("id, directory_entry_id, confirmed, stopped_at").eq("token", token).maybeSingle();
  return data;
}

async function notify(db: any): Promise<Row> {
  const since = new Date(Date.now() - NOTIFY_WINDOW_DAYS * 864e5).toISOString();
  const { data: events, error } = await db.from("events")
    .select("id, title, start_date, is_all_day, timezone, is_online, location_name, city, country, directory_entry_id")
    .not("directory_entry_id", "is", null).is("follows_notified_at", null).in("status", ["upcoming", "ongoing"])
    .gte("created_at", since).gte("start_date", new Date().toISOString().slice(0, 10)).limit(50);
  if (error) throw new Error(error.message);
  let sent = 0;
  for (const ev of events ?? []) {
    // claim the event first, so two runs at once cannot announce it twice
    const claim = await db.from("events").update({ follows_notified_at: new Date().toISOString() }).eq("id", ev.id).is("follows_notified_at", null).select("id");
    if (!claim.data?.length) continue;
    const [{ data: entry }, { data: fans }] = await Promise.all([
      db.from("directory_entries").select("organization_name").eq("id", ev.directory_entry_id).maybeSingle(),
      db.from("event_follows").select("email, token").eq("directory_entry_id", ev.directory_entry_id).eq("confirmed", true).is("stopped_at", null).limit(5000),
    ]);
    const name = entry?.organization_name ?? "A group you follow";
    const where = ev.is_online ? "Online" : [ev.location_name, ev.city, ev.country].filter(Boolean).join(", ");
    sent += await send((fans ?? []).map((f: Row) => {
      const stop = link(ev.directory_entry_id, "stop", f.token);
      return { from: FROM_ADDRESS, reply_to: REPLY_TO, to: [f.email], subject: `New event from ${name}: ${ev.title}`.slice(0, 180),
        headers: { "List-Unsubscribe": `<${stop}>` },
        html: mail(`New event from ${name}`, `<p style="font-size:18px;margin:0 0 6px"><b>${esc(ev.title)}</b></p>`
          + `<p style="margin:0 0 4px">${esc(when(ev))}</p>` + (where ? `<p style="margin:0 0 14px;color:#7a7368">${esc(where)}</p>` : "")
          + `<p><a href="${SITE}/event/${ev.id}" ${BTN}>See the event</a></p>`, stop) };
    }));
  }
  return { ok: true, events: events?.length ?? 0, sent };
}

serve(async (req) => {
  const headers = { ...cors(req.headers.get("origin")), "Content-Type": "application/json" };
  const out = (body: Row, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return out({ error: "POST only" }, 405);

  let input: Row;
  try { input = await req.json(); } catch { return out({ error: "Invalid request." }, 400); }
  const keys = serverKeys();
  const db = createClient(Deno.env.get("SUPABASE_URL")!, keys[0]);
  try {
    switch (String(input.action ?? "")) {
      case "follow": { const [b, s] = await follow(db, input); return out(b, s); }
      case "confirm": {
        const f = await byToken(db, input);
        if (!f) return out({ error: "This link is not valid any more." }, 404);
        if (!f.confirmed || f.stopped_at) await db.from("event_follows").update({ confirmed: true, confirmed_at: new Date().toISOString(), stopped_at: null }).eq("id", f.id);
        return out({ ok: true, entry_id: f.directory_entry_id });
      }
      case "stop": {
        const f = await byToken(db, input);
        if (!f) return out({ error: "This link is not valid any more." }, 404);
        if (!f.stopped_at) await db.from("event_follows").update({ stopped_at: new Date().toISOString() }).eq("id", f.id);
        return out({ ok: true, entry_id: f.directory_entry_id });
      }
      case "notify": {
        const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
        if (!token || !keys.some((k) => same(token, k))) return out({ error: "Forbidden" }, 403);
        return out(await notify(db));
      }
      default: return out({ error: "Unknown action." }, 400);
    }
  } catch (e) {
    console.error("event-follow", String(e));
    return out({ error: "Something went wrong. Please try again." }, 500);
  }
});
