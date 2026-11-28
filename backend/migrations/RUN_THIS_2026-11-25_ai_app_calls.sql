-- AI app usage log (owner, 2026-11-25): one row per tool call from ChatGPT, Claude or another MCP client
-- at https://sophiacommons.org/mcp. Stores the tool, which assistant, the search words (max 300 chars),
-- how many results and how long it took. No IP address, no user account, nothing personal.
-- Run once in the Supabase SQL editor. Safe to run again.

CREATE TABLE IF NOT EXISTS public.ai_app_calls (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at    timestamptz NOT NULL DEFAULT now(),
  tool          text        NOT NULL CHECK (char_length(tool) <= 40),
  source        text        NOT NULL CHECK (source IN ('chatgpt', 'claude', 'mcp')),
  args          text        CHECK (char_length(args) <= 300),
  result_count  int         CHECK (result_count >= 0 AND result_count <= 10000),
  ms            int         CHECK (ms >= 0 AND ms <= 600000),
  error         text        CHECK (error IN ('input', 'server'))
);

CREATE INDEX IF NOT EXISTS idx_ai_app_calls_created ON public.ai_app_calls (created_at DESC);

ALTER TABLE public.ai_app_calls ENABLE ROW LEVEL SECURITY;

-- The MCP server writes with the public key: insert only, never read, update or delete
DROP POLICY IF EXISTS "ai app calls: public insert" ON public.ai_app_calls;
CREATE POLICY "ai app calls: public insert" ON public.ai_app_calls
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Only admins can read the log (Admin > AI app)
DROP POLICY IF EXISTS "ai app calls: admin read" ON public.ai_app_calls;
CREATE POLICY "ai app calls: admin read" ON public.ai_app_calls
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- Keep 18 months: delete older rows (run by hand or from a scheduled job)
-- DELETE FROM public.ai_app_calls WHERE created_at < now() - interval '18 months';
