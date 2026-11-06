-- Weekly digest: pick the date, time and time zone it goes out (owner, 2026-11-06)
-- send_at is the moment in UTC; send_tz is the zone the owner picked, for showing it back.
-- .github/workflows/newsletter.yml calls send-newsletter every 15 minutes with { due: true }; it emails a
-- pending digest whose send_at has passed, once (the emailed_at claim), with the draft as it is at that moment.

alter table public.news add column if not exists send_at timestamptz;
alter table public.news add column if not exists send_tz text;
create index if not exists idx_news_send_at on public.news (send_at) where send_at is not null and emailed_at is null;

-- Check: expect 2
select count(*) as new_columns from information_schema.columns
where table_schema = 'public' and table_name = 'news' and column_name in ('send_at', 'send_tz');
