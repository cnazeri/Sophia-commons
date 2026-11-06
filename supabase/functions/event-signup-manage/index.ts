// event-signup-manage: everything after someone signs up (owner, 2026-11-02, Phase B).
//   lookup / cancel     public, by the private cancel token from the confirmation email (/signup/cancel?t=...)
//   organizer_cancel    the event's organizer or an admin removes one sign-up
//   message             the organizer or an admin emails everyone signed up (at most 3 per event per day)
//   promote             a server key (event-save after a capacity change): move people up from the waitlist
//   remind              a server key (daily GitHub workflow): reminder to confirmed sign-ups the day before
// Whenever a place opens, event_signup_cancel()/event_signup_promote() move waitlisted people up under a lock,
// and this function emails each of them. Deploy with --no-verify-jwt (cancel links work without signing in).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SITE = "https://sophiacommons.org";
const FROM_ADDRESS = "Sophia Commons <hello@sophiacommons.org>";
const REPLY_TO = "hello@sophiacommons.org";
const ORIGINS = [SITE, "https://www.sophiacommons.org"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MESSAGES_PER_DAY = 3;

type Row = Record<string, any>;
type Mail = { from: string; reply_to: string; to: string[]; subject: string; html: string };

const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && (ORIGINS.includes(origin) || /--sophia-commons-6ce169\.netlify\.app$/.test(origin)) ? origin : SITE,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clean = (s: unknown, n: number) => String(s ?? "").replace(/[\u0000-\u0009\u000b-\u001f]/g, " ").trim().slice(0, n);

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

// Emails to attendees carry the host's name, else the event title (owner, 2026-11-04); emails to the
// organizer keep "Sophia Commons". The From line reads "<host> via Sophia Commons".
const host = (ev: Row) => String(ev.organizer_name || ev.title || "Sophia Commons").replace(/[\u0000-\u001f<>"]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
const fromHost = (ev: Row) => `${host(ev).replace(/[,;:@\\]/g, " ").slice(0, 60)} via Sophia Commons <hello@sophiacommons.org>`;

function mail(title: string, body: string, brand = "Sophia Commons") {
  return `<!doctype html><html><body style="margin:0;background:#FDFBF7;font-family:Georgia,serif;color:#2d2a26">
<div style="max-width:560px;margin:0 auto;padding:28px 22px">
<div style="font-size:20px;font-weight:bold;margin-bottom:4px">${esc(brand)}</div>
<div style="font-size:13px;color:#7a7368;margin-bottom:20px">${esc(title)}</div>
<div style="background:#fff;border:1px solid #ece6da;border-radius:10px;padding:22px;font-size:15px;line-height:1.55">${body}</div>
<div style="font-size:12px;color:#7a7368;margin-top:16px">Sent through Sophia Commons, the anthroposophical directory and calendar: <a href="${SITE}" style="color:#8a6d1f">sophiacommons.org</a></div>
</div></body></html>`;
}

function details(ev: Row) {
  const place = ev.is_online ? "Online" : ["In person", ev.location_name, ev.address || ev.city].filter(Boolean).join(", ");
  return `<p style="margin:0 0 6px"><b>${esc(ev.title)}</b></p><p style="margin:0 0 6px">${esc(when(ev))}</p>`
    + (place ? `<p style="margin:0 0 6px">Event location: ${esc(place)}</p>` : "")
    + (ev.organizer_name ? `<p style="margin:0 0 6px">Hosted by ${esc(ev.organizer_name)}</p>` : "");
}
const joinLine = (ev: Row) => ev.is_online && ev.online_url
  ? `<p style="margin:12px 0 0">Join online: <a href="${esc(ev.online_url)}" style="color:#8a6d1f">${esc(ev.online_url)}</a></p>` : "";
const cancelLine = (s: Row) => `<p style="margin:14px 0 0;font-size:13px;color:#7a7368">Can no longer come? <a href="${SITE}/signup/cancel?t=${s.cancel_token}" style="color:#8a6d1f">Cancel your sign-up</a> so someone else can have your place.</p>`;

function promotedMail(ev: Row, s: Row): Mail {
  return {
    from: fromHost(ev), reply_to: REPLY_TO, to: [s.email], subject: `A place opened up: you're signed up for ${ev.title}`,
    html: mail("You're off the waitlist", `<p style="margin:0 0 14px">Dear ${esc(s.name)},</p>
      <p style="margin:0 0 14px">Good news: a place opened up and you are now signed up${s.attending > 1 ? ` (${s.attending} people)` : ""}.</p>${details(ev)}${joinLine(ev)}
      <p style="margin:14px 0 0"><a href="${SITE}/event/${ev.id}" style="color:#8a6d1f;font-weight:bold">See the event page</a></p>${cancelLine(s)}`, host(ev)),
  };
}

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

const EV_COLS = "id, title, start_date, end_date, is_all_day, timezone, location_name, address, city, is_online, online_url, organizer_name, user_id, status";

serve(async (req) => {
  const headers = { ...cors(req.headers.get("origin")), "Content-Type": "application/json" };
  const out = (body: Row, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return out({ error: "POST only" }, 405);

  let input: Row;
  try { input = await req.json(); } catch { return out({ error: "Invalid request." }, 400); }
  const action = String(input.action ?? "");
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const isServer = !!token && serverKeys().some((k) => same(token, k));

  const getEvent = async (id: string) => (await db.from("events").select(EV_COLS).eq("id", id).maybeSingle()).data as Row | null;
  const organizerEmail = async (ev: Row) => ev.user_id ? (await db.auth.admin.getUserById(ev.user_id)).data?.user?.email ?? null : null;
  // The signed-in caller, if they organize this event or are an admin
  const mayManage = async (ev: Row) => {
    if (isServer) return true;
    const { data } = await db.auth.getUser(token);
    const u = data?.user;
    return !!u && (u.id === ev.user_id || u.app_metadata?.role === "admin");
  };

  try {
    // ── Cancel page: show what is being cancelled, then cancel on the button press ──
    if (action === "lookup" || action === "cancel") {
      const t = String(input.token ?? "");
      if (!UUID.test(t)) return out({ error: "This cancel link is not complete. Please check the link in your email." }, 400);
      const { data: s } = await db.from("event_signups").select("id, event_id, name, status, attending").eq("cancel_token", t).maybeSingle();
      if (!s) return out({ error: "This cancel link is no longer valid." }, 404);
      const ev = await getEvent(s.event_id);
      if (!ev) return out({ error: "This event could not be found." }, 404);
      const info = { ok: true, event_id: ev.id, title: ev.title, when: when(ev), name: s.name };
      if (action === "lookup") return out({ ...info, status: s.status });
      if (s.status === "cancelled") return out({ ...info, status: "cancelled" });

      const { data: rows, error } = await db.rpc("event_signup_cancel", { p_token: t, p_id: null });
      if (error) throw new Error("cancel: " + error.message);
      const promoted = (rows || []).slice(1) as Row[];
      const mails = promoted.map((p) => promotedMail(ev, p));
      const org = await organizerEmail(ev);
      if (org) mails.push({
        from: FROM_ADDRESS, reply_to: REPLY_TO, to: [org], subject: `Sign-up cancelled: ${ev.title}`,
        html: mail("Sign-up cancelled", `<p style="margin:0 0 10px"><b>${esc(s.name)}</b> cancelled their sign-up${s.attending > 1 ? ` for ${s.attending} people` : ""}.</p>`
          + (promoted.length ? `<p style="margin:0 0 10px">Moved up from the waitlist: ${promoted.map((p) => esc(p.name)).join(", ")}.</p>` : "")
          + `${details(ev)}<p style="margin:14px 0 0"><a href="${SITE}/event/${ev.id}" style="color:#8a6d1f;font-weight:bold">See all sign-ups</a> (sign in first)</p>`),
      });
      await send(mails);
      return out({ ...info, status: "cancelled", moved_up: promoted.length });
    }

    // ── Organizer removes one sign-up ──
    if (action === "organizer_cancel") {
      const id = String(input.signup_id ?? "");
      if (!UUID.test(id)) return out({ error: "This sign-up could not be found." }, 400);
      const { data: s } = await db.from("event_signups").select("id, event_id").eq("id", id).maybeSingle();
      const ev = s ? await getEvent(s.event_id) : null;
      if (!s || !ev) return out({ error: "This sign-up could not be found." }, 404);
      if (!(await mayManage(ev))) return out({ error: "Only the organizer can change this list." }, 403);
      const { data: rows, error } = await db.rpc("event_signup_cancel", { p_token: null, p_id: id });
      if (error) throw new Error("cancel: " + error.message);
      const promoted = (rows || []).slice(1) as Row[];
      await send(promoted.map((p) => promotedMail(ev, p)));
      return out({ ok: true, moved_up: promoted.map((p) => p.name) });
    }

    // ── Move people up after the organizer adds places (called by event-save) ──
    if (action === "promote") {
      if (!isServer) return out({ error: "Not allowed." }, 403);
      const ev = await getEvent(String(input.event_id ?? ""));
      if (!ev) return out({ error: "This event could not be found." }, 404);
      const { data: rows, error } = await db.rpc("event_signup_promote", { p_event: ev.id });
      if (error) throw new Error("promote: " + error.message);
      await send(((rows || []) as Row[]).map((p) => promotedMail(ev, p)));
      return out({ ok: true, moved_up: (rows || []).length });
    }

    // ── Organizer emails everyone who signed up ──
    if (action === "message") {
      const eventId = String(input.event_id ?? "");
      const ev = UUID.test(eventId) ? await getEvent(eventId) : null;
      if (!ev) return out({ error: "This event could not be found." }, 404);
      if (isServer || !(await mayManage(ev))) return out({ error: "Only the organizer can message the people who signed up." }, 403);
      const subject = clean(input.subject, 150).replace(/\s+/g, " ");
      const body = clean(input.body, 5000);
      if (!subject || !body) return out({ error: "Please write a subject and a message." }, 400);
      const waitlistToo = input.include_waitlist === true;

      const since = new Date(Date.now() - 864e5).toISOString();
      const { count } = await db.from("event_messages").select("id", { count: "exact", head: true }).eq("event_id", ev.id).gte("created_at", since);
      if ((count ?? 0) >= MESSAGES_PER_DAY) return out({ error: `You can send ${MESSAGES_PER_DAY} messages per event a day. Please try again tomorrow.` }, 429);

      const { data: people } = await db.from("event_signups").select("name, email, status, cancel_token")
        .eq("event_id", ev.id).in("status", waitlistToo ? ["confirmed", "waitlist"] : ["confirmed"]);
      if (!people?.length) return out({ error: "Nobody has signed up yet." }, 400);
      const { data: me } = await db.auth.getUser(token);
      const replyTo = me?.user?.email || REPLY_TO;
      const from = fromHost(ev);
      const paragraphs = body.split(/\n{2,}/).map((p) => `<p style="margin:0 0 12px">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
      const mails: Mail[] = (people as Row[]).map((p) => ({
        from, reply_to: replyTo, to: [p.email], subject,
        html: mail(`A message about ${ev.title}`, `<p style="margin:0 0 14px">Dear ${esc(p.name)},</p>${paragraphs}
          <hr style="border:0;border-top:1px solid #ece6da;margin:16px 0">${details(ev)}
          <p style="margin:12px 0 0;font-size:13px;color:#7a7368">You get this because you signed up for this event. Reply to this email to answer the organizer.</p>`
          + (p.status === "confirmed" ? cancelLine(p) : ""), host(ev)),
      }));
      const sent = await send(mails);
      await db.from("event_messages").insert({ event_id: ev.id, user_id: me?.user?.id, subject, body, sent_to: sent });
      if (!sent) return out({ error: "The message could not be sent. Please try again later." }, 502);
      return out({ ok: true, sent, left_today: MESSAGES_PER_DAY - (count ?? 0) - 1 });
    }

    // ── Daily reminder: confirmed sign-ups for events starting in the next 6 to 36 hours ──
    if (action === "remind") {
      if (!isServer) return out({ error: "Not allowed." }, 403);
      const from = new Date(Date.now() + 6 * 36e5).toISOString(), to = new Date(Date.now() + 36 * 36e5).toISOString();
      const { data: events } = await db.from("events").select(EV_COLS).eq("signup_enabled", true)
        .in("status", ["pending", "upcoming", "ongoing"]).gte("start_date", from).lt("start_date", to);
      let total = 0;
      for (const ev of (events || []) as Row[]) {
        const { data: people } = await db.from("event_signups").select("id, name, email, attending, cancel_token")
          .eq("event_id", ev.id).eq("status", "confirmed").is("reminded_at", null);
        if (!people?.length) continue;
        const mails: Mail[] = (people as Row[]).map((p) => ({
          from: fromHost(ev), reply_to: REPLY_TO, to: [p.email], subject: `Reminder: ${ev.title}`,
          html: mail("See you soon", `<p style="margin:0 0 14px">Dear ${esc(p.name)},</p>
            <p style="margin:0 0 14px">A friendly reminder that you are signed up${p.attending > 1 ? ` (${p.attending} people)` : ""} for:</p>${details(ev)}${joinLine(ev)}
            <p style="margin:14px 0 0"><a href="${SITE}/event/${ev.id}" style="color:#8a6d1f;font-weight:bold">See the event page</a></p>${cancelLine(p)}`, host(ev)),
        }));
        const sent = await send(mails);
        if (sent) {   // mark only what went out, so a failed send is retried on the next run
          await db.from("event_signups").update({ reminded_at: new Date().toISOString() }).in("id", (people as Row[]).slice(0, sent).map((p) => p.id));
          total += sent;
        }
      }
      return out({ ok: true, events: (events || []).length, reminded: total });
    }

    return out({ error: "Unknown action." }, 400);
  } catch (e) {
    console.error(String(e));
    return out({ error: "Something went wrong. Please try again." }, 500);
  }
});
