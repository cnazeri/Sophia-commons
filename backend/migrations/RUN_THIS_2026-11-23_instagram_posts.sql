-- Weekly Instagram Reel of the upcoming events, with music (owner, 2026-11-23)
-- One row per week (id events-YYYY-MM-DD, the Monday). automation/instagram_post.py claims the row
-- ('posting') before it publishes, so a repeated or late run never posts the same week twice.
-- 'failed' rows are retried by the next scheduled run that day.

create table if not exists public.instagram_posts (
  id          text primary key,              -- events-YYYY-MM-DD (Monday of the week) or newsletter-<news id>
  kind        text not null default 'events' check (kind in ('events', 'newsletter', 'other')),
  title       text,
  caption     text not null,
  video_url   text,                          -- the reel.mp4 sent to Instagram
  music       text,                          -- file name of the track used; the next Reel takes the next one
  event_ids   uuid[] not null default '{}',
  status      text not null default 'posting' check (status in ('posting', 'posted', 'failed')),
  error       text,
  posted_url  text,
  drafted_at  timestamptz not null default now(),
  posted_at   timestamptz
);

alter table public.instagram_posts add column if not exists music text;

alter table public.instagram_posts enable row level security;

drop policy if exists "instagram_posts admin read" on public.instagram_posts;
create policy "instagram_posts admin read" on public.instagram_posts for select using (public.is_admin());

-- Public bucket for the reel videos (event-images only accepts pictures up to 5 MB).
-- Only the service role writes here (the posting script); anyone may read, which Instagram needs to fetch the video.
insert into storage.buckets (id, name, public, allowed_mime_types, file_size_limit)
values ('social', 'social', true, array['video/mp4', 'image/jpeg'], 52428800)
on conflict (id) do update set public = true, allowed_mime_types = excluded.allowed_mime_types,
  file_size_limit = excluded.file_size_limit;

-- Check: expect policies = 1 and buckets = 1
select (select count(*) from pg_policies where tablename = 'instagram_posts') as policies,
       (select count(*) from storage.buckets where id = 'social') as buckets;

-- Newsletter Reels (owner, 2026-11-23): safe to run again on a table made before this line
alter table public.instagram_posts drop constraint if exists instagram_posts_kind_check;
alter table public.instagram_posts add constraint instagram_posts_kind_check check (kind in ('events', 'newsletter', 'other'));
