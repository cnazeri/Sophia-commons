-- X posts log for the Admin "X posts" tab (owner, 2026-11-20: "so I can see the postings that are going out")
-- automation/x_post.py writes a row when it drafts a post and updates it when the post goes out.
-- Only admins can read it; only the server key (the script) writes it.

create table if not exists public.x_posts (
  id          text primary key,              -- newsletter issue id, or events-YYYY-MM-DD for the Monday post
  kind        text not null default 'newsletter' check (kind in ('newsletter', 'events', 'other')),
  title       text,
  post        text not null,                 -- the exact text, hashtags and link included
  length      int,
  status      text not null default 'draft' check (status in ('draft', 'posted')),
  posted_url  text,
  drafted_at  timestamptz not null default now(),
  posted_at   timestamptz
);

alter table public.x_posts enable row level security;

drop policy if exists "x_posts admin read" on public.x_posts;
create policy "x_posts admin read" on public.x_posts for select using (public.is_admin());

-- Check: expect 1 row
select count(*) as policies from pg_policies where tablename = 'x_posts';
