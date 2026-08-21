-- Register the channels the publish adapters can actually reach.
--
-- content_items.channel is a foreign key to channels(key), so a channel that
-- is not registered here cannot even be inserted — a LinkedIn draft would fail
-- at the database before any adapter ran. facebook and linkedin were missing;
-- 'webhook' is the generic outbound adapter that reaches everything else
-- through Make / Zapier / n8n without waiting on a platform's API approval.
--
-- Deliberately NOT added as publishable: google_ads, meta_ads. They exist in
-- this table as known-but-disabled because spending money is a different
-- decision from publishing a post, and belongs behind its own approval.

insert into channels(key, label, category, enabled, status, config) values
  ('facebook','Facebook Page','social',false,'not_configured','{}'::jsonb),
  ('linkedin','LinkedIn','social',false,'not_configured','{}'::jsonb),
  ('webhook','Outbound Webhook (Make / Zapier / n8n)','content',false,'not_configured','{}'::jsonb)
on conflict (key) do nothing;

-- Channel credentials live here, service-role only. Empty means every channel
-- falls back to the mock stub, which is the correct default.
insert into settings(key, value, updated_at)
values ('channels', '{}'::jsonb, now())
on conflict (key) do nothing;
