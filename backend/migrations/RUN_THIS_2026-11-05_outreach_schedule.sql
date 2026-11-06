-- Outreach: approve an email now, send it later from hello@ (owner, 2026-11-05)
-- The owner approves rows in Admin > Outreach and picks a send time (status 'scheduled', send_at).
-- The outreach-send function, run every hour by .github/workflows/outreach.yml, sends what is due through
-- Resend, a few per run, and marks each row 'sent' or 'failed'. 'Open in Gmail' still works as before.

alter table public.outreach_queue add column if not exists send_at timestamptz;
alter table public.outreach_queue add column if not exists approved_at timestamptz;
alter table public.outreach_queue add column if not exists last_error text;
alter table public.outreach_queue drop constraint if exists outreach_queue_status_check;
alter table public.outreach_queue add constraint outreach_queue_status_check
  check (status in ('queued', 'scheduled', 'sending', 'sent', 'skipped', 'failed'));
create index if not exists idx_outreach_due on public.outreach_queue (send_at) where status = 'scheduled';

-- Check: expect 3
select count(*) as new_columns from information_schema.columns
where table_schema = 'public' and table_name = 'outreach_queue' and column_name in ('send_at', 'approved_at', 'last_error');
