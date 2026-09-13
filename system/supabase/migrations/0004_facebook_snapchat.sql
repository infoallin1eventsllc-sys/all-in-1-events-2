-- Facebook and Snapchat.
--
-- Facebook Pages was a genuine gap: `meta_ads` existed (the paid side) but the
-- free side — posting to a Page — did not. Worth knowing that connecting it is
-- better value than it looks, because Instagram business accounts authenticate
-- *through* a linked Facebook Page. One Meta OAuth grant covers both, so this
-- row and `instagram` go live together or not at all.
--
-- Snapchat is the honest problem in this list. It is added because Otis asked
-- for it and because an inventory that omits a channel he uses is a worse
-- inventory — but marked `manual`, not `not_configured`, because those mean
-- different things. `not_configured` says "connect this and it works".
-- `manual` says "no amount of configuration will automate this".
--
-- The reason: Snapchat's public API is a Marketing (ads) API. There is no
-- general endpoint for posting organic content to a personal account or Story
-- the way Meta and TikTok provide. Snap keeps organic posting inside its own
-- app. So organic Snapchat stays a person with a phone, and the system's
-- useful role there is to draft the caption, not to publish it.
--
-- Marking it `manual` rather than leaving it looking connectable is the point:
-- a false promise on a dashboard costs more than an absent row.

-- The status check constraint predates this and only allows four values, so
-- 'manual' needs adding before any row can use it.
alter table public.channels drop constraint if exists channels_status_check;
alter table public.channels add constraint channels_status_check
  check (status in ('not_configured','configured','live','error','manual'));

comment on column public.channels.status is
  'not_configured = connectable, just not connected yet. configured = credentials '
  'in place, not verified. live = working. error = was working, now failing. '
  'manual = no API exists for this; a person does it by hand. The distinction '
  'between not_configured and manual matters — one is a task, the other is a fact.';

insert into public.channels (key, label, category, department, enabled, status, cost_note) values
  ('facebook','Facebook Page','social','publishing_social',false,'not_configured',
   'Free — Meta Graph API; the same OAuth also unlocks Instagram'),
  ('fb_insights','Facebook Page insights','analytics','results_roi',false,'not_configured',
   'Free with a Page'),
  ('snapchat','Snapchat','social','publishing_social',false,'manual',
   'Manual — no organic posting API exists; the agent drafts, a person posts'),
  ('snapchat_ads','Snapchat Ads','ads','results_roi',false,'not_configured',
   'Paid media — Marketing API exists, but this is ad spend, not organic reach')
on conflict (key) do update
  set label = excluded.label,
      department = excluded.department,
      cost_note = excluded.cost_note;

-- Metricool (already seeded at ~$20/mo) schedules Facebook, Instagram and
-- TikTok from one place. Noting it here so the cheapest route to covering three
-- channels is visible on the row itself rather than buried in a conversation.
update public.channels
set cost_note = '~$20/mo — schedules Facebook, Instagram and TikTok from one place'
where key = 'metricool';
