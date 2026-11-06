// ══════════════════════════════════════════
//  Sophia Commons - Send Newsletter Edge Function
//  POST /functions/v1/send-newsletter
//  Body: { subject: string, html_content: string }
//     or { news_id: uuid }  (an approved weekly digest draft: sent once, then published)
//     or { due: true }     (server key only: emails a digest whose scheduled send_at has passed)
//  Auth: Bearer token (admin users only), or a server key for { due: true }
//  Deploy with --no-verify-jwt: the server key is not a JWT. The checks below still admit only the two callers.
// ══════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { emailShell } from "./email_shell.ts";

// Server key: the new secret key Supabase injects (SUPABASE_SECRET_KEYS, JSON by key name),
// falling back to the legacy service_role key until legacy keys are disabled.
function serviceKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (keys.default) return keys.default;
  } catch (_) { /* fall through */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
}

// Every server key that may run the scheduled send (as event-signup-manage)
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

const ADMIN_EMAILS = ["cameron.nazeri@gmail.com", "cameron@sophiacommons.org", "admin@sophiacommons.org"];  // keep in sync with sophia_commons_v9.js; prefer app_metadata.role
const CONTINUE_FROM_UTC = 14;   // a digest spread over days continues from 14:00 UTC (7 am Pacific, 10 am Eastern)
const BATCH_SIZE = 100;   // Resend batch endpoint maximum
const BATCH_DELAY_MS = 600;  // stay under 2 requests/second
const FROM_ADDRESS = "Sophia Commons <newsletter@sophiacommons.org>";
const REPLY_TO = "hello@sophiacommons.org";   // forwarded to the owner's inbox (Namecheap email forwarding)

const SITE = "https://sophiacommons.org";
const corsHeaders = {
  "Access-Control-Allow-Origin": SITE,   // was "*": only the site's admin panel calls this
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // ── Auth check ──
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return jsonResponse({ error: "Missing authorization header" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = serviceKey();
  const resendApiKey = Deno.env.get("RESEND_API_KEY");

  if (!resendApiKey) {
    return jsonResponse({ error: "RESEND_API_KEY not configured" }, 500);
  }

  // Verify the caller is the scheduler (server key) or an authenticated admin
  const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
  const token = authHeader.replace("Bearer ", "");
  const isServer = serverKeys().some((k) => same(token, k));

  if (!isServer) {
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      return jsonResponse({ error: "Invalid or expired token" }, 401);
    }

    // Admin = app_metadata.role "admin" only (same rule as the database RLS). Users cannot set
    // app_metadata themselves; an email address alone is not proof, since sign-ups can be auto-confirmed.
    const isRoleAdmin = user.app_metadata?.role === "admin";
    if (!isRoleAdmin) {
      return jsonResponse({ error: "Forbidden: admin access required" }, 403);
    }
  }

  // ── Parse request body ──
  let subject: string;
  let html_content: string;
  let newsId: string | null = null;
  let preheader = "";
  let kicker = "";
  let due = false;

  try {
    const body = await req.json();
    subject = body.subject?.trim();
    html_content = body.html_content?.trim();
    newsId = typeof body.news_id === "string" ? body.news_id : null;
    due = body.due === true;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  // The server key can only run the scheduled send, and the scheduled send only runs with it
  if (isServer !== due) return jsonResponse({ error: "Forbidden" }, 403);
  if (due) {
    // First finish a digest that is going out over several days (mornings US time, so it does not land at night)
    let pick: string | null = null;
    if (new Date().getUTCHours() >= CONTINUE_FROM_UTC) {
      const { data: going } = await supabaseClient.from("news").select("id").contains("tags", ["weekly-digest"])
        .not("emailed_at", "is", null).is("email_done_at", null).order("emailed_at").limit(1);
      pick = going?.[0]?.id ?? null;
    }
    if (!pick) {
      const { data: ready, error: dueError } = await supabaseClient.from("news").select("id")
        .eq("status", "pending").contains("tags", ["weekly-digest"]).is("emailed_at", null)
        .lte("send_at", new Date().toISOString()).order("send_at").limit(1);
      if (dueError) return jsonResponse({ error: "Could not check the schedule: " + dueError.message }, 500);
      pick = ready?.[0]?.id ?? null;
    }
    if (!pick) return jsonResponse({ message: "Nothing due", sent: 0 });
    newsId = pick;
  }

  let started = false;   // this call is the first send of the digest
  let row: Record<string, any> | null = null;
  if (newsId) {
    const { data: found, error: loadError } = await supabaseClient.from("news")
      .select("id, title, body, email_subject, excerpt, status, emailed_at, emailed_count, email_done_at")
      .eq("id", newsId).contains("tags", ["weekly-digest"]).maybeSingle();
    if (loadError) return jsonResponse({ error: "Could not load digest: " + loadError.message }, 500);
    row = found;
    if (!row || row.email_done_at) return jsonResponse({ error: "This digest was already emailed (or is not a weekly digest)." }, 409);
    if (row.emailed_at && !due) return jsonResponse({ error: "This digest is already going out; the rest follows automatically each day." }, 409);
    if (!row.emailed_at) {
      // Claim it first (emailed_at is set only if still empty), so a double click can never start it twice.
      const { data: claimed } = await supabaseClient.from("news").update({ emailed_at: new Date().toISOString() })
        .eq("id", newsId).is("emailed_at", null).select("id").maybeSingle();
      if (!claimed) return jsonResponse({ error: "This digest was already emailed (or is not a weekly digest)." }, 409);
      started = true;
    }
    subject = (row.email_subject || row.title || "").trim();
    html_content = (row.body || "").trim();
    preheader = (row.excerpt || "").trim();
    kicker = "Weekly digest \u00b7 " + subject.replace(/^.*?:\s*/, "");
  }

  if (!subject || !html_content) {
    if (started) await supabaseClient.from("news").update({ emailed_at: null }).eq("id", newsId);
    return jsonResponse({ error: "Both 'subject' and 'html_content' are required" }, 400);
  }

  // ── Fetch confirmed subscribers ──
  const { data: subscribers, error: fetchError } = await supabaseClient
    .from("newsletter_subscribers")
    .select("id, email, name, unsubscribe_token, preferences")
    .eq("confirmed", true)
    .is("unsubscribed_at", null);

  if (fetchError) {
    if (started) await supabaseClient.from("news").update({ emailed_at: null }).eq("id", newsId);
    return jsonResponse({ error: "Failed to fetch subscribers: " + fetchError.message }, 500);
  }

  if (!subscribers || subscribers.length === 0) {
    if (started) await supabaseClient.from("news").update({ emailed_at: null }).eq("id", newsId);
    return jsonResponse({ message: "No confirmed subscribers found", sent: 0, failed: 0, total: 0 });
  }

  // ── Daily limit: everyone still waiting, people who signed up themselves first ──
  let todo = subscribers;
  if (newsId) {
    const { data: done } = await supabaseClient.from("newsletter_deliveries").select("subscriber_id").eq("news_id", newsId).limit(20000);
    const have = new Set((done || []).map((d: Record<string, string>) => d.subscriber_id));
    const bulkAdded = (s: Record<string, any>) => (s.preferences?.batch ? 1 : 0);
    todo = subscribers.filter((s) => !have.has(s.id)).sort((x, y) => bulkAdded(x) - bulkAdded(y));
  }
  const { data: granted, error: quotaError } = await supabaseClient.rpc("email_quota_take", { p_want: todo.length });
  if (quotaError) {
    if (started) await supabaseClient.from("news").update({ emailed_at: null }).eq("id", newsId);
    return jsonResponse({ error: "Could not check the daily email limit: " + quotaError.message }, 500);
  }
  const allowed = Number(granted) || 0;
  if (!newsId && allowed < todo.length) {
    await supabaseClient.rpc("email_quota_note", { p_n: -allowed });
    return jsonResponse({ error: `Only ${allowed} emails are left today, and this goes to ${todo.length} people. Use the weekly digest, which spreads over several days.` }, 429);
  }
  let list = todo.slice(0, allowed);
  if (newsId && list.length) {
    // Mark them before sending: even if two runs overlap, nobody gets the digest twice
    const { data: mine } = await supabaseClient.from("newsletter_deliveries")
      .upsert(list.map((s) => ({ news_id: newsId, subscriber_id: s.id })), { onConflict: "news_id,subscriber_id", ignoreDuplicates: true })
      .select("subscriber_id");
    const ids = new Set((mine || []).map((d: Record<string, string>) => d.subscriber_id));
    const skipped = list.length - ids.size;
    list = list.filter((s) => ids.has(s.id));
    if (skipped) await supabaseClient.rpc("email_quota_note", { p_n: -skipped });
  }

  // ── Send in batches via Resend's batch endpoint (up to 100 emails per request) ──
  // The old loop sent 10 single emails per second, which exceeds Resend's default
  // 2 requests/second limit and would time out the function at roughly 1,500 subscribers.
  let sent = 0;
  let failed = 0;
  const errors: { email: string; error: string }[] = [];

  for (let i = 0; i < list.length; i += BATCH_SIZE) {
    const batch = list.slice(i, i + BATCH_SIZE);
    const payload = batch.map((subscriber) => ({
      from: FROM_ADDRESS, reply_to: REPLY_TO,
      to: [subscriber.email],
      subject: subject,
      // Every newsletter carries a one-click unsubscribe link (required by CAN-SPAM / GDPR)
      html: emailShell({ subject, preheader, kicker, body: html_content,
        unsubscribeUrl: `${SITE}/newsletter/unsubscribe?t=${subscriber.unsubscribe_token}` }),
      headers: {
        "List-Unsubscribe": `<${SITE}/newsletter/unsubscribe?t=${subscriber.unsubscribe_token}>, <mailto:hello@sophiacommons.org?subject=unsubscribe>`,
      },
    }));
    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { "Authorization": `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Resend API ${res.status}: ${await res.text()}`);
      sent += batch.length;
    } catch (e) {
      failed += batch.length;
      await supabaseClient.rpc("email_quota_note", { p_n: -batch.length });
      if (newsId) await supabaseClient.from("newsletter_deliveries").delete().eq("news_id", newsId).in("subscriber_id", batch.map((s) => s.id));
      errors.push({ email: `${batch[0].email} (+${batch.length - 1} more)`, error: (e as Error).message });
    }
    if (i + BATCH_SIZE < list.length) await sleep(BATCH_DELAY_MS);
  }
  const remaining = todo.length - sent;
  if (newsId && row) {
    // First send failed outright: release the claim so the admin can try again. Published at the first
    // success; finished once everyone has it. With no allowance left today it simply starts tomorrow.
    const update: Record<string, unknown> = {};
    if (sent === 0 && started && failed > 0) update.emailed_at = null;
    if (sent > 0) update.emailed_count = (row.emailed_count || 0) + sent;
    if (sent > 0 && row.status === "pending") { update.status = "published"; update.published_at = new Date().toISOString(); }
    if (remaining === 0) update.email_done_at = new Date().toISOString();
    if (Object.keys(update).length) await supabaseClient.from("news").update(update).eq("id", newsId);
  }
  return jsonResponse({
    message: `Newsletter: ${sent} sent, ${failed} failed, ${remaining} waiting for the next days, of ${subscribers.length} subscribers`,
    sent,
    failed,
    remaining,
    total: subscribers.length,
    errors: errors.length > 0 ? errors : undefined,
  });
});
