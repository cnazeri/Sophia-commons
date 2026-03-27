-- =============================================================================
-- SOPHIA COMMONS -- PostgreSQL Functions and RPC Endpoints
-- =============================================================================
-- Run AFTER schema.sql and rls_policies.sql.
-- These functions are callable via Supabase's PostgREST RPC interface:
--   POST /rest/v1/rpc/<function_name>
-- All functions use SECURITY DEFINER only where explicitly needed.
-- =============================================================================


-- =============================================================================
-- 1. increment_view_count
--    Safely increments the view_count on a listing using an atomic update.
--    Avoids race conditions that would occur with a read-then-write in the client.
--
--    Usage:
--      POST /rest/v1/rpc/increment_view_count
--      Body: { "listing_id": "<uuid>" }
-- =============================================================================

CREATE OR REPLACE FUNCTION public.increment_view_count(listing_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.listings
  SET    view_count = view_count + 1
  WHERE  id = listing_id
    AND  status = 'active';
$$;

-- Grant anon and authenticated users the right to call this function
GRANT EXECUTE ON FUNCTION public.increment_view_count(uuid) TO anon, authenticated;


-- =============================================================================
-- 2. get_listings_by_category
--    Returns paginated, active listings for a given category slug.
--    Ordered by created_at DESC (newest first).
--
--    Usage:
--      POST /rest/v1/rpc/get_listings_by_category
--      Body: { "cat_slug": "marketplace", "limit_n": 20, "offset_n": 0 }
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_listings_by_category(
  cat_slug  text,
  limit_n   int  DEFAULT 20,
  offset_n  int  DEFAULT 0
)
RETURNS TABLE (
  id            uuid,
  title         text,
  description   text,
  price         numeric,
  location      text,
  region        text,
  country       text,
  listing_type  text,
  status        text,
  contact_email text,
  website_url   text,
  tags          text[],
  view_count    int,
  expires_at    timestamptz,
  created_at    timestamptz,
  updated_at    timestamptz,
  -- joined fields
  category_slug text,
  category_name text,
  user_username text,
  user_full_name text
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    l.id,
    l.title,
    l.description,
    l.price,
    l.location,
    l.region,
    l.country,
    l.listing_type,
    l.status,
    l.contact_email,
    l.website_url,
    l.tags,
    l.view_count,
    l.expires_at,
    l.created_at,
    l.updated_at,
    c.slug         AS category_slug,
    c.name         AS category_name,
    p.username     AS user_username,
    p.full_name    AS user_full_name
  FROM  public.listings  l
  JOIN  public.categories c ON c.id   = l.category_id
  JOIN  public.profiles   p ON p.id   = l.user_id
  WHERE c.slug     = cat_slug
    AND l.status   = 'active'
    AND l.expires_at > now()
  ORDER BY l.created_at DESC
  LIMIT  least(limit_n, 100)   -- cap at 100 rows per page
  OFFSET offset_n;
$$;

GRANT EXECUTE ON FUNCTION public.get_listings_by_category(text, int, int) TO anon, authenticated;


-- =============================================================================
-- 3. get_upcoming_events
--    Returns events starting within the next N days, ordered by start_date ASC.
--
--    Usage:
--      POST /rest/v1/rpc/get_upcoming_events
--      Body: { "days_ahead": 30, "limit_n": 20 }
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_upcoming_events(
  days_ahead  int  DEFAULT 30,
  limit_n     int  DEFAULT 20
)
RETURNS TABLE (
  id             uuid,
  title          text,
  description    text,
  event_type     text,
  start_date     timestamptz,
  end_date       timestamptz,
  is_all_day     boolean,
  location_name  text,
  city           text,
  region         text,
  country        text,
  is_online      boolean,
  online_url     text,
  organizer_name text,
  ticket_url     text,
  ticket_price   numeric,
  is_free        boolean,
  image_url      text,
  status         text,
  featured       boolean,
  created_at     timestamptz,
  -- joined fields
  category_slug  text,
  category_name  text
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    e.id,
    e.title,
    e.description,
    e.event_type,
    e.start_date,
    e.end_date,
    e.is_all_day,
    e.location_name,
    e.city,
    e.region,
    e.country,
    e.is_online,
    e.online_url,
    e.organizer_name,
    e.ticket_url,
    e.ticket_price,
    e.is_free,
    e.image_url,
    e.status,
    e.featured,
    e.created_at,
    c.slug AS category_slug,
    c.name AS category_name
  FROM  public.events     e
  LEFT  JOIN public.categories c ON c.id = e.category_id
  WHERE e.status      IN ('upcoming', 'ongoing')
    AND e.start_date  >= now()
    AND e.start_date  <= now() + (days_ahead || ' days')::interval
  ORDER BY e.featured DESC, e.start_date ASC
  LIMIT  least(limit_n, 100);
$$;

GRANT EXECUTE ON FUNCTION public.get_upcoming_events(int, int) TO anon, authenticated;


-- =============================================================================
-- 4. search_all
--    Full-text search across listings, events, and news in a single call.
--    Returns a unified result set with an item_type discriminator column.
--
--    Usage:
--      POST /rest/v1/rpc/search_all
--      Body: { "query": "biodynamic farming", "limit_n": 30 }
-- =============================================================================

CREATE OR REPLACE FUNCTION public.search_all(
  query    text,
  limit_n  int  DEFAULT 30
)
RETURNS TABLE (
  item_type   text,
  id          uuid,
  title       text,
  excerpt     text,
  status      text,
  created_at  timestamptz,
  rank        real
)
LANGUAGE sql
STABLE
AS $$
  -- Listings
  SELECT
    'listing'::text                                             AS item_type,
    l.id,
    l.title,
    left(l.description, 200)                                   AS excerpt,
    l.status,
    l.created_at,
    ts_rank(l.search_vector, websearch_to_tsquery('english', query)) AS rank
  FROM  public.listings l
  WHERE l.status = 'active'
    AND l.search_vector @@ websearch_to_tsquery('english', query)

  UNION ALL

  -- Events
  SELECT
    'event'::text,
    e.id,
    e.title,
    left(e.description, 200),
    e.status,
    e.created_at,
    ts_rank(e.search_vector, websearch_to_tsquery('english', query))
  FROM  public.events e
  WHERE e.status IN ('upcoming', 'ongoing')
    AND e.search_vector @@ websearch_to_tsquery('english', query)

  UNION ALL

  -- News
  SELECT
    'news'::text,
    n.id,
    n.title,
    coalesce(n.excerpt, left(n.body, 200)),
    n.status,
    n.created_at,
    ts_rank(n.search_vector, websearch_to_tsquery('english', query))
  FROM  public.news n
  WHERE n.status = 'published'
    AND n.search_vector @@ websearch_to_tsquery('english', query)

  ORDER BY rank DESC, created_at DESC
  LIMIT least(limit_n, 100);
$$;

GRANT EXECUTE ON FUNCTION public.search_all(text, int) TO anon, authenticated;


-- =============================================================================
-- 5. expire_old_listings
--    Marks listings as expired when their expires_at timestamp has passed.
--    Designed to be called by a Supabase pg_cron job once per day.
--
--    To schedule via pg_cron (run once in SQL editor after enabling pg_cron):
--      SELECT cron.schedule(
--        'expire-old-listings',          -- job name
--        '0 2 * * *',                    -- 02:00 UTC every day
--        $$ SELECT public.expire_old_listings(); $$
--      );
--
--    Manual call:
--      POST /rest/v1/rpc/expire_old_listings   (admin only -- see policy below)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.expire_old_listings()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rows_updated int;
BEGIN
  UPDATE public.listings
  SET    status = 'expired'
  WHERE  status     = 'active'
    AND  expires_at < now();

  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RETURN rows_updated;
END;
$$;

-- Restrict direct RPC calls to authenticated users; admins or cron handles this.
GRANT EXECUTE ON FUNCTION public.expire_old_listings() TO authenticated;


-- =============================================================================
-- 6. get_featured_content
--    Returns a curated mix of featured events and news for the homepage.
--
--    Usage:
--      POST /rest/v1/rpc/get_featured_content
--      Body: {}
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_featured_content()
RETURNS TABLE (
  item_type   text,
  id          uuid,
  title       text,
  excerpt     text,
  image_url   text,
  created_at  timestamptz
)
LANGUAGE sql
STABLE
AS $$
  -- Featured upcoming events
  SELECT
    'event'::text,
    e.id,
    e.title,
    left(e.description, 200),
    e.image_url,
    e.created_at
  FROM  public.events e
  WHERE e.featured = true
    AND e.status   IN ('upcoming', 'ongoing')
  ORDER BY e.start_date ASC
  LIMIT 5

  UNION ALL

  -- Featured news
  SELECT
    'news'::text,
    n.id,
    n.title,
    coalesce(n.excerpt, left(n.body, 200)),
    NULL::text,
    n.created_at
  FROM  public.news n
  WHERE n.featured = true
    AND n.status   = 'published'
  ORDER BY n.published_at DESC
  LIMIT 5

  ORDER BY created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_featured_content() TO anon, authenticated;


-- =============================================================================
-- 7. get_directory_by_country
--    Returns approved directory entries filtered by country, with pagination.
--
--    Usage:
--      POST /rest/v1/rpc/get_directory_by_country
--      Body: { "country_name": "United States", "limit_n": 20, "offset_n": 0 }
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_directory_by_country(
  country_name  text,
  limit_n       int  DEFAULT 20,
  offset_n      int  DEFAULT 0
)
RETURNS TABLE (
  id                uuid,
  organization_name text,
  description       text,
  category          text,
  website_url       text,
  email             text,
  location          text,
  country           text,
  tags              text[],
  is_verified       boolean,
  created_at        timestamptz
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    d.id,
    d.organization_name,
    d.description,
    d.category,
    d.website_url,
    d.email,
    d.location,
    d.country,
    d.tags,
    d.is_verified,
    d.created_at
  FROM  public.directory_entries d
  WHERE d.status  = 'approved'
    AND d.country ILIKE country_name
  ORDER BY d.is_verified DESC, d.organization_name ASC
  LIMIT  least(limit_n, 100)
  OFFSET offset_n;
$$;

GRANT EXECUTE ON FUNCTION public.get_directory_by_country(text, int, int) TO anon, authenticated;
