-- =============================================================================
-- Sophia Commons: monthly active users for the admin Traffic Dashboard
-- 2026-10-10. Safe to run more than once.
-- visitor_id: a random ID kept in the visitor's browser (localStorage), so a returning visitor is
-- counted once per month. No name, email or IP address is stored.
-- is_member: true when the page was viewed by a signed-in member (no account ID is stored).
-- =============================================================================
ALTER TABLE public.page_views ADD COLUMN IF NOT EXISTS visitor_id text;
ALTER TABLE public.page_views ADD COLUMN IF NOT EXISTS is_member boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS page_views_timestamp_idx ON public.page_views (timestamp);

-- Admin-only: page views and active visitors for the last N months, plus the rolling 30 days.
-- Months before visitor_id existed fall back to sessions (marked by has_visitor_ids = false).
CREATE OR REPLACE FUNCTION public.admin_monthly_stats(months integer DEFAULT 12)
RETURNS TABLE (month date, page_views bigint, active_visitors bigint, active_members bigint, sessions bigint, has_visitor_ids boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT date_trunc('month', pv.timestamp)::date,
         count(*),
         count(DISTINCT pv.visitor_id),
         count(DISTINCT pv.visitor_id) FILTER (WHERE pv.is_member),
         count(DISTINCT pv.session_id),
         bool_or(pv.visitor_id IS NOT NULL)
    FROM public.page_views pv
   WHERE pv.timestamp >= date_trunc('month', now()) - make_interval(months => greatest(months, 1) - 1)
     AND pv.timestamp <= now()
   GROUP BY 1
   ORDER BY 1 DESC;
END $$;

CREATE OR REPLACE FUNCTION public.admin_rolling_30()
RETURNS TABLE (page_views bigint, active_visitors bigint, active_members bigint, sessions bigint, registered_active bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT count(*), count(DISTINCT pv.visitor_id), count(DISTINCT pv.visitor_id) FILTER (WHERE pv.is_member),
         count(DISTINCT pv.session_id),
         (SELECT count(*) FROM auth.users u WHERE u.last_sign_in_at >= now() - interval '30 days')
    FROM public.page_views pv
   WHERE pv.timestamp >= now() - interval '30 days' AND pv.timestamp <= now();
END $$;

REVOKE ALL ON FUNCTION public.admin_monthly_stats(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_rolling_30() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_monthly_stats(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_rolling_30() TO authenticated;
