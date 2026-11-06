-- Stay under Resend's free limit of 100 emails a day (owner, 2026-11-06: at most 99 until the plan is upgraded)
-- email_limits: one row. daily_cap is the ceiling for everything; bulk_cap is what newsletters and outreach may use,
--   so the rest stays free for sign-up confirmations and reminders, which cannot wait for tomorrow.
--   After upgrading Resend: update public.email_limits set daily_cap = 100000, bulk_cap = 100000;
-- email_daily: emails sent per UTC day, by every function.
-- newsletter_deliveries: who already got which digest, so a digest can go out over several days, once per person.

create table if not exists public.email_limits (
  id boolean primary key default true check (id),
  daily_cap integer not null default 99,
  bulk_cap integer not null default 85
);
insert into public.email_limits (id) values (true) on conflict (id) do nothing;

create table if not exists public.email_daily (
  day date primary key,
  sent integer not null default 0
);

create table if not exists public.newsletter_deliveries (
  news_id uuid not null references public.news (id) on delete cascade,
  subscriber_id uuid not null references public.newsletter_subscribers (id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (news_id, subscriber_id)
);

alter table public.email_limits enable row level security;
alter table public.email_daily enable row level security;
alter table public.newsletter_deliveries enable row level security;
drop policy if exists email_limits_admin_read on public.email_limits;
create policy email_limits_admin_read on public.email_limits for select to authenticated using (public.is_admin());
drop policy if exists email_daily_admin_read on public.email_daily;
create policy email_daily_admin_read on public.email_daily for select to authenticated using (public.is_admin());
drop policy if exists newsletter_deliveries_admin_read on public.newsletter_deliveries;
create policy newsletter_deliveries_admin_read on public.newsletter_deliveries for select to authenticated using (public.is_admin());
revoke all on public.email_limits, public.email_daily, public.newsletter_deliveries from anon;
revoke all on public.email_limits, public.email_daily, public.newsletter_deliveries from authenticated;
grant select on public.email_limits, public.email_daily, public.newsletter_deliveries to authenticated;

-- Newsletters and outreach ask for p_want emails and get what is left of today's bulk allowance
create or replace function public.email_quota_take(p_want integer)
returns integer language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'utc')::date; lim public.email_limits; used integer; ok integer;
begin
  select * into lim from public.email_limits where id;
  insert into public.email_daily (day) values (d) on conflict (day) do nothing;
  select sent into used from public.email_daily where day = d for update;
  ok := greatest(0, least(p_want, lim.bulk_cap - used, lim.daily_cap - used));
  update public.email_daily set sent = sent + ok where day = d;
  return ok;
end $$;

-- Every other email (confirmations, reminders, notices) just counts itself; a negative number gives unused ones back
create or replace function public.email_quota_note(p_n integer)
returns void language sql security definer set search_path = public as $$
  insert into public.email_daily (day, sent) values ((now() at time zone 'utc')::date, greatest(0, p_n))
  on conflict (day) do update set sent = greatest(0, public.email_daily.sent + p_n);
$$;
revoke all on function public.email_quota_take(integer) from public, anon, authenticated;
revoke all on function public.email_quota_note(integer) from public, anon, authenticated;
grant execute on function public.email_quota_take(integer) to service_role;
grant execute on function public.email_quota_note(integer) to service_role;

-- A digest is finished when everyone has it. Digests already sent count as finished.
alter table public.news add column if not exists email_done_at timestamptz;
update public.news set email_done_at = emailed_at where emailed_at is not null and email_done_at is null;

-- Check: expect 99 and 85
select daily_cap, bulk_cap from public.email_limits;
