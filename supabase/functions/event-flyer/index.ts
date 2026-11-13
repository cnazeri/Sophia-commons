// event-flyer: reads an event flyer picture and returns the event form fields (owner, 2026-11-13).
// The organizer picks a flyer on /events/new; the form fills in what the flyer says, and the
// organizer checks every field before creating the event. Nothing is saved here.
// Deploy WITH JWT verification: only signed-in members can call it (it spends Claude API credit).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cleanFields, FLYER_SCHEMA, flyerPrompt } from "./flyer.ts";

const SITE = "https://sophiacommons.org";
const ORIGINS = [SITE, "https://www.sophiacommons.org"];
const MODEL = "claude-sonnet-5-5";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const PER_HOUR = 10;   // flyers per member per hour (per server instance; a brake, not a hard quota)

const recent = new Map<string, number[]>();

const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && (ORIGINS.includes(origin) || /--sophia-commons-6ce169\.netlify\.app$/.test(origin) || /^http:\/\/localhost:\d+$/.test(origin)) ? origin : SITE,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});

serve(async (req) => {
  const headers = { ...cors(req.headers.get("origin")), "Content-Type": "application/json" };
  const out = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return out({ error: "POST only" }, 405);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await db.auth.getUser(token);
  const uid = auth?.user?.id;
  if (!uid) return out({ error: "Please sign in first." }, 401);

  const now = Date.now();
  const mine = (recent.get(uid) ?? []).filter((t) => now - t < 3600e3);
  if (mine.length >= PER_HOUR) return out({ error: "You have read many flyers this hour. Please fill in the form by hand or try again later." }, 429);
  recent.set(uid, [...mine, now]);

  let input: { image?: unknown; timezone?: unknown };
  try { input = await req.json(); } catch { return out({ error: "Invalid request." }, 400); }
  const m = String(input.image ?? "").match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return out({ error: "Please choose a JPG, PNG or WebP picture." }, 400);
  if (m[2].length * 0.75 > MAX_IMAGE_BYTES) return out({ error: "The picture is larger than 5 MB." }, 400);
  const tz = String(input.timezone ?? "").slice(0, 64);

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return out({ error: "Reading flyers is not available right now." }, 503);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        output_config: { format: { type: "json_schema", schema: FLYER_SCHEMA } },
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } },
          { type: "text", text: flyerPrompt(new Date().toISOString().slice(0, 10), tz) },
        ] }],
      }),
    });
    if (!res.ok) return out({ error: "The flyer could not be read. Please fill in the form by hand." }, 502);
    const body = await res.json();
    const text = (body.content ?? []).filter((c: { type?: string }) => c.type === "text").map((c: { text?: string }) => c.text ?? "").join("");
    const fields = cleanFields(JSON.parse(text));
    if (!fields.title) return out({ error: "This picture does not look like an event flyer." }, 422);
    return out({ fields });
  } catch (_) {
    return out({ error: "The flyer could not be read. Please fill in the form by hand." }, 502);
  }
});
