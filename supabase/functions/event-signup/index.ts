// event-signup: a visitor signs up for an event on its Sophia Commons page (owner, 2026-10-31).
// Checks the event takes sign-ups, saves one sign-up per email per event, then emails a confirmation to the
// person and a short note to the organizer (both via Resend). Public endpoint: deploy with --no-verify-jwt.
// The event_signups table has no public policies; only this function (service role) writes to it.
// Pending (not yet approved) events take sign-ups too: organizers share them by link first (2026-11-01).
// Phase B (2026-11-02): spots and a waitlist (event_signup_place() decides, under a lock), a closing time
// (signup_close_hours before the start), and a private cancel link in every confirmation.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SITE = "https://sophiacommons.org";
const FROM_ADDRESS = "Sophia Commons <hello@sophiacommons.org>";
type Row = Record<string, any>;
const REPLY_TO = "hello@sophiacommons.org";
const ORIGINS = [SITE, "https://www.sophiacommons.org"];

const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && (ORIGINS.includes(origin) || /--sophia-commons-6ce169\.netlify\.app$/.test(origin)) ? origin : SITE,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clean = (s: unknown, n: number) => String(s ?? "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

function when(ev: { start_date: string; is_all_day: boolean }, tz: string) {
  const d = new Date(ev.start_date);
  const day = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: ev.is_all_day ? "UTC" : tz });
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

serve(async (req) => {
  const headers = { ...cors(req.headers.get("origin")), "Content-Type": "application/json" };
  const out = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return out({ error: "POST only" }, 405);

  let input: Record<string, unknown>;
  try { input = await req.json(); } catch { return out({ error: "Invalid request." }, 400); }
  if (input.website) return out({ ok: true });   // honeypot field: bots fill it, people never see it

  const eventId = clean(input.event_id, 40);
  const name = clean(input.name, 120);
  const email = clean(input.email, 200).toLowerCase();
  const attending = Math.min(20, Math.max(1, parseInt(String(input.attending ?? 1), 10) || 1));
  const note = clean(input.note, 1000);
  // Times in the emails use the visitor's own time zone (sent by their browser), else UTC
  let tz = clean(input.tz, 60) || "UTC";
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); } catch { tz = "UTC"; }
  if (!/^[0-9a-f-]{36}$/.test(eventId) || !name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return out({ error: "Please give your name and a valid email address." }, 400);
  }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: ev } = await db.from("events")
    .select("id, title, start_date, end_date, is_all_day, location_name, address, city, is_online, online_url, organizer_name, price_text, donation_url, user_id, status, signup_enabled, signup_questions, signup_capacity, signup_close_hours")
    .eq("id", eventId).maybeSingle();
  if (!ev || !ev.signup_enabled || !["pending", "upcoming", "ongoing"].includes(ev.status)) {
    return out({ error: "This event is not taking sign-ups." }, 400);
  }
  const closesAt = ev.signup_close_hours == null
    ? new Date(ev.end_date || ev.start_date).getTime() + 864e5
    : new Date(ev.start_date).getTime() - ev.signup_close_hours * 36e5;
  if (Date.now() > closesAt) return out({ error: "Sign-ups for this event are closed." }, 400);
  if (ev.signup_capacity && attending > ev.signup_capacity) {
    return out({ error: `This event has room for ${ev.signup_capacity} people in all. Please sign up for fewer.` }, 400);
  }

  // Answers in the same order as the organizer's questions; a choice must be one of the options
  const qs = Array.isArray(ev.signup_questions) ? ev.signup_questions.slice(0, 3) : [];
  const given = Array.isArray(input.answers) ? input.answers : [];
  const answers = qs.map((q: { label: string; type: string; options?: string[] }, i: number) => {
    let a = clean(given[i], 500);
    if (q.type === "yesno" && !["Yes", "No"].includes(a)) a = "";
    if (q.type === "choice" && !(q.options || []).includes(a)) a = "";
    return { label: q.label, answer: a };
  });

  const { data: row, error } = await db.rpc("event_signup_place", {
    p_event: eventId, p_name: name, p_email: email, p_attending: attending, p_answers: answers, p_note: note || null,
  });
  if (error || !row) {
    if (error?.code === "23505") return out({ error: "You are already signed up for this event with this email." }, 409);
    return out({ error: "Your sign-up could not be saved. Please try again." }, 500);
  }
  const waitlist = row.status === "waitlist";
  const cancelUrl = `${SITE}/signup/cancel?t=${row.cancel_token}`;

  // Emails: a failure here never undoes the sign-up
  const key = Deno.env.get("RESEND_API_KEY");
  const page = `${SITE}/event/${ev.id}`;
  const place = ev.is_online ? "Online" : ["In person", ev.location_name, ev.address || ev.city].filter(Boolean).join(", ");
  const details = `<p style="margin:0 0 6px"><b>${esc(ev.title)}</b></p><p style="margin:0 0 6px">${esc(when(ev, tz))}</p>`
    + (place ? `<p style="margin:0 0 6px">Event location: ${esc(place)}</p>` : "")
    + (ev.organizer_name ? `<p style="margin:0 0 6px">Hosted by ${esc(ev.organizer_name)}</p>` : "");
  const answerList = answers.filter((a) => a.answer).map((a) => `<li>${esc(a.label)}: ${esc(a.answer)}</li>`).join("");
  const messages = [{
    from: fromHost(ev), reply_to: REPLY_TO, to: [email],
    subject: waitlist ? `You're on the waitlist: ${ev.title}` : `You're signed up: ${ev.title}`,
    html: waitlist
      ? mail("Waitlist", `<p style="margin:0 0 14px">Dear ${esc(name)},</p>
      <p style="margin:0 0 14px">This event is full right now, so you are on the waitlist${attending > 1 ? ` (${attending} people)` : ""}. If a place opens up, you move up automatically and we email you straight away.</p>${details}
      <p style="margin:14px 0 0"><a href="${page}" style="color:#8a6d1f;font-weight:bold">See the event page</a></p>
      <p style="margin:14px 0 0;font-size:13px;color:#7a7368">No longer interested? <a href="${cancelUrl}" style="color:#8a6d1f">Leave the waitlist</a>.</p>`, host(ev))
      : mail("Sign-up confirmation", `<p style="margin:0 0 14px">Dear ${esc(name)},</p>
      <p style="margin:0 0 14px">Thank you for signing up${attending > 1 ? ` (${attending} people)` : ""}. Here are the details:</p>${details}
      ${/^https?:\/\//i.test(ev.donation_url || "") ? `<p style="margin:12px 0 0">${ev.price_text && !/^(free|kostenlos|gratis|frei)$/i.test(ev.price_text) ? `Suggested donation: ${esc(ev.price_text)}.` : "A donation is suggested."} <a href="${esc(ev.donation_url)}" style="color:#8a6d1f">Donate here</a></p>` : ""}
      ${ev.is_online && ev.online_url ? `<p style="margin:12px 0 0">Join online: <a href="${esc(ev.online_url)}" style="color:#8a6d1f">${esc(ev.online_url)}</a></p>` : ""}
      <p style="margin:14px 0 0"><a href="${page}" style="color:#8a6d1f;font-weight:bold">See the event page</a></p>
      <p style="margin:14px 0 0;font-size:13px;color:#7a7368">Can no longer come? <a href="${cancelUrl}" style="color:#8a6d1f">Cancel your sign-up</a> so someone else can have your place.</p>`, host(ev)),
  }];
  if (ev.user_id) {
    const { data: u } = await db.auth.admin.getUserById(ev.user_id);
    const organizer = u?.user?.email;
    if (organizer) messages.push({
      from: FROM_ADDRESS, reply_to: email, to: [organizer],
      subject: waitlist ? `New on the waitlist: ${ev.title}` : `New sign-up: ${ev.title}`,
      html: mail(waitlist ? "New on the waitlist" : "New sign-up", `<p style="margin:0 0 10px"><b>${esc(name)}</b> (${esc(email)}) ${waitlist ? "joined the waitlist" : "signed up"}${attending > 1 ? ` for ${attending} people` : ""}.</p>
        ${answerList ? `<ul style="margin:0 0 10px;padding-left:18px">${answerList}</ul>` : ""}${note ? `<p style="margin:0 0 10px">Note: ${esc(note)}</p>` : ""}
        ${details}<p style="margin:14px 0 0"><a href="${page}" style="color:#8a6d1f;font-weight:bold">See all sign-ups on the event page</a> (sign in first)</p>`),
    });
  }
  if (key) {
    try {
      const r = await fetch("https://api.resend.com/emails/batch", {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(messages),
      });
      if (r.ok) await db.from("event_signups").update({ emailed_at: new Date().toISOString() }).eq("id", row.id);
    } catch (_) { /* the sign-up is saved; the email is best effort */ }
  }
  const { data: spots } = await db.rpc("event_signup_spots", { p_event: eventId });
  return out({ ok: true, waitlist, count: spots?.count ?? null, left: spots?.left ?? null });
});
