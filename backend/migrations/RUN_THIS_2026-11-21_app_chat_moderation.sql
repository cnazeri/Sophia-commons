-- App chat moderation (owner, 2026-11-21: "Build it now"). Apple's rules for apps with chat:
-- members can report a message, block another member, and delete their own account in the app.
-- Additive only: nothing existing is changed except the list of reportable item types.

-- 1. Chat messages can be reported (shown under Admin > Reports like other reports)
alter table public.reports drop constraint if exists reports_item_type_check;
alter table public.reports add constraint reports_item_type_check check (item_type = any (array[
  'listing','event','news','directory','channel_review','blog_post','chat_message']));

-- 2. A member's private block list. Blocked members' chat messages are hidden from the blocker.
create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);
alter table public.user_blocks enable row level security;
drop policy if exists "blocks: owner read" on public.user_blocks;
drop policy if exists "blocks: owner insert" on public.user_blocks;
drop policy if exists "blocks: owner delete" on public.user_blocks;
create policy "blocks: owner read" on public.user_blocks for select to authenticated using (auth.uid() = blocker_id);
create policy "blocks: owner insert" on public.user_blocks for insert to authenticated with check (auth.uid() = blocker_id);
create policy "blocks: owner delete" on public.user_blocks for delete to authenticated using (auth.uid() = blocker_id);

-- 3. Account deletion is done by the delete-account edge function (service role), which first removes the
--    member's chat messages and releases directory entries they claimed (the entries stay listed).
