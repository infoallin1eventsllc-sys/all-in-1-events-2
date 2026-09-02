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
| **TikTok** (video) | ✅ Built | A TikTok developer app, audited, with a refresh token | Days to weeks — TikTok audit |
| **Instagram Reels / Facebook video** | ✅ Built | The Meta connection above | Same review |
| **LinkedIn video** | ✅ Built | The LinkedIn connection above | Same approval |
| **Video rendering** (Shotstack) | ✅ Built | A Shotstack API key | **Minutes** — free tier |
| YouTube, WordPress, Google Business Profile | ↪ via webhook | Reach them through the webhook adapter | Minutes |
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

## Short-form video (TikTok, Reels, Facebook, LinkedIn)

TikTok takes only video, and Reels is where Instagram's reach is, so a caption
is not a post there. The planner can ask for `kind: "video"`; the runner has
Claude write a five-scene script (a hook, three beats, the price, a call to
action), Shotstack renders 20 seconds of large on-brand type at 1080×1920, and
the MP4 and a poster frame are copied into the public `social-videos` bucket.
The item then joins the approval queue with the clip attached. One clip serves
all four platforms.

### Turning on rendering — five minutes

1. Sign up at shotstack.io. The free sandbox renders with a watermark; the
   production key does not.
2. Copy the API key, then in the SQL editor:

```sql
select public.set_channel('shotstack_api_key', 'PASTE_KEY_HERE');
select public.set_channel('shotstack_env', 'v1');   -- or 'stage' for the watermarked sandbox
```

Each call answers with a sentence — `Saved shotstack_api_key: 40 characters,
starts abc123, ends wxyz.` — or a refusal saying what was wrong. Nothing else
to redeploy. The next video task renders.

Optional soundtrack: `select public.set_channel('video_music_url', 'https://…/track.mp3');`

### Every setting goes in the same way

`set_channel(name, value)` is the one door for all platform credentials. It
checks the value for the shape of the mistake it is most likely to be — a name
pasted instead of a value, a stray space, a URL without https — and never
prints the value back. The names it accepts:

```
webhook_url, webhook_secret
meta_page_id, meta_page_token, meta_ig_user_id
linkedin_org_urn, linkedin_token, linkedin_version
tiktok_client_key, tiktok_client_secret, tiktok_refresh_token, tiktok_privacy
shotstack_api_key, shotstack_env, video_music_url
```

### TikTok

The Content Posting API needs an app that TikTok has reviewed, and until the
review passes it only posts **privately** (visible to the account owner). The
adapter asks TikTok which privacy levels the app is allowed and uses the best
one, so a pre-audit post lands privately rather than failing.

1. **developers.tiktok.com** → Manage apps → Create. Answers that fit this
   system: *App name* "Meridian Interface Studio"; *Category* Business /
   Marketing; *Description* "Posts our own short brand videos to our own
   TikTok account after the owner approves each one. No third-party users."
2. Add the **Content Posting API** product. Request scopes `user.info.basic`,
   `video.publish`. Choose **Direct Post**.
3. Under Content Posting API → **URL properties**, verify the storage domain
   `glzodwhyavexpuusbqjy.supabase.co` — TikTok pulls the MP4 from there and
   refuses unverified hosts.
4. Submit for review. While waiting, the app works in sandbox against your
   own account.
5. Authorize your account once (Login Kit → the app's authorization URL) and
   keep the **refresh token** from the response. Then:

```sql
select public.set_channel('tiktok_client_key',    'YOUR_CLIENT_KEY');
select public.set_channel('tiktok_client_secret', 'YOUR_CLIENT_SECRET');
select public.set_channel('tiktok_refresh_token', 'YOUR_REFRESH_TOKEN');
```

The refresh token lasts a year; the adapter mints a day-long access token from
it on every publish and saves a rotated refresh token back automatically.

### What "published" means for video

Every video platform accepts the file and finishes in its own time. The
adapter returns *pending*; the item shows as `scheduled` with the platform's
note ("instagram is processing the video"); the runner looks again in ninety
seconds. Only the platform's own **complete** moves an item to `published`.
Nothing is marked done on a promise.

---

## Nothing is released without the owner

Stated by Otis on Sep 2 and enforced by the database, not by code: a content
item cannot become `approved`, `scheduled` or `published`, and a message
cannot be `queued` or `sent`, unless its meta carries `approved_by = 'owner'`.
The owner portal's approve and send actions and the CLI set that stamp when he
clicks; nothing else does. Any other path — including a future "auto" mode —
fails with *"requires owner approval. Nothing is released without it."*

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
