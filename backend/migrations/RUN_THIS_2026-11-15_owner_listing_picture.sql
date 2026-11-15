-- =============================================================================
-- 2026-11-15: listing managers change their own picture (owner request after Otto Specht School asked)
-- A signed-in manager (directory_entries.claimed_by) uploads into listing-photos/owner/<entry id>/,
-- then owner_set_listing_photo() points the listing at it. Every change is logged in listing_edits.
-- =============================================================================

-- Uploads: 8 MB cap and picture types only, for every upload to this bucket
UPDATE storage.buckets
   SET file_size_limit = 8388608,
       allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
 WHERE id = 'listing-photos';

-- True when the signed-in user manages this listing. SECURITY DEFINER so the check does not depend on
-- whether the listing is visible to that user under directory_entries RLS.
CREATE OR REPLACE FUNCTION public.i_manage_listing(entry text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.directory_entries d
                  WHERE d.id::text = entry AND d.claimed_by IS NOT NULL AND d.claimed_by = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.i_manage_listing(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.i_manage_listing(text) TO authenticated;

-- Only the listing's manager may add files, and only in that listing's own folder
DROP POLICY IF EXISTS "Listing managers upload pictures" ON storage.objects;
CREATE POLICY "Listing managers upload pictures" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'listing-photos'
    AND (storage.foldername(name))[1] = 'owner'
    AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp')
    AND public.i_manage_listing((storage.foldername(name))[2])
  );

CREATE OR REPLACE FUNCTION public.owner_set_listing_photo(entry uuid, path text, logo boolean DEFAULT true)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.directory_entries; url text;
BEGIN
  SELECT * INTO d FROM public.directory_entries WHERE id = entry;
  IF NOT FOUND THEN RAISE EXCEPTION 'listing not found'; END IF;
  IF d.claimed_by IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'you do not manage this listing' USING ERRCODE = '42501';
  END IF;
  IF path IS NULL OR path !~ ('^owner/' || entry::text || '/[A-Za-z0-9_-]{6,80}\.(jpg|jpeg|png|webp)$') THEN
    RAISE EXCEPTION 'picture path looks wrong';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'listing-photos' AND o.name = path) THEN
    RAISE EXCEPTION 'picture not found; please upload it again';
  END IF;
  url := 'https://bnrvgitzbpocratvszgk.supabase.co/storage/v1/object/public/listing-photos/' || path
         || CASE WHEN logo THEN '#contain' ELSE '' END;
  PERFORM set_config('sc.owner_update', 'on', true);
  UPDATE public.directory_entries SET photo_url = url, photo_credit = NULL, updated_at = now() WHERE id = entry;
  PERFORM set_config('sc.owner_update', 'off', true);
  INSERT INTO public.listing_edits (entry_id, user_id, changes)
  VALUES (entry, auth.uid(), jsonb_build_object('before', jsonb_build_object('photo_url', d.photo_url),
                                                'after', jsonb_build_object('photo_url', url)));
  RETURN url;
END $$;

REVOKE ALL ON FUNCTION public.owner_set_listing_photo(uuid, text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.owner_set_listing_photo(uuid, text, boolean) TO authenticated;
