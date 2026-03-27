-- =============================================================================
-- SOPHIA COMMONS -- Row Level Security (RLS) Policies
-- =============================================================================
-- Run AFTER schema.sql.
-- Every table has RLS enabled. Policies follow the principle of least privilege:
--   - Public (anon) can read approved/active/published content.
--   - Authenticated users can create content and manage their own records.
--   - Admins (app_metadata role = 'admin') can manage all records.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- HELPER: check if the current user is an admin
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;


-- =============================================================================
-- profiles
-- =============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Anyone can view profiles
CREATE POLICY "profiles: public read"
  ON public.profiles FOR SELECT
  USING (true);

-- Authenticated users can insert their own profile (handle_new_user trigger also does this)
CREATE POLICY "profiles: insert own"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Users can update only their own profile
CREATE POLICY "profiles: update own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Admins can update any profile (e.g. to verify users, change membership tier)
CREATE POLICY "profiles: admin update"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.is_admin());

-- Users can delete their own profile (cascades to all their content)
CREATE POLICY "profiles: delete own"
  ON public.profiles FOR DELETE
  TO authenticated
  USING (auth.uid() = id);


-- =============================================================================
-- categories
-- =============================================================================

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- Anyone can read active categories
CREATE POLICY "categories: public read"
  ON public.categories FOR SELECT
  USING (is_active = true);

-- Only admins can insert / update / delete categories
CREATE POLICY "categories: admin insert"
  ON public.categories FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "categories: admin update"
  ON public.categories FOR UPDATE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "categories: admin delete"
  ON public.categories FOR DELETE
  TO authenticated
  USING (public.is_admin());


-- =============================================================================
-- listings
-- =============================================================================

ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

-- Public can read active listings
CREATE POLICY "listings: public read active"
  ON public.listings FOR SELECT
  USING (status = 'active');

-- Authenticated users can read their own listings (any status)
CREATE POLICY "listings: owner read all"
  ON public.listings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Admins can read all listings
CREATE POLICY "listings: admin read all"
  ON public.listings FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Authenticated users can create listings (status defaults to active)
CREATE POLICY "listings: authenticated insert"
  ON public.listings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own listings
CREATE POLICY "listings: owner update"
  ON public.listings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins can update any listing (e.g. to flag or expire it)
CREATE POLICY "listings: admin update"
  ON public.listings FOR UPDATE
  TO authenticated
  USING (public.is_admin());

-- Users can delete their own listings
CREATE POLICY "listings: owner delete"
  ON public.listings FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Admins can delete any listing
CREATE POLICY "listings: admin delete"
  ON public.listings FOR DELETE
  TO authenticated
  USING (public.is_admin());


-- =============================================================================
-- events
-- =============================================================================

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Public can read upcoming / ongoing events
CREATE POLICY "events: public read"
  ON public.events FOR SELECT
  USING (status IN ('upcoming', 'ongoing'));

-- Authenticated users can read their own events (any status)
CREATE POLICY "events: owner read all"
  ON public.events FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Admins can read all events
CREATE POLICY "events: admin read all"
  ON public.events FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Authenticated users can submit events
CREATE POLICY "events: authenticated insert"
  ON public.events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own events
CREATE POLICY "events: owner update"
  ON public.events FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins can update any event (e.g. mark as featured, cancel)
CREATE POLICY "events: admin update"
  ON public.events FOR UPDATE
  TO authenticated
  USING (public.is_admin());

-- Users can delete their own events
CREATE POLICY "events: owner delete"
  ON public.events FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Admins can delete any event
CREATE POLICY "events: admin delete"
  ON public.events FOR DELETE
  TO authenticated
  USING (public.is_admin());


-- =============================================================================
-- news
-- =============================================================================

ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;

-- Public can read published news
CREATE POLICY "news: public read published"
  ON public.news FOR SELECT
  USING (status = 'published');

-- Authenticated users can read their own submissions (any status)
CREATE POLICY "news: owner read all"
  ON public.news FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Admins can read all news (including pending / rejected)
CREATE POLICY "news: admin read all"
  ON public.news FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Authenticated users can submit news (lands in 'pending')
CREATE POLICY "news: authenticated insert"
  ON public.news FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

-- Users can update their own pending submissions
CREATE POLICY "news: owner update pending"
  ON public.news FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND status = 'pending')
  WITH CHECK (auth.uid() = user_id);

-- Admins can update any news (approve, reject, feature)
CREATE POLICY "news: admin update"
  ON public.news FOR UPDATE
  TO authenticated
  USING (public.is_admin());

-- Users can delete their own submissions
CREATE POLICY "news: owner delete"
  ON public.news FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Admins can delete any news item
CREATE POLICY "news: admin delete"
  ON public.news FOR DELETE
  TO authenticated
  USING (public.is_admin());


-- =============================================================================
-- directory_entries
-- =============================================================================

ALTER TABLE public.directory_entries ENABLE ROW LEVEL SECURITY;

-- Public can read approved directory entries
CREATE POLICY "directory: public read approved"
  ON public.directory_entries FOR SELECT
  USING (status = 'approved');

-- Owners can read their own entries (any status)
CREATE POLICY "directory: owner read all"
  ON public.directory_entries FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Admins can read all
CREATE POLICY "directory: admin read all"
  ON public.directory_entries FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Authenticated users can submit directory entries
CREATE POLICY "directory: authenticated insert"
  ON public.directory_entries FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Owners can update their own entries
CREATE POLICY "directory: owner update"
  ON public.directory_entries FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins can update any entry (approve, verify, reject)
CREATE POLICY "directory: admin update"
  ON public.directory_entries FOR UPDATE
  TO authenticated
  USING (public.is_admin());

-- Owners can delete their own entries
CREATE POLICY "directory: owner delete"
  ON public.directory_entries FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Admins can delete any entry
CREATE POLICY "directory: admin delete"
  ON public.directory_entries FOR DELETE
  TO authenticated
  USING (public.is_admin());


-- =============================================================================
-- organizations
-- =============================================================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Public can read all organizations
CREATE POLICY "organizations: public read"
  ON public.organizations FOR SELECT
  USING (true);

-- Authenticated users can create an organization
CREATE POLICY "organizations: authenticated insert"
  ON public.organizations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Owners can update their own organization
CREATE POLICY "organizations: owner update"
  ON public.organizations FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins can update any organization (verify, change tier)
CREATE POLICY "organizations: admin update"
  ON public.organizations FOR UPDATE
  TO authenticated
  USING (public.is_admin());

-- Owners can delete their own organization
CREATE POLICY "organizations: owner delete"
  ON public.organizations FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);


-- =============================================================================
-- saved_items
-- =============================================================================

ALTER TABLE public.saved_items ENABLE ROW LEVEL SECURITY;

-- Users can only read their own saved items
CREATE POLICY "saved_items: owner read"
  ON public.saved_items FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can save items
CREATE POLICY "saved_items: owner insert"
  ON public.saved_items FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can unsave (delete) their own saved items
CREATE POLICY "saved_items: owner delete"
  ON public.saved_items FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);


-- =============================================================================
-- reports
-- =============================================================================

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Users can submit reports
CREATE POLICY "reports: authenticated insert"
  ON public.reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

-- Users can view their own reports
CREATE POLICY "reports: owner read"
  ON public.reports FOR SELECT
  TO authenticated
  USING (auth.uid() = reporter_id);

-- Admins can read and update all reports
CREATE POLICY "reports: admin read"
  ON public.reports FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "reports: admin update"
  ON public.reports FOR UPDATE
  TO authenticated
  USING (public.is_admin());


-- =============================================================================
-- newsletter_subscribers
-- =============================================================================

ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can subscribe
CREATE POLICY "newsletter: public insert"
  ON public.newsletter_subscribers FOR INSERT
  WITH CHECK (true);

-- No one can read subscriber list except admins (privacy protection)
CREATE POLICY "newsletter: admin read"
  ON public.newsletter_subscribers FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Admins can update (e.g. confirm emails, update preferences)
CREATE POLICY "newsletter: admin update"
  ON public.newsletter_subscribers FOR UPDATE
  TO authenticated
  USING (public.is_admin());

-- Admins can delete subscribers
CREATE POLICY "newsletter: admin delete"
  ON public.newsletter_subscribers FOR DELETE
  TO authenticated
  USING (public.is_admin());
