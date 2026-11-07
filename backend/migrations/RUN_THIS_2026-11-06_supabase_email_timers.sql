-- Run the email senders from Supabase instead of relying on GitHub's timer (owner, 2026-11-06)
-- GitHub ran these jobs hours late or not at all, so a digest scheduled for 10:30 stayed unsent. pg_cron runs on time.
-- The GitHub workflows stay as a backup: a second run finds nothing to do, and newsletter_deliveries stops double sends.
-- Needs a Vault secret named scheduler_key holding a server key: scripts/setup_email_timers.sh adds it, then runs this file.

create extension if not exists pg_net;

select cron.schedule('send-due-digest', '2,17,32,47 * * * *', $job$
  select net.http_post(
    url := 'https://bnrvgitzbpocratvszgk.supabase.co/functions/v1/send-newsletter',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'scheduler_key')),
    body := '{"due":true}'::jsonb,
    timeout_milliseconds := 120000);
$job$);

select cron.schedule('send-due-outreach', '7 * * * *', $job$
  select net.http_post(
    url := 'https://bnrvgitzbpocratvszgk.supabase.co/functions/v1/outreach-send',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'scheduler_key')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000);
$job$);

-- Check: expect 2 rows, both active
select jobname, schedule, active from cron.job where jobname in ('send-due-digest', 'send-due-outreach') order by jobname;
