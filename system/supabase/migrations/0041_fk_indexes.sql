-- Index every foreign key the performance advisor flagged on 1 Oct 2026.
--
-- The tables are small today (under 50 rows each), so nothing is slow yet.
-- Without these, deleting a campaign, deal, channel, department or payment
-- scans the whole child table and locks it while it does; that cost grows
-- with every row the marketing system writes.
create index if not exists activities_deal_id_idx          on public.activities (deal_id);
create index if not exists channels_department_idx         on public.channels (department);
create index if not exists content_items_campaign_id_idx   on public.content_items (campaign_id);
create index if not exists content_items_channel_idx       on public.content_items (channel);
create index if not exists payment_events_payment_id_idx   on public.payment_events (payment_id);
