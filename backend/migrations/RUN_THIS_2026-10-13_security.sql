-- Sophia Commons: security hardening, 2026-10-11 review (sections 1-9) plus 2026-10-13 newsletter fix (section 10).
-- Run once in the Supabase SQL editor. Everything is inside one transaction: if any line fails,
-- nothing is changed. Safe to re-run (drops use IF EXISTS, constraints are re-created).
--
-- What the site keeps doing after this:
--   - anonymous visitors can still submit listings, memorials (with a photo) and page views
--   - the live visitor counter keeps working (same upsert from the browser)
--   - admins keep every power they have today
-- What stops working (on purpose):
--   - anonymous uploads to listing-photos (the site never does this; local scripts use the server key)
--   - memorial photos over 5 MB or not JPEG/PNG/WebP/GIF
--   - deleting or rewriting other visitors' heartbeat rows
--   - signed-in users inserting into listings_approved
--   - more than 3 listing claims per user per 24 hours, a second open claim on the same listing,
--     or a claim on a listing that already has an owner

begin;

-- 1. Storage: done in the dashboard instead (the SQL editor role does not own storage tables):
--    Storage > Policies > listing-photos: delete "Allow public upload listing-photos"
--    Storage > memorial-photos > Edit bucket: file size limit 5 MB, allowed types image/jpeg, image/png, image/webp, image/gif

-- 2. Duplicate "anyone can insert" policies (an identical policy stays in place for each) ----
drop policy if exists "Allow anon insert listings_pending" on public.listings_pending;   -- keeps "listings_pending: anyone insert"
drop policy if exists "Allow inserts" on public.memorials_pending;                       -- keeps "memorials_pending: public insert"
drop policy if exists "Allow anonymous inserts" on public.page_views;                   -- keeps "page_views: public insert"

-- 3. Length limits on public submissions (NOT VALID: checked for new and edited rows only) ---
alter table public.listings_pending drop constraint if exists listings_pending_lengths;
alter table public.listings_pending add constraint listings_pending_lengths check (
  char_length(coalesce(name, '')) <= 200 and char_length(coalesce(url, '')) <= 500
  and char_length(coalesce(category, '')) <= 60 and char_length(coalesce(location, '')) <= 200
  and char_length(coalesce(description, '')) <= 5000 and char_length(coalesce(contact_email, '')) <= 254
  and char_length(coalesce(photo_url, '')) <= 500) not valid;

alter table public.memorials_pending drop constraint if exists memorials_pending_lengths;
alter table public.memorials_pending add constraint memorials_pending_lengths check (
  char_length(coalesce(name, '')) <= 200 and char_length(coalesce(years, '')) <= 60
  and char_length(coalesce(location, '')) <= 200 and char_length(coalesce(bio, '')) <= 20000
  and char_length(coalesce(contact_email, '')) <= 254 and char_length(coalesce(photo_url, '')) <= 500) not valid;

alter table public.memorial_photos drop constraint if exists memorial_photos_lengths;
alter table public.memorial_photos add constraint memorial_photos_lengths check (
  char_length(coalesce(memorial_name, '')) <= 200 and char_length(coalesce(caption, '')) <= 1000
  and char_length(coalesce(uploaded_by, '')) <= 200 and char_length(coalesce(photo_url, '')) <= 500) not valid;

-- Directory: limits sit well above today's longest values (description 415, name 96, URL 107)
alter table public.directory_entries drop constraint if exists directory_entries_lengths;
alter table public.directory_entries add constraint directory_entries_lengths check (
  char_length(coalesce(organization_name, '')) <= 300 and char_length(coalesce(description, '')) <= 5000
  and char_length(coalesce(website_url, '')) <= 500 and char_length(coalesce(email, '')) <= 254
  and char_length(coalesce(phone, '')) <= 50 and char_length(coalesce(address, '')) <= 500) not valid;

-- 4. Live visitor heartbeat: no more "anyone can do anything" -------------------------------
drop policy if exists "Allow upserts" on public.page_views_heartbeat;
drop policy if exists "heartbeat: read" on public.page_views_heartbeat;
drop policy if exists "heartbeat: insert" on public.page_views_heartbeat;
drop policy if exists "heartbeat: update" on public.page_views_heartbeat;
-- Session ids are random and hold no personal data; the upsert needs to see the existing row.
create policy "heartbeat: read" on public.page_views_heartbeat for select to public using (true);
create policy "heartbeat: insert" on public.page_views_heartbeat for insert to public
  with check (char_length(session_id) <= 100 and last_seen between now() - interval '5 minutes' and now() + interval '5 minutes');
create policy "heartbeat: update" on public.page_views_heartbeat for update to public using (true)
  with check (char_length(session_id) <= 100 and last_seen between now() - interval '5 minutes' and now() + interval '5 minutes');
-- (no delete policy: only the admin, through the service key, can clear rows)

-- 5. listings_approved: admin-only writes ---------------------------------------------------
drop policy if exists "Allow authenticated insert listings_approved" on public.listings_approved;
drop policy if exists "listings_approved: admin insert" on public.listings_approved;
create policy "listings_approved: admin insert" on public.listings_approved for insert to authenticated with check (public.is_admin());

-- 6. Listing claims: throttle and skip listings that already have an owner -------------------
create or replace function public.listing_claims_guard()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
BEGIN
  IF public.is_admin() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.user_id := auth.uid(); NEW.status := 'pending'; NEW.decided_at := NULL;
    IF EXISTS (SELECT 1 FROM public.directory_entries WHERE id = NEW.entry_id AND claimed_by IS NOT NULL) THEN
      RAISE EXCEPTION 'This listing already has an owner. Contact us if that is wrong.' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM public.listing_claims WHERE entry_id = NEW.entry_id AND user_id = NEW.user_id AND status = 'pending') THEN
      RAISE EXCEPTION 'You already have a claim waiting for review on this listing.' USING ERRCODE = '42501';
    END IF;
    IF (SELECT count(*) FROM public.listing_claims WHERE user_id = NEW.user_id AND created_at > now() - interval '24 hours') >= 3 THEN
      RAISE EXCEPTION 'Too many claims today. Please try again tomorrow.' USING ERRCODE = '42501';
    END IF;
    IF char_length(coalesce(NEW.contact_name, '')) > 200 OR char_length(coalesce(NEW.role, '')) > 200
       OR char_length(coalesce(NEW.work_email, '')) > 254 OR char_length(coalesce(NEW.phone, '')) > 50
       OR char_length(coalesce(NEW.message, '')) > 3000 THEN
      RAISE EXCEPTION 'One of the fields is too long.' USING ERRCODE = '22001';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'only the admin can change a claim' USING ERRCODE = '42501';
END $function$;

-- 7. Narrow table grants: RLS stays the real gate, these remove the backup keys --------------
-- TRUNCATE is not covered by RLS at all, so nobody outside the server key should hold it.
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
-- No anonymous flow updates or deletes anything except the heartbeat upsert.
revoke update, delete on all tables in schema public from anon;
grant update on public.page_views_heartbeat to anon;

-- 8. Trigger functions are not meant to be called directly ----------------------------------
revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.blog_posts_guard() from anon, authenticated, public;
revoke execute on function public.listing_claims_guard() from anon, authenticated, public;
revoke execute on function public.protect_profile_privileges() from anon, authenticated, public;
revoke execute on function public.check_social_media_links() from anon, public;

-- 9. Indexes for category pages and owner lookups -------------------------------------------
create index if not exists directory_entries_status_category_name_idx
  on public.directory_entries (status, category, organization_name);
create index if not exists directory_entries_claimed_by_idx
  on public.directory_entries (claimed_by) where claimed_by is not null;

-- 10. Newsletter double opt-in (2026-10-13 review, HIGH H2) ---------------------------------
-- Browsers could insert a subscriber row with a confirm_token they chose, then "confirm" it.
-- Subscribing now only goes through the newsletter edge function (server key), which emails a
-- real confirmation link. Privileges are checked before RLS, so this closes every insert policy.
revoke insert on public.newsletter_subscribers from anon, authenticated;

commit;

-- Quick check after running (should list the new heartbeat policies and no "Allow upserts"):
-- select tablename, policyname, cmd from pg_policies where tablename in ('page_views_heartbeat', 'listings_approved') order by 1, 2;
-- select has_table_privilege('anon', 'public.newsletter_subscribers', 'INSERT');  -- should be false
