-- =============================================================================
-- Sophia Commons :: Featured social media post (top of Social Media on Podcasts & Media)
-- Run once in Supabase Dashboard -> SQL Editor (idempotent; safe to re-run).
--
-- The admin picks a post in Admin > Featured post. The newest active row is shown on the site;
-- older rows stay as history and can be featured again. Until a row exists the site shows a
-- "Page of the day" from facebook_pages instead.
--
-- Access
--   anon / public: read active rows
--   admin (app_metadata.role = 'admin'): full write
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.featured_posts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  platform    text        NOT NULL DEFAULT 'facebook'
                          CHECK (platform IN ('facebook','instagram','telegram','other')),
  url         text        NOT NULL CHECK (url ~* '^https://' AND length(url) <= 500),
  excerpt     text        CHECK (excerpt IS NULL OR length(excerpt) <= 800),
  image_url   text        CHECK (image_url IS NULL OR (image_url ~* '^https://' AND length(image_url) <= 500)),
  page_name   text        CHECK (page_name IS NULL OR length(page_name) <= 200),
  active      boolean     NOT NULL DEFAULT true,
  created_by  uuid        DEFAULT auth.uid(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_featured_posts_active ON public.featured_posts (active, created_at DESC);

ALTER TABLE public.featured_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "featured posts: public read active" ON public.featured_posts;
CREATE POLICY "featured posts: public read active" ON public.featured_posts
  FOR SELECT USING (active = true OR public.is_admin());

DROP POLICY IF EXISTS "featured posts: admin write" ON public.featured_posts;
CREATE POLICY "featured posts: admin write" ON public.featured_posts
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT ON public.featured_posts TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.featured_posts TO authenticated;

-- Check: the table exists and is empty or has your posts (expect a count)
SELECT count(*) AS featured_posts FROM public.featured_posts;
