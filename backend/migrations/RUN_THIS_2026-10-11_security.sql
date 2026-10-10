-- =============================================================================
-- Sophia Commons: security tightening (prepared 2026-10-11, night run, Batch 3)
-- Run in Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to run more than once. Each section is independent.
-- =============================================================================

-- 1. PROFILES: anonymous visitors may read only the public columns.
--    The site shows usernames on listings and comment author names (id, username, full_name);
--    bio, location, website and membership tier are no longer readable without signing in.
--    Signed-in users keep their current access (RLS policies are unchanged).
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (id, username, full_name, avatar_url, is_verified, created_at) ON public.profiles TO anon;

-- 2. EVENT SOURCES (the list of websites crawled for events): admins only.
ALTER TABLE public.event_sources ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'event_sources' LOOP
    EXECUTE format('DROP POLICY %I ON public.event_sources', pol.policyname);
  END LOOP;
END $$;
CREATE POLICY "event_sources: admin all"
  ON public.event_sources FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 3. EVENTS: links and images must be web addresses (blocks javascript: and data: URLs at the source).
--    All current rows already comply (checked 2026-10-11).
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_urls_http;
ALTER TABLE public.events ADD CONSTRAINT events_urls_http CHECK (
  (online_url IS NULL OR online_url ~* '^https?://') AND
  (ticket_url IS NULL OR ticket_url ~* '^https?://') AND
  (image_url  IS NULL OR image_url  ~* '^https?://') AND
  (organizer_url IS NULL OR organizer_url ~* '^https?://')
);

-- 4. NEWSLETTER: re-assert the safe signup rule (anonymous signups always start unconfirmed).
DROP POLICY IF EXISTS "newsletter: public insert" ON public.newsletter_subscribers;
CREATE POLICY "newsletter: public insert"
  ON public.newsletter_subscribers FOR INSERT
  WITH CHECK (confirmed = false);

-- 5. STORAGE bucket "event-images" (record only): public read, no anonymous writes.
--    Verified 2026-10-10: an anonymous upload is refused by row-level security.
--    Uploads are done by admins with the server key. No change needed here.

-- 6. OPTIONAL (your decision): make Community Chat readable only by signed-in members.
--    Today anyone can read chat messages. Uncomment the four lines below to require sign-in to read.
--    Logged-out visitors would then see an empty chat until they sign in.
-- DO $$ DECLARE pol record; BEGIN FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='chat_messages' AND cmd='SELECT' LOOP EXECUTE format('DROP POLICY %I ON public.chat_messages', pol.policyname); END LOOP; END $$;
-- CREATE POLICY "chat: authenticated read" ON public.chat_messages FOR SELECT TO authenticated USING (true);
-- REVOKE SELECT ON public.chat_messages FROM anon;
-- (then reload the site while logged out: the chat should be empty; logged in: messages show)

-- =============================================================================
-- CHECKS: run these after the script. Expected results are in the comments.
-- =============================================================================
-- a) Anonymous profile columns (expect exactly: avatar_url, created_at, full_name, id, is_verified, username)
SELECT column_name FROM information_schema.column_privileges
 WHERE table_schema = 'public' AND table_name = 'profiles' AND grantee = 'anon' AND privilege_type = 'SELECT'
 ORDER BY column_name;
-- b) Event sources policies (expect one row: "event_sources: admin all")
SELECT policyname, cmd FROM pg_policies WHERE schemaname = 'public' AND tablename = 'event_sources';
-- c) URL constraint present (expect one row)
SELECT conname FROM pg_constraint WHERE conname = 'events_urls_http';
