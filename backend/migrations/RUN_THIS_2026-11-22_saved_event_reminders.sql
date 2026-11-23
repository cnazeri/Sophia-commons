-- Email reminders for events members saved on the website (owner, 2026-11-22: saved events should remind them).
-- reminded_at: when the "your saved event is tomorrow" email went out (the saved-remind function sends one per saved
-- event). Members cannot change it: saved_items has no update policy for them.
alter table public.saved_items add column if not exists reminded_at timestamptz;
create index if not exists saved_items_events_to_remind on public.saved_items (item_id) where item_type = 'event' and reminded_at is null;
-- Check: expect 1 row
select column_name from information_schema.columns where table_schema = 'public' and table_name = 'saved_items' and column_name = 'reminded_at';
