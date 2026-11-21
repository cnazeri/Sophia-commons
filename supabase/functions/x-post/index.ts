// ══════════════════════════════════════════
//  Sophia Commons - Post to X from the Admin dashboard (owner, 2026-11-20)
//  POST /functions/v1/x-post
//  Body: { id: "<x_posts id>" }   posts that draft's exact text to @SophiaCommons7, marks it posted
//     or { check: true }          no post: confirms the X keys work (reads the account name)
//  Auth: a signed-in admin (app_metadata.role "admin"), or the server key for { check: true } and for
//        { id, auto: true } (the scheduled Friday newsletter and Monday events posts, owner rule 2026-11-20).
//  Posts go straight to the X API with the owner's own X app (OAuth 1.0a user context), no go-between.
//  Secrets: X_CONSUMER_KEY, X_CONSUMER_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET
//           (scripts/set_x_keys.sh copies them from the owner's key file).
//  Clicking "Post to X" twice in Admin is the owner's approval of the exact text shown.
//  Deployed with --no-verify-jwt so the server key can run the check; posting still needs a signed-in admin.
// ══════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SITE = "https://sophiacommons.org";
const HANDLE = "SophiaCommons7";
const X_API = "https://api.x.com/2";

const corsHeaders = {
  "Access-Control-Allow-Origin": SITE,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function serviceKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (keys.default) return keys.default;
  } catch (_) { /* fall through */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
}

function serverKeys(): string[] {
  const keys: string[] = [];
  try {
    for (const v of Object.values(JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}"))) if (typeof v === "string" && v) keys.push(v);
  } catch (_) { /* none */ }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); if (legacy) keys.push(legacy);
  return keys;
}

// ── OAuth 1.0a request signing (HMAC-SHA1), as X requires for posting as the account ──
const pct = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

async function oauthHeader(method: string, url: string, query: Record<string, string> = {}): Promise<string> {
  const ck = Deno.env.get("X_CONSUMER_KEY"), cs = Deno.env.get("X_CONSUMER_SECRET");
  const at = Deno.env.get("X_ACCESS_TOKEN"), ats = Deno.env.get("X_ACCESS_TOKEN_SECRET");
  if (!ck || !cs || !at || !ats) throw new Error("The X keys are not set in Supabase secrets (run scripts/set_x_keys.sh)");
  const oauth: Record<string, string> = {
    oauth_consumer_key: ck, oauth_nonce: crypto.randomUUID().replace(/-/g, ""), oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)), oauth_token: at, oauth_version: "1.0",
  };
  // JSON bodies are not part of the signature; query parameters are
  const all = { ...query, ...oauth };
  const params = Object.keys(all).sort().map((k) => `${pct(k)}=${pct(all[k])}`).join("&");
  const base = `${method.toUpperCase()}&${pct(url)}&${pct(params)}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(`${pct(cs)}&${pct(ats)}`),
    { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(base)));
  oauth.oauth_signature = btoa(String.fromCharCode(...sig));
  return "OAuth " + Object.keys(oauth).sort().map((k) => `${pct(k)}="${pct(oauth[k])}"`).join(", ");
}

function xError(out: any, status: number): string {
  return String(out?.detail ?? out?.title ?? out?.errors?.[0]?.message ?? `HTTP ${status}`).slice(0, 300);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey());
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  let body: { id?: string; check?: boolean; auto?: boolean } = {};
  try { body = await req.json(); } catch (_) { /* empty */ }

  const isServer = token.length > 20 && serverKeys().includes(token);
  // Server key: the no-post check, or the scheduled weekly posts (owner rule 2026-11-20: Friday newsletter
  // post goes out with the newsletter, Monday events post goes out on its own)
  if (!(isServer && (body.check || body.auto))) {
    const { data: { user } } = await sb.auth.getUser(token);
    if (!user) return json({ error: "Please sign in again" }, 401);
    if (user.app_metadata?.role !== "admin") return json({ error: "Admins only" }, 403);
  }

  try {
    if (body.check) {
      const url = `${X_API}/users/me`;
      const r = await fetch(url, { headers: { Authorization: await oauthHeader("GET", url) } });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) return json({ error: `X refused the keys: ${xError(out, r.status)}` }, 502);
      return json({ ok: true, username: out?.data?.username ?? null, access_level: r.headers.get("x-access-level") });
    }

    if (!body.id) return json({ error: "Missing draft id" }, 400);
    const { data: row } = await sb.from("x_posts").select("*").eq("id", body.id).maybeSingle();
    if (!row) return json({ error: "Draft not found" }, 404);
    if (row.status === "posted") return json({ error: "Already posted", url: row.posted_url }, 409);

    // Claim the row first so a double click cannot post twice
    const { data: claimed } = await sb.from("x_posts").update({ status: "posting" })
      .eq("id", row.id).eq("status", "draft").select("id");
    if (!claimed || !claimed.length) return json({ error: "This draft is already being posted" }, 409);

    const url = `${X_API}/tweets`;
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: await oauthHeader("POST", url), "Content-Type": "application/json" },
      body: JSON.stringify({ text: row.post }),
    });
    const out = await r.json().catch(() => ({}));
    const tid = r.ok ? out?.data?.id : null;
    if (!tid) {
      await sb.from("x_posts").update({ status: "draft" }).eq("id", row.id);
      return json({ error: `X did not accept the post: ${xError(out, r.status)}` }, 502);
    }
    const postUrl = `https://x.com/${HANDLE}/status/${tid}`;
    const posted_at = new Date().toISOString();
    await sb.from("x_posts").update({ status: "posted", posted_url: postUrl, posted_at }).eq("id", row.id);
    return json({ ok: true, url: postUrl, posted_at });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
