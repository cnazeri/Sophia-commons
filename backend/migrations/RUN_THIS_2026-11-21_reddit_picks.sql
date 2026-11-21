-- Hand-picked Reddit posts for the "From Reddit" box on Social Media (owner, 2026-11-21).
-- Reddit blocks automated reads and no longer gives new API keys for this use, so the owner pastes
-- 1 to 3 post links and their titles in Admin > Reddit posts. Everyone can read them; only admins change them.

create table if not exists public.reddit_picks (
  id          uuid primary key default gen_random_uuid(),
  url         text not null check (url ~ '^https://(www\.|old\.)?reddit\.com/r/[A-Za-z0-9_]+/'),
  title       text not null check (char_length(title) between 1 and 300),
  author      text check (author is null or char_length(author) <= 40),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.reddit_picks enable row level security;

drop policy if exists "reddit_picks public read" on public.reddit_picks;
create policy "reddit_picks public read" on public.reddit_picks for select using (active or public.is_admin());

drop policy if exists "reddit_picks admin write" on public.reddit_picks;
create policy "reddit_picks admin write" on public.reddit_picks for all using (public.is_admin()) with check (public.is_admin());

-- Check: expect 2 policies
select count(*) as policies from pg_policies where tablename = 'reddit_picks';
