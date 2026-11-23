// saved-remind: an email the day before an event a member saved on the website (owner, 2026-11-22: "individuals can
// save events ... and events will send a notification to them"). Browser push does not work reliably on iPhones, so
// the website reminds by email; the phone app reminds with its own notifications (the day before and an hour before).
//   remind   a server key (daily GitHub workflow, reminders.yml): for each member, one email listing their saved
//            events that start in the next 6 to 30 hours, each saved event once (saved_items.reminded_at).
// Deploy with --no-verify-jwt.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SITE = "https://sophiacommons.org";
const FROM_ADDRESS = "Sophia Commons <hello@sophiacommons.org>";
const REPLY_TO = "hello@sophiacommons.org";
const FROM_H = 6, TO_H = 30;
const MAX_PER_RUN = 500;

type Row = Record<string, any>;
type Mail = { from: string; reply_to: string; to: string[]; subject: string; html: string };

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

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

// "Tuesday, November 24, 2026, 9:30 AM GMT+2" in the event's own time zone (as the event-follow emails)
function when(ev: Row) {
  const d = new Date(ev.start_date), tz = ev.timezone || "UTC";
  const o: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: ev.is_all_day ? "UTC" : tz };
  const day = d.toLocaleDateString("en-US", o);
  return ev.is_all_day ? day : `${day}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz, timeZoneName: "short" })}`;
}
const iso = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
function calLinks(ev: Row) {
  const start = new Date(ev.start_date), end = ev.end_date ? new Date(ev.end_date) : new Date(start.getTime() + 2 * 3600e3);
  const url = `${SITE}/event/${ev.id}`;
  const g = new URLSearchParams({ action: "TEMPLATE", text: ev.title, dates: `${iso(start)}/${iso(end)}`, details: url });
  const o = new URLSearchParams({ path: "/calendar/action/compose", rru: "addevent", subject: ev.title, body: url,
    startdt: start.toISOString(), enddt: end.toISOString() });
  return { google: `https://calendar.google.com/calendar/render?${g}`, outlook: `https://outlook.live.com/calendar/0/deeplink/compose?${o}` };
}

function mail(title: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#FDFBF7;font-family:Georgia,serif;color:#2d2a26">
<div style="max-width:560px;margin:0 auto;padding:28px 22px">
<div style="font-size:13px;color:#7a7368;margin-bottom:20px">${esc(title)}</div>
<div style="background:#fff;border:1px solid #ece6da;border-radius:10px;padding:22px;font-size:15px;line-height:1.55">${body}</div>
<div style="font-size:12px;color:#7a7368;margin-top:16px">Sophia Commons, the anthroposophical directory and calendar: <a href="${SITE}" style="color:#8a6d1f">sophiacommons.org</a><br>
You get this email because you saved this event on Sophia Commons. To stop, remove it from <a href="${SITE}/saved" style="color:#8a6d1f">your saved list</a>.</div></div></body></html>`;
}

async function send(messages: Mail[]): Promise<number> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key || !messages.length) return 0;
  let sent = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const r = await fetch("https://api.resend.com/emails/batch", {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(chunk),
      });
      if (r.ok) sent += chunk.length;
      else console.error("resend", r.status, (await r.text()).slice(0, 200));
    } catch (e) { console.error("resend", String(e)); }
  }
  if (sent) await createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!).rpc("email_quota_note", { p_n: sent });
  return sent;
}

async function remind(db: any): Promise<Row> {
  const from = new Date(Date.now() + FROM_H * 3600e3).toISOString(), to = new Date(Date.now() + TO_H * 3600e3).toISOString();
  const { data: evs, error: e1 } = await db.from("events").select("id, title, start_date, end_date, timezone, is_all_day, is_online, online_url, location_name, city, country, status")
    .gte("start_date", from).lte("start_date", to).in("status", ["upcoming", "ongoing", "pending"]).limit(1000);
  if (e1) throw new Error(e1.message);
  if (!evs?.length) return { ok: true, due: 0, emailed: 0 };
  const byId = new Map((evs as Row[]).map((e) => [e.id, e]));
  const { data: saves, error: e2 } = await db.from("saved_items").select("id, user_id, item_id")
    .eq("item_type", "event").is("reminded_at", null).in("item_id", [...byId.keys()]).limit(MAX_PER_RUN);
  if (e2) throw new Error(e2.message);
  const perUser = new Map<string, Row[]>();
  for (const s of (saves || []) as Row[]) perUser.set(s.user_id, [...(perUser.get(s.user_id) || []), s]);

  const messages: Mail[] = [], doneIds: string[] = [];
  for (const [uid, list] of perUser) {
    const { data: u } = await db.auth.admin.getUserById(uid);
    const to = u?.user?.email;
    if (!to) continue;
    const items = list.map((s) => byId.get(s.item_id)).filter(Boolean).sort((a: Row, b: Row) => a.start_date.localeCompare(b.start_date));
    const blocks = items.map((ev: Row) => {
      const c = calLinks(ev), where = ev.is_online ? "Online" : [ev.location_name, ev.city, ev.country].filter(Boolean).join(", ");
      return `<div style="margin:0 0 18px"><a href="${SITE}/event/${esc(ev.id)}" style="color:#1E1810;font-weight:bold;font-size:17px">${esc(ev.title)}</a>
<div style="color:#5A4E42;margin-top:4px">${esc(when(ev))}${where ? " &middot; " + esc(where) : ""}</div>
<div style="margin-top:6px;font-size:13px">${ev.is_online && ev.online_url ? `<a href="${esc(ev.online_url)}" style="color:#8a6d1f">Join online</a> &middot; ` : ""}<a href="${esc(c.google)}" style="color:#8a6d1f">Add to Google Calendar</a> &middot; <a href="${esc(c.outlook)}" style="color:#8a6d1f">Outlook</a> &middot; <a href="${SITE}/event/${esc(ev.id)}" style="color:#8a6d1f">Event page (Apple calendar file)</a></div></div>`;
    }).join("");
    const subject = items.length === 1 ? `Tomorrow: ${items[0].title}` : `Tomorrow: ${items.length} events you saved`;
    messages.push({ from: FROM_ADDRESS, reply_to: REPLY_TO, to: [to], subject: subject.slice(0, 180),
      html: mail("A reminder from Sophia Commons", `<p style="margin:0 0 16px">${items.length === 1 ? "An event you saved is coming up:" : "Events you saved are coming up:"}</p>${blocks}`) });
    doneIds.push(...list.map((s) => s.id));
  }
  const sent = await send(messages);
  // Mark only when everything went out, so a failed send is tried again on the next run (if still in the window)
  if (doneIds.length && sent === messages.length) await db.from("saved_items").update({ reminded_at: new Date().toISOString() }).in("id", doneIds);
  return { ok: true, due: messages.length, emailed: sent };
}

serve(async (req) => {
  const headers = { "Content-Type": "application/json" };
  const out = (body: Row, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (req.method !== "POST") return out({ error: "POST only" }, 405);
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token || !serverKeys().some((k) => same(k, token))) return out({ error: "Not allowed." }, 401);
  let input: Row = {};
  try { input = await req.json(); } catch { /* empty */ }
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    if (input.action === "remind") return out(await remind(db));
    return out({ error: "Unknown action." }, 400);
  } catch (e) {
    console.error("saved-remind", String(e));
    return out({ error: "Something went wrong." }, 500);
  }
});
