// ══════════════════════════════════════════
//  Sophia Commons - Send Newsletter Edge Function
//  POST /functions/v1/send-newsletter
//  Body: { subject: string, html_content: string }
//  Auth: Bearer token (admin users only)
// ══════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ADMIN_EMAILS = ["cameron@sophiacommons.org", "admin@sophiacommons.org"];
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 1000; // 1 second between batches to respect Resend rate limits
const FROM_ADDRESS = "Sophia Commons <newsletter@sophiacommons.org>";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
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
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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

  if (!user.email || !ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    return jsonResponse({ error: "Forbidden: admin access required" }, 403);
  }

  // ── Parse request body ──
  let subject: string;
  let html_content: string;

  try {
    const body = await req.json();
    subject = body.subject?.trim();
    html_content = body.html_content?.trim();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  if (!subject || !html_content) {
    return jsonResponse({ error: "Both 'subject' and 'html_content' are required" }, 400);
  }

  // ── Fetch confirmed subscribers ──
  const { data: subscribers, error: fetchError } = await supabaseClient
    .from("newsletter_subscribers")
    .select("id, email, name")
    .eq("confirmed", true);

  if (fetchError) {
    return jsonResponse({ error: "Failed to fetch subscribers: " + fetchError.message }, 500);
  }

  if (!subscribers || subscribers.length === 0) {
    return jsonResponse({ message: "No confirmed subscribers found", sent: 0, failed: 0, total: 0 });
  }

  // ── Send emails in batches ──
  let sent = 0;
  let failed = 0;
  const errors: { email: string; error: string }[] = [];

  for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
    const batch = subscribers.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(async (subscriber) => {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: FROM_ADDRESS,
            to: [subscriber.email],
            subject: subject,
            html: html_content,
          }),
        });

        if (!res.ok) {
          const errBody = await res.text();
          throw new Error(`Resend API ${res.status}: ${errBody}`);
        }

        return subscriber.email;
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        sent++;
      } else {
        failed++;
        errors.push({
          email: batch[results.indexOf(result)]?.email || "unknown",
          error: result.reason?.message || "Unknown error",
        });
      }
    }

    // Rate limit delay between batches (skip after last batch)
    if (i + BATCH_SIZE < subscribers.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return jsonResponse({
    message: `Newsletter sent: ${sent} succeeded, ${failed} failed out of ${subscribers.length} subscribers`,
    sent,
    failed,
    total: subscribers.length,
    errors: errors.length > 0 ? errors : undefined,
  });
});
