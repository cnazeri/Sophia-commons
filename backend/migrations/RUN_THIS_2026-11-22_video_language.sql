-- Each YouTube video's language and an English title for the app's Talks pages (owner, 2026-11-22: English
-- videos first, and a talk's page says its language and shows the title in English).
-- lang is NULL until automation/translate_videos.py has checked the video (then 'en', 'de', ...).
alter table public.youtube_videos add column if not exists lang text;
alter table public.youtube_videos add column if not exists title_en text;
create index if not exists youtube_videos_lang_published_idx on public.youtube_videos (lang, published_at desc);
