# Sophia Commons - API Structure

Supabase auto-generates a full REST API from the PostgreSQL schema via PostgREST.
This document covers every endpoint, auth flow, storage configuration, real-time
setup, and how to wire a Next.js frontend to this backend.

---

## Base URL

```
https://<your-project-ref>.supabase.co
```

All REST calls go through:
```
https://<your-project-ref>.supabase.co/rest/v1/<table_or_rpc>
```

---

## Authentication Headers

Every request should include:
```
apikey: <NEXT_PUBLIC_SUPABASE_ANON_KEY>
Authorization: Bearer <user_access_token_or_anon_key>
Content-Type: application/json
```

For admin/server-side operations, replace the Bearer token with
`SUPABASE_SERVICE_ROLE_KEY`. Never expose the service role key to the browser.

---

## Auto-Generated REST Endpoints (PostgREST)

PostgREST creates CRUD endpoints for every table automatically.
RLS policies control what each caller can read or write.

### profiles

| Method | Path | Description |
|--------|------|-------------|
| GET | `/rest/v1/profiles` | List profiles (public) |
| GET | `/rest/v1/profiles?id=eq.<uuid>` | Get single profile |
| PATCH | `/rest/v1/profiles?id=eq.<uuid>` | Update own profile (auth required) |

### categories

| Method | Path | Description |
|--------|------|-------------|
| GET | `/rest/v1/categories?is_active=eq.true&order=display_order` | All active categories |
| GET | `/rest/v1/categories?slug=eq.<slug>` | Single category by slug |

### listings

| Method | Path | Description |
|--------|------|-------------|
| GET | `/rest/v1/listings?status=eq.active&order=created_at.desc` | All active listings |
| GET | `/rest/v1/listings?category_id=eq.<id>&status=eq.active` | Listings by category ID |
| GET | `/rest/v1/listings?id=eq.<uuid>` | Single listing |
| GET | `/rest/v1/listings?country=eq.USA&status=eq.active` | Listings by country |
| GET | `/rest/v1/listings?listing_type=eq.for_sale&status=eq.active` | Filter by type |
| POST | `/rest/v1/listings` | Create listing (auth required) |
| PATCH | `/rest/v1/listings?id=eq.<uuid>` | Update own listing (auth required) |
| DELETE | `/rest/v1/listings?id=eq.<uuid>` | Delete own listing (auth required) |

Filtering examples:
```
GET /rest/v1/listings?tags=cs.{biodynamic}&status=eq.active
GET /rest/v1/listings?price=lte.100&status=eq.active
GET /rest/v1/listings?select=id,title,price,location&status=eq.active&limit=20&offset=0
```

### events

| Method | Path | Description |
|--------|------|-------------|
| GET | `/rest/v1/events?status=eq.upcoming&order=start_date` | Upcoming events |
| GET | `/rest/v1/events?featured=eq.true&status=eq.upcoming` | Featured events |
| GET | `/rest/v1/events?country=eq.Germany&status=eq.upcoming` | Events by country |
| GET | `/rest/v1/events?is_online=eq.true&status=eq.upcoming` | Online-only events |
| POST | `/rest/v1/events` | Submit event (auth required) |
| PATCH | `/rest/v1/events?id=eq.<uuid>` | Update own event (auth required) |
| DELETE | `/rest/v1/events?id=eq.<uuid>` | Delete own event (auth required) |

### news

| Method | Path | Description |
|--------|------|-------------|
| GET | `/rest/v1/news?status=eq.published&order=published_at.desc` | Published news |
| GET | `/rest/v1/news?featured=eq.true&status=eq.published` | Featured articles |
| POST | `/rest/v1/news` | Submit news (auth required, lands as pending) |
| PATCH | `/rest/v1/news?id=eq.<uuid>` | Update own pending submission |
| DELETE | `/rest/v1/news?id=eq.<uuid>` | Delete own submission |

### directory_entries

| Method | Path | Description |
|--------|------|-------------|
| GET | `/rest/v1/directory_entries?status=eq.approved` | Approved directory entries |
| GET | `/rest/v1/directory_entries?country=eq.United States&status=eq.approved` | By country |
| POST | `/rest/v1/directory_entries` | Submit entry (auth required) |
| PATCH | `/rest/v1/directory_entries?id=eq.<uuid>` | Update own entry |
| DELETE | `/rest/v1/directory_entries?id=eq.<uuid>` | Delete own entry |

### organizations

| Method | Path | Description |
|--------|------|-------------|
| GET | `/rest/v1/organizations?order=name` | All organizations |
| GET | `/rest/v1/organizations?type=eq.school` | Schools only |
| GET | `/rest/v1/organizations?slug=eq.<slug>` | Single organization |
| POST | `/rest/v1/organizations` | Create organization (auth required) |
| PATCH | `/rest/v1/organizations?id=eq.<uuid>` | Update own organization |

### saved_items

| Method | Path | Description |
|--------|------|-------------|
| GET | `/rest/v1/saved_items?user_id=eq.<uuid>` | User's saved items (auth required) |
| POST | `/rest/v1/saved_items` | Save an item (auth required) |
| DELETE | `/rest/v1/saved_items?id=eq.<uuid>` | Unsave an item (auth required) |

### reports

| Method | Path | Description |
|--------|------|-------------|
| POST | `/rest/v1/reports` | Submit a report (auth required) |
| GET | `/rest/v1/reports` | View own reports (auth required) |

### newsletter_subscribers

| Method | Path | Description |
|--------|------|-------------|
| POST | `/rest/v1/newsletter_subscribers` | Subscribe (public) |

---

## Custom RPC Endpoints

These call the PostgreSQL functions defined in `functions.sql`.
All RPC calls use `POST` with a JSON body.

### increment_view_count

Atomically increments view count on a listing.

```http
POST /rest/v1/rpc/increment_view_count
Content-Type: application/json

{
  "listing_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

Response: `null` (204 No Content)

Recommended: call this on the client side when a listing detail page mounts.

---

### get_listings_by_category

Paginated listings with joined category and profile data.

```http
POST /rest/v1/rpc/get_listings_by_category
Content-Type: application/json

{
  "cat_slug": "marketplace",
  "limit_n": 20,
  "offset_n": 0
}
```

Response: Array of listing objects with `category_slug`, `category_name`,
`user_username`, `user_full_name` included.

---

### get_upcoming_events

Events starting within the next N days.

```http
POST /rest/v1/rpc/get_upcoming_events
Content-Type: application/json

{
  "days_ahead": 30,
  "limit_n": 20
}
```

Response: Array of event objects ordered by `featured DESC, start_date ASC`.

---

### search_all

Full-text search across listings, events, and news in a single request.
Uses PostgreSQL `websearch_to_tsquery` (supports quoted phrases, negation with `-`).

```http
POST /rest/v1/rpc/search_all
Content-Type: application/json

{
  "query": "biodynamic farming workshop",
  "limit_n": 30
}
```

Response: Array of results with `item_type` field (`listing`, `event`, or `news`)
and a `rank` score (higher = more relevant).

---

### expire_old_listings

Marks listings past their `expires_at` as expired. Intended for the cron job
but can be triggered manually by an admin.

```http
POST /rest/v1/rpc/expire_old_listings
Authorization: Bearer <admin_token>
```

Response: Integer (count of rows updated).

---

### get_featured_content

Returns up to 5 featured events and 5 featured news items for the homepage.

```http
POST /rest/v1/rpc/get_featured_content
```

Response: Array of `{ item_type, id, title, excerpt, image_url, created_at }`.

---

### get_directory_by_country

Approved directory entries filtered by country with pagination.

```http
POST /rest/v1/rpc/get_directory_by_country
Content-Type: application/json

{
  "country_name": "United States",
  "limit_n": 20,
  "offset_n": 0
}
```

---

## Authentication Flows

Supabase Auth is at `/auth/v1`. The JS client handles all of this automatically.

### Email and Password Signup

```js
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'securepassword',
  options: {
    data: {
      full_name: 'Firstname Lastname',
    },
  },
})
```

After signup, the `handle_new_user` trigger automatically creates a `profiles` row.
The user receives a confirmation email (configure in Supabase Auth settings).

### Email and Password Login

```js
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'securepassword',
})
```

### Google OAuth Login

```js
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
  },
})
```

Create the OAuth callback route at `app/auth/callback/route.ts`:

```ts
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  if (code) {
    const supabase = createRouteHandlerClient({ cookies })
    await supabase.auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(requestUrl.origin)
}
```

### Password Reset

```js
const { error } = await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/update-password`,
})
```

### Sign Out

```js
const { error } = await supabase.auth.signOut()
```

---

## Storage Buckets

Create these three buckets in the Supabase Dashboard under Storage.

### avatars

- Bucket name: `avatars`
- Public: yes (profile pictures are public)
- Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`
- Max file size: 2 MB
- File path convention: `<user_id>/avatar.<ext>`

Upload example:
```js
const { data, error } = await supabase.storage
  .from('avatars')
  .upload(`${userId}/avatar.jpg`, file, { upsert: true })
```

Get public URL:
```js
const { data } = supabase.storage.from('avatars').getPublicUrl(`${userId}/avatar.jpg`)
```

### listing-images

- Bucket name: `listing-images`
- Public: yes
- Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`
- Max file size: 5 MB
- File path convention: `<user_id>/<listing_id>/<filename>`

### event-images

- Bucket name: `event-images`
- Public: yes
- Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`
- Max file size: 5 MB
- File path convention: `<user_id>/<event_id>/<filename>`

Storage RLS policy for listing-images (run in SQL editor):
```sql
CREATE POLICY "listing images: owner upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'listing-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "listing images: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'listing-images');
```

Apply the same pattern for `event-images` and `avatars`.

---

## Real-Time Subscriptions

Enable real-time for a table in the Supabase Dashboard under
Database > Replication, then add the table to the supabase_realtime publication.

Or via SQL:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.listings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
```

### Subscribe to new listings

```js
const channel = supabase
  .channel('new-listings')
  .on(
    'postgres_changes',
    {
      event:  'INSERT',
      schema: 'public',
      table:  'listings',
      filter: 'status=eq.active',
    },
    (payload) => {
      console.log('New listing:', payload.new)
    }
  )
  .subscribe()

// Cleanup
supabase.removeChannel(channel)
```

### Subscribe to new events

```js
const channel = supabase
  .channel('new-events')
  .on(
    'postgres_changes',
    {
      event:  'INSERT',
      schema: 'public',
      table:  'events',
      filter: 'status=eq.upcoming',
    },
    (payload) => {
      console.log('New event:', payload.new)
    }
  )
  .subscribe()
```

---

## Rate Limiting Recommendations

Supabase does not have built-in per-endpoint rate limiting (as of 2026).
Recommended approaches:

1. **Vercel Edge Middleware** (simplest for Next.js): Use the `@upstash/ratelimit`
   package with Redis to throttle requests per IP before they hit Supabase.

2. **Cloudflare WAF**: If your domain is proxied through Cloudflare, use rate
   limiting rules on specific paths (e.g., `/rest/v1/rpc/search_all`).

3. **Supabase Row Limits**: Cap rows returned per request in PostgREST by setting
   `max-rows` in project settings (recommended: 100).

4. **Search endpoint**: The `search_all` RPC is the most expensive. Add a
   debounce of at least 300ms on the frontend and cache results with SWR or
   React Query.

---

## Connecting a Next.js Frontend

### Install dependencies

```bash
npm install @supabase/supabase-js @supabase/auth-helpers-nextjs
```

### Create the Supabase client

`lib/supabase/client.ts` (browser):
```ts
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import type { Database } from '@/types/supabase'

export const supabase = createClientComponentClient<Database>()
```

`lib/supabase/server.ts` (Server Components / Route Handlers):
```ts
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import type { Database } from '@/types/supabase'

export const createServerSupabase = () =>
  createServerComponentClient<Database>({ cookies })
```

### Generate TypeScript types from your schema

```bash
npx supabase gen types typescript \
  --project-id <your-project-ref> \
  --schema public \
  > types/supabase.ts
```

Run this command every time you change the schema.

### Example: fetch active listings in a Server Component

```ts
import { createServerSupabase } from '@/lib/supabase/server'

export default async function ListingsPage() {
  const supabase = createServerSupabase()

  const { data: listings, error } = await supabase
    .from('listings')
    .select('id, title, price, location, listing_type, created_at')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) throw error
  return <ListingGrid listings={listings} />
}
```

### Example: create a listing from a Client Component

```ts
'use client'
import { supabase } from '@/lib/supabase/client'

async function createListing(formData: ListingFormData) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('listings')
    .insert({
      user_id:      user.id,
      category_id:  formData.categoryId,
      title:        formData.title,
      description:  formData.description,
      listing_type: formData.listingType,
      location:     formData.location,
      country:      formData.country,
      tags:         formData.tags,
    })
    .select()
    .single()

  if (error) throw error
  return data
}
```

### Middleware for protecting routes

`middleware.ts` (Next.js App Router):
```ts
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })
  await supabase.auth.getSession()
  return res
}

export const config = {
  matcher: ['/dashboard/:path*', '/account/:path*', '/submit/:path*'],
}
```
