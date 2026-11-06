// outreach-send: sends the outreach emails the owner approved for a later time (owner, 2026-11-05).
// Admin > Outreach sets status 'scheduled' and send_at; .github/workflows/outreach.yml calls this every hour
// with the server key. Each run sends at most PER_RUN emails that are due, oldest first, from hello@ through
// Resend, as plain text plus a simple HTML copy, and marks each row 'sent' or 'failed' (with the error).
// Deploy with --no-verify-jwt: only a server key is accepted (checked below), never a member's sign-in.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FROM_ADDRESS = "Cameron at Sophia Commons <hello@sophiacommons.org>";
const REPLY_TO = "hello@sophiacommons.org";
const PER_RUN = 8;   // spread out: at most this many per hourly run

type Row = Record<string, any>;

// Every server secret key Supabase injects, plus the legacy service_role key and the cron key (as event-signup-manage)
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
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// Plain text to simple HTML: paragraphs, line breaks and clickable links
function toHtml(text: string) {
  return text.split(/\n{2,}/).map((p) => "<p style=\"margin:0 0 14px\">"
    + esc(p).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>').replace(/\n/g, "<br>") + "</p>").join("");
}

serve(async (req) => {
  const out = (body: Row, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  if (req.method !== "POST") return out({ error: "POST only" }, 405);
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token || !serverKeys().some((k) => same(token, k))) return out({ error: "Not allowed." }, 403);
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return out({ error: "RESEND_API_KEY is not set." }, 500);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: due, error } = await db.from("outreach_queue").select("id")
    .eq("status", "scheduled").lte("send_at", new Date().toISOString()).order("send_at").limit(PER_RUN);
  if (error) return out({ error: error.message }, 500);

  // People who unsubscribed from the newsletter are not written to either
  const { data: unsub } = await db.from("newsletter_subscribers").select("email").not("unsubscribed_at", "is", null).limit(5000);
  const blocked = new Set((unsub || []).map((u: Row) => String(u.email).toLowerCase()));

  let sent = 0, failed = 0, skipped = 0;
  for (const { id } of (due || []) as Row[]) {
    // Claim the row first, so two runs can never send the same email twice
    const { data: claimed } = await db.from("outreach_queue").update({ status: "sending" })
      .eq("id", id).eq("status", "scheduled").select("id, to_email, subject, body").maybeSingle();
    if (!claimed) continue;
    const to = String(claimed.to_email).trim();
    if (blocked.has(to.toLowerCase())) {
      await db.from("outreach_queue").update({ status: "skipped", last_error: "address unsubscribed" }).eq("id", id);
      skipped++;
      continue;
    }
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM_ADDRESS, reply_to: REPLY_TO, to: [to], subject: claimed.subject,
          text: claimed.body, html: toHtml(claimed.body),
          headers: { "List-Unsubscribe": "<mailto:hello@sophiacommons.org?subject=unsubscribe>" } }),
      });
      if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 300)}`);
      await db.from("outreach_queue").update({ status: "sent", sent_at: new Date().toISOString(), last_error: null }).eq("id", id);
      sent++;
    } catch (err) {
      await db.from("outreach_queue").update({ status: "failed", last_error: String(err).slice(0, 500) }).eq("id", id);
      failed++;
    }
  }
  return out({ ok: true, due: (due || []).length, sent, failed, skipped });
});
