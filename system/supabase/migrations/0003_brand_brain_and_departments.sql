-- Brand Brain + departments.
--
-- Two changes, both aimed at the same weakness: the agent had almost no idea
-- who it was writing for, and no structure describing what work it covers.
--
-- Before this, the entire brand guidance in every prompt was one string:
--   `Voice: ${profile.voice}`  →  "warm, professional, upscale"
-- Three adjectives that fit any business in the country, which is exactly what
-- the drafts read like. `brand_brain` replaces that with four documents the
-- functions load and compose into the system prompt.
--
-- The `channels` table was a flat list, so there was no way to say which part
-- of the operation a tool belongs to, or to show what is covered versus what is
-- a gap. `departments` groups them the way the work is actually divided.

-- ---------------------------------------------------------------- brand brain

create table if not exists public.brand_brain (
  brand text not null,
  -- Four fixed documents rather than free-form keys. They are composed into the
  -- prompt in a deliberate order (see _shared/brand.ts), and a constrained set
  -- is what makes that order meaningful.
  doc text not null check (doc in ('voice-guide','positioning','messaging-bank','tone-rules')),
  content text not null default '',
  updated_at timestamptz not null default now(),
  primary key (brand, doc)
);

comment on table public.brand_brain is
  'Brand voice documents composed into every Claude system prompt. Authored as '
  'Markdown in system/brand-brain/<brand>/ and pushed here with `node cli.mjs '
  'brand-sync` — the edge functions cannot read the repo, so this table is the '
  'live copy.';

alter table public.brand_brain enable row level security;

-- Deny-by-default, matching every other table here: no policy is created, so
-- only the service role (which bypasses RLS) can read or write. The brand brain
-- is not secret, but it is not public either — it describes what we will and
-- will not say, which is competitive information.

-- No updated_at trigger: nothing else in this schema uses one, and adding a
-- trigger function for a single table is more machinery than the value. The
-- sync command sends updated_at explicitly, which is also more honest — it
-- records when the content was authored, not when a row happened to be touched.

-- ----------------------------------------------------------------- departments

create table if not exists public.departments (
  key text primary key,
  label text not null,
  -- What this department is responsible for, in a sentence. Shown on the
  -- dashboard and used to explain a gap rather than just flagging one.
  purpose text not null default '',
  sort_order int not null default 0
);

alter table public.departments enable row level security;

insert into public.departments (key, label, purpose, sort_order) values
  ('search_visibility','Search Visibility','Whether people find us when they search for what we sell.',1),
  ('market_radar','Market Radar','What competitors and the wider market are doing, early enough to react.',2),
  ('content_engine','Content Engine','Turning a topic into a draft that sounds like us.',3),
  ('creative_studio','Creative Studio','The image, video or audio that goes with the words.',4),
  ('publishing_social','Publishing & Social','Getting approved work out on schedule, everywhere it belongs.',5),
  ('reviews_reputation','Reviews & Reputation','Reviews arriving, being answered, and being asked for.',6),
  ('leads_conversations','Leads & Conversations','Every inbound message reaching a person and a follow-up.',7),
  ('results_roi','Results & ROI','What any of it actually returned.',8)
on conflict (key) do nothing;

alter table public.channels
  add column if not exists department text references public.departments(key),
  -- Free tools should be visibly distinct from ones with a monthly bill. Half
  -- the value of this inventory is seeing what a gap would cost to close.
  add column if not exists cost_note text not null default '';

-- Map the channels that already existed.
update public.channels set department = 'publishing_social'
  where key in ('instagram','tiktok','youtube','wordpress','gbp');
update public.channels set department = 'content_engine' where key = 'content';
update public.channels set department = 'leads_conversations' where key in ('email','sms');
update public.channels set department = 'results_roi' where key in ('meta_ads','google_ads');

-- Free signals we are already entitled to and simply have not connected. These
-- are listed first because they cost nothing — the honest starting point before
-- any subscription is considered.
insert into public.channels (key, label, category, department, enabled, status, cost_note) values
  ('gsc','Google Search Console','analytics','search_visibility',false,'not_configured','Free — already entitled to it'),
  ('ga4','Google Analytics 4','analytics','search_visibility',false,'not_configured','Free — already entitled to it'),
  ('gbp_insights','Google Business Profile insights','analytics','search_visibility',false,'not_configured','Free'),
  ('ig_insights','Instagram insights','analytics','results_roi',false,'not_configured','Free with a business account'),
  ('review_requests','Review requests','reviews','reviews_reputation',false,'not_configured','Free — email or SMS ask after purchase'),
  ('review_replies','Review replies (Claude-drafted)','reviews','reviews_reputation',false,'not_configured','Free — uses the existing agent'),
  ('metricool','Metricool scheduler','social','publishing_social',false,'not_configured','~$20/mo — recommended first paid tool'),
  ('calendly','Calendly booking','operations','leads_conversations',false,'not_configured','Free tier available')
on conflict (key) do nothing;

-- Which brand the agent is currently writing as. One system, one active brand;
-- the others sit in brand_brain ready to switch to.
update public.settings
set value = jsonb_set(value, '{brand}', '"all-in-1-events"', true)
where key = 'business_profile'
  and not (value ? 'brand');
