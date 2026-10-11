-- =============================================================================
-- Sophia Commons: organizations claim and update their own listing
-- 2026-10-10. Safe to run more than once.
-- A signed-in member asks to manage a listing (listing_claims, pending). The admin approves it, which sets
-- directory_entries.claimed_by. The claimant can then update the listing's public details through
-- owner_update_listing(); every change is logged in listing_edits.
-- Also: non-admins can no longer change status, is_verified, badges, claimed_by or user_id on any listing.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.listing_claims (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id      uuid NOT NULL REFERENCES public.directory_entries(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_name  text NOT NULL CHECK (char_length(contact_name) BETWEEN 2 AND 120),
  role          text NOT NULL CHECK (char_length(role) BETWEEN 2 AND 120),
  work_email    text NOT NULL CHECK (work_email ~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' AND char_length(work_email) <= 200),
  phone         text CHECK (phone IS NULL OR char_length(phone) <= 40),
  message       text CHECK (message IS NULL OR char_length(message) <= 1500),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  decided_at    timestamptz
);
CREATE INDEX IF NOT EXISTS listing_claims_status_idx ON public.listing_claims (status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS listing_claims_one_open ON public.listing_claims (entry_id, user_id) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.listing_edits (
  id         bigserial PRIMARY KEY,
  entry_id   uuid NOT NULL REFERENCES public.directory_entries(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL,
  changes    jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Claims: members create their own (always pending), see their own; the admin sees and decides all.
CREATE OR REPLACE FUNCTION public.listing_claims_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_admin() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.user_id := auth.uid(); NEW.status := 'pending'; NEW.decided_at := NULL;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'only the admin can change a claim' USING ERRCODE = '42501';
END $$;
DROP TRIGGER IF EXISTS listing_claims_guard ON public.listing_claims;
CREATE TRIGGER listing_claims_guard BEFORE INSERT OR UPDATE ON public.listing_claims
  FOR EACH ROW EXECUTE FUNCTION public.listing_claims_guard();

ALTER TABLE public.listing_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS claims_insert_own ON public.listing_claims;
CREATE POLICY claims_insert_own ON public.listing_claims FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS claims_read_own_or_admin ON public.listing_claims;
CREATE POLICY claims_read_own_or_admin ON public.listing_claims FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS claims_admin_update ON public.listing_claims;
CREATE POLICY claims_admin_update ON public.listing_claims FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT, INSERT, UPDATE ON public.listing_claims TO authenticated;
REVOKE ALL ON public.listing_claims FROM anon;

ALTER TABLE public.listing_edits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS edits_admin_read ON public.listing_edits;
CREATE POLICY edits_admin_read ON public.listing_edits FOR SELECT TO authenticated USING (public.is_admin());
REVOKE ALL ON public.listing_edits FROM anon, authenticated;
GRANT SELECT ON public.listing_edits TO authenticated;

-- Non-admins may never change moderation fields on a listing (closes a gap in the old 'owner update' policy).
CREATE OR REPLACE FUNCTION public.directory_entries_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  -- the admin, server scripts (service role / SQL editor) and owner_update_listing() are trusted
  IF public.is_admin() OR current_setting('sc.owner_update', true) = 'on'
     OR coalesce(auth.role(), '') = 'service_role' OR current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pending'; NEW.is_verified := false; NEW.badges := '{}'; NEW.claimed_by := NULL;
  ELSE
    NEW.status := OLD.status; NEW.is_verified := OLD.is_verified; NEW.badges := OLD.badges;
    NEW.claimed_by := OLD.claimed_by; NEW.user_id := OLD.user_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS directory_entries_guard ON public.directory_entries;
CREATE TRIGGER directory_entries_guard BEFORE INSERT OR UPDATE ON public.directory_entries
  FOR EACH ROW EXECUTE FUNCTION public.directory_entries_guard();

-- Admin: approve or reject a claim. Approving makes the claimant the listing's manager.
CREATE OR REPLACE FUNCTION public.admin_decide_claim(claim_id uuid, approve boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.listing_claims;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only' USING ERRCODE = '42501'; END IF;
  SELECT * INTO c FROM public.listing_claims WHERE id = claim_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'claim not found'; END IF;
  UPDATE public.listing_claims SET status = CASE WHEN approve THEN 'approved' ELSE 'rejected' END, decided_at = now() WHERE id = claim_id;
  IF approve THEN
    UPDATE public.directory_entries SET claimed_by = c.user_id, updated_at = now() WHERE id = c.entry_id;
    -- any other open claims on the same listing are closed
    UPDATE public.listing_claims SET status = 'rejected', decided_at = now() WHERE entry_id = c.entry_id AND status = 'pending' AND id <> claim_id;
  END IF;
END $$;

-- Listing manager: update the public details of a listing they manage. Only these fields can change.
CREATE OR REPLACE FUNCTION public.owner_update_listing(entry uuid, fields jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.directory_entries; allowed text[] := ARRAY['description','website_url','email','phone','address','city','region','location','tags'];
        k text; changes jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO d FROM public.directory_entries WHERE id = entry;
  IF NOT FOUND THEN RAISE EXCEPTION 'listing not found'; END IF;
  IF d.claimed_by IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'you do not manage this listing' USING ERRCODE = '42501';
  END IF;
  FOR k IN SELECT jsonb_object_keys(fields) LOOP
    IF NOT k = ANY(allowed) THEN RAISE EXCEPTION 'field % cannot be changed here', k; END IF;
  END LOOP;
  IF fields ? 'description' AND char_length(fields->>'description') > 3000 THEN RAISE EXCEPTION 'description too long'; END IF;
  IF fields ? 'website_url' AND coalesce(fields->>'website_url','') <> '' AND (fields->>'website_url') !~ '^https?://' THEN RAISE EXCEPTION 'website must start with http:// or https://'; END IF;
  IF fields ? 'email' AND coalesce(fields->>'email','') <> '' AND (fields->>'email') !~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' THEN RAISE EXCEPTION 'email looks wrong'; END IF;
  changes := jsonb_build_object('before', (SELECT jsonb_object_agg(key, to_jsonb(d) -> key) FROM jsonb_object_keys(fields) AS key), 'after', fields);
  PERFORM set_config('sc.owner_update', 'on', true);
  UPDATE public.directory_entries SET
    description = CASE WHEN fields ? 'description' THEN NULLIF(fields->>'description','') ELSE description END,
    website_url = CASE WHEN fields ? 'website_url' THEN NULLIF(fields->>'website_url','') ELSE website_url END,
    email       = CASE WHEN fields ? 'email' THEN NULLIF(fields->>'email','') ELSE email END,
    phone       = CASE WHEN fields ? 'phone' THEN NULLIF(left(fields->>'phone', 40),'') ELSE phone END,
    address     = CASE WHEN fields ? 'address' THEN NULLIF(left(fields->>'address', 300),'') ELSE address END,
    city        = CASE WHEN fields ? 'city' THEN NULLIF(left(fields->>'city', 120),'') ELSE city END,
    region      = CASE WHEN fields ? 'region' THEN NULLIF(left(fields->>'region', 120),'') ELSE region END,
    location    = CASE WHEN fields ? 'location' THEN NULLIF(left(fields->>'location', 200),'') ELSE location END,
    tags        = CASE WHEN fields ? 'tags' THEN ARRAY(SELECT left(lower(x), 40) FROM jsonb_array_elements_text(fields->'tags') x LIMIT 12) ELSE tags END,
    updated_at  = now()
  WHERE id = entry;
  PERFORM set_config('sc.owner_update', 'off', true);
  INSERT INTO public.listing_edits (entry_id, user_id, changes) VALUES (entry, auth.uid(), changes);
END $$;

REVOKE ALL ON FUNCTION public.admin_decide_claim(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owner_update_listing(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_decide_claim(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_update_listing(uuid, jsonb) TO authenticated;
