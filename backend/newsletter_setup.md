# Newsletter Send Pipeline - Setup Guide

## Overview

The newsletter pipeline uses a Supabase Edge Function that reads confirmed subscribers from the `newsletter_subscribers` table and sends emails via the Resend API. Only authenticated admin users can trigger sends.

---

## 1. Create a Resend Account and Get an API Key

1. Go to [https://resend.com](https://resend.com) and create an account.
2. Verify your sending domain (`sophiacommons.org`) under **Domains** in the Resend dashboard.
   - Add the DNS records Resend provides (SPF, DKIM, DMARC) to your domain registrar.
   - Wait for verification to complete (usually a few minutes).
3. Go to **API Keys** in the Resend dashboard and create a new key.
   - Name it something like `sophia-commons-newsletter`.
   - Copy the key (starts with `re_`). You will not be able to see it again.

---

## 2. Set the Supabase Secret

Store the Resend API key as a Supabase secret so the Edge Function can access it at runtime:

```bash
supabase secrets set RESEND_API_KEY=re_xxxxx_your_key_here
```

To verify it was set:

```bash
supabase secrets list
```

---

## 3. Deploy the Edge Function

From the project root (where `supabase/` config lives or from the repo root):

```bash
supabase functions deploy send-newsletter
```

If this is your first Edge Function, you may need to link your project first:

```bash
supabase link --project-ref bnrvgitzbpocratvszgk
supabase functions deploy send-newsletter
```

The function source is at: `backend/functions/send-newsletter/index.ts`

Note: You may need to copy the function into `supabase/functions/send-newsletter/index.ts` if your Supabase CLI expects that directory structure.

---

## 4. Calling from the Admin Panel

The admin panel includes a "Send Newsletter" tab (visible only to admin users). It provides:

- A subject line input
- An HTML content textarea
- A subscriber count display
- A send button with confirmation dialog

The frontend calls the Edge Function like this:

```javascript
const { data: { session } } = await _sb.auth.getSession();

const response = await fetch(
  'https://bnrvgitzbpocratvszgk.supabase.co/functions/v1/send-newsletter',
  {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + session.access_token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      subject: 'Your subject here',
      html_content: '<h1>Hello!</h1><p>Newsletter content...</p>',
    }),
  }
);

const result = await response.json();
// result: { sent: 42, failed: 0, total: 42, message: "..." }
```

---

## 5. Testing

To test without sending to all subscribers:

1. Ensure only your own email is marked `confirmed = true` in the `newsletter_subscribers` table.
2. Use the admin panel or cURL:

```bash
curl -X POST \
  'https://bnrvgitzbpocratvszgk.supabase.co/functions/v1/send-newsletter' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"subject": "Test Newsletter", "html_content": "<h1>Test</h1><p>This is a test.</p>"}'
```

---

## 6. Rate Limiting

The Edge Function sends emails in batches of 10 with a 1-second delay between batches. This respects Resend's free-tier rate limit of 10 emails/second. If you upgrade your Resend plan, you can adjust `BATCH_SIZE` and `BATCH_DELAY_MS` in the function source.

---

## 7. Security

- The function requires a valid Supabase auth token (Bearer header).
- The token must belong to a user whose email is in the `ADMIN_EMAILS` list.
- Non-admin users receive a 403 Forbidden response.
- The `RESEND_API_KEY` is stored as a Supabase secret, never exposed to the frontend.
