-- Where a post came from: 'app' (the phone app) or 'web' (sophiacommons.org). Owner, 2026-11-22: "see both at once"
-- in Admin, with an App or Website tag on each item. Empty on older rows; Admin shows those as Website.
-- It is only a label: it changes nothing about who can post or what is shown publicly.
alter table public.events           add column if not exists source text;
alter table public.listings         add column if not exists source text;
alter table public.listings_pending add column if not exists source text;
alter table public.blog_posts       add column if not exists source text;

do $$
declare t text;
begin
  foreach t in array array['events', 'listings', 'listings_pending', 'blog_posts'] loop
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_source_check');
    execute format('alter table public.%I add constraint %I check (source is null or source in (''app'', ''web''))', t, t || '_source_check');
  end loop;
end $$;

-- Check: expect 4 rows
select table_name from information_schema.columns
where table_schema = 'public' and column_name = 'source' and table_name in ('events', 'listings', 'listings_pending', 'blog_posts')
order by table_name;
