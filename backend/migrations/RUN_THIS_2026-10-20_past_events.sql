-- =============================================================================
-- Sophia Commons :: past events stay readable once they are marked 'past'
-- Run once in Supabase Dashboard -> SQL Editor (idempotent; safe to re-run).
--
-- Why: events keep status 'upcoming' after they end (60 of 60 were 'upcoming' on 2026-10-20, 11 of
-- them already over). A daily job (automation/mark_past_events.py) sets status = 'past' once an
-- event has ended ('past' is already allowed by events_status_check). The public read policy only
-- allowed 'upcoming' and 'ongoing', which would turn every past event page (some already in Google)
-- into "not found". This lets the public read 'past' events too. Lists keep asking for
-- upcoming/ongoing only, so past events drop out of them while their pages keep working.
-- (Replaces the first version of this file, which used 'completed': not an allowed status.)
-- =============================================================================

DROP POLICY IF EXISTS "events: public read" ON public.events;
CREATE POLICY "events: public read"
  ON public.events FOR SELECT
  USING (status IN ('upcoming', 'ongoing', 'past'));

-- Check: expect one row whose rule includes 'past'
SELECT polname, pg_get_expr(polqual, polrelid) AS rule
FROM pg_policy WHERE polrelid = 'public.events'::regclass AND polname = 'events: public read';
