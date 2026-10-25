-- =============================================================================
-- Sophia Commons :: Book of the week, chosen by the admin (home page)
-- Run once in Supabase Dashboard -> SQL Editor (idempotent; safe to re-run).
--
-- Admin > Book of the week shows three recommendations from the Rudolf Steiner Bookstore for this
-- week or next week; picking one saves a row here for that week (Monday, UTC). The home page shows
-- the pick for the current week, or the first recommendation when there is none.
--
-- Access
--   anon / public: read
--   admin (app_metadata.role = 'admin'): full write
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.book_picks (
  week_start  date        PRIMARY KEY,   -- the Monday the week starts (UTC)
  name        text        NOT NULL CHECK (length(name) <= 300),
  url         text        NOT NULL CHECK (url ~* '^https://rudolfsteinerbookstore\.com/' AND length(url) <= 500),
  image       text        CHECK (image IS NULL OR (image ~* '^https://' AND length(image) <= 500)),
  price       text        CHECK (price IS NULL OR length(price) <= 30),
  section     text        CHECK (section IS NULL OR length(section) <= 100),
  blurb       text        CHECK (blurb IS NULL OR length(blurb) <= 400),
  picked_by   uuid        DEFAULT auth.uid(),
  picked_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.book_picks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "book picks: public read" ON public.book_picks;
CREATE POLICY "book picks: public read" ON public.book_picks
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "book picks: admin write" ON public.book_picks;
CREATE POLICY "book picks: admin write" ON public.book_picks
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT ON public.book_picks TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.book_picks TO authenticated;

-- Check: the table exists (expect a count, 0 at first)
SELECT count(*) AS book_picks FROM public.book_picks;
