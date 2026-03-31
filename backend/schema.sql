-- =============================================================================
-- SOPHIA COMMONS -- Complete PostgreSQL Schema for Supabase
-- A curated community board platform for the anthroposophical world
-- =============================================================================
-- Run this file in the Supabase SQL Editor (or via CLI: supabase db push)
-- All tables use UUID primary keys and include created_at / updated_at columns.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- EXTENSIONS
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- trigram search support
CREATE EXTENSION IF NOT EXISTS "unaccent";   -- accent-insensitive search


-- ---------------------------------------------------------------------------
-- HELPER: auto-update updated_at column
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- =============================================================================
-- TABLE: profiles
-- Extends auth.users. One row per registered user.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id                uuid        PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  username          text        UNIQUE,
  full_name         text,
  bio               text,
  location          text,
  website           text,
  organization_name text,
  is_verified       boolean     NOT NULL DEFAULT false,
  membership_tier   text        NOT NULL DEFAULT 'free'
                                CHECK (membership_tier IN ('free', 'member', 'pro')),
  avatar_url        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Auto-set updated_at
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_username   ON public.profiles (username);
CREATE INDEX IF NOT EXISTS idx_profiles_membership ON public.profiles (membership_tier);


-- =============================================================================
-- TABLE: categories
-- Top-level navigation buckets for the community board.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.categories (
  id            serial      PRIMARY KEY,
  slug          text        NOT NULL UNIQUE,
  name          text        NOT NULL,
  description   text,
  icon          text,                    -- e.g. emoji or icon name
  display_order int         NOT NULL DEFAULT 0,
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_categories_slug         ON public.categories (slug);
CREATE INDEX IF NOT EXISTS idx_categories_display_order ON public.categories (display_order);


-- =============================================================================
-- TABLE: listings
-- Classified-style posts (for sale, wanted, offerings, seeking, announcements).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.listings (
  id            uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  category_id   int         NOT NULL REFERENCES public.categories (id),
  title         text        NOT NULL,
  description   text        NOT NULL,
  price         numeric(12, 2),          -- NULL means price on request or free
  location      text,
  region        text,
  country       text,
  listing_type  text        NOT NULL
                            CHECK (listing_type IN ('for_sale', 'wanted', 'offering', 'seeking', 'announcement')),
  status        text        NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'expired', 'draft', 'flagged')),
  contact_email text,
  contact_phone text,
  website_url   text,
  tags          text[]      DEFAULT '{}',
  view_count    int         NOT NULL DEFAULT 0,
  expires_at    timestamptz NOT NULL DEFAULT (now() + INTERVAL '90 days'),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- Full-text search vector (auto-populated by trigger below)
  search_vector tsvector
);

CREATE TRIGGER trg_listings_updated_at
  BEFORE UPDATE ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Full-text search trigger
CREATE OR REPLACE FUNCTION public.listings_search_vector_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.location, '')), 'C') ||
    setweight(to_tsvector('english', array_to_string(NEW.tags, ' ')), 'D');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_listings_search_vector
  BEFORE INSERT OR UPDATE ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.listings_search_vector_update();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_listings_user_id     ON public.listings (user_id);
CREATE INDEX IF NOT EXISTS idx_listings_category_id ON public.listings (category_id);
CREATE INDEX IF NOT EXISTS idx_listings_status      ON public.listings (status);
CREATE INDEX IF NOT EXISTS idx_listings_listing_type ON public.listings (listing_type);
CREATE INDEX IF NOT EXISTS idx_listings_country     ON public.listings (country);
CREATE INDEX IF NOT EXISTS idx_listings_region      ON public.listings (region);
CREATE INDEX IF NOT EXISTS idx_listings_expires_at  ON public.listings (expires_at);
CREATE INDEX IF NOT EXISTS idx_listings_created_at  ON public.listings (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listings_search      ON public.listings USING gin (search_vector);
CREATE INDEX IF NOT EXISTS idx_listings_tags        ON public.listings USING gin (tags);


-- =============================================================================
-- TABLE: events
-- Community calendar entries (conferences, festivals, workshops, etc.).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.events (
  id               uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  title            text        NOT NULL,
  description      text        NOT NULL,
  event_type       text        NOT NULL DEFAULT 'other'
                               CHECK (event_type IN ('conference', 'festival', 'study_group', 'workshop', 'retreat', 'other')),
  start_date       timestamptz NOT NULL,
  end_date         timestamptz,
  is_all_day       boolean     NOT NULL DEFAULT false,
  location_name    text,
  address          text,
  city             text,
  region           text,
  country          text,
  is_online        boolean     NOT NULL DEFAULT false,
  online_url       text,
  category_id      int         REFERENCES public.categories (id),
  organizer_name   text,
  organizer_url    text,
  ticket_url       text,
  ticket_price     numeric(10, 2),
  is_free          boolean     NOT NULL DEFAULT false,
  image_url        text,
  status           text        NOT NULL DEFAULT 'upcoming'
                               CHECK (status IN ('upcoming', 'ongoing', 'past', 'cancelled')),
  featured         boolean     NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  search_vector    tsvector
);

CREATE TRIGGER trg_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.events_search_vector_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.city, '') || ' ' || coalesce(NEW.country, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(NEW.organizer_name, '')), 'D');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_events_search_vector
  BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.events_search_vector_update();

CREATE INDEX IF NOT EXISTS idx_events_user_id     ON public.events (user_id);
CREATE INDEX IF NOT EXISTS idx_events_category_id ON public.events (category_id);
CREATE INDEX IF NOT EXISTS idx_events_start_date  ON public.events (start_date);
CREATE INDEX IF NOT EXISTS idx_events_status      ON public.events (status);
CREATE INDEX IF NOT EXISTS idx_events_featured    ON public.events (featured);
CREATE INDEX IF NOT EXISTS idx_events_country     ON public.events (country);
CREATE INDEX IF NOT EXISTS idx_events_search      ON public.events USING gin (search_vector);


-- =============================================================================
-- TABLE: news
-- Community-submitted news and announcements (moderated before publish).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.news (
  id           uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  title        text        NOT NULL,
  body         text        NOT NULL,
  excerpt      text,
  source_name  text,
  source_url   text,
  category_id  int         REFERENCES public.categories (id),
  tags         text[]      DEFAULT '{}',
  status       text        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'published', 'rejected')),
  featured     boolean     NOT NULL DEFAULT false,
  published_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  search_vector tsvector
);

CREATE TRIGGER trg_news_updated_at
  BEFORE UPDATE ON public.news
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.news_search_vector_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.excerpt, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.body, '')), 'C') ||
    setweight(to_tsvector('english', array_to_string(NEW.tags, ' ')), 'D');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_news_search_vector
  BEFORE INSERT OR UPDATE ON public.news
  FOR EACH ROW EXECUTE FUNCTION public.news_search_vector_update();

CREATE INDEX IF NOT EXISTS idx_news_user_id     ON public.news (user_id);
CREATE INDEX IF NOT EXISTS idx_news_category_id ON public.news (category_id);
CREATE INDEX IF NOT EXISTS idx_news_status      ON public.news (status);
CREATE INDEX IF NOT EXISTS idx_news_featured    ON public.news (featured);
CREATE INDEX IF NOT EXISTS idx_news_published_at ON public.news (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_search      ON public.news USING gin (search_vector);
CREATE INDEX IF NOT EXISTS idx_news_tags        ON public.news USING gin (tags);


-- =============================================================================
-- TABLE: directory_entries
-- Individuals and organizations in the anthroposophical directory.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.directory_entries (
  id                uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  organization_name text        NOT NULL,
  description       text,
  category          text,
  website_url       text,
  email             text,
  phone             text,
  address           text,
  location          text,
  country           text,
  tags              text[]      DEFAULT '{}',
  is_verified       boolean     NOT NULL DEFAULT false,
  status            text        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  search_vector     tsvector
);

CREATE TRIGGER trg_directory_updated_at
  BEFORE UPDATE ON public.directory_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.directory_search_vector_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.organization_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.location, '') || ' ' || coalesce(NEW.country, '')), 'C') ||
    setweight(to_tsvector('english', array_to_string(NEW.tags, ' ')), 'D');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_directory_search_vector
  BEFORE INSERT OR UPDATE ON public.directory_entries
  FOR EACH ROW EXECUTE FUNCTION public.directory_search_vector_update();

CREATE INDEX IF NOT EXISTS idx_directory_user_id  ON public.directory_entries (user_id);
CREATE INDEX IF NOT EXISTS idx_directory_status   ON public.directory_entries (status);
CREATE INDEX IF NOT EXISTS idx_directory_country  ON public.directory_entries (country);
CREATE INDEX IF NOT EXISTS idx_directory_verified ON public.directory_entries (is_verified);
CREATE INDEX IF NOT EXISTS idx_directory_search   ON public.directory_entries USING gin (search_vector);
CREATE INDEX IF NOT EXISTS idx_directory_tags     ON public.directory_entries USING gin (tags);


-- =============================================================================
-- TABLE: organizations
-- Verified organizational profiles (schools, farms, societies, clinics, etc.).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.organizations (
  id              uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  name            text        NOT NULL,
  slug            text        NOT NULL UNIQUE,
  description     text,
  website         text,
  email           text,
  phone           text,
  address         text,
  type            text        NOT NULL DEFAULT 'other'
                              CHECK (type IN ('school', 'farm', 'society', 'clinic', 'publisher', 'other')),
  is_verified     boolean     NOT NULL DEFAULT false,
  membership_tier text        NOT NULL DEFAULT 'free'
                              CHECK (membership_tier IN ('free', 'member', 'pro')),
  logo_url        text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_organizations_user_id  ON public.organizations (user_id);
CREATE INDEX IF NOT EXISTS idx_organizations_slug     ON public.organizations (slug);
CREATE INDEX IF NOT EXISTS idx_organizations_type     ON public.organizations (type);
CREATE INDEX IF NOT EXISTS idx_organizations_verified ON public.organizations (is_verified);


-- =============================================================================
-- TABLE: saved_items
-- Bookmarks: any user can save listings, events, news, or directory entries.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.saved_items (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  item_type  text        NOT NULL
             CHECK (item_type IN ('listing', 'event', 'news', 'directory')),
  item_id    uuid        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Prevent duplicate saves
  UNIQUE (user_id, item_type, item_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_items_user_id   ON public.saved_items (user_id);
CREATE INDEX IF NOT EXISTS idx_saved_items_item_type ON public.saved_items (item_type, item_id);


-- =============================================================================
-- TABLE: reports
-- Abuse / flag reports submitted by users.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.reports (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  item_type   text        NOT NULL
              CHECK (item_type IN ('listing', 'event', 'news', 'directory')),
  item_id     uuid        NOT NULL,
  reason      text        NOT NULL,
  details     text,
  status      text        NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'reviewed', 'resolved')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_reporter_id ON public.reports (reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_item        ON public.reports (item_type, item_id);
CREATE INDEX IF NOT EXISTS idx_reports_status      ON public.reports (status);


-- =============================================================================
-- TABLE: newsletter_subscribers
-- Email list for the Sophia Commons newsletter.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  email       text        NOT NULL UNIQUE,
  name        text,
  preferences jsonb       NOT NULL DEFAULT '{}',
  confirmed   boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_newsletter_email     ON public.newsletter_subscribers (email);
CREATE INDEX IF NOT EXISTS idx_newsletter_confirmed ON public.newsletter_subscribers (confirmed);

ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

-- Anyone can subscribe (insert)
CREATE POLICY "newsletter: public insert"
  ON public.newsletter_subscribers FOR INSERT
  WITH CHECK (true);

-- Admins can read all subscribers
CREATE POLICY "newsletter: admin read"
  ON public.newsletter_subscribers FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Admins can manage subscribers
CREATE POLICY "newsletter: admin update"
  ON public.newsletter_subscribers FOR UPDATE
  TO authenticated
  USING (public.is_admin());

-- Admins can delete subscribers
CREATE POLICY "newsletter: admin delete"
  ON public.newsletter_subscribers FOR DELETE
  TO authenticated
  USING (public.is_admin());


-- =============================================================================
-- SEED DATA: Categories
-- 13 curated categories for the anthroposophical community board.
-- =============================================================================

INSERT INTO public.categories (slug, name, description, icon, display_order, is_active)
VALUES
  ('waldorf-education',      'Waldorf and Education',       'Schools, homeschooling, teacher training, educational resources', '🏫', 1,  true),
  ('biodynamic-agriculture', 'Biodynamic Agriculture',      'Farms, CSAs, seeds, tools, biodynamic certifications', '🌱', 2,  true),
  ('esoteric-studies',       'Esoteric Studies',            'Study groups, books, courses, spiritual science', '📖', 3,  true),
  ('arts-eurythmy',          'Arts and Eurythmy',           'Visual arts, music, drama, speech, eurythmy', '🎭', 4,  true),
  ('anthroposophic-medicine','Anthroposophic Medicine',     'Doctors, therapists, remedies, clinics, wellness', '💊', 5,  true),
  ('community-camphill',     'Community and Camphill',      'Camphill communities, intentional communities, cohousing', '🏘️', 6,  true),
  ('events-calendar',        'Events and Calendar',         'Upcoming gatherings, festivals, courses, conferences', '📅', 7,  true),
  ('news-announcements',     'News and Announcements',      'Community news, organizational updates, announcements', '📢', 8,  true),
  ('marketplace',            'Marketplace',                 'Buy, sell, or trade books, tools, crafts, and more', '🛒', 9,  true),
  ('housing-land',           'Housing and Land',            'Rentals, land, farm stays, community living spaces', '🌍', 10, true),
  ('jobs-volunteering',      'Jobs and Volunteering',       'Employment, apprenticeships, volunteer opportunities', '💼', 11, true),
  ('groups-circles',         'Groups and Circles',          'Reading circles, study groups, working groups, societies', '⭕', 12, true),
  ('eldercare',              'Eldercare',                   'Senior living, home care, biography work, threshold care', '🏡', 13, true),
  ('directory',              'Directory',                   'Listings of schools, farms, clinics, and organizations', '🗂️', 14, true)
ON CONFLICT (slug) DO NOTHING;


-- =============================================================================
-- TABLE: chat_messages
-- Realtime community chat messages, organized by room.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  room       text        NOT NULL,
  user_id    uuid        REFERENCES auth.users (id) ON DELETE SET NULL,
  username   text        NOT NULL,
  content    text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_room       ON public.chat_messages (room);
CREATE INDEX IF NOT EXISTS idx_chat_created_at  ON public.chat_messages (created_at DESC);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all messages
CREATE POLICY "chat: authenticated read"
  ON public.chat_messages FOR SELECT
  TO authenticated
  USING (true);

-- Authenticated users can insert messages
CREATE POLICY "chat: authenticated insert"
  ON public.chat_messages FOR INSERT
  TO authenticated
  WITH CHECK (true);


-- =============================================================================
-- TABLE: memorials
-- Approved memorial tributes for community members who have crossed the threshold.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.memorials (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       text        NOT NULL,
  years      text,
  location   text,
  bio        text        NOT NULL,
  photo_url  text,
  status     text        NOT NULL DEFAULT 'approved'
                         CHECK (status IN ('approved', 'pending', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memorials_status ON public.memorials (status);

ALTER TABLE public.memorials ENABLE ROW LEVEL SECURITY;

-- Public can read approved memorials
CREATE POLICY "memorials: public read approved"
  ON public.memorials FOR SELECT
  USING (status = 'approved');

-- Admins can manage all memorials
CREATE POLICY "memorials: admin all"
  ON public.memorials FOR ALL
  TO authenticated
  USING (public.is_admin());


-- =============================================================================
-- TABLE: memorials_pending
-- User-submitted memorial tributes awaiting review.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.memorials_pending (
  id            uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          text        NOT NULL,
  years         text,
  location      text,
  bio           text        NOT NULL,
  photo_url     text,
  contact_email text,
  status        text        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.memorials_pending ENABLE ROW LEVEL SECURITY;

-- Anyone can submit a memorial
CREATE POLICY "memorials_pending: public insert"
  ON public.memorials_pending FOR INSERT
  WITH CHECK (true);

-- Admins can read/update pending memorials
CREATE POLICY "memorials_pending: admin read"
  ON public.memorials_pending FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "memorials_pending: admin update"
  ON public.memorials_pending FOR UPDATE
  TO authenticated
  USING (public.is_admin());

-- Admins can delete pending memorials (approve/reject)
CREATE POLICY "memorials_pending: admin delete"
  ON public.memorials_pending FOR DELETE
  TO authenticated
  USING (public.is_admin());


-- =============================================================================
-- TABLE: listings_pending
-- Anonymous listing submissions awaiting moderation.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.listings_pending (
  id            uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          text        NOT NULL,
  url           text,
  category      text        NOT NULL,
  location      text,
  description   text,
  contact_email      text,
  directory_entry_id uuid,
  submitted_at       timestamptz NOT NULL DEFAULT now(),
  status             text        NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending', 'approved', 'rejected'))
);

ALTER TABLE public.listings_pending ENABLE ROW LEVEL SECURITY;

-- Anyone can submit a listing
CREATE POLICY "listings_pending: public insert"
  ON public.listings_pending FOR INSERT
  WITH CHECK (true);

-- Admins can manage pending listings
CREATE POLICY "listings_pending: admin read"
  ON public.listings_pending FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "listings_pending: admin update"
  ON public.listings_pending FOR UPDATE
  TO authenticated
  USING (public.is_admin());


-- =============================================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- Supabase trigger: whenever a new auth.users row is inserted, create a profile.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- =============================================================================
-- TABLE: steiner_books
-- Catalog of Rudolf Steiner's written works and lecture cycles (GA numbers).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.steiner_books (
  id                uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  ga_number         text,
  title             text        NOT NULL,
  category          text,
  archive_url       text,
  steinerbooks_url  text,
  price             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_steiner_books_updated_at
  BEFORE UPDATE ON public.steiner_books
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_steiner_books_ga_number ON public.steiner_books (ga_number);
CREATE INDEX IF NOT EXISTS idx_steiner_books_category  ON public.steiner_books (category);

-- =============================================================================
-- TABLE: comments
-- Threaded comments on all content types.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.comments (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_type   text        NOT NULL
                          CHECK (post_type IN ('listing', 'event', 'news', 'directory', 'memorial')),
  post_id     uuid        NOT NULL,
  user_id     uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  parent_id   uuid        REFERENCES public.comments (id) ON DELETE CASCADE,
  content     text        NOT NULL CHECK (char_length(content) <= 2000),
  is_edited   boolean     NOT NULL DEFAULT false,
  is_deleted  boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_post      ON public.comments (post_type, post_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent    ON public.comments (parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_user      ON public.comments (user_id);
CREATE INDEX IF NOT EXISTS idx_comments_created   ON public.comments (created_at DESC);

CREATE TRIGGER set_comments_updated_at
  BEFORE UPDATE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comments: public read"
  ON public.comments FOR SELECT
  USING (true);

CREATE POLICY "comments: authenticated insert"
  ON public.comments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "comments: owner update"
  ON public.comments FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "comments: admin update"
  ON public.comments FOR ALL
  TO authenticated
  USING (public.is_admin());

-- =============================================================================
-- TABLE: comment_votes
-- Upvotes/downvotes on comments.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.comment_votes (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  comment_id  uuid        NOT NULL REFERENCES public.comments (id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  vote        smallint    NOT NULL CHECK (vote IN (1, -1)),
  UNIQUE (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_comment_votes_comment ON public.comment_votes (comment_id);

ALTER TABLE public.comment_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comment_votes: read own"
  ON public.comment_votes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "comment_votes: insert own"
  ON public.comment_votes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "comment_votes: update own"
  ON public.comment_votes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "comment_votes: delete own"
  ON public.comment_votes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_steiner_books_title     ON public.steiner_books (title);
