-- =============================================================================
-- 2026-11-18: listing managers can remove their own picture (owner request after Firefly Oasis asked).
-- Clears photo_url only; the uploaded file stays in storage so the admin can put it back. Logged in
-- listing_edits like owner_set_listing_photo().
-- =============================================================================

CREATE OR REPLACE FUNCTION public.owner_clear_listing_photo(entry uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.directory_entries;
BEGIN
  SELECT * INTO d FROM public.directory_entries WHERE id = entry;
  IF NOT FOUND THEN RAISE EXCEPTION 'listing not found'; END IF;
  IF d.claimed_by IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'you do not manage this listing' USING ERRCODE = '42501';
  END IF;
  IF d.photo_url IS NULL THEN RETURN; END IF;
  PERFORM set_config('sc.owner_update', 'on', true);
  UPDATE public.directory_entries SET photo_url = NULL, photo_credit = NULL, updated_at = now() WHERE id = entry;
  PERFORM set_config('sc.owner_update', 'off', true);
  INSERT INTO public.listing_edits (entry_id, user_id, changes)
  VALUES (entry, auth.uid(), jsonb_build_object('before', jsonb_build_object('photo_url', d.photo_url),
                                                'after', jsonb_build_object('photo_url', NULL)));
END $$;

REVOKE ALL ON FUNCTION public.owner_clear_listing_photo(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.owner_clear_listing_photo(uuid) TO authenticated;
