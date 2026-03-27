# Sophia Commons - Supabase Setup Guide

Complete step-by-step instructions for standing up the backend from scratch.
No prior Supabase experience required.

---

## Prerequisites

- A free account at https://supabase.com
- Node.js 18+ installed on your Mac
- The Supabase CLI (installation steps below)

---

## Step 1 - Create a Supabase Project

1. Go to https://app.supabase.com and sign in.
2. Click **New Project**.
3. Fill in the fields:
   - **Organization**: your personal org or create a new one
   - **Project name**: `sophia-commons`
   - **Database password**: generate a strong password and save it somewhere safe
   - **Region**: pick the one closest to your users (US East or US West for North America)
4. Click **Create new project**. Provisioning takes about 60 seconds.
5. Once ready, you land on the project dashboard. Keep this tab open.

---

## Step 2 - Run schema.sql

This creates all tables, indexes, triggers, and seed data.

1. In the Supabase dashboard, click **SQL Editor** in the left sidebar.
2. Click **New query**.
3. Open `schema.sql` from this folder and paste the entire contents into the editor.
4. Click **Run** (or press Cmd + Enter).
5. You should see `Success. No rows returned` (or similar) for each statement.
6. Verify: click **Table Editor** in the sidebar. You should see all 10 tables listed.

If you see an error about a table already existing, click the three dots next to
the query tab and select **Reset** then re-run.

---

## Step 3 - Run rls_policies.sql

This enables Row Level Security and applies all access policies.

1. In the SQL Editor, open a **New query**.
2. Paste the entire contents of `rls_policies.sql`.
3. Click **Run**.
4. Verify: go to **Authentication > Policies**. You should see policies listed
   under each table.

---

## Step 4 - Run functions.sql

This installs the PostgreSQL functions callable as RPC endpoints.

1. In the SQL Editor, open a **New query**.
2. Paste the entire contents of `functions.sql`.
3. Click **Run**.
4. Verify: go to **Database > Functions**. You should see all 7 functions listed.

---

## Step 5 - Configure Authentication

### Enable Email Auth

1. Go to **Authentication > Providers** in the sidebar.
2. Under **Email**, confirm it is enabled.
3. Recommended settings:
   - Confirm email: ON (users must verify their email address)
   - Secure email change: ON
   - Minimum password length: 8

### Enable Google OAuth

1. Go to https://console.cloud.google.com and create a new project (or use an existing one).
2. Navigate to **APIs and Services > Credentials**.
3. Click **Create Credentials > OAuth client ID**.
4. Application type: **Web application**.
5. Add these to **Authorized redirect URIs**:
   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```
6. Copy your **Client ID** and **Client Secret**.
7. Back in Supabase: **Authentication > Providers > Google**.
8. Paste your Client ID and Client Secret. Click **Save**.

### Set the Site URL

1. Go to **Authentication > URL Configuration**.
2. Set **Site URL** to your production domain (e.g., `https://sophiacommons.org`).
3. Add to **Redirect URLs**:
   ```
   http://localhost:3000/**
   https://sophiacommons.org/**
   ```
4. Click **Save**.

---

## Step 6 - Create Storage Buckets

1. Go to **Storage** in the sidebar.
2. Click **New bucket** three times to create:

   **Bucket 1: avatars**
   - Name: `avatars`
   - Public bucket: ON
   - Click **Create bucket**

   **Bucket 2: listing-images**
   - Name: `listing-images`
   - Public bucket: ON
   - Click **Create bucket**

   **Bucket 3: event-images**
   - Name: `event-images`
   - Public bucket: ON
   - Click **Create bucket**

3. Now set storage policies. Go to **SQL Editor** and run:

```sql
-- avatars bucket policies
CREATE POLICY "avatars: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars: owner upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "avatars: owner delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- listing-images bucket policies
CREATE POLICY "listing-images: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'listing-images');

CREATE POLICY "listing-images: owner upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'listing-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "listing-images: owner delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'listing-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- event-images bucket policies
CREATE POLICY "event-images: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'event-images');

CREATE POLICY "event-images: owner upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'event-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "event-images: owner delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'event-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
```

---

## Step 7 - Get Your API Keys

1. Go to **Settings > API** in the sidebar.
2. Copy these values (you will need them for your Next.js `.env.local`):

   - **Project URL**: `https://<your-project-ref>.supabase.co`
   - **anon / public key**: safe to expose in the browser
   - **service_role key**: SECRET - never expose this in the browser or commit to git

---

## Step 8 - Set Up Environment Variables in Next.js

In your Next.js project root, create a file called `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Rules:
- Variables prefixed with `NEXT_PUBLIC_` are exposed to the browser.
- `SUPABASE_SERVICE_ROLE_KEY` must only be used in server-side code
  (API routes, Server Components, Route Handlers). Never put it in client code.
- Add `.env.local` to your `.gitignore` file.

---

## Step 9 - Schedule the Expire Listings Cron Job

To automatically expire old listings, enable pg_cron in Supabase:

1. Go to **Database > Extensions**.
2. Search for `pg_cron` and enable it.
3. Run this in the SQL Editor:

```sql
SELECT cron.schedule(
  'expire-old-listings',
  '0 2 * * *',
  $$ SELECT public.expire_old_listings(); $$
);
```

This runs the expiry function every day at 02:00 UTC.

To verify it was scheduled:
```sql
SELECT * FROM cron.job;
```

---

## Step 10 - Set Up the Admin Role

To mark a user as admin (so they can moderate content), run this in the
SQL Editor with the target user's UUID:

```sql
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}'::jsonb
WHERE id = '<target-user-uuid>';
```

The `is_admin()` function in `rls_policies.sql` checks for this `role` value.
After running this, the user can approve directory entries, publish news,
feature events, and manage reports.

---

## Step 11 - Local Development with Supabase CLI

The Supabase CLI lets you run a full local Supabase stack on your Mac.
This mirrors your cloud project for offline development and testing.

### Install the CLI

```bash
brew install supabase/tap/supabase
```

### Initialize a local project

In your project root:
```bash
supabase init
```

### Link to your cloud project

```bash
supabase login
supabase link --project-ref <your-project-ref>
```

### Pull your remote schema

```bash
supabase db pull
```

This generates migration files in `supabase/migrations/`.

### Start the local stack

```bash
supabase start
```

This spins up a local Postgres, PostgREST, GoTrue (auth), and Studio.
Local credentials will be printed to your terminal:
```
API URL:         http://localhost:54321
Studio URL:      http://localhost:54323
anon key:        <local-anon-key>
service_role key: <local-service-role-key>
```

Update `.env.local` to use the local values during development:
```
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local-anon-key>
```

### Run schema changes locally

Place `.sql` files in `supabase/migrations/` with a timestamp prefix:
```
supabase/migrations/20260101000000_initial_schema.sql
```

Then run:
```bash
supabase db reset
```

This wipes and re-applies all migrations, giving you a clean local DB.

### Push migrations to the cloud

```bash
supabase db push
```

---

## Step 12 - Deploy to Production

### Option A: Vercel (recommended)

1. Push your Next.js repo to GitHub.
2. Go to https://vercel.com and import the repo.
3. Under **Environment Variables**, add all variables from `.env.local`
   (replace `localhost:3000` with your production domain).
4. Deploy.

### Option B: Any Node.js host

1. Set the environment variables in your host's config panel.
2. Run `npm run build` and serve with `npm start`.

### Post-deploy checklist

- Update the **Site URL** in Supabase Auth settings to your production domain.
- Update the **Redirect URLs** to include your production domain.
- Update the Google OAuth **Authorized redirect URIs** to include your
  production Supabase callback URL.
- Confirm the cron job is running: `SELECT * FROM cron.job_run_details LIMIT 5;`

---

## Quick Reference: Common SQL Queries for Admin Tasks

### View pending news submissions

```sql
SELECT id, title, created_at FROM public.news WHERE status = 'pending' ORDER BY created_at;
```

### Approve a news submission

```sql
UPDATE public.news
SET status = 'published', published_at = now()
WHERE id = '<news-uuid>';
```

### Feature an event

```sql
UPDATE public.events SET featured = true WHERE id = '<event-uuid>';
```

### Approve a directory entry

```sql
UPDATE public.directory_entries SET status = 'approved', is_verified = true WHERE id = '<entry-uuid>';
```

### View flagged listings

```sql
SELECT id, title, created_at FROM public.listings WHERE status = 'flagged';
```

### See total content counts

```sql
SELECT
  (SELECT count(*) FROM public.listings   WHERE status = 'active')      AS active_listings,
  (SELECT count(*) FROM public.events     WHERE status = 'upcoming')     AS upcoming_events,
  (SELECT count(*) FROM public.news       WHERE status = 'published')    AS published_news,
  (SELECT count(*) FROM public.profiles)                                 AS total_users;
```
