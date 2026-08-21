-- Close the loop: measured results flow back into the planning prompt.
--
-- Until now the system planned, wrote, and reported — and the report was read
-- by a human, so nothing it learned ever reached the next plan. This adds the
-- return path: an `analyze` run aggregates real outcomes per channel, writes
-- them to settings.performance, and the shared context layer renders them into
-- every planning prompt.
--
-- A note on cost-per-acquisition. The reference architecture this was compared
-- against computes CAC by channel. CAC needs ad spend, and there is none here
-- by deliberate decision — ad platforms were left unbuilt because they spend
-- money without a person in the loop. So `ad_spend` below starts empty and is
-- the seam: enter real spend per channel and CAC becomes real. Until then the
-- only genuine cost is the AI itself, computed from agent_runs token counts,
-- which is $0 while the system runs in mock mode.

-- Per-channel outcomes, computed from what actually happened.
-- Attribution is by contacts.source matching a channel key — deliberately
-- simple and deliberately honest: it credits a channel only when the lead
-- actually arrived tagged with it, and never guesses.
create or replace view public.v_channel_performance as
with published as (
  select channel, count(*) as items_published
  from content_items where status = 'published' group by channel
),
drafted as (
  select channel, count(*) as items_drafted
  from content_items group by channel
),
leads as (
  select source as channel, count(*) as leads_in
  from contacts group by source
),
deals_by_source as (
  select c.source as channel,
         count(d.id) as deals_opened,
         coalesce(sum(d.amount) filter (where d.stage in ('new','quoted')), 0) as pipeline_value,
         coalesce(sum(d.amount) filter (where d.stage in ('won','completed')), 0) as won_value
  from deals d join contacts c on c.id = d.contact_id
  group by c.source
)
select
  ch.key                                   as channel,
  ch.label,
  ch.enabled,
  coalesce(dr.items_drafted, 0)            as items_drafted,
  coalesce(p.items_published, 0)           as items_published,
  coalesce(l.leads_in, 0)                  as leads_in,
  coalesce(ds.deals_opened, 0)             as deals_opened,
  coalesce(ds.pipeline_value, 0)           as pipeline_value,
  coalesce(ds.won_value, 0)                as won_value,
  -- leads per published item: the number that says whether posting works.
  case when coalesce(p.items_published, 0) > 0
       then round(coalesce(l.leads_in, 0)::numeric / p.items_published, 2)
       else null end                       as leads_per_post
from channels ch
left join drafted   dr on dr.channel = ch.key
left join published p  on p.channel  = ch.key
left join leads     l  on l.channel  = ch.key
left join deals_by_source ds on ds.channel = ch.key;

comment on view public.v_channel_performance is
  'Real per-channel outcomes. leads_per_post is null when nothing has been published — an absent number rather than a fake zero.';

-- Where the analyzer writes its findings, and where the context layer reads them.
insert into settings(key, value, updated_at)
values ('performance', jsonb_build_object(
  'computed_at', null,
  'sufficient_data', false,
  'note', 'No analysis has run yet.'
), now())
on conflict (key) do nothing;

-- The CAC seam. Fill in real spend per channel and cost-per-acquisition
-- becomes a real number instead of a division by zero.
insert into settings(key, value, updated_at)
values ('ad_spend', jsonb_build_object(
  'currency', 'USD',
  'period_days', 30,
  'by_channel', '{}'::jsonb,
  'note', 'Empty by design: no ad platforms are connected. Add {"google_ads": 500} style entries to make CAC real.'
), now())
on conflict (key) do nothing;

-- What the AI itself costs, so cost-per-lead is computable from token counts
-- the moment a real key is in use. Rates are per million tokens.
insert into settings(key, value, updated_at)
values ('model_rates', jsonb_build_object(
  'note', 'USD per 1M tokens, used to price agent_runs token counts. Update if pricing changes.',
  'input_per_mtok', 5,
  'output_per_mtok', 25
), now())
on conflict (key) do nothing;
