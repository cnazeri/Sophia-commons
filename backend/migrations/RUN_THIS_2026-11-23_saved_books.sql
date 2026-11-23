-- Owner, 2026-11-23: every item on the site can be saved with the heart, including books (book of the week,
-- Top 50). Books have no database id, so they are saved in saved_media like talks, blogs and podcasts.
-- Run once in Supabase > SQL Editor. Safe to run again.
alter table public.saved_media drop constraint if exists saved_media_kind_check;
alter table public.saved_media add constraint saved_media_kind_check
  check (kind in ('video', 'blog', 'podcast', 'book'));
