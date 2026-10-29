-- Suggested posts for Admin > Featured post (owner, 2026-10-29).
-- automation/suggest_posts.py (daily job, service role) adds recent posts from organizations' own
-- news feeds; an admin features one with a click or dismisses it. Visitors never read this table.
create table if not exists public.suggested_posts (
  id uuid primary key default gen_random_uuid(),
  url text not null unique check (url ~* '^https://' and length(url) <= 500),
  title text not null check (length(title) <= 300),
  excerpt text check (excerpt is null or length(excerpt) <= 800),
  image_url text check (image_url is null or (image_url ~* '^https://' and length(image_url) <= 500)),
  source_name text not null check (length(source_name) <= 200),
  entry_id uuid references public.directory_entries(id) on delete set null,
  facebook_url text,
  published_at timestamptz,
  status text not null default 'new' check (status in ('new', 'featured', 'dismissed')),
  created_at timestamptz not null default now()
);
create index if not exists suggested_posts_status_idx on public.suggested_posts (status, published_at desc);

alter table public.suggested_posts enable row level security;
revoke all on public.suggested_posts from anon;
grant select, update on public.suggested_posts to authenticated;

drop policy if exists "suggested_posts: admin read" on public.suggested_posts;
create policy "suggested_posts: admin read" on public.suggested_posts for select to authenticated using (is_admin());
drop policy if exists "suggested_posts: admin update" on public.suggested_posts;
create policy "suggested_posts: admin update" on public.suggested_posts for update to authenticated using (is_admin()) with check (is_admin());
