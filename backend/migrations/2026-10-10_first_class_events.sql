-- Events for the School of Spiritual Science, First Class (blue card holders): a separate event type
-- so the Groups page can list them in their own section.
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_event_type_check;
ALTER TABLE public.events ADD CONSTRAINT events_event_type_check
  CHECK (event_type = ANY (ARRAY['conference', 'festival', 'study_group', 'workshop', 'retreat', 'first_class', 'other']));
