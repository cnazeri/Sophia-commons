-- =============================================================================
-- Sophia Commons :: past events stay readable once they are marked 'completed'
-- Run once in Supabase Dashboard -> SQL Editor (idempotent; safe to re-run).
--
-- Why: events keep status 'upcoming' after they end (60 of 60 were 'upcoming' on 2026-10-20, 11 of
-- them already over), so lists had to filter by date everywhere. A daily job
-- (automation/mark_past_events.py) will set status = 'completed' once an event has ended. The public
-- read policy only allowed 'upcoming' and 'ongoing', which would have turned every past event page
-- (some already in Google) into "not found". This adds 'completed' to what the public can read.
-- Lists keep asking for upcoming/ongoing only, so past events drop out of them but their pages work.
-- =============================================================================

DROP POLICY IF EXISTS "events: public read" ON public.events;
CREATE POLICY "events: public read"
  ON public.events FOR SELECT
  USING (status IN ('upcoming', 'ongoing', 'completed'));

-- Check: expect one row with the new rule
SELECT polname, pg_get_expr(polqual, polrelid) AS rule
FROM pg_policy WHERE polrelid = 'public.events'::regclass AND polname = 'events: public read';
