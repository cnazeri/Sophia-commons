-- =============================================================================
-- Sophia Commons: admin Members + Activity tabs, and two privacy fixes
-- 2026-10-10. Safe to run more than once.
-- =============================================================================

-- 1. PRIVACY FIXES
-- memorials_pending was readable by anyone (including the submitter's contact_email);
-- listings_pending could be read and edited by any signed-in member. Admin policies remain.
DROP POLICY IF EXISTS "Allow reads" ON public.memorials_pending;
DROP POLICY IF EXISTS "Allow authenticated select listings_pending" ON public.listings_pending;
DROP POLICY IF EXISTS "Allow authenticated update listings_pending" ON public.listings_pending;
-- the admin panel deletes approved/rejected memorial submissions, but no delete policy existed
DROP POLICY IF EXISTS "memorials_pending: admin delete" ON public.memorials_pending;
CREATE POLICY "memorials_pending: admin delete" ON public.memorials_pending FOR DELETE TO authenticated
  USING (public.is_admin());

-- 2. MEMBERS: every registered account with its email (auth.users is not reachable from the
-- browser, so this admin-only function reads it). Returns nothing for non-admins.
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz, confirmed boolean,
  provider text, is_admin boolean, username text, full_name text, newsletter text,
  comments bigint, chat bigint, events bigint, listings bigint, reviews bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT u.id, u.email::text, u.created_at, u.last_sign_in_at, u.email_confirmed_at IS NOT NULL,
         coalesce(u.raw_app_meta_data->>'provider', 'email'), (u.raw_app_meta_data->>'role') = 'admin',
         p.username, p.full_name,
         (SELECT CASE WHEN ns.unsubscribed_at IS NOT NULL THEN 'unsubscribed'
                      WHEN ns.confirmed THEN 'subscribed' ELSE 'unconfirmed' END
            FROM public.newsletter_subscribers ns WHERE lower(ns.email) = lower(u.email) LIMIT 1),
         (SELECT count(*) FROM public.comments c WHERE c.user_id = u.id),
         (SELECT count(*) FROM public.chat_messages m WHERE m.user_id = u.id),
         (SELECT count(*) FROM public.events e WHERE e.user_id = u.id),
         (SELECT count(*) FROM public.listings l WHERE l.user_id = u.id),
         (SELECT count(*) FROM public.channel_reviews r WHERE r.user_id = u.id)
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
   ORDER BY u.created_at DESC;
END $$;

-- 3. ACTIVITY: the newest posts of every kind in one list, with the author's email.
CREATE OR REPLACE FUNCTION public.admin_recent_posts(max_rows integer DEFAULT 200)
RETURNS TABLE (kind text, id uuid, created_at timestamptz, author_id uuid, author text, title text, body text, status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH posts AS (
    SELECT 'comment'::text k, c.id, c.created_at ts, c.user_id uid, NULL::text who,
           (c.post_type || ' ' || c.post_id::text) ttl, c.content txt,
           CASE WHEN c.is_deleted THEN 'deleted' ELSE 'visible' END st
      FROM public.comments c
    UNION ALL
    SELECT 'chat', m.id, m.created_at, m.user_id, m.username, 'room: ' || coalesce(m.room, ''), m.content, 'visible'
      FROM public.chat_messages m
    UNION ALL
    SELECT 'review', r.id, r.updated_at, r.user_id, NULL, 'channel: ' || r.channel_slug || ' (' || r.rating || ' stars)', r.comment,
           CASE WHEN r.is_hidden THEN 'hidden' ELSE 'visible' END
      FROM public.channel_reviews r
    UNION ALL
    SELECT 'event', e.id, e.created_at, e.user_id, e.organizer_name, e.title, left(e.description, 500), e.status
      FROM public.events e WHERE e.user_id IS NOT NULL
    UNION ALL
    SELECT 'listing', l.id, l.created_at, l.user_id, NULL, l.title, left(l.description, 500), l.status
      FROM public.listings l
    UNION ALL
    SELECT 'news', n.id, n.created_at, n.user_id, n.source_name, n.title, n.excerpt, n.status
      FROM public.news n WHERE NOT (coalesce(n.tags, '{}') @> ARRAY['weekly-digest'])
    UNION ALL
    SELECT 'pending listing', lp.id, lp.submitted_at, NULL, lp.contact_email, lp.name, left(lp.description, 500), coalesce(lp.status, 'pending')
      FROM public.listings_pending lp
    UNION ALL
    SELECT 'pending memorial', mp.id, mp.created_at, NULL, mp.contact_email, mp.name, left(mp.bio, 500), mp.status
      FROM public.memorials_pending mp
  )
  SELECT p.k, p.id, p.ts, p.uid, coalesce(u.email::text, p.who), p.ttl, p.txt, p.st
    FROM posts p LEFT JOIN auth.users u ON u.id = p.uid
   ORDER BY p.ts DESC NULLS LAST
   LIMIT least(greatest(max_rows, 1), 1000);
END $$;

-- 4. MODERATION from the Activity tab: hide or remove one post. Comments are soft-deleted
--    (replies stay readable), reviews are hidden, everything else is deleted.
CREATE OR REPLACE FUNCTION public.admin_moderate(post_kind text, post_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;
  CASE post_kind
    WHEN 'comment' THEN UPDATE public.comments SET is_deleted = true, content = '[removed by moderator]' WHERE id = post_id;
    WHEN 'review'  THEN UPDATE public.channel_reviews SET is_hidden = true WHERE id = post_id;
    WHEN 'chat'    THEN DELETE FROM public.chat_messages WHERE id = post_id;
    WHEN 'event'   THEN DELETE FROM public.events WHERE id = post_id;
    WHEN 'listing' THEN DELETE FROM public.listings WHERE id = post_id;
    WHEN 'news'    THEN DELETE FROM public.news WHERE id = post_id;
    ELSE RAISE EXCEPTION 'unknown kind %', post_kind;
  END CASE;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN CASE WHEN n > 0 THEN 'ok' ELSE 'not found' END;
END $$;

REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_recent_posts(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_moderate(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_recent_posts(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_moderate(text, uuid) TO authenticated;
