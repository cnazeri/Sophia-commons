-- AI app usage log cleanup (owner, 2026-11-27): the privacy page says these records are kept 18 months.
-- Runs on the 1st of every month at 03:00 UTC and deletes older rows. Safe to run again (replaces the job).
-- Applied 2026-11-27 with `supabase db query --linked -f`.

SELECT cron.unschedule('ai-app-calls-cleanup')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ai-app-calls-cleanup');

SELECT cron.schedule(
  'ai-app-calls-cleanup',
  '0 3 1 * *',
  $$DELETE FROM public.ai_app_calls WHERE created_at < now() - interval '18 months'$$
);
