-- Owner, 2026-11-13: at most 5,000 emails a week (Resend paid plan is 50,000 a month).
-- weekly_cap counts every email sent in the last 7 UTC days, today included.
-- Newsletters and outreach (email_quota_take) stop at it; a digest that hits it finishes on later days.

alter table public.email_limits add column if not exists weekly_cap integer not null default 5000;
update public.email_limits set weekly_cap = 5000, daily_cap = 5000, bulk_cap = 5000;

create or replace function public.email_quota_take(p_want integer)
returns integer language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'utc')::date; lim public.email_limits; used integer; week integer; ok integer;
begin
  select * into lim from public.email_limits where id;
  insert into public.email_daily (day) values (d) on conflict (day) do nothing;
  select sent into used from public.email_daily where day = d for update;
  select coalesce(sum(sent), 0) into week from public.email_daily where day > d - 7;
  ok := greatest(0, least(p_want, lim.bulk_cap - used, lim.daily_cap - used, lim.weekly_cap - week));
  update public.email_daily set sent = sent + ok where day = d;
  return ok;
end $$;
revoke all on function public.email_quota_take(integer) from public, anon, authenticated;
grant execute on function public.email_quota_take(integer) to service_role;

-- Check: expect 5000, 5000, 5000
select daily_cap, bulk_cap, weekly_cap from public.email_limits;
