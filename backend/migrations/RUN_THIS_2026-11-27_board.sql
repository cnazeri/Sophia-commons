-- Community board (owner, 2026-11-27: "turn the chat into a posts area, where individuals can make posts to
-- the board and make comments"). Owner's choices: posts appear right away (members report, block, admins remove);
-- the chat rooms become the board's topics; old chat messages stay readable as an archive; site and app both.
-- Members only, like the chat (2026-10-10). Additive: chat_messages is left as it is.
-- Run in the Supabase SQL editor (or: supabase db query --linked -f <this file>).

-- 1. Posts
create table if not exists public.board_posts (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  username      text        not null,
  topic         text        not null check (topic in ('general', 'waldorf-education', 'biodynamic', 'study-groups',
                              'eurythmy-arts', 'medicine', 'christian-community', 'meetups', 'new-members')),
  title         text        not null check (char_length(btrim(title)) between 3 and 140),
  body          text        not null check (char_length(btrim(body)) between 1 and 5000),
  comment_count integer     not null default 0,
  last_activity timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index if not exists board_posts_activity_idx on public.board_posts (last_activity desc);
create index if not exists board_posts_topic_idx on public.board_posts (topic, last_activity desc);

-- 2. Comments on a post
create table if not exists public.board_comments (
  id         uuid        primary key default gen_random_uuid(),
  post_id    uuid        not null references public.board_posts (id) on delete cascade,
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  username   text        not null,
  body       text        not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists board_comments_post_idx on public.board_comments (post_id, created_at);

-- 3. The name shown is the member's profile name, never what the browser sends
create or replace function public.board_set_username() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.username := coalesce(nullif((select p.username from public.profiles p where p.id = auth.uid()), ''), 'Member');
  return new;
end $$;
drop trigger if exists board_posts_username on public.board_posts;
create trigger board_posts_username before insert on public.board_posts for each row execute function public.board_set_username();
drop trigger if exists board_comments_username on public.board_comments;
create trigger board_comments_username before insert on public.board_comments for each row execute function public.board_set_username();

-- 4. Comment count and "last activity" on the post, kept by the database
create or replace function public.board_comment_count() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.board_posts set comment_count = comment_count + 1, last_activity = now() where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.board_posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end $$;
drop trigger if exists board_comments_count on public.board_comments;
create trigger board_comments_count after insert or delete on public.board_comments for each row execute function public.board_comment_count();

-- 5. Who can do what: signed-in members read all and write their own; authors and admins delete
alter table public.board_posts enable row level security;
alter table public.board_comments enable row level security;
revoke all on public.board_posts, public.board_comments from anon;
grant select, insert, delete on public.board_posts, public.board_comments to authenticated;

drop policy if exists "board posts: members read" on public.board_posts;
drop policy if exists "board posts: members write own" on public.board_posts;
drop policy if exists "board posts: author or admin delete" on public.board_posts;
create policy "board posts: members read" on public.board_posts for select to authenticated using (true);
create policy "board posts: members write own" on public.board_posts for insert to authenticated with check (auth.uid() = user_id);
create policy "board posts: author or admin delete" on public.board_posts for delete to authenticated using (auth.uid() = user_id or public.is_admin());

drop policy if exists "board comments: members read" on public.board_comments;
drop policy if exists "board comments: members write own" on public.board_comments;
drop policy if exists "board comments: author or admin delete" on public.board_comments;
create policy "board comments: members read" on public.board_comments for select to authenticated using (true);
create policy "board comments: members write own" on public.board_comments for insert to authenticated with check (auth.uid() = user_id);
create policy "board comments: author or admin delete" on public.board_comments for delete to authenticated using (auth.uid() = user_id or public.is_admin());

-- 6. Posts and comments can be reported (Admin > Reports), like chat messages
alter table public.reports drop constraint if exists reports_item_type_check;
alter table public.reports add constraint reports_item_type_check check (item_type = any (array[
  'listing','event','news','directory','channel_review','blog_post','chat_message','board_post','board_comment']));
