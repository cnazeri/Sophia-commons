-- READY TO RUN: identical to 2026-09-27_security_and_moderation_fixes.sql, with step 12 (admin role) switched on.
-- =============================================================================
-- Sophia Commons: security + moderation fixes (v1.8.0)
-- 2026-09-27
--
-- REVIEW BEFORE RUNNING. Check first: sophia_crawler.py and any import scripts must use the
-- service_role key (not a user login), because user inserts into events/directory_entries
-- are now forced to status = 'pending'. Written against backend/schema.sql + rls_policies.sql.
-- The live database may differ, so every step is guarded (IF EXISTS / DROP ... IF EXISTS).
-- Run in the Supabase SQL editor as one transaction. Take a backup first
-- (Database > Backups) or run on a branch.
--
-- What this fixes (all confirmed against the live site on 2026-09-27 unless noted):
--   1. Comments never load: get_comments_with_votes() joins auth.users without
--      SECURITY DEFINER -> "permission denied for table users". Also leaked email prefixes.
--   2. Any signed-in user could self-publish events and directory entries (and set
--      is_verified = true) because INSERT policies only checked user_id.
--   3. Event moderation queue was dead: 'pending' / 'rejected' not allowed by the CHECK.
--   4. News authors could publish their own posts (UPDATE had no status check).
--   5. Admin inserts (approving a listing, publishing the weekly digest) were blocked
--      once the policies above are tightened, so admin INSERT policies are added.
--   6. steiner_books had no RLS in the repo schema (unverified live).
--   7. Chat: anyone could post as any user_id, and nobody could delete their own message.
--   8. page_views (session ids, referrers, device info) is readable by anonymous visitors.
--   9. SECURITY DEFINER functions without a pinned search_path.
--  10. view_logs table used by the app does not exist (404s in the console).
--  11. Newsletter: double opt-in and unsubscribe tokens (pairs with functions/newsletter).
-- =============================================================================

BEGIN;

-- ── 1. Comments RPC: definer rights, usernames from profiles, total vote score ──
-- Drop first: the live function may have a different return shape, which REPLACE can't change
DROP FUNCTION IF EXISTS public.get_comments_with_votes(text, uuid, uuid);
CREATE FUNCTION public.get_comments_with_votes(
  p_post_type text,
  p_post_id   uuid,
  p_user_id   uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid, parent_id uuid, user_id uuid, username text, content text,
  is_edited boolean, is_deleted boolean, created_at timestamptz, updated_at timestamptz,
  vote_score bigint, user_vote smallint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    c.id, c.parent_id, c.user_id,
    COALESCE(NULLIF(p.username, ''), NULLIF(p.full_name, ''), 'member') AS username,
    CASE WHEN c.is_deleted THEN '' ELSE c.content END AS content,
    c.is_edited, c.is_deleted, c.created_at, c.updated_at,
    COALESCE((SELECT SUM(v.vote) FROM public.comment_votes v WHERE v.comment_id = c.id), 0)::bigint AS vote_score,
    (SELECT v.vote FROM public.comment_votes v WHERE v.comment_id = c.id AND v.user_id = auth.uid()) AS user_vote
  FROM public.comments c
  LEFT JOIN public.profiles p ON p.id = c.user_id
  WHERE c.post_type = p_post_type AND c.post_id = p_post_id
  ORDER BY c.created_at ASC;
$$;
-- Note: user_vote now uses auth.uid() instead of trusting the p_user_id argument.
GRANT EXECUTE ON FUNCTION public.get_comments_with_votes(text, uuid, uuid) TO anon, authenticated;


-- ── 2 + 3. Events: moderation statuses and safe INSERT ──
-- Drop whatever CHECK constraint currently governs events.status (its live name may differ)
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.events'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.events DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE public.events ADD CONSTRAINT events_status_check
  CHECK (status IN ('pending', 'upcoming', 'ongoing', 'past', 'cancelled', 'rejected'));

DROP POLICY IF EXISTS "events: authenticated insert" ON public.events;
CREATE POLICY "events: authenticated insert"
  ON public.events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

DROP POLICY IF EXISTS "events: admin insert" ON public.events;
CREATE POLICY "events: admin insert"
  ON public.events FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

-- Owners may edit their own event, but not publish it
DROP POLICY IF EXISTS "events: owner update" ON public.events;
CREATE POLICY "events: owner update"
  ON public.events FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND status IN ('pending', 'cancelled'));


-- ── 2. Directory entries: submissions start pending and unverified ──
DROP POLICY IF EXISTS "directory: authenticated insert" ON public.directory_entries;
CREATE POLICY "directory: authenticated insert"
  ON public.directory_entries FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND status = 'pending' AND COALESCE(is_verified, false) = false);

DROP POLICY IF EXISTS "directory: admin insert" ON public.directory_entries;
CREATE POLICY "directory: admin insert"
  ON public.directory_entries FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "directory: owner update" ON public.directory_entries;
CREATE POLICY "directory: owner update"
  ON public.directory_entries FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND status = 'pending' AND COALESCE(is_verified, false) = false);


-- ── 4 + 5. News: authors cannot self-publish; admins can insert (weekly digest) ──
DROP POLICY IF EXISTS "news: owner update pending" ON public.news;
CREATE POLICY "news: owner update pending"
  ON public.news FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND status = 'pending')
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

DROP POLICY IF EXISTS "news: admin insert" ON public.news;
CREATE POLICY "news: admin insert"
  ON public.news FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());


-- ── Profiles: users cannot grant themselves verification or a paid tier ──
CREATE OR REPLACE FUNCTION public.protect_profile_privileges()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Admins, the service_role key (webhooks, scripts) and the SQL editor may change these
  IF NOT public.is_admin()
     AND COALESCE(auth.role(), '') <> 'service_role'
     AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    NEW.is_verified     := OLD.is_verified;
    NEW.membership_tier := OLD.membership_tier;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_protect_profile_privileges ON public.profiles;
CREATE TRIGGER trg_protect_profile_privileges
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileges();


-- ── 6. Books catalog: read-only for the public ──
ALTER TABLE IF EXISTS public.steiner_books ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "books: public read" ON public.steiner_books;
CREATE POLICY "books: public read" ON public.steiner_books FOR SELECT USING (true);
DROP POLICY IF EXISTS "books: admin write" ON public.steiner_books;
CREATE POLICY "books: admin write" ON public.steiner_books FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());


-- ── 7. Chat: no impersonation; users can delete their own messages ──
DROP POLICY IF EXISTS "chat: authenticated insert" ON public.chat_messages;
CREATE POLICY "chat: authenticated insert"
  ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "chat: owner delete" ON public.chat_messages;
CREATE POLICY "chat: owner delete"
  ON public.chat_messages FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());


-- ── 8. Analytics: visitors can write page views but only admins can read them ──
DO $$
DECLARE pol record;
BEGIN
  IF to_regclass('public.page_views') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "page_views: public insert" ON public.page_views';
    EXECUTE 'CREATE POLICY "page_views: public insert" ON public.page_views FOR INSERT WITH CHECK (true)';
    EXECUTE 'DROP POLICY IF EXISTS "page_views: admin read" ON public.page_views';
    EXECUTE 'CREATE POLICY "page_views: admin read" ON public.page_views FOR SELECT TO authenticated USING (public.is_admin())';
  END IF;
  -- Remove any older read policy (e.g. a public "allow read") so only admins can read analytics
  FOR pol IN SELECT policyname FROM pg_policies
             WHERE schemaname = 'public' AND tablename = 'page_views'
               AND cmd IN ('SELECT', 'ALL') AND policyname <> 'page_views: admin read'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.page_views', pol.policyname);
  END LOOP;
END $$;


-- ── 10. view_logs (written by the app on every detail view) ──
CREATE TABLE IF NOT EXISTS public.view_logs (
  id         bigserial   PRIMARY KEY,
  item_type  text        NOT NULL CHECK (item_type IN ('directory', 'event', 'news', 'listing')),
  item_id    uuid        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.view_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "view_logs: public insert" ON public.view_logs;
CREATE POLICY "view_logs: public insert" ON public.view_logs FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "view_logs: admin read" ON public.view_logs;
CREATE POLICY "view_logs: admin read" ON public.view_logs FOR SELECT TO authenticated USING (public.is_admin());
CREATE INDEX IF NOT EXISTS idx_view_logs_item ON public.view_logs (item_type, item_id);


-- ── 9. Pin search_path on SECURITY DEFINER functions ──
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('is_admin', 'handle_new_user', 'increment_view_count', 'expire_old_listings')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', f.sig);
  END LOOP;
END $$;
-- expire_old_listings is meant for pg_cron, not for any signed-in user
DO $$
BEGIN
  IF to_regprocedure('public.expire_old_listings()') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.expire_old_listings() FROM PUBLIC, anon, authenticated';
  END IF;
END $$;

-- ── 11. Newsletter double opt-in + unsubscribe (used by functions/newsletter) ──
ALTER TABLE public.newsletter_subscribers ADD COLUMN IF NOT EXISTS confirm_token     uuid;
ALTER TABLE public.newsletter_subscribers ADD COLUMN IF NOT EXISTS confirm_sent_at   timestamptz;
ALTER TABLE public.newsletter_subscribers ADD COLUMN IF NOT EXISTS confirmed_at      timestamptz;
ALTER TABLE public.newsletter_subscribers ADD COLUMN IF NOT EXISTS unsubscribed_at   timestamptz;
ALTER TABLE public.newsletter_subscribers ADD COLUMN IF NOT EXISTS unsubscribe_token uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_confirm_token     ON public.newsletter_subscribers (confirm_token);
CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_unsubscribe_token ON public.newsletter_subscribers (unsubscribe_token);
-- The browser may only add UNCONFIRMED addresses (confirmation happens server-side by emailed link)
DROP POLICY IF EXISTS "newsletter: public insert" ON public.newsletter_subscribers;
CREATE POLICY "newsletter: public insert"
  ON public.newsletter_subscribers FOR INSERT
  WITH CHECK (confirmed = false);
-- Existing rows were saved as confirmed=true without any email check. Decide before the first send:
--   keep them (they asked, but unverified) or require re-confirmation:
--   UPDATE public.newsletter_subscribers SET confirmed = false WHERE confirmed_at IS NULL;

-- ── 12. Make your account an admin by role (what RLS checks), then sign out and back in ──
UPDATE auth.users SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'
WHERE email IN ('cameron.nazeri@gmail.com');

COMMIT;

-- =============================================================================
-- AFTER RUNNING: checks
-- =============================================================================
-- Tables with RLS disabled (should return no rows):
--   SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
--
-- All policies on the analytics tables (drop any leftover public SELECT policy):
--   SELECT tablename, policyname, cmd, qual FROM pg_policies
--   WHERE tablename IN ('page_views', 'page_views_heartbeat') ORDER BY 1, 2;
--
-- Comments RPC works for anonymous visitors:
--   SELECT * FROM public.get_comments_with_votes('directory', gen_random_uuid());
--
-- Then run Supabase Advisors (Database > Advisors > Security) and fix anything flagged.
-- =============================================================================
