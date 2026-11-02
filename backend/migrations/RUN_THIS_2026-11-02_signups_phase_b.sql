-- Event sign-ups, Phase B (owner, 2026-11-02): spots and a waitlist, a closing time, a cancel link,
-- a reminder the day before, and organizers can message everyone who signed up.
-- Run once in the Supabase SQL editor. Safe to run twice.
--
-- Sign-ups are still written only through the edge functions (service role). Placing and cancelling go
-- through the two functions below, which lock the event first so two people cannot take the last spot.

-- 1. Events: how many people fit (empty = no limit) and when sign-ups close (hours before the start;
--    empty = open until the event is over). Hours, not a date, so a weekly series works the same each week.
alter table public.events add column if not exists signup_capacity int check (signup_capacity between 1 and 10000);
alter table public.events add column if not exists signup_close_hours int check (signup_close_hours between 0 and 720);

-- 2. Sign-ups: waitlist status, a private cancel token, and when the reminder went out
alter table public.event_signups drop constraint if exists event_signups_status_check;
alter table public.event_signups add constraint event_signups_status_check check (status in ('confirmed', 'waitlist', 'cancelled'));
alter table public.event_signups add column if not exists cancel_token uuid not null default gen_random_uuid();
alter table public.event_signups add column if not exists cancelled_at timestamptz;
alter table public.event_signups add column if not exists reminded_at timestamptz;
create unique index if not exists event_signups_cancel_token on public.event_signups (cancel_token);

-- Organizers may still cancel from the table, but the app now uses the edge function (it also moves people
-- up from the waitlist). They may not set 'waitlist' or 'confirmed' on someone by hand.
drop policy if exists "event owner or admin cancels sign-ups" on public.event_signups;
create policy "event owner or admin cancels sign-ups" on public.event_signups
  for update to authenticated
  using (
    exists (select 1 from public.events e where e.id = event_id and e.user_id = auth.uid())
    or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
  )
  with check (status = 'cancelled');

-- 3. Moves people up from the waitlist, oldest first, while they fit. Returns the ones moved up.
--    Stops at the first one who does not fit, so nobody is skipped over.
create or replace function public.event_signup_promote(p_event uuid)
returns setof public.event_signups language plpgsql security definer set search_path = public as $$
declare cap int; used int; w public.event_signups;
begin
  perform pg_advisory_xact_lock(hashtext(p_event::text));
  select signup_capacity into cap from events where id = p_event;
  select coalesce(sum(attending), 0) into used from event_signups where event_id = p_event and status = 'confirmed';
  for w in select * from event_signups where event_id = p_event and status = 'waitlist' order by created_at loop
    exit when cap is not null and used + w.attending > cap;
    update event_signups set status = 'confirmed' where id = w.id returning * into w;
    used := used + w.attending;
    return next w;
  end loop;
end $$;

-- 4. Places one sign-up: confirmed when it fits, else on the waitlist. Raises 'duplicate' (23505) if the
--    email has already signed up (a cancelled sign-up can sign up again).
create or replace function public.event_signup_place(p_event uuid, p_name text, p_email text, p_attending int, p_answers jsonb, p_note text)
returns public.event_signups language plpgsql security definer set search_path = public as $$
declare cap int; used int; old public.event_signups; r public.event_signups; st text;
begin
  perform pg_advisory_xact_lock(hashtext(p_event::text));
  select signup_capacity into cap from events where id = p_event;
  select coalesce(sum(attending), 0) into used from event_signups where event_id = p_event and status = 'confirmed';
  -- Anyone already waiting goes first, so a newcomer never jumps the queue
  st := case when cap is null then 'confirmed'
             when exists (select 1 from event_signups where event_id = p_event and status = 'waitlist') then 'waitlist'
             when used + p_attending <= cap then 'confirmed' else 'waitlist' end;
  select * into old from event_signups where event_id = p_event and lower(email) = lower(p_email);
  if found then
    if old.status <> 'cancelled' then raise exception 'duplicate' using errcode = '23505'; end if;
    update event_signups set name = p_name, attending = p_attending, answers = p_answers, note = p_note, status = st,
      cancel_token = gen_random_uuid(), cancelled_at = null, reminded_at = null, emailed_at = null, created_at = now()
      where id = old.id returning * into r;
  else
    insert into event_signups (event_id, name, email, attending, answers, note, status)
      values (p_event, p_name, p_email, p_attending, p_answers, p_note, st) returning * into r;
  end if;
  return r;
end $$;

-- 5. Cancels one sign-up (by its private token, or by id for the organizer) and moves people up.
--    Returns the cancelled row first, then anyone moved up from the waitlist.
create or replace function public.event_signup_cancel(p_token uuid, p_id uuid default null)
returns setof public.event_signups language plpgsql security definer set search_path = public as $$
declare r public.event_signups;
begin
  select * into r from event_signups where (p_token is not null and cancel_token = p_token) or (p_id is not null and id = p_id) limit 1;
  if not found then return; end if;
  perform pg_advisory_xact_lock(hashtext(r.event_id::text));
  if r.status <> 'cancelled' then
    update event_signups set status = 'cancelled', cancelled_at = now() where id = r.id returning * into r;
  end if;
  return next r;
  return query select * from public.event_signup_promote(r.event_id);
end $$;

-- Only the edge functions (service role) may call these three
revoke all on function public.event_signup_promote(uuid) from public, anon, authenticated;
revoke all on function public.event_signup_place(uuid, text, text, int, jsonb, text) from public, anon, authenticated;
revoke all on function public.event_signup_cancel(uuid, uuid) from public, anon, authenticated;
grant execute on function public.event_signup_promote(uuid) to service_role;
grant execute on function public.event_signup_place(uuid, text, text, int, jsonb, text) to service_role;
grant execute on function public.event_signup_cancel(uuid, uuid) to service_role;

-- 6. Public numbers for the sign-up button: people signed up, spots left (null = no limit), waiting
create or replace function public.event_signup_spots(p_event uuid)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'count', coalesce(sum(s.attending) filter (where s.status = 'confirmed'), 0),
    'capacity', (select signup_capacity from events where id = p_event),
    'left', (select greatest(signup_capacity - coalesce(sum(s.attending) filter (where s.status = 'confirmed'), 0), 0) from events where id = p_event),
    'waiting', count(*) filter (where s.status = 'waitlist'))
  from event_signups s where s.event_id = p_event;
$$;
grant execute on function public.event_signup_spots(uuid) to anon, authenticated;

-- 7. Messages organizers send to everyone who signed up (kept for the 3-per-day limit and as a record)
create table if not exists public.event_messages (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  user_id    uuid not null,
  subject    text not null check (char_length(subject) between 1 and 150),
  body       text not null check (char_length(body) between 1 and 5000),
  sent_to    int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists event_messages_event on public.event_messages (event_id, created_at);
alter table public.event_messages enable row level security;
drop policy if exists "event owner or admin reads messages" on public.event_messages;
create policy "event owner or admin reads messages" on public.event_messages
  for select to authenticated
  using (
    exists (select 1 from public.events e where e.id = event_id and e.user_id = auth.uid())
    or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
  );

-- Check: should list signup_capacity and signup_close_hours, then {"count":0,"capacity":null,"left":null,"waiting":0}
select column_name from information_schema.columns where table_name = 'events' and column_name in ('signup_capacity', 'signup_close_hours');
select public.event_signup_spots(gen_random_uuid());
