// event-save: an organizer creates or edits an event from /events/new (owner, 2026-11-01).
// Deploy WITH JWT verification (no --no-verify-jwt): only signed-in members can call it.
//
// - Every field is checked here; organizers can never set status, featured or user_id.
// - New events are 'upcoming' (listed) when the organizer has claimed a directory listing, else 'pending'
//   (unlisted: the page opens by its link through get_event, and the owner gets an email to review it).
// - Edits keep the event's status. Only the event's owner (events.user_id) or an admin can edit it.
// - Repeats: weekly, or monthly on the same weekday (e.g. every 2nd Tuesday), up to 12 dates, stored as
//   separate rows that share series_id. Times are entered in the event's own time zone and stored in UTC.
// - Picture: a base64 data URL (jpg/png/webp, max 5 MB), stored with the service role at
//   event-images/user/<uid>/<uuid>.<ext> (the SQL editor cannot add storage policies for members).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SITE = "https://sophiacommons.org";
const FROM_ADDRESS = "Sophia Commons <hello@sophiacommons.org>";
const OWNER_EMAIL = "hello@sophiacommons.org";
const ORIGINS = [SITE, "https://www.sophiacommons.org"];
const EVENT_TYPES = ["workshop", "conference", "study_group", "festival", "retreat", "first_class", "other"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_DATES = 12;
const MAX_NEW_ROWS_PER_DAY = 40;   // a member can create at most this many event rows per 24 hours
const FREE_WORDS = /^(free|kostenlos|gratis|frei|бесплатно)$/i;

type Input = Record<string, unknown>;
type Row = Record<string, unknown>;

const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && (ORIGINS.includes(origin) || /--sophia-commons-6ce169\.netlify\.app$/.test(origin)) ? origin : SITE,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// One line of text: control characters removed, spaces collapsed, cut to n characters
const line = (s: unknown, n: number) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
// Multi-line text (description): keep line breaks, drop other control characters
const text = (s: unknown, n: number) => String(s ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").replace(/\n{4,}/g, "\n\n\n").trim().slice(0, n);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class Invalid extends Error {}
const fail = (msg: string): never => { throw new Invalid(msg); };

function httpUrl(v: unknown, label: string): string | null {
  const s = line(v, 500);
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : "https://" + s);
    if (!["http:", "https:"].includes(u.protocol) || !u.hostname.includes(".")) throw new Error();
    return u.toString();
  } catch { return fail(`Please enter a valid web address for ${label}.`); }
}

// ── Dates: local wall time in an IANA zone -> UTC ──
function validZone(tz: string): boolean {
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}
function zoneOffsetMs(utcMs: number, tz: string): number {
  const p: Record<string, number> = {};
  for (const x of new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(utcMs))) {
    if (x.type !== "literal") p[x.type] = parseInt(x.value, 10);
  }
  return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - utcMs;
}
function zonedToUtc(day: string, hm: string, tz: string): Date {
  const [y, m, d] = day.split("-").map(Number), [h, mi] = hm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const off1 = zoneOffsetMs(guess, tz);
  let t = guess - off1;
  const off2 = zoneOffsetMs(t, tz);
  if (off2 !== off1) t = guess - off2;    // the date is on the other side of a daylight-saving change
  return new Date(t);
}
const DAY = /^\d{4}-\d{2}-\d{2}$/, HM = /^([01]\d|2[0-3]):[0-5]\d$/;
function realDay(s: string): boolean {
  if (!DAY.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
function addDays(day: string, n: number): string {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);

// The local start days of the series: weekly, or monthly on the same weekday ("2nd Tuesday"; a 5th becomes the last)
function seriesDays(first: string, repeat: string, count: number): string[] {
  if (repeat === "weekly") return Array.from({ length: count }, (_, i) => addDays(first, 7 * i));
  if (repeat !== "monthly") return [first];
  const d0 = new Date(first + "T00:00:00Z"), dow = d0.getUTCDay(), nth = Math.ceil(d0.getUTCDate() / 7);
  const out: string[] = [];
  for (let k = 0; k < count; k++) {
    const y = d0.getUTCFullYear(), m = d0.getUTCMonth() + k;
    const firstOfMonth = new Date(Date.UTC(y, m, 1));
    const firstDow = 1 + ((dow - firstOfMonth.getUTCDay() + 7) % 7);
    const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    let day = firstDow + 7 * (nth - 1);
    if (day > daysInMonth) day -= 7;
    out.push(new Date(Date.UTC(y, m, day)).toISOString().slice(0, 10));
  }
  return out;
}

// ── The organizer's questions for sign-ups (same shape as v1.107) ──
function questions(v: unknown) {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 3).map((q: Input) => {
    const label = line(q?.label, 120), type = String(q?.type ?? "");
    if (!label || !["yesno", "text", "choice"].includes(type)) return null;
    if (type !== "choice") return { label, type };
    const options = (Array.isArray(q.options) ? q.options : []).map((o) => line(o, 60)).filter(Boolean).slice(0, 10);
    return options.length >= 2 ? { label, type, options } : null;
  }).filter(Boolean);
}

// ── Picture ──
function decodeImage(v: unknown): { bytes: Uint8Array; type: string; ext: string } {
  const m = String(v ?? "").match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/);
  if (!m) return fail("The picture must be a JPG, PNG or WebP image.");
  let bin: string;
  try { bin = atob(m[2].replace(/\s/g, "")); } catch { return fail("The picture could not be read."); }
  if (bin.length > MAX_IMAGE_BYTES) fail("The picture is larger than 5 MB.");
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const b = (i: number) => bytes[i];
  // Check the real file type from its first bytes, not from what the browser claims
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return { bytes, type: "image/jpeg", ext: "jpg" };
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return { bytes, type: "image/png", ext: "png" };
  if (bin.slice(0, 4) === "RIFF" && bin.slice(8, 12) === "WEBP") return { bytes, type: "image/webp", ext: "webp" };
  return fail("The picture must be a JPG, PNG or WebP image.");
}

// Validates everything the organizer typed. Returns the shared columns plus the list of {start, end} dates.
async function buildEvent(db: ReturnType<typeof createClient>, uid: string, admin: boolean, e: Input, isNew: boolean, oldEntry: unknown) {
  const title = line(e.title, 200);
  if (title.length < 3) fail("Please give the event a title.");
  const description = text(e.description, 5000);
  const eventType = EVENT_TYPES.includes(String(e.event_type)) ? String(e.event_type) : "other";

  const tz = line(e.timezone, 60) || "UTC";
  if (!validZone(tz)) fail("Please choose a time zone from the list.");
  const allDay = e.is_all_day === true;
  const startDay = String(e.start_date ?? ""), endDay = String(e.end_date ?? "") || "";
  const startTime = String(e.start_time ?? ""), endTime = String(e.end_time ?? "");
  if (!realDay(startDay)) fail("Please give the start date.");
  if (endDay && !realDay(endDay)) fail("The end date is not a valid date.");
  if (endDay && endDay < startDay) fail("The end date is before the start date.");
  if (!allDay && !HM.test(startTime)) fail("Please give the start time (or tick All day).");
  if (!allDay && endTime && !HM.test(endTime)) fail("The end time is not a valid time.");
  if (isNew) {
    const today = new Date().toISOString().slice(0, 10);
    if (startDay < addDays(today, -1)) fail("The start date is in the past.");
    if (startDay > addDays(today, 3 * 366)) fail("The start date is more than three years away.");
  }

  const repeat = isNew && ["weekly", "monthly"].includes(String(e.repeat)) ? String(e.repeat) : "none";
  const count = repeat === "none" ? 1 : Math.min(MAX_DATES, Math.max(2, parseInt(String(e.repeat_count ?? 2), 10) || 2));
  const spanDays = endDay ? dayDiff(startDay, endDay) : 0;
  if (repeat === "weekly" && spanDays >= 7) fail("A weekly event cannot last a week or longer.");
  if (repeat === "monthly" && spanDays >= 28) fail("A monthly event cannot last four weeks or longer.");
  const dates = seriesDays(startDay, repeat, count).map((d) => {
    const ed = endDay ? addDays(d, spanDays) : "";
    if (allDay) return { start: d + "T00:00:00Z", end: ed ? ed + "T23:59:59Z" : null };
    const start = zonedToUtc(d, startTime, tz);
    let end: Date | null = null;
    if (endTime) end = zonedToUtc(ed || d, endTime, tz);
    else if (ed && ed !== d) end = zonedToUtc(ed, "23:59", tz);
    if (end && end <= start) fail("The end is before the start. Please check the end date and time.");
    return { start: start.toISOString(), end: end ? end.toISOString() : null };
  });

  const online = e.is_online === true;
  const place = {
    is_online: online,
    online_url: online ? httpUrl(e.online_url, "the online link") : null,
    location_name: online ? "Online" : line(e.location_name, 200) || null,
    address: online ? null : line(e.address, 300) || null,
    city: online ? null : line(e.city, 120) || null,
    region: online ? null : line(e.region, 120) || null,
    country: online ? null : line(e.country, 120) || null,
  };
  if (online && !place.online_url) fail("Please give the link for the online event.");
  if (!online && !place.city && !place.location_name) fail("Please give the venue or the city.");

  const price = line(e.price_text, 100);
  const organizerName = line(e.organizer_name, 200);
  const organizerUrl = httpUrl(e.organizer_url, "the organizer");

  // Linked listing: only one the organizer has claimed (admins may link any). An unchanged link is kept as is.
  let entry: string | null = null;
  const want = String(e.directory_entry_id ?? "");
  if (want) {
    if (!UUID.test(want)) fail("Please choose one of your listings.");
    if (want === oldEntry) entry = want;
    else {
      const { data } = await db.from("directory_entries").select("id, claimed_by").eq("id", want).maybeSingle();
      if (!data || (!admin && data.claimed_by !== uid)) fail("You can only link a listing you have claimed.");
      entry = want;
    }
  }

  const signup = e.signup_enabled === true;
  const columns: Row = {
    title, description, event_type: eventType, is_all_day: allDay, timezone: tz,
    ...place,
    price_text: price || null,
    is_free: !price || FREE_WORDS.test(price),
    organizer_name: organizerName || null,
    organizer_url: organizerUrl,
    directory_entry_id: entry,
    signup_enabled: signup,
    signup_questions: signup ? questions(e.signup_questions) : [],
  };
  return { columns, dates };
}

async function uploadImage(db: ReturnType<typeof createClient>, uid: string, data: unknown): Promise<string> {
  const img = decodeImage(data);
  const path = `user/${uid}/${crypto.randomUUID()}.${img.ext}`;
  const { error } = await db.storage.from("event-images").upload(path, img.bytes, { contentType: img.type, upsert: false });
  if (error) throw new Error("upload: " + error.message);
  return db.storage.from("event-images").getPublicUrl(path).data.publicUrl;
}

async function emailOwner(rows: Row[], organizer: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key || !rows.length) return;
  const first = rows[0];
  const list = rows.map((r) => `<li><a href="${SITE}/event/${r.id}">${esc(String(r.start_date).slice(0, 16).replace("T", " "))} UTC</a></li>`).join("");
  const html = `<p>A new event is waiting for approval: <b>${esc(first.title)}</b></p>
<p>From: ${esc(organizer)}${first.organizer_name ? ` (organizer: ${esc(first.organizer_name)})` : ""}</p>
<ul>${list}</ul>
<p>It can already be shared by its link. Approve or reject it under Admin &gt; Events on <a href="${SITE}">sophiacommons.org</a> (sign in first).</p>`;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_ADDRESS, to: [OWNER_EMAIL], subject: `Event to approve: ${first.title}`, html }),
    });
  } catch (_) { /* the event is saved; the note is best effort */ }
}

// "Copy as new" keeps the picture only when it already lives in our event-images bucket (never an outside URL)
function ownImageUrl(v: unknown): string | null {
  const s = line(v, 500);
  const prefix = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/event-images/`;
  return s.startsWith(prefix) && !s.includes("..") && /^[\w\-./%]+$/.test(s.slice(prefix.length)) ? s : null;
}

const links = (r: Row) => ({ id: r.id, status: r.status, start_date: r.start_date, event: `${SITE}/event/${r.id}`, signup: r.signup_enabled ? `${SITE}/signup/${r.id}` : null });

serve(async (req) => {
  const headers = { ...cors(req.headers.get("origin")), "Content-Type": "application/json" };
  const out = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return out({ error: "POST only" }, 405);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await db.auth.getUser(token);
  const user = auth?.user;
  if (!user) return out({ error: "Please sign in first." }, 401);
  const uid = user.id, admin = user.app_metadata?.role === "admin";

  let input: Input;
  try { input = await req.json(); } catch { return out({ error: "Invalid request." }, 400); }
  const ev = (input.event && typeof input.event === "object" ? input.event : {}) as Input;
  const editId = String(input.id ?? "");

  try {
    // ── Edit one event ──
    if (editId) {
      if (!UUID.test(editId)) fail("This event could not be found.");
      const { data: old } = await db.from("events").select("id, user_id, status, image_url, directory_entry_id, series_id").eq("id", editId).maybeSingle();
      if (!old || (old.user_id !== uid && !admin)) return out({ error: "You can only edit your own events." }, 403);
      const { columns, dates } = await buildEvent(db, uid, admin, ev, false, old.directory_entry_id);
      const row: Row = { ...columns, start_date: dates[0].start, end_date: dates[0].end, updated_at: new Date().toISOString() };
      if (input.image) row.image_url = await uploadImage(db, uid, input.image);
      else if (input.remove_image === true) row.image_url = null;
      // status, featured, user_id and series_id are never taken from the request
      const { data, error } = await db.from("events").update(row).eq("id", editId)
        .select("id, status, start_date, signup_enabled").single();
      if (error) throw new Error("update: " + error.message);
      return out({ ok: true, status: data.status, events: [links(data)] });
    }

    // ── Create (one date or a series) ──
    if (!admin) {
      const since = new Date(Date.now() - 864e5).toISOString();
      const { count } = await db.from("events").select("id", { count: "exact", head: true }).eq("user_id", uid).gte("created_at", since);
      if ((count ?? 0) >= MAX_NEW_ROWS_PER_DAY) return out({ error: "You have added many events today. Please try again tomorrow." }, 429);
    }
    const { columns, dates } = await buildEvent(db, uid, admin, ev, true, null);
    // Trusted organizers (anyone who has claimed a listing) are listed at once; others wait for approval
    const { count: claimed } = await db.from("directory_entries").select("id", { count: "exact", head: true }).eq("claimed_by", uid);
    const status = admin || (claimed ?? 0) > 0 ? "upcoming" : "pending";
    const imageUrl = input.image ? await uploadImage(db, uid, input.image) : ownImageUrl(input.copy_image_url);
    const series = dates.length > 1 ? crypto.randomUUID() : null;
    const rows = dates.map((d) => ({ ...columns, start_date: d.start, end_date: d.end, image_url: imageUrl,
      series_id: series, status, featured: false, user_id: uid }));
    const { data, error } = await db.from("events").insert(rows).select("id, title, status, start_date, organizer_name, signup_enabled");
    if (error) throw new Error("insert: " + error.message);
    const saved = (data || []).sort((a: Row, b: Row) => String(a.start_date).localeCompare(String(b.start_date)));
    if (status === "pending") await emailOwner(saved, user.email || uid);
    return out({ ok: true, status, events: saved.map(links) });
  } catch (err) {
    if (err instanceof Invalid) return out({ error: err.message }, 400);
    console.error("event-save", String(err));
    return out({ error: "The event could not be saved. Please try again." }, 500);
  }
});
