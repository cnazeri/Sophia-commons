// ══════════════════════════════════════════
//  Sophia Commons - Newsletter opt-in Edge Function
//  POST /functions/v1/newsletter
//  Body: { action: "subscribe", email }            -> sends a confirmation email
//        { action: "confirm", token }              -> confirms the subscription
//        { action: "unsubscribe", token }          -> unsubscribes (token from any newsletter)
//  Public endpoint (no login). Deploy with:  supabase functions deploy newsletter --no-verify-jwt
//  Secrets: RESEND_API_KEY (already used by send-newsletter)
// ══════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Server key: the new secret key Supabase injects (SUPABASE_SECRET_KEYS, JSON by key name),
// falling back to the legacy service_role key until legacy keys are disabled.
function serviceKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (keys.default) return keys.default;
  } catch (_) { /* fall through */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
}

const SITE = "https://sophiacommons.org";
const FROM_ADDRESS = "Sophia Commons <newsletter@sophiacommons.org>";
const RESEND_COOLDOWN_MIN = 60; // don't send another confirmation to the same address within an hour
const ALLOWED_ORIGINS = [SITE, "https://www.sophiacommons.org", "http://localhost:8080"];

function cors(req: Request) {
  const origin = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : SITE,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(req: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function confirmEmailHtml(confirmUrl: string) {
  return `<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;color:#1E1810;line-height:1.6">
  <h2 style="font-weight:600">Please confirm your subscription</h2>
  <p>Someone (hopefully you) asked to receive the Sophia Commons newsletter at this address.</p>
  <p><a href="${confirmUrl}" style="display:inline-block;background:#C9A035;color:#1E1810;padding:10px 22px;border-radius:50px;text-decoration:none;font-family:Arial,sans-serif;font-weight:bold">Yes, subscribe me</a></p>
  <p style="color:#6F665B;font-size:13px">If you didn't ask for this, ignore this email and you won't hear from us.</p>
</div>`;
}

// Site-wide brake on confirmation emails: at most this many per window, counted in the database
// (function instances are short-lived, so an in-memory counter would not hold).
const CONFIRM_EMAILS_PER_WINDOW = 30;
const CONFIRM_WINDOW_MS = 10 * 60000;   // 10 minutes

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey());
  let body: { action?: string; email?: string; token?: string };
  try { body = await req.json(); } catch { return json(req, { error: "Invalid JSON" }, 400); }

  // ── Subscribe: create or refresh a pending row, email a confirmation link ──
  if (body.action === "subscribe") {
    const email = String(body.email || "").trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) return json(req, { error: "invalid_email" }, 400);

    const { data: existing } = await supabase.from("newsletter_subscribers")
      .select("id, confirmed, confirm_token, confirm_sent_at, unsubscribed_at").eq("email", email).maybeSingle();

    // Same response whether or not the address is already subscribed (no account enumeration)
    if (existing?.confirmed && !existing.unsubscribed_at) return json(req, { ok: true, status: "pending_confirmation" });

    if (existing?.confirm_sent_at && Date.now() - new Date(existing.confirm_sent_at).getTime() < RESEND_COOLDOWN_MIN * 60000) {
      return json(req, { ok: true, status: "pending_confirmation" });
    }

    const since = new Date(Date.now() - CONFIRM_WINDOW_MS).toISOString();
    const { count: recent } = await supabase.from("newsletter_subscribers")
      .select("id", { count: "exact", head: true }).gte("confirm_sent_at", since);
    if ((recent ?? 0) >= CONFIRM_EMAILS_PER_WINDOW) return json(req, { error: "too_many_requests" }, 429);

    const token = crypto.randomUUID();
    const row = { email, confirmed: false, confirm_token: token, confirm_sent_at: new Date().toISOString(), unsubscribed_at: null };
    const { error: upErr } = existing
      ? await supabase.from("newsletter_subscribers").update(row).eq("id", existing.id)
      : await supabase.from("newsletter_subscribers").insert(row);
    if (upErr) return json(req, { error: "save_failed" }, 500);

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) return json(req, { error: "email_not_configured" }, 500);
    const confirmUrl = `${SITE}/newsletter/confirm?t=${token}`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_ADDRESS, to: [email], subject: "Confirm your Sophia Commons subscription", html: confirmEmailHtml(confirmUrl) }),
    });
    if (!res.ok) return json(req, { error: "send_failed" }, 502);
    return json(req, { ok: true, status: "pending_confirmation" });
  }

  // ── Confirm / Unsubscribe by token ──
  if (body.action === "confirm" || body.action === "unsubscribe") {
    const token = String(body.token || "");
    if (!UUID_RE.test(token)) return json(req, { error: "invalid_token" }, 400);
    if (body.action === "confirm") {
      const { data, error } = await supabase.from("newsletter_subscribers")
        .update({ confirmed: true, confirmed_at: new Date().toISOString(), confirm_token: null, unsubscribed_at: null })
        .eq("confirm_token", token).select("id");
      if (error) return json(req, { error: "save_failed" }, 500);
      if (!data || !data.length) return json(req, { error: "unknown_token" }, 404);
      return json(req, { ok: true, status: "confirmed" });
    }
    const { data, error } = await supabase.from("newsletter_subscribers")
      .update({ confirmed: false, unsubscribed_at: new Date().toISOString() })
      .eq("unsubscribe_token", token).select("id");
    if (error) return json(req, { error: "save_failed" }, 500);
    if (!data || !data.length) return json(req, { error: "unknown_token" }, 404);
    return json(req, { ok: true, status: "unsubscribed" });
  }

  return json(req, { error: "unknown_action" }, 400);
});
