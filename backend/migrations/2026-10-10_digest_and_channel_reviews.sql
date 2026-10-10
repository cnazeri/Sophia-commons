-- =============================================================================
-- Sophia Commons: weekly email digest + YouTube channel details and reviews
-- 2026-10-10. Safe to run more than once.
-- =============================================================================

-- 1. YouTube: video descriptions (for the digest) and channel details (avatar, subscribers).
ALTER TABLE public.youtube_videos   ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.youtube_channels ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.youtube_channels ADD COLUMN IF NOT EXISTS subscriber_count integer;
ALTER TABLE public.youtube_channels ADD COLUMN IF NOT EXISTS subscriber_text text;
ALTER TABLE public.youtube_channels ADD COLUMN IF NOT EXISTS total_videos integer;
ALTER TABLE public.youtube_channels ADD COLUMN IF NOT EXISTS details_at timestamptz;

-- The site reads channels through this view; add the new columns at the end (CREATE OR REPLACE
-- VIEW may only append columns).
CREATE OR REPLACE VIEW public.youtube_channel_latest AS
SELECT c.slug, c.name, c.url AS channel_url, c.language, c.category, c.description, c.verified,
       c.thumbnail_url AS channel_thumbnail,
       v.video_id, v.title AS video_title, v.url AS video_url, v.thumbnail_url AS video_thumbnail, v.published_at,
       c.avatar_url, c.subscriber_count, c.subscriber_text, c.total_videos
  FROM public.youtube_channels c
  LEFT JOIN LATERAL (
    SELECT v_1.video_id, v_1.title, v_1.url, v_1.thumbnail_url, v_1.published_at
      FROM public.youtube_videos v_1
     WHERE v_1.channel_slug = c.slug
     ORDER BY v_1.published_at DESC NULLS LAST
     LIMIT 1) v ON true
 WHERE c.active = true;

-- 2. NEWS: remember when a weekly digest was emailed, so it can never be sent twice.
ALTER TABLE public.news ADD COLUMN IF NOT EXISTS emailed_at timestamptz;
ALTER TABLE public.news ADD COLUMN IF NOT EXISTS emailed_count integer;
ALTER TABLE public.news ADD COLUMN IF NOT EXISTS email_subject text;

-- 3. CHANNEL REVIEWS: one star rating (1-5) plus an optional comment per member per channel.
CREATE TABLE IF NOT EXISTS public.channel_reviews (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_slug text NOT NULL REFERENCES public.youtube_channels(slug) ON DELETE CASCADE,
  user_id      uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating       smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment      text CHECK (comment IS NULL OR char_length(comment) <= 1000),
  is_hidden    boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_slug, user_id)
);
CREATE INDEX IF NOT EXISTS channel_reviews_slug_idx ON public.channel_reviews (channel_slug);

-- Members cannot unhide a review an admin hid, or move it to someone else.
CREATE OR REPLACE FUNCTION public.channel_reviews_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.user_id := OLD.user_id;
    NEW.channel_slug := OLD.channel_slug;
    NEW.created_at := OLD.created_at;
    IF NOT public.is_admin() THEN NEW.is_hidden := OLD.is_hidden; END IF;
  ELSIF NOT public.is_admin() THEN
    NEW.is_hidden := false;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS channel_reviews_guard ON public.channel_reviews;
CREATE TRIGGER channel_reviews_guard BEFORE INSERT OR UPDATE ON public.channel_reviews
  FOR EACH ROW EXECUTE FUNCTION public.channel_reviews_guard();

ALTER TABLE public.channel_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "channel_reviews: public read" ON public.channel_reviews;
DROP POLICY IF EXISTS "channel_reviews: own insert"  ON public.channel_reviews;
DROP POLICY IF EXISTS "channel_reviews: own update"  ON public.channel_reviews;
DROP POLICY IF EXISTS "channel_reviews: own delete"  ON public.channel_reviews;
DROP POLICY IF EXISTS "channel_reviews: admin all"   ON public.channel_reviews;
CREATE POLICY "channel_reviews: public read" ON public.channel_reviews FOR SELECT
  USING (is_hidden = false OR user_id = auth.uid() OR public.is_admin());
CREATE POLICY "channel_reviews: own insert" ON public.channel_reviews FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "channel_reviews: own update" ON public.channel_reviews FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "channel_reviews: own delete" ON public.channel_reviews FOR DELETE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "channel_reviews: admin all" ON public.channel_reviews FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT ON public.channel_reviews TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.channel_reviews TO authenticated;

-- Average and count per channel (visible reviews only; RLS applies through security_invoker).
CREATE OR REPLACE VIEW public.channel_rating_summary WITH (security_invoker = true) AS
SELECT channel_slug, round(avg(rating)::numeric, 1) AS avg_rating, count(*)::int AS review_count
  FROM public.channel_reviews
 WHERE is_hidden = false
 GROUP BY channel_slug;
GRANT SELECT ON public.channel_rating_summary TO anon, authenticated;

-- 4. REPORTS: allow reporting a channel review.
ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_item_type_check;
ALTER TABLE public.reports ADD CONSTRAINT reports_item_type_check
  CHECK (item_type = ANY (ARRAY['listing', 'event', 'news', 'directory', 'channel_review']));
