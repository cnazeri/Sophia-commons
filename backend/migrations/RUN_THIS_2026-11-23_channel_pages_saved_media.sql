-- Owner, 2026-11-23. Run once in Supabase > SQL Editor. Safe to run again.
--
-- 1. Channel pages: each YouTube broadcaster's other accounts (Substack, Reddit, X, website, ...),
--    shown on sophiacommons.org/channel/<slug>. A list of {"platform": "...", "url": "..."}.
alter table public.youtube_channels add column if not exists links jsonb not null default '[]'::jsonb;

-- 1b. A channel and the place it belongs to (e.g. the Chicago Branch's YouTube channel and its directory listing)
--     link to each other: the channel page shows the place, the listing page shows the channel.
alter table public.youtube_channels add column if not exists directory_entry_id uuid
  references public.directory_entries (id) on delete set null;
create index if not exists youtube_channels_directory_entry_idx on public.youtube_channels (directory_entry_id);

-- 2. Saving is for signed-in members only, on the website and in the app, with one Saved list per account.
--    Events, places, articles and jobs already use saved_items. Talks, blogs and podcasts (saved in the app)
--    have text ids, so they get their own table; "data" keeps a copy so the app can open them offline.
create table if not exists public.saved_media (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text        not null check (kind in ('video', 'blog', 'podcast')),
  item_id    text        not null,
  data       jsonb       not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, item_id)
);

alter table public.saved_media enable row level security;

drop policy if exists "own saved media read" on public.saved_media;
create policy "own saved media read" on public.saved_media
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "own saved media add" on public.saved_media;
create policy "own saved media add" on public.saved_media
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "own saved media remove" on public.saved_media;
create policy "own saved media remove" on public.saved_media
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, delete on public.saved_media to authenticated;
