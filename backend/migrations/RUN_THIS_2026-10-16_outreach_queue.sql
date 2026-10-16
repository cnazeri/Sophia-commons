-- =============================================================================
-- Sophia Commons :: Outreach queue (Admin > Outreach)
-- Run once in Supabase Dashboard -> SQL Editor (idempotent; safe to re-run).
--
-- Holds "please check your listing" emails waiting to be sent by hand. Nothing in the
-- site or any function sends these: the admin opens each one in their own mail account,
-- then marks it sent or skipped. Admin only; the public cannot read or write it.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.outreach_queue (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id     uuid        REFERENCES public.directory_entries (id) ON DELETE SET NULL,
  to_email     text        NOT NULL,
  organization text,
  country      text,
  category     text,
  language     text        NOT NULL DEFAULT 'en',
  subject      text        NOT NULL,
  body         text        NOT NULL,
  batch        text,
  status       text        NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','skipped')),
  sent_at      timestamptz,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_outreach_email_batch ON public.outreach_queue (lower(to_email), batch);
CREATE INDEX IF NOT EXISTS idx_outreach_status ON public.outreach_queue (status, created_at);

ALTER TABLE public.outreach_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "outreach: admin all" ON public.outreach_queue;
CREATE POLICY "outreach: admin all" ON public.outreach_queue
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

REVOKE ALL ON public.outreach_queue FROM anon;
