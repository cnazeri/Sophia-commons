// ══════════════════════════════════════════
//  Sophia Commons - Send Newsletter Edge Function
//  POST /functions/v1/send-newsletter
//  Body: { subject: string, html_content: string }
//     or { news_id: uuid }  (an approved weekly digest draft: sent once, then published)
//  Auth: Bearer token (admin users only)
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

const ADMIN_EMAILS = ["cameron.nazeri@gmail.com", "cameron@sophiacommons.org", "admin@sophiacommons.org"];  // keep in sync with sophia_commons_v9.js; prefer app_metadata.role
const BATCH_SIZE = 100;   // Resend batch endpoint maximum
const BATCH_DELAY_MS = 600;  // stay under 2 requests/second
const FROM_ADDRESS = "Sophia Commons <newsletter@sophiacommons.org>";

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

function unsubscribeFooter(token: string) {
  return `<p style="margin-top:32px;padding-top:12px;border-top:1px solid #E8E2DA;font-size:12px;color:#6F665B;font-family:Arial,sans-serif">
You're receiving this because you subscribed at sophiacommons.org.
<a href="${SITE}/newsletter/unsubscribe?t=${token}" style="color:#7F6116">Unsubscribe</a></p>`;
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

  // Verify the caller is an authenticated admin
  const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

  if (authError || !user) {
    return jsonResponse({ error: "Invalid or expired token" }, 401);
  }

  // Admin = app_metadata.role "admin" (same rule as the database RLS), or a listed address
  // that has actually been confirmed (an unconfirmed sign-up with an admin address is refused).
  const isRoleAdmin = user.app_metadata?.role === "admin";
  const isListedAdmin = !!user.email && ADMIN_EMAILS.includes(user.email.toLowerCase()) && !!user.email_confirmed_at;
  if (!isRoleAdmin && !isListedAdmin) {
    return jsonResponse({ error: "Forbidden: admin access required" }, 403);
  }

  // ── Parse request body ──
  let subject: string;
  let html_content: string;
  let newsId: string | null = null;

  try {
    const body = await req.json();
    subject = body.subject?.trim();
    html_content = body.html_content?.trim();
    newsId = typeof body.news_id === "string" ? body.news_id : null;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  if (newsId) {
    // Claim the digest first (emailed_at is set only if still empty), so a double click or a
    // retry can never email subscribers twice.
    const { data: claimed, error: claimError } = await supabaseClient.from("news")
      .update({ emailed_at: new Date().toISOString() })
      .eq("id", newsId).is("emailed_at", null).contains("tags", ["weekly-digest"])
      .select("id, title, body, email_subject").maybeSingle();
    if (claimError) return jsonResponse({ error: "Could not load digest: " + claimError.message }, 500);
    if (!claimed) return jsonResponse({ error: "This digest was already emailed (or is not a weekly digest)." }, 409);
    subject = (claimed.email_subject || claimed.title || "").trim();
    html_content = (claimed.body || "").trim();
  }

  if (!subject || !html_content) {
    if (newsId) await supabaseClient.from("news").update({ emailed_at: null }).eq("id", newsId);
    return jsonResponse({ error: "Both 'subject' and 'html_content' are required" }, 400);
  }

  // ── Fetch confirmed subscribers ──
  const { data: subscribers, error: fetchError } = await supabaseClient
    .from("newsletter_subscribers")
    .select("id, email, name, unsubscribe_token")
    .eq("confirmed", true)
    .is("unsubscribed_at", null);

  if (fetchError) {
    if (newsId) await supabaseClient.from("news").update({ emailed_at: null }).eq("id", newsId);
    return jsonResponse({ error: "Failed to fetch subscribers: " + fetchError.message }, 500);
  }

  if (!subscribers || subscribers.length === 0) {
    if (newsId) await supabaseClient.from("news").update({ emailed_at: null }).eq("id", newsId);
    return jsonResponse({ message: "No confirmed subscribers found", sent: 0, failed: 0, total: 0 });
  }

  // ── Send in batches via Resend's batch endpoint (up to 100 emails per request) ──
  // The old loop sent 10 single emails per second, which exceeds Resend's default
  // 2 requests/second limit and would time out the function at roughly 1,500 subscribers.
  let sent = 0;
  let failed = 0;
  const errors: { email: string; error: string }[] = [];

  for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
    const batch = subscribers.slice(i, i + BATCH_SIZE);
    const payload = batch.map((subscriber) => ({
      from: FROM_ADDRESS,
      to: [subscriber.email],
      subject: subject,
      // Every newsletter carries a one-click unsubscribe link (required by CAN-SPAM / GDPR)
      html: html_content + unsubscribeFooter(subscriber.unsubscribe_token),
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
      errors.push({ email: `${batch[0].email} (+${batch.length - 1} more)`, error: (e as Error).message });
    }
    if (i + BATCH_SIZE < subscribers.length) await sleep(BATCH_DELAY_MS);
  }
  if (newsId) {
    // Nothing went out: release the claim so the admin can try again. Otherwise publish it.
    const done = sent === 0
      ? { emailed_at: null }
      : { emailed_count: sent, status: "published", published_at: new Date().toISOString() };
    await supabaseClient.from("news").update(done).eq("id", newsId);
  }
  return jsonResponse({
    message: `Newsletter sent: ${sent} succeeded, ${failed} failed out of ${subscribers.length} subscribers`,
    sent,
    failed,
    total: subscribers.length,
    errors: errors.length > 0 ? errors : undefined,
  });
});
