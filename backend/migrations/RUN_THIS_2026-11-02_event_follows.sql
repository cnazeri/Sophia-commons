-- Follow a group (owner, 2026-11-02, Phase C): a visitor enters an email on a listing page and gets one
-- email each time that listing adds an event. Double opt-in: nothing is sent until the confirm link is
-- clicked, and every email has an unsubscribe link. Safe to run twice.
--
-- Only the event-follow edge function (service role) reads or writes this table; there are no public policies.

create table if not exists public.event_follows (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null check (char_length(email) between 3 and 254),
  directory_entry_id uuid not null references public.directory_entries(id) on delete cascade,
  token              uuid not null default gen_random_uuid(),
  confirmed          boolean not null default false,
  created_at         timestamptz not null default now(),
  confirm_sent_at    timestamptz,
  confirmed_at       timestamptz,
  stopped_at         timestamptz
);
create unique index if not exists event_follows_email_entry on public.event_follows (lower(email), directory_entry_id);
create unique index if not exists event_follows_token on public.event_follows (token);
create index if not exists event_follows_entry on public.event_follows (directory_entry_id) where confirmed;
alter table public.event_follows enable row level security;

-- When followers were told about this event (each event is announced once)
alter table public.events add column if not exists follows_notified_at timestamptz;

-- Check: should list the table, then the new events column
select to_regclass('public.event_follows');
select column_name from information_schema.columns where table_name = 'events' and column_name = 'follows_notified_at';
