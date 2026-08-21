# Publishing channels — what's built, and how to switch each one on

The system drafts content into an approval queue. When you approve an item, a
`publish_content` task runs it through the adapter for its channel. This file
is how to give each adapter what it needs.

**Nothing here needs a redeploy.** Credentials live in the `settings` table
under the key `channels`, read fresh on every publish. One SQL statement turns
a channel on.

---

## The honest state of each channel

| Channel | Built? | What it needs from you | How long that takes |
|---|---|---|---|
| **Outbound webhook** | ✅ Working | A URL from Make / Zapier / n8n | **Minutes** |
| **Facebook Page** | ✅ Working | Page ID + a Page access token | Days — Meta app review |
| **Instagram** | ✅ Working | The above + an IG Business account ID | Days — same review |
| **LinkedIn** | ✅ Working | Organization URN + an OAuth token | Days — LinkedIn approval |
| **Email (SendGrid)** | ✅ Working | `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL` | Minutes — free tier |
| **SMS (Twilio)** | ✅ Working | `TWILIO_*` secrets | Minutes — paid per message |
| TikTok, YouTube, WordPress, Google Business Profile | ↪ via webhook | Reach them through the webhook adapter | Minutes |
| Google Ads, Meta Ads | ❌ **Not built, on purpose** | — | See below |

### Why the ad platforms are not here

Publishing a post costs nothing. An ads API **spends money** against a budget,
on a schedule, without a person in the loop. That is a different decision from
a content system and deserves its own approval flow, its own spend caps, and
its own conversation. They are registered in the `channels` table as
known-but-disabled so it is clear they were considered, not overlooked.

---

## Start here: the webhook adapter

This is the one to use first. It reaches **every** platform without waiting on
anyone's API approval, because the automation tool on the other end already has
those connections.

1. In Make (or Zapier / n8n), create a scenario starting with a **Webhook**
   trigger. Copy the URL it gives you.
2. Run this, pasting your URL in:

```sql
update settings
set value = jsonb_build_object(
  'webhook_url',    'https://hook.eu2.make.com/YOUR-URL-HERE',
  'webhook_secret', 'pick-any-random-string'
), updated_at = now()
where key = 'channels';
```

3. Add whatever you like after the trigger — post to TikTok, Instagram,
   Google Business Profile, a Google Sheet, your phone.

Every approved item then arrives as a JSON POST:

```json
{
  "source":  "meridian-marketing",
  "channel": "linkedin",
  "kind":    "post",
  "title":   "The $22,000 line on our invoice, explained",
  "body":    "A client asked why a custom portal costs what it costs...",
  "image_url": null
}
```

`webhook_secret`, if set, is sent as the `x-webhook-secret` header so your
scenario can reject anything that is not from this system. `image_url` is only
ever a real hosted URL — the generated brand cards are data URIs and are left
out rather than sent as enormous unusable strings.

---

## Direct platform adapters

Each is a straight API call, no automation tool in between. Use these once you
have been through the platform's approval.

### Facebook Page and Instagram

```sql
update settings set value = value || jsonb_build_object(
  'meta_page_id',    'YOUR_PAGE_ID',
  'meta_page_token', 'YOUR_LONG_LIVED_PAGE_TOKEN',
  'meta_ig_user_id', 'YOUR_IG_BUSINESS_ACCOUNT_ID'
), updated_at = now() where key = 'channels';
```

**Instagram requires a hosted image.** Meta's API takes an image by URL, and
our generated cards are data URIs, so an Instagram item with no real photo is
rejected with exactly that message rather than silently marked published. Give
Instagram items a real image, or route them through the webhook instead.

### LinkedIn

```sql
update settings set value = value || jsonb_build_object(
  'linkedin_org_urn', 'urn:li:organization:YOUR_ORG_ID',
  'linkedin_token',   'YOUR_OAUTH_TOKEN'
), updated_at = now() where key = 'channels';
```

### Environment secrets take precedence

Any of these may instead be set as Supabase Edge Function secrets —
`CHANNEL_WEBHOOK_URL`, `META_PAGE_TOKEN`, `LINKEDIN_TOKEN`, and so on. A secret
always wins over the settings row, so you can keep a production token out of
the database if you prefer.

---

## Which adapter runs

For each approved item, in order:

1. The channel's **own platform**, if its credentials exist
   (facebook/instagram → Meta; linkedin → LinkedIn).
2. Otherwise the **webhook**, if a URL is configured.
3. Otherwise the **mock stub** — marked `mocked: true`, so a demo never looks
   like a real publish.

A failure is recorded, never swallowed. The content item goes to `failed` with
the platform's verbatim error in `meta.publish.error`, and the task retries
with exponential backoff.

---

## Adding a channel

`content_items.channel` is a foreign key to `channels(key)`, so a channel must
be registered before a draft can even be written for it:

```sql
insert into channels(key, label, category, enabled, status, config)
values ('youtube','YouTube','social',false,'not_configured','{}'::jsonb)
on conflict (key) do nothing;
```

Then it publishes through the webhook adapter with no code change at all.

---

## Key Router: the secret env var name is case-sensitive

When you deploy Key Router, each key's secret env var uses the key's `id`
**verbatim**. A fleet entry of `{"id":"primary"}` needs `KEYROUTER_SECRET_primary`
— not `KEYROUTER_SECRET_PRIMARY`. The wrong case does not degrade quietly; it
kills the boot with `missing env var KEYROUTER_SECRET_primary`.

The seam itself is verified: key-router run in-process against the marketing
system's own client code passes 9/9 — happy path, auth enforced, wrong token
rejected, trailing-slash URL handled, token usage returned for cost tracking.

---

## Verified

All three routing branches were tested live against the deployed runner (v14):

- **Success** — a real HTTP 200 from a real endpoint. Item `published`,
  `{"ok":true,"mocked":false,"provider":"webhook","providerId":"200"}`.
- **Failure** — a real HTTP 400. Item `failed`, no publish date, error stored
  verbatim as `400: {"ok":false,"error":"email or phone required"}`, task
  re-queued with backoff.
- **Unconfigured** — no credentials, falls back to the stub and completes.

Test rows were removed afterwards.
