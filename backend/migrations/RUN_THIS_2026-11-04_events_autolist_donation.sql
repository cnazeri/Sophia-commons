-- Events: listed at once, reviewed afterwards; donation link (owner, 2026-11-04)
-- 1. needs_review: true for events members create (event-save sets it). They are live on the calendar right away
--    and show under Admin > Events until the owner marks them as seen or takes them down.
-- 2. donation_url: an optional "suggested donation" page, shown on the event page and both sign-up forms.

alter table public.events add column if not exists needs_review boolean not null default false;
alter table public.events add column if not exists donation_url text;

create index if not exists events_needs_review on public.events (created_at desc) where needs_review;

-- Members cannot clear needs_review themselves (admins, the SQL editor and the service role are not affected).
-- This runs alongside events_guard_owner_fields from 2026-11-01.
create or replace function public.events_guard_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.needs_review := true;
  else
    new.needs_review := old.needs_review;
  end if;
  return new;
end $$;
drop trigger if exists events_guard_review on public.events;
create trigger events_guard_review before insert or update on public.events
  for each row execute function public.events_guard_review();

-- Check: expect 2 rows
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'events' and column_name in ('needs_review', 'donation_url')
order by column_name;
