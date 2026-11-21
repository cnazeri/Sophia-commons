-- "From Reddit": show the subreddit and the post's original date (owner, 2026-11-21).
-- Reddit blocks the site from looking the date up, so the owner enters it in Admin > Reddit posts.
alter table public.reddit_picks add column if not exists posted_on date;
notify pgrst, 'reload schema';
select count(*) as has_column from information_schema.columns where table_name = 'reddit_picks' and column_name = 'posted_on';
