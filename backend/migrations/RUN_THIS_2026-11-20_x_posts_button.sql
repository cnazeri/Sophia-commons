-- Post to X from the Admin dashboard (owner, 2026-11-20)
-- 1. "posting": the x-post function claims a draft before sending, so a double click cannot post twice.
-- 2. text: the sentences without hashtags and link, shown in the home page X box.
-- 3. latest_x_post(): anyone may read the newest SENT post (what is already public on X); drafts stay admin-only.

alter table public.x_posts drop constraint if exists x_posts_status_check;
alter table public.x_posts add constraint x_posts_status_check check (status in ('draft', 'posting', 'posted'));
alter table public.x_posts add column if not exists text text;

create or replace function public.latest_x_post()
returns table (url text, text text, posted_at timestamptz)
language sql stable security definer set search_path = public as $$
  select posted_url, coalesce(x.text, x.post), x.posted_at
  from public.x_posts x
  where x.status = 'posted' and x.posted_url like 'https://x.com/%'
  order by x.posted_at desc nulls last
  limit 1;
$$;
revoke all on function public.latest_x_post() from public;
grant execute on function public.latest_x_post() to anon, authenticated;

-- Check: the function exists and returns 0 or 1 row
select count(*) as rows from public.latest_x_post();
