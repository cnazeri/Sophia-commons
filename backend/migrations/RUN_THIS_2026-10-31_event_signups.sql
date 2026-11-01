-- Event sign-ups on Sophia Commons (owner, 2026-10-31): organizers can collect sign-ups on their event page
-- instead of a Google Form. Run once in the Supabase SQL editor. Safe to run twice.
--
-- Sign-ups are written only by the event-signup edge function (service role), which checks the event,
-- removes duplicates and sends the emails. The public can neither read nor write this table directly.
-- An event's organizer (events.user_id) and admins can read and cancel its sign-ups.

-- 1. Events: sign-up switch and up to 3 organizer questions
--    signup_questions: [{"label": "Will you attend?", "type": "yesno" | "text" | "choice", "options": ["a","b"]}]
alter table public.events add column if not exists signup_enabled boolean not null default false;
alter table public.events add column if not exists signup_questions jsonb not null default '[]'::jsonb;

-- 2. The sign-ups
create table if not exists public.event_signups (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  email       text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 200),
  attending   int  not null default 1 check (attending between 1 and 20),
  answers     jsonb not null default '[]'::jsonb,     -- [{"label": "...", "answer": "..."}], same order as the questions
  note        text check (char_length(note) <= 1000),
  status      text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  emailed_at  timestamptz,
  created_at  timestamptz not null default now()
);
create unique index if not exists event_signups_one_per_email on public.event_signups (event_id, lower(email));
create index if not exists event_signups_event on public.event_signups (event_id, created_at);

alter table public.event_signups enable row level security;

-- 3. Organizer and admin access (no anon policies: the edge function writes with the service role)
drop policy if exists "event owner or admin reads sign-ups" on public.event_signups;
create policy "event owner or admin reads sign-ups" on public.event_signups
  for select to authenticated
  using (
    exists (select 1 from public.events e where e.id = event_id and e.user_id = auth.uid())
    or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
  );

drop policy if exists "event owner or admin cancels sign-ups" on public.event_signups;
create policy "event owner or admin cancels sign-ups" on public.event_signups
  for update to authenticated
  using (
    exists (select 1 from public.events e where e.id = event_id and e.user_id = auth.uid())
    or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
  )
  with check (status in ('confirmed', 'cancelled'));

-- 4. Public count for the event page ("12 people have signed up"), without exposing names or emails
create or replace function public.event_signup_count(p_event uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(attending), 0)::int from public.event_signups where event_id = p_event and status = 'confirmed';
$$;
grant execute on function public.event_signup_count(uuid) to anon, authenticated;

-- Check: should list the two new columns and return 0
select column_name from information_schema.columns where table_name = 'events' and column_name like 'signup%';
select public.event_signup_count(gen_random_uuid());
