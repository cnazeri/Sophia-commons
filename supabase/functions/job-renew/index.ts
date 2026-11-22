// job-renew: job posts last 90 days, then the poster renews them in the app (owner, 2026-11-22).
//   remind   a server key (daily GitHub workflow, reminders.yml): emails each member whose live job post ends in the
//            next 7 days, once per term (listings.renew_reminded_at). Renewing in the app clears it for the next term.
// Renewal itself happens in the app (Post > My posts > Renew), as the member, under the listings_guard_member rule
// (at most 90 days from the day of renewal). Deploy with --no-verify-jwt.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SITE = "https://sophiacommons.org";
const FROM_ADDRESS = "Sophia Commons <hello@sophiacommons.org>";
const REPLY_TO = "hello@sophiacommons.org";
const JOBS_CAT_ID = 11;
const REMIND_DAYS = 7;
const MAX_PER_RUN = 200;

type Row = Record<string, any>;
type Mail = { from: string; reply_to: string; to: string[]; subject: string; html: string };

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Every server secret key Supabase injects, plus the legacy service_role key and the cron key (as event-follow)
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

function mail(title: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#FDFBF7;font-family:Georgia,serif;color:#2d2a26">
<div style="max-width:560px;margin:0 auto;padding:28px 22px">
<div style="font-size:13px;color:#7a7368;margin-bottom:20px">${esc(title)}</div>
<div style="background:#fff;border:1px solid #ece6da;border-radius:10px;padding:22px;font-size:15px;line-height:1.55">${body}</div>
<div style="font-size:12px;color:#7a7368;margin-top:16px">Sophia Commons, the anthroposophical directory and calendar: <a href="${SITE}" style="color:#8a6d1f">sophiacommons.org</a><br>
You get this email because you posted this job on Sophia Commons.</div></div></body></html>`;
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

async function remind(db: any): Promise<Row> {
  const now = new Date(), until = new Date(Date.now() + REMIND_DAYS * 864e5);
  const { data: jobs, error } = await db.from("listings").select("id, title, user_id, expires_at")
    .eq("category_id", JOBS_CAT_ID).eq("status", "active").contains("tags", ["member"]).is("renew_reminded_at", null)
    .gt("expires_at", now.toISOString()).lte("expires_at", until.toISOString()).limit(MAX_PER_RUN);
  if (error) throw new Error(error.message);
  const messages: Mail[] = [], ids: string[] = [];
  for (const j of (jobs || []) as Row[]) {
    const { data: u } = await db.auth.admin.getUserById(j.user_id);
    const to = u?.user?.email;
    if (!to) continue;
    const ends = new Date(j.expires_at).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
    messages.push({ from: FROM_ADDRESS, reply_to: REPLY_TO, to: [to], subject: `Your job post ends ${ends}: ${j.title}`.slice(0, 180),
      html: mail("Your job post ends soon", `<p style="margin:0 0 12px">Your job post <strong>${esc(j.title)}</strong> on Sophia Commons ends on <strong>${esc(ends)}</strong>. Job posts stay up for 90 days.</p>
<p style="margin:0 0 12px">If the position is still open, renew it for another 90 days in the Sophia Commons app: tap <strong>Post</strong>, then <strong>My posts</strong>, then <strong>Renew</strong>.</p>
<p style="margin:0">If it has been filled, there is nothing to do: the post comes down by itself. Questions? Just reply to this email.</p>`) });
    ids.push(j.id);
  }
  const sent = await send(messages);
  // Mark only when everything went out, so a failed send is tried again tomorrow
  if (ids.length && sent === messages.length) await db.from("listings").update({ renew_reminded_at: now.toISOString() }).in("id", ids);
  return { ok: true, due: (jobs || []).length, emailed: sent };
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
    console.error("job-renew", String(e));
    return out({ error: "Something went wrong." }, 500);
  }
});
