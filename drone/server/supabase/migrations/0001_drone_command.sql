-- Drone Command: accounts, roles and a server copy of the record.
--
-- The console records everything on the device (IndexedDB). This is the copy
-- that the person holding the laptop cannot clear:
--   * operators sign in (Supabase Auth, email link) and belong to one company (org)
--   * roles match the console: PIC (pilot in command), OBSERVER, CLIENT (view only), ADMIN
--   * flight events are APPEND-ONLY and each must extend the session's SHA-256
--     chain exactly as the console computed it (src/record/chain.ts) — the
--     database recomputes the hash and refuses anything that doesn't match
--   * row-level security keeps each company to its own rows; clients can read
--     but never write
--
-- Apply with the Supabase CLI (`supabase db push`) or paste into the SQL editor.

create extension if not exists pgcrypto;

-- Who belongs to which company, in which role. Admins add rows here.
create table if not exists public.dc_members (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  org_id       text not null,
  role         text not null check (role in ('PIC', 'OBSERVER', 'CLIENT', 'ADMIN')),
  display_name text not null,
  created_at   timestamptz not null default now()
);

create or replace function public.dc_org() returns text
  language sql stable security definer set search_path = public
  as $$ select org_id from public.dc_members where user_id = auth.uid() $$;

create or replace function public.dc_role() returns text
  language sql stable security definer set search_path = public
  as $$ select role from public.dc_members where user_id = auth.uid() $$;

-- One row per recorded flight session.
create table if not exists public.dc_sessions (
  id           text primary key,
  org_id       text not null default public.dc_org(),
  vertical     text not null,
  title        text not null,
  source       text not null,
  started_at   timestamptz not null,
  ended_at     timestamptz,
  aircraft     text[] not null default '{}',
  note         text,
  chain_head   text not null default repeat('0', 64),
  uploaded_by  uuid not null default auth.uid(),
  uploaded_at  timestamptz not null default now()
);

-- Every event, in recorded order, chained.
create table if not exists public.dc_events (
  session_id  text not null references public.dc_sessions (id),
  seq         integer not null check (seq >= 0),
  t           bigint not null,
  severity    text not null,
  kind        text not null,
  text        text not null,
  aircraft    text,
  operator    text,
  prev        text not null,
  hash        text not null,
  primary key (session_id, seq)
);

-- The chain rule, enforced by the database: the first event links to the
-- genesis hash, each next one to the previous hash, and the hash must be
-- SHA-256(prev|session|t|severity|kind|text|aircraft|operator).
create or replace function public.dc_events_chain() returns trigger
  language plpgsql as $$
declare
  expected_prev text;
  expected_seq  integer;
  computed      text;
begin
  select e.hash, e.seq + 1 into expected_prev, expected_seq
    from public.dc_events e where e.session_id = new.session_id
    order by e.seq desc limit 1;
  expected_prev := coalesce(expected_prev, repeat('0', 64));
  expected_seq  := coalesce(expected_seq, 0);
  if new.seq <> expected_seq then
    raise exception 'dc_events: session % expects seq %, got %', new.session_id, expected_seq, new.seq using errcode = '23514';
  end if;
  if new.prev <> expected_prev then
    raise exception 'dc_events: event % does not extend the chain of session %', new.seq, new.session_id using errcode = '23514';
  end if;
  computed := encode(digest(concat_ws('|', new.prev, new.session_id, new.t::text, new.severity, new.kind, new.text,
                                      coalesce(new.aircraft, ''), coalesce(new.operator, '')), 'sha256'), 'hex');
  if computed <> new.hash then
    raise exception 'dc_events: hash of event % in session % does not match its contents', new.seq, new.session_id using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists dc_events_chain on public.dc_events;
create trigger dc_events_chain before insert on public.dc_events
  for each row execute function public.dc_events_chain();

create or replace function public.dc_events_head() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  update public.dc_sessions set chain_head = new.hash where id = new.session_id;
  return null;
end $$;

drop trigger if exists dc_events_head on public.dc_events;
create trigger dc_events_head after insert on public.dc_events
  for each row execute function public.dc_events_head();

-- Events are evidence: no edits, no deletes, for anyone but the database owner.
create or replace function public.dc_no_change() returns trigger
  language plpgsql as $$ begin raise exception 'dc_events is append-only' using errcode = '42501'; end $$;
drop trigger if exists dc_events_frozen on public.dc_events;
create trigger dc_events_frozen before update or delete on public.dc_events
  for each row execute function public.dc_no_change();

-- Health reports and the parts log.
create table if not exists public.dc_health (
  id           bigserial primary key,
  org_id       text not null default public.dc_org(),
  aircraft     text not null,
  started_at   timestamptz not null,
  ended_at     timestamptz not null,
  airborne_s   integer not null,
  overall      text not null,
  report       jsonb not null,
  uploaded_by  uuid not null default auth.uid(),
  unique (org_id, aircraft, started_at)
);

create table if not exists public.dc_service (
  id           bigserial primary key,
  org_id       text not null default public.dc_org(),
  aircraft     text not null,
  t            timestamptz not null,
  note         text not null,
  part         text,
  logged_by    uuid not null default auth.uid()
);

-- Row-level security: your company's rows only; clients read, crew write.
alter table public.dc_members  enable row level security;
alter table public.dc_sessions enable row level security;
alter table public.dc_events   enable row level security;
alter table public.dc_health   enable row level security;
alter table public.dc_service  enable row level security;

drop policy if exists dc_members_self on public.dc_members;
create policy dc_members_self on public.dc_members for select using (org_id = public.dc_org());

drop policy if exists dc_sessions_read on public.dc_sessions;
create policy dc_sessions_read on public.dc_sessions for select using (org_id = public.dc_org());
drop policy if exists dc_sessions_write on public.dc_sessions;
create policy dc_sessions_write on public.dc_sessions for insert
  with check (org_id = public.dc_org() and public.dc_role() in ('PIC', 'OBSERVER', 'ADMIN'));
drop policy if exists dc_sessions_close on public.dc_sessions;
create policy dc_sessions_close on public.dc_sessions for update
  using (org_id = public.dc_org() and public.dc_role() in ('PIC', 'OBSERVER', 'ADMIN'))
  with check (org_id = public.dc_org());

drop policy if exists dc_events_read on public.dc_events;
create policy dc_events_read on public.dc_events for select
  using (exists (select 1 from public.dc_sessions s where s.id = session_id and s.org_id = public.dc_org()));
drop policy if exists dc_events_write on public.dc_events;
create policy dc_events_write on public.dc_events for insert
  with check (public.dc_role() in ('PIC', 'OBSERVER', 'ADMIN')
              and exists (select 1 from public.dc_sessions s where s.id = session_id and s.org_id = public.dc_org()));

drop policy if exists dc_health_read on public.dc_health;
create policy dc_health_read on public.dc_health for select using (org_id = public.dc_org());
drop policy if exists dc_health_write on public.dc_health;
create policy dc_health_write on public.dc_health for insert
  with check (org_id = public.dc_org() and public.dc_role() in ('PIC', 'OBSERVER', 'ADMIN'));

drop policy if exists dc_service_read on public.dc_service;
create policy dc_service_read on public.dc_service for select using (org_id = public.dc_org());
drop policy if exists dc_service_write on public.dc_service;
create policy dc_service_write on public.dc_service for insert
  with check (org_id = public.dc_org() and public.dc_role() in ('PIC', 'OBSERVER', 'ADMIN'));

grant usage on schema public to authenticated;
grant select on public.dc_members to authenticated;
grant select, insert, update on public.dc_sessions to authenticated;
grant select, insert on public.dc_events, public.dc_health, public.dc_service to authenticated;
grant usage on all sequences in schema public to authenticated;
