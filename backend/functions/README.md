# Edge functions

The deployed source of the Supabase Edge Functions is in `supabase/functions/` (newsletter, send-newsletter).
Deploy with the Supabase CLI from the repo root, for example:

    supabase functions deploy newsletter --no-verify-jwt --project-ref bnrvgitzbpocratvszgk
    supabase functions deploy send-newsletter --project-ref bnrvgitzbpocratvszgk

The older copies that used to live here were removed on 2026-10-11 so the wrong version cannot be deployed.
