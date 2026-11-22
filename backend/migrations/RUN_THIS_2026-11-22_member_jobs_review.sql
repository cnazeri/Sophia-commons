-- Jobs posted by members wait for the owner's approval (owner, 2026-11-22: "a place to post in the app").
-- Before this, any signed-in member could insert a job straight into the public list (status defaults to 'active').
-- Now, for members (not admins, not the SQL editor or service role):
--   insert: status is always 'draft' (= waiting for review), the poster is the signed-in member, no 'featured' tag
--   update: members may take their own job down (status 'expired') but cannot make it public or featured
-- The owner approves in the app (Post > Review jobs) by setting status 'active'.

create or replace function public.listings_guard_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'draft';
    new.user_id := auth.uid();
    new.tags := array_remove(coalesce(new.tags, '{}'), 'featured');
    new.view_count := 0;
  else
    new.user_id := old.user_id;
    new.status := case when new.status = 'expired' then 'expired' else old.status end;
    new.tags := case when 'featured' = any(coalesce(old.tags, '{}'))
                     then array_append(array_remove(coalesce(new.tags, '{}'), 'featured'), 'featured')
                     else array_remove(coalesce(new.tags, '{}'), 'featured') end;
  end if;
  return new;
end $$;

drop trigger if exists listings_guard_member on public.listings;
create trigger listings_guard_member before insert or update on public.listings
  for each row execute function public.listings_guard_member();

-- Check: expect 1 row
select tgname from pg_trigger where tgname = 'listings_guard_member';
