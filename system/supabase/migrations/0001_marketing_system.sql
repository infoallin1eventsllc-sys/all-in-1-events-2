-- ============================================================================
-- Meridian Marketing System — full schema (mirrors the live Supabase project).
-- Apply with the Supabase CLI (`supabase db push`) or paste into the SQL editor.
-- ============================================================================

-- Extensions -----------------------------------------------------------------
create extension if not exists "vector"      with schema extensions;
create extension if not exists "moddatetime" with schema extensions;
create extension if not exists "pgcrypto"    with schema extensions;
create extension if not exists "pg_trgm"     with schema extensions;

-- CRM core -------------------------------------------------------------------
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  full_name text, email text, phone text, company text, source text,
  lifecycle_stage text not null default 'lead'
    check (lifecycle_stage in ('lead','qualified','customer','past','archived')),
  lead_score int not null default 0,
  tags text[] not null default '{}',
  consent_email boolean not null default false,
  consent_sms boolean not null default false,
  notes text, meta jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists contacts_email_uniq on public.contacts (lower(email)) where email is not null;
create index if not exists contacts_stage_idx on public.contacts (lifecycle_stage);
create index if not exists contacts_created_idx on public.contacts (created_at desc);

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete cascade,
  title text not null,
  stage text not null default 'new' check (stage in ('new','quoted','won','lost','completed')),
  amount numeric(12,2), currency text not null default 'USD',
  event_date date, expected_close date, details jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists deals_contact_idx on public.deals (contact_id);
create index if not exists deals_stage_idx on public.deals (stage);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete set null,
  type text not null,
  direction text check (direction in ('inbound','outbound','internal')),
  subject text, body text,
  occurred_at timestamptz not null default now(),
  meta jsonb not null default '{}'
);
create index if not exists activities_contact_idx on public.activities (contact_id, occurred_at desc);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null, channel text, goal text,
  status text not null default 'active' check (status in ('draft','active','paused','completed','archived')),
  budget numeric(12,2), starts_at timestamptz, ends_at timestamptz,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Marketing engine -----------------------------------------------------------
create table if not exists public.channels (
  key text primary key, label text not null, category text not null,
  enabled boolean not null default false,
  status text not null default 'not_configured'
    check (status in ('not_configured','configured','live','error')),
  config jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id) on delete set null,
  channel text references public.channels(key),
  kind text not null default 'post', title text, body text not null,
  status text not null default 'draft'
    check (status in ('draft','pending_approval','approved','scheduled','published','rejected','failed')),
  scheduled_for timestamptz, published_at timestamptz, external_id text,
  created_by text not null default 'agent',
  meta jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists content_status_idx on public.content_items (status);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete set null,
  channel text not null check (channel in ('email','sms')),
  direction text not null default 'outbound' check (direction in ('inbound','outbound')),
  to_addr text, from_addr text, subject text, body text,
  status text not null default 'queued'
    check (status in ('draft','queued','sent','delivered','failed','received')),
  provider text, provider_id text, error text, sent_at timestamptz,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists messages_contact_idx on public.messages (contact_id, created_at desc);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  status text not null default 'pending' check (status in ('pending','running','done','failed','canceled')),
  priority int not null default 100,
  run_at timestamptz not null default now(),
  attempts int not null default 0, max_attempts int not null default 5,
  payload jsonb not null default '{}', result jsonb, error text,
  dedupe_key text, locked_at timestamptz, locked_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tasks_ready_idx on public.tasks (status, run_at, priority);
create unique index if not exists tasks_dedupe_uniq on public.tasks (dedupe_key);

create table if not exists public.memory (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'note', ref_type text, ref_id uuid,
  content text not null, embedding extensions.vector(1536),
  importance int not null default 1, meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists memory_trgm_idx on public.memory using gin (content extensions.gin_trgm_ops);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'owner_summary', title text,
  period_start date, period_end date, body text,
  metrics jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  key text primary key, value jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'running' check (status in ('running','success','error')),
  trigger text not null default 'cron', summary text, plan jsonb,
  tasks_created int not null default 0, tokens_in int, tokens_out int, error text,
  started_at timestamptz not null default now(), finished_at timestamptz
);

-- updated_at triggers --------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['contacts','deals','campaigns','channels','content_items','tasks','settings']
  loop
    execute format('drop trigger if exists %I_set_updated on public.%I', t, t);
    execute format('create trigger %I_set_updated before update on public.%I for each row execute procedure extensions.moddatetime(updated_at)', t, t);
  end loop;
end $$;

-- RLS: deny-by-default (edge functions use the service role, which bypasses RLS)
do $$
declare t text;
begin
  foreach t in array array['contacts','deals','activities','campaigns','channels','content_items','messages','tasks','memory','reports','settings','agent_runs']
  loop execute format('alter table public.%I enable row level security', t); end loop;
end $$;

-- Helpers --------------------------------------------------------------------
create or replace function public.claim_tasks(p_limit int default 10, p_worker text default 'runner')
returns setof public.tasks language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.tasks t set status='running', attempts=t.attempts+1, locked_at=now(), locked_by=p_worker
  where t.id in (select id from public.tasks where status='pending' and run_at<=now()
                 order by priority asc, run_at asc limit p_limit for update skip locked)
  returning t.*;
end $$;
revoke execute on function public.claim_tasks(int, text) from public, anon, authenticated;
grant execute on function public.claim_tasks(int, text) to service_role;

-- Seeds ----------------------------------------------------------------------
insert into public.channels (key, label, category, enabled, status) values
  ('email','SendGrid Email','operations',false,'not_configured'),
  ('sms','Twilio SMS','operations',false,'not_configured'),
  ('content','Content Studio','content',true,'live'),
  ('instagram','Instagram','social',false,'not_configured'),
  ('tiktok','TikTok','social',false,'not_configured'),
  ('youtube','YouTube','social',false,'not_configured'),
  ('meta_ads','Meta Ads Manager','ads',false,'not_configured'),
  ('google_ads','Google Ads','ads',false,'not_configured'),
  ('gbp','Google Business Profile','local_seo',false,'not_configured'),
  ('wordpress','WordPress / CMS','content',false,'not_configured')
on conflict (key) do nothing;

insert into public.settings (key, value) values
  ('business_profile', jsonb_build_object('name','Your Business','industry','events','voice','warm, professional, upscale','timezone','America/Chicago','website','')),
  ('goals', jsonb_build_object('primary','Book more qualified events','weekly_content_target',5,'follow_up_within_hours',24)),
  ('agent', jsonb_build_object('model','claude-opus-5','autonomy','draft','daily_run_hour_local',8))
on conflict (key) do nothing;
