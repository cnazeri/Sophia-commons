# Sophia Commons — Weekly Digest Template

## Overview

This document describes the weekly digest system for Sophia Commons. Every week, an automated summary article is generated from the site's activity and posted to the News section on the main page.

## What the Digest Includes

1. **New Directory Listings** — Organizations, schools, farms, etc. added this week
2. **Upcoming Events** — Events happening in the next 7-14 days
3. **News Highlights** — Top news articles published this week
4. **New Memorials** — Recently approved In Memoriam tributes
5. **Community Stats** — Total listings, new members, page views
6. **Moon Phase** — Current lunar cycle info (ties into the site's anthroposophical focus)

## Automation

The digest is generated via a Supabase Edge Function (`generate-weekly-digest`) that runs every Sunday at 8:00 AM UTC. It:

1. Queries the past 7 days of activity from Supabase tables
2. Compiles the data into an HTML article
3. Inserts it into the `news` table with `status: 'published'` and `featured: true`
4. Optionally sends it as a newsletter to subscribers

## Supabase Edge Function

Deploy the function at `backend/functions/weekly-digest/index.ts` and set up a cron job in Supabase Dashboard > Database > Extensions > pg_cron:

```sql
SELECT cron.schedule(
  'weekly-digest',
  '0 8 * * 0',  -- Every Sunday at 8:00 AM UTC
  $$SELECT net.http_post(
    'https://bnrvgitzbpocratvszgk.supabase.co/functions/v1/generate-weekly-digest',
    '{}',
    'application/json',
    ARRAY[http_header('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'))]
  )$$
);
```

## Manual Generation

To generate a digest manually, run the admin function from the browser console:
```javascript
generateWeeklyDigest()
```
Or click the "Generate Weekly Digest" button in the Admin panel.
