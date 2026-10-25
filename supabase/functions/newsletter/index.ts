// ══════════════════════════════════════════
//  Sophia Commons - Newsletter opt-in Edge Function
//  POST /functions/v1/newsletter
//  Body: { action: "subscribe", email, source? }   -> sends a confirmation email (source = which form)
//        { action: "confirm", token }              -> confirms the subscription
//        { action: "unsubscribe", token }          -> unsubscribes (token from any newsletter)
//        { action: "admin_add", entries: [{email, name}] } -> admins only: adds people as confirmed
//  Public endpoint (no login). Deploy with:  supabase functions deploy newsletter --no-verify-jwt
//  Secrets: RESEND_API_KEY (already used by send-newsletter)
// ══════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cleanEntries, MAX_ADD, planAdds } from "./admin-add.ts";

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
const REPLY_TO = "hello@sophiacommons.org";   // forwarded to the owner's inbox (Namecheap email forwarding)
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
  <div style="text-align:center;padding:8px 0 4px"><img src="https://sophiacommons.org/img/logo-mark.png" width="72" height="72" alt="Sophia Commons" style="border:0"><div style="font-size:22px;margin-top:6px">Sophia Commons</div></div>
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
const SOURCES = ["listing", "event", "home", "sidebar", "footer", "signup_page"];

// Which signup form was used, from a fixed list so the column never holds arbitrary input
function signupSource(s: unknown): string {
  return SOURCES.includes(String(s)) ? String(s) : "other";
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey());
  let body: { action?: string; email?: string; token?: string; source?: string };
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
      : await supabase.from("newsletter_subscribers").insert({ ...row, preferences: { source: signupSource(body.source) } });
    if (upErr) return json(req, { error: "save_failed" }, 500);

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) return json(req, { error: "email_not_configured" }, 500);
    const confirmUrl = `${SITE}/newsletter/confirm?t=${token}`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_ADDRESS, reply_to: REPLY_TO, to: [email], subject: "Confirm your Sophia Commons subscription", html: confirmEmailHtml(confirmUrl) }),
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

  if (body.action === "admin_add") return adminAdd(req, supabase, (body as { entries?: unknown }).entries);

  return json(req, { error: "unknown_action" }, 400);
});

// ── Admin: add people by hand, as confirmed (see admin-add.ts) ──
async function adminAdd(req: Request, supabase: SupabaseClient, raw: unknown) {
  // Admin = app_metadata.role "admin", same rule as send-newsletter and the database RLS
  const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const { data: { user } } = await supabase.auth.getUser(jwt);
  if (user?.app_metadata?.role !== "admin") return json(req, { error: "admins_only" }, 403);

  const { entries, invalid } = cleanEntries(raw);
  if (!entries.length) return json(req, { error: invalid.length ? "invalid_email" : "no_emails", invalid }, 400);
  if (entries.length > MAX_ADD) return json(req, { error: `at most ${MAX_ADD} at a time` }, 400);

  const { data: existing, error: readErr } = await supabase.from("newsletter_subscribers")
    .select("id, email, name, confirmed, unsubscribed_at").in("email", entries.map((e) => e.email));
  if (readErr) return json(req, { error: "save_failed" }, 500);

  const plan = planAdds(entries, existing ?? [], invalid);
  const now = new Date().toISOString();
  if (plan.inserts.length) {
    const { error } = await supabase.from("newsletter_subscribers").insert(plan.inserts.map((e) => ({
      email: e.email, name: e.name || null, confirmed: true, confirmed_at: now, preferences: { source: "admin" },
    })));
    if (error) return json(req, { error: "save_failed" }, 500);
  }
  for (const c of plan.confirms) {
    const { error } = await supabase.from("newsletter_subscribers")
      .update({ confirmed: true, confirmed_at: now, confirm_token: null, name: c.name || null }).eq("id", c.id);
    if (error) return json(req, { error: "save_failed" }, 500);
  }
  return json(req, {
    ok: true, added: plan.inserts.length + plan.confirms.length,
    already: plan.already, unsubscribed: plan.unsubscribed, invalid: plan.invalid,
  });
}
