-- =============================================================================
-- Sophia Commons :: Facebook pages and groups
-- Run once in Supabase Dashboard -> SQL Editor (idempotent; safe to re-run).
--
-- Tables
--   facebook_pages          curated Facebook pages and groups (anthroposophy, Waldorf,
--                           biodynamic, ...). Loaded by scripts/load_facebook_pages.py.
--   facebook_pages_pending  suggestions from visitors, approved by admin
--   directory_entries.facebook_url   the listing's own Facebook page, shown on its listing
--
-- Access (same model as youtube_channels)
--   anon / public: read active rows; insert a suggestion (facebook.com URLs only)
--   admin (app_metadata.role = 'admin'): full write
--   service role (local scripts): bypasses RLS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.facebook_pages (
  slug             text        PRIMARY KEY,
  name             text        NOT NULL,
  url              text        NOT NULL,
  kind             text        NOT NULL DEFAULT 'page' CHECK (kind IN ('page','group')),
  category         text        NOT NULL DEFAULT 'other',
  language         text,
  country          text,
  description      text,
  members_text     text,
  avatar_url       text,
  listing_id       uuid        REFERENCES public.directory_entries (id) ON DELETE SET NULL,
  listing_count    integer     NOT NULL DEFAULT 0,   -- how many listings link to this page
  verified         boolean     NOT NULL DEFAULT false,
  active           boolean     NOT NULL DEFAULT true,
  source           text,                             -- website-scan | curated | visitor
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_facebook_pages_url ON public.facebook_pages (lower(url));
CREATE INDEX IF NOT EXISTS idx_facebook_pages_category  ON public.facebook_pages (category);

CREATE TABLE IF NOT EXISTS public.facebook_pages_pending (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  url              text        NOT NULL,
  note             text,
  source           text        NOT NULL DEFAULT 'visitor',
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','approved','rejected')),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_facebook_pending_url ON public.facebook_pages_pending (lower(url));

ALTER TABLE public.directory_entries ADD COLUMN IF NOT EXISTS facebook_url text;

-- updated_at trigger (set_updated_at() already exists in this project's schema.sql)
DROP TRIGGER IF EXISTS trg_facebook_pages_updated_at ON public.facebook_pages;
CREATE TRIGGER trg_facebook_pages_updated_at
  BEFORE UPDATE ON public.facebook_pages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Row Level Security ──────────────────────────────────────────────────────
ALTER TABLE public.facebook_pages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facebook_pages_pending ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fb pages: public read active" ON public.facebook_pages;
CREATE POLICY "fb pages: public read active" ON public.facebook_pages
  FOR SELECT USING (active = true OR public.is_admin());

DROP POLICY IF EXISTS "fb pages: admin write" ON public.facebook_pages;
CREATE POLICY "fb pages: admin write" ON public.facebook_pages
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Anyone may suggest a page or group (only facebook.com URLs); only admins can see / moderate.
DROP POLICY IF EXISTS "fb pending: anyone suggest" ON public.facebook_pages_pending;
CREATE POLICY "fb pending: anyone suggest" ON public.facebook_pages_pending
  FOR INSERT TO anon, authenticated
  WITH CHECK (status = 'pending' AND source = 'visitor'
              AND url ~* '^https://(www\.|m\.)?facebook\.com/'
              AND length(url) <= 300 AND coalesce(length(note), 0) <= 1000);

DROP POLICY IF EXISTS "fb pending: admin all" ON public.facebook_pages_pending;
CREATE POLICY "fb pending: admin all" ON public.facebook_pages_pending
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT ON public.facebook_pages TO anon, authenticated;
GRANT INSERT ON public.facebook_pages_pending TO anon, authenticated;
