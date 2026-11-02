-- Organizer events, Phase A (owner, 2026-11-01): groups create their own event pages at /events/new,
-- share them right away (unlisted until approved) and link them to a listing they have claimed.
-- Run once:  supabase db query --linked -f backend/migrations/RUN_THIS_2026-11-01_organizer_events.sql
-- Safe to run twice. No existing policy is changed.
--
-- Events are created and edited by the event-save edge function (service role), which decides the status:
-- 'upcoming' when the organizer has claimed a directory listing, else 'pending'. Pending events stay out of
-- every list (the lists already ask for upcoming/ongoing only) but open by direct link through get_event().

-- 1. New event columns
alter table public.events add column if not exists timezone text
  check (timezone is null or char_length(timezone) between 1 and 60);
alter table public.events add column if not exists price_text text
  check (price_text is null or char_length(price_text) <= 100);
alter table public.events add column if not exists series_id uuid;                 -- repeating events share one id
alter table public.events add column if not exists directory_entry_id uuid
  references public.directory_entries(id) on delete set null;                     -- the organizer's claimed listing

create index if not exists events_series_id on public.events (series_id) where series_id is not null;
create index if not exists events_directory_entry on public.events (directory_entry_id, start_date) where directory_entry_id is not null;
create index if not exists events_user_id on public.events (user_id, start_date);

-- 2. Read one event by id, including a pending one (shared by link before approval).
--    Rejected and cancelled events stay hidden from the public, as today. Ids are random UUIDs.
create or replace function public.get_event(p_id uuid)
returns setof public.events
language sql stable security definer set search_path = public as $$
  select * from public.events
  where id = p_id and status in ('pending', 'upcoming', 'ongoing', 'past')
  limit 1;
$$;
revoke all on function public.get_event(uuid) from public;
grant execute on function public.get_event(uuid) to anon, authenticated;

-- Check: expect the 4 new columns, then an empty result for a random id
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'events'
  and column_name in ('timezone', 'price_text', 'series_id', 'directory_entry_id')
order by column_name;
select count(*) as should_be_0 from public.get_event(gen_random_uuid());
