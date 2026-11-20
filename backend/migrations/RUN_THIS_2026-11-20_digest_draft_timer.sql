-- Build the weekly digest draft from Supabase's own timer instead of GitHub's (owner, 2026-11-20)
-- GitHub was due to run it Thu 8 pm Pacific (Fri 04:00 UTC) but started it at 4:31 am, 8.5 hours late, so the
-- "draft ready" email arrived overnight. pg_cron runs on time. Times are UTC: 8 pm Pacific in winter, 9 pm in summer.
-- The GitHub workflow stays as a backup; a second run sees "Draft already waiting" and stops.
-- Uses the Vault secret scheduler_key added by scripts/setup_email_timers.sh.

-- Safe to run twice: removes an earlier copy of this one job only
select cron.unschedule(jobid) from cron.job where jobname = 'weekly-digest-draft';

select cron.schedule('weekly-digest-draft', '0 4 * * 5', $job$
  select net.http_post(
    url := 'https://bnrvgitzbpocratvszgk.supabase.co/functions/v1/weekly-digest',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'scheduler_key')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000);
$job$);

-- Check: expect 3 rows, all active
select jobname, schedule, active from cron.job
where jobname in ('weekly-digest-draft', 'send-due-digest', 'send-due-outreach') order by jobname;
