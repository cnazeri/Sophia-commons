-- Job posts last 90 days; the poster renews them (owner, 2026-11-22: "have the user renew the posting after 90 days").
--   renew_reminded_at: when the "your job post ends soon" email went out (the job-renew function sends one per term)
-- Members (not admins, not the server) renewing their own job:
--   - the new end date is at most 90 days from now (no posting for years)
--   - extending the end date clears renew_reminded_at, so the next term gets its own reminder
--   - members cannot set renew_reminded_at themselves
alter table public.listings add column if not exists renew_reminded_at timestamptz;

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
    new.renew_reminded_at := null;
    new.expires_at := least(coalesce(new.expires_at, now() + interval '90 days'), now() + interval '90 days');
  else
    new.user_id := old.user_id;
    new.status := case when new.status = 'expired' then 'expired' else old.status end;
    new.tags := case when 'featured' = any(coalesce(old.tags, '{}'))
                     then array_append(array_remove(coalesce(new.tags, '{}'), 'featured'), 'featured')
                     else array_remove(coalesce(new.tags, '{}'), 'featured') end;
    new.expires_at := least(new.expires_at, now() + interval '90 days');
    new.renew_reminded_at := case when new.expires_at > old.expires_at then null else old.renew_reminded_at end;
  end if;
  return new;
end $$;

-- Check: expect 1 row
select column_name from information_schema.columns where table_schema = 'public' and table_name = 'listings' and column_name = 'renew_reminded_at';
