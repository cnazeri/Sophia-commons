// delete-account: a signed-in member deletes their own account (owner, 2026-11-21; Apple requires in-app
// account deletion for apps with sign-in). Deploy WITH JWT verification (no --no-verify-jwt).
//
// - The account is taken from the caller's own token, never from the request body.
// - The body must be {"confirm":"DELETE"} so a stray call cannot delete anything.
// - Removes the member's chat messages and releases directory entries they claimed (the entries stay listed),
//   then deletes the login. Profile, comments, blog posts, claims and blocks go with it (ON DELETE CASCADE).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SITE = "https://sophiacommons.org";
const ORIGINS = [SITE, "https://www.sophiacommons.org"];
const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ORIGINS.includes(origin) ? origin : SITE,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});

serve(async (req) => {
  const h = { ...cors(req.headers.get("origin")), "Content-Type": "application/json" };
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: h });
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return reply(405, { ok: false, error: "Use POST." });

  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return reply(401, { ok: false, error: "Please sign in first." });
    const body = await req.json().catch(() => ({}));
    if (body?.confirm !== "DELETE") return reply(400, { ok: false, error: "Deletion was not confirmed." });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });
    const { data: who, error: whoErr } = await admin.auth.getUser(token);
    if (whoErr || !who?.user) return reply(401, { ok: false, error: "Your sign-in has expired. Please sign in again." });
    const uid = who.user.id;

    const msgs = await admin.from("chat_messages").delete().eq("user_id", uid);
    if (msgs.error) throw new Error("chat: " + msgs.error.message);
    const dir = await admin.from("directory_entries").update({ claimed_by: null }).eq("claimed_by", uid);
    if (dir.error) throw new Error("directory: " + dir.error.message);
    const del = await admin.auth.admin.deleteUser(uid);
    if (del.error) throw new Error("account: " + del.error.message);

    console.log("delete-account: deleted", uid);
    return reply(200, { ok: true });
  } catch (e) {
    console.error("delete-account failed:", e);
    return reply(500, { ok: false, error: "Your account could not be deleted. Please email hello@sophiacommons.org." });
  }
});
