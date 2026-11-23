-- Favorite YouTube channels for signed-in members (owner, 2026-11-23): favorites show first in the
-- YouTube Channels list (website and app) and on the member's Saved page.
-- Run once in Supabase > SQL Editor. Safe to run again.

create table if not exists public.favorite_channels (
  user_id      uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  channel_slug text        not null,
  created_at   timestamptz not null default now(),
  primary key (user_id, channel_slug)
);

alter table public.favorite_channels enable row level security;

-- Each member can only see, add and remove their own favorites
drop policy if exists "own favorites read" on public.favorite_channels;
create policy "own favorites read" on public.favorite_channels
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "own favorites add" on public.favorite_channels;
create policy "own favorites add" on public.favorite_channels
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "own favorites remove" on public.favorite_channels;
create policy "own favorites remove" on public.favorite_channels
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, delete on public.favorite_channels to authenticated;
