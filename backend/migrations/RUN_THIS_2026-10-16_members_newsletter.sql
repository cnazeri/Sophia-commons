-- =============================================================================
-- Sophia Commons :: Members get the newsletter
-- Run once in Supabase Dashboard -> SQL Editor (idempotent; safe to re-run).
--
-- When a member confirms their account email, they are added to newsletter_subscribers as
-- confirmed (the account confirmation already proved they own the address, so no second
-- confirmation email). Source is recorded as "member".
-- Anyone who unsubscribed stays unsubscribed: the rule never touches a row with unsubscribed_at.
-- The last block adds the members who already exist.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.subscribe_confirmed_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NULL OR NEW.email_confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.email_confirmed_at IS NOT NULL AND OLD.email = NEW.email THEN
    RETURN NEW;   -- already handled when they first confirmed
  END IF;

  INSERT INTO public.newsletter_subscribers (email, confirmed, confirmed_at, preferences)
  VALUES (lower(NEW.email), true, now(), jsonb_build_object('source', 'member'))
  ON CONFLICT (email) DO UPDATE
    SET confirmed = true,
        confirmed_at = coalesce(newsletter_subscribers.confirmed_at, now()),
        confirm_token = NULL
    WHERE newsletter_subscribers.unsubscribed_at IS NULL;
  RETURN NEW;
EXCEPTION WHEN others THEN
  -- Never block a sign-up because of the newsletter list
  RAISE WARNING 'subscribe_confirmed_member failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.subscribe_confirmed_member() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_member_email_confirmed ON auth.users;
CREATE TRIGGER on_member_email_confirmed
  AFTER INSERT OR UPDATE OF email_confirmed_at, email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.subscribe_confirmed_member();

-- Existing members
INSERT INTO public.newsletter_subscribers (email, confirmed, confirmed_at, preferences)
SELECT lower(u.email), true, now(), jsonb_build_object('source', 'member')
FROM auth.users u
WHERE u.email IS NOT NULL AND u.email_confirmed_at IS NOT NULL
ON CONFLICT (email) DO UPDATE
  SET confirmed = true,
      confirmed_at = coalesce(newsletter_subscribers.confirmed_at, now()),
      confirm_token = NULL
  WHERE newsletter_subscribers.unsubscribed_at IS NULL;

-- Check: every confirmed member should now be on the list (expect 0)
SELECT count(*) AS members_not_subscribed
FROM auth.users u
LEFT JOIN public.newsletter_subscribers s ON s.email = lower(u.email)
WHERE u.email_confirmed_at IS NOT NULL AND s.id IS NULL;
