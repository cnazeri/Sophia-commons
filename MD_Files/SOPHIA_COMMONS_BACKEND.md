# Sophia Commons — Backend Setup Guide
## Stack: Supabase + Vercel (or Netlify)

---

## 1. Supabase Project Setup

1. Go to https://supabase.com and create a free account
2. Create a new project — name it `sophia-commons`
3. Copy your **Project URL** and **anon public key** from Settings → API
4. Replace in `sophia_commons_final.html`:
   ```js
   const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
   const SUPABASE_ANON_KEY = 'YOUR-ANON-KEY';
   const supabase = supabaseJs.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
   ```

---

## 2. Database Tables (run in Supabase SQL Editor)

```sql
-- USERS (handled by Supabase Auth — no manual table needed)

-- LISTINGS (directory entries)
create table listings (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  url text,
  category text not null,
  subcategory text,
  description text,
  city text,
  country text,
  tags text[],
  verified boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  views integer default 0
);

-- LISTINGS PENDING (submitted, awaiting review)
create table listings_pending (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  url text,
  category text not null,
  location text,
  description text,
  contact_email text,
  submitted_at timestamptz default now(),
  status text default 'pending'  -- pending | approved | rejected
);

-- EVENTS
create table events (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  event_date date not null,
  start_time time,
  end_time time,
  location text,
  city text,
  country text,
  online boolean default false,
  url text,
  host text,
  category text,
  created_at timestamptz default now()
);

-- NEWS / ARTICLES
create table articles (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  content text,
  summary text,
  category text,
  author text,
  published_at timestamptz default now(),
  views integer default 0,
  featured boolean default false
);

-- CHAT MESSAGES (realtime)
create table chat_messages (
  id uuid default gen_random_uuid() primary key,
  room text not null,
  user_id uuid references auth.users(id),
  username text not null,
  content text not null,
  created_at timestamptz default now()
);

-- NEWSLETTER SIGNUPS
create table newsletter_signups (
  id uuid default gen_random_uuid() primary key,
  email text unique not null,
  signed_up_at timestamptz default now()
);

-- PAGE VIEWS (for community spotlight)
create table page_views (
  id uuid default gen_random_uuid() primary key,
  listing_id uuid references listings(id),
  viewed_at timestamptz default now()
);
```

---

## 3. Row Level Security (RLS)

```sql
-- Enable RLS on all tables
alter table listings enable row level security;
alter table chat_messages enable row level security;
alter table listings_pending enable row level security;
alter table newsletter_signups enable row level security;

-- Listings: anyone can read, only admins can write
create policy "Public read listings" on listings for select using (true);
create policy "Admins can insert" on listings for insert with check (auth.role() = 'authenticated');

-- Chat: authenticated users can read and write
create policy "Members read chat" on chat_messages for select using (auth.role() = 'authenticated');
create policy "Members write chat" on chat_messages for insert with check (auth.role() = 'authenticated');

-- Pending listings: anyone can submit
create policy "Anyone can submit" on listings_pending for insert with check (true);

-- Newsletter: anyone can sign up
create policy "Anyone can subscribe" on newsletter_signups for insert with check (true);
```

---

## 4. Supabase Auth Setup

In your Supabase dashboard → Authentication → Settings:
- Enable **Email** provider
- Set Site URL to your domain (e.g. `https://sophiacommons.org`)
- Add redirect URLs: `https://sophiacommons.org/` and `http://localhost:3000/`
- Optional: enable Google OAuth for "Sign in with Google"

In `sophia_commons_final.html`, replace `doSignIn()`:
```js
async function doSignIn() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-pass').value;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) { alert(error.message); return; }
  username = data.user.email.split('@')[0];
  signedIn = true;
  closeModal();
  applySignedInState();
}
```

---

## 5. Realtime Chat

Replace the simulated chat with Supabase Realtime:
```js
// Load message history
async function loadRoomHistory(room) {
  const { data } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('room', room)
    .order('created_at', { ascending: true })
    .limit(50);
  return data || [];
}

// Subscribe to new messages
function subscribeToRoom(room) {
  return supabase
    .channel('room:' + room)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'chat_messages',
      filter: `room=eq.${room}`
    }, payload => {
      appendMessage(payload.new);
    })
    .subscribe();
}

// Send a message
async function sendMsg() {
  const txt = document.getElementById('chat-input').value.trim();
  if (!txt) return;
  await supabase.from('chat_messages').insert({
    room: currentRoom,
    username: username,
    content: txt
  });
  document.getElementById('chat-input').value = '';
}
```

---

## 6. Newsletter Signups

```js
async function doSignup() {
  const email = document.getElementById('signup-email').value.trim();
  if (!email.includes('@')) return;
  const { error } = await supabase.from('newsletter_signups').insert({ email });
  if (error && error.code === '23505') {
    // Already subscribed — show success anyway
  }
  document.getElementById('rsignup-ok').style.display = 'block';
}
```

---

## 7. Submit a Listing

```js
async function submitListing() {
  const name = document.getElementById('sl-name').value.trim();
  const cat  = document.getElementById('sl-cat').value;
  if (!name || !cat) { alert('Name and category required.'); return; }
  await supabase.from('listings_pending').insert({
    name,
    url:         document.getElementById('sl-url').value.trim(),
    category:    cat,
    location:    document.getElementById('sl-loc').value.trim(),
    description: document.getElementById('sl-desc').value.trim(),
    contact_email: document.getElementById('sl-email').value.trim()
  });
  document.getElementById('sl-ok').style.display = 'block';
}
```

---

## 8. Hosting on Vercel

1. Install Vercel CLI: `npm i -g vercel`
2. In your project folder: `vercel`
3. Follow prompts — connect to GitHub for auto-deploy
4. Add environment variables in Vercel dashboard:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
5. Your site will be live at `your-project.vercel.app`
6. Add custom domain `sophiacommons.org` in Vercel → Domains

**Alternative: Netlify**
- Drag and drop `sophia_commons_final.html` into netlify.com/drop
- For full backend: connect GitHub repo, set env vars in Site Settings

---

## 9. Community Spotlight (weekly auto-update)

```js
// Supabase Edge Function (scheduled weekly via cron)
// dashboard.supabase.com → Edge Functions → New Function

Deno.serve(async () => {
  const { data: topListing } = await supabase
    .from('page_views')
    .select('listing_id, count(*)')
    .gte('viewed_at', new Date(Date.now() - 7*24*60*60*1000).toISOString())
    .group('listing_id')
    .order('count', { ascending: false })
    .limit(1);

  // Update a 'spotlight' config row with the top listing
  await supabase.from('config').upsert({ key: 'spotlight_listing', value: topListing[0]?.listing_id });

  return new Response('OK');
});
```

---

## 10. Domain & DNS

1. Register `sophiacommons.org` at Namecheap, Cloudflare, or Google Domains (~$12/yr)
2. Point DNS to Vercel:
   - `A` record: `76.76.21.21`
   - `CNAME` for `www`: `cname.vercel-dns.com`
3. SSL is automatic via Let's Encrypt through Vercel

---

## File Structure (recommended)

```
sophia-commons/
├── index.html              ← sophia_commons_final.html renamed
├── public/
│   └── og-image.jpg        ← 1200x630 image for social sharing
├── supabase/
│   ├── migrations/
│   │   └── 001_initial.sql ← all CREATE TABLE statements above
│   └── functions/
│       └── spotlight/      ← weekly spotlight edge function
├── backend/
│   └── README.md           ← this file
└── .env                    ← SUPABASE_URL, SUPABASE_ANON_KEY
```

---

## Monthly Cost Estimate

| Service | Free Tier | Paid |
|---|---|---|
| Supabase | Free (500MB, 50MB storage) | $25/mo (Pro) |
| Vercel | Free (hobby) | $20/mo (Pro) |
| Domain | — | ~$12/yr |
| Google Maps API | $200/mo credit (free for most) | Pay per use |
| **Total** | **$0** to start | **~$57/mo** at scale |
