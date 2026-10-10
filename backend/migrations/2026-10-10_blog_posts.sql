-- =============================================================================
-- Sophia Commons: blog articles
-- 2026-10-10. Safe to run more than once.
-- Members submit articles (status 'pending'); the admin publishes or rejects them.
-- The admin's own articles may be inserted as 'published' directly.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.blog_posts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name   text NOT NULL CHECK (char_length(author_name) BETWEEN 1 AND 80),
  title         text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 200),
  slug          text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 120),
  excerpt       text CHECK (excerpt IS NULL OR char_length(excerpt) <= 400),
  body          text NOT NULL CHECK (char_length(body) BETWEEN 50 AND 60000),
  cover_url     text CHECK (cover_url IS NULL OR cover_url ~ '^https://'),
  tags          text[] NOT NULL DEFAULT '{}' CHECK (cardinality(tags) <= 8),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'rejected')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  published_at  timestamptz
);
CREATE INDEX IF NOT EXISTS blog_posts_published_idx ON public.blog_posts (status, published_at DESC);
CREATE INDEX IF NOT EXISTS blog_posts_user_idx ON public.blog_posts (user_id);

-- Non-admins can only create pending posts under their own account and cannot change status later.
CREATE OR REPLACE FUNCTION public.blog_posts_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_admin() THEN
    IF NEW.status = 'published' AND NEW.published_at IS NULL THEN NEW.published_at := now(); END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.user_id := auth.uid();
    NEW.status := 'pending';
    NEW.published_at := NULL;
  ELSE
    -- authors may edit their own pending post's text, nothing else
    IF OLD.status <> 'pending' THEN RAISE EXCEPTION 'only pending posts can be edited' USING ERRCODE = '42501'; END IF;
    NEW.user_id := OLD.user_id; NEW.status := OLD.status; NEW.published_at := OLD.published_at;
    NEW.created_at := OLD.created_at; NEW.slug := OLD.slug;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS blog_posts_guard ON public.blog_posts;
CREATE TRIGGER blog_posts_guard BEFORE INSERT OR UPDATE ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.blog_posts_guard();

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS blog_read_published ON public.blog_posts;
CREATE POLICY blog_read_published ON public.blog_posts FOR SELECT
  USING (status = 'published' OR user_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS blog_insert_own ON public.blog_posts;
CREATE POLICY blog_insert_own ON public.blog_posts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS blog_update_own_or_admin ON public.blog_posts;
CREATE POLICY blog_update_own_or_admin ON public.blog_posts FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS blog_delete_own_pending_or_admin ON public.blog_posts;
CREATE POLICY blog_delete_own_pending_or_admin ON public.blog_posts FOR DELETE TO authenticated
  USING (public.is_admin() OR (user_id = auth.uid() AND status = 'pending'));

GRANT SELECT ON public.blog_posts TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.blog_posts TO authenticated;

-- Readers' reports on a blog post go to the existing reports queue
DO $$
DECLARE def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
   WHERE conrelid = 'public.reports'::regclass AND conname = 'reports_item_type_check';
  IF def IS NOT NULL AND def NOT LIKE '%blog_post%' THEN
    EXECUTE 'ALTER TABLE public.reports DROP CONSTRAINT reports_item_type_check';
    EXECUTE 'ALTER TABLE public.reports ADD CONSTRAINT reports_item_type_check CHECK (item_type IN (' ||
      (SELECT string_agg(quote_literal(m[1]), ', ') FROM regexp_matches(def, '''([a-z_]+)''', 'g') AS m) || ', ''blog_post''))';
  END IF;
END $$;
