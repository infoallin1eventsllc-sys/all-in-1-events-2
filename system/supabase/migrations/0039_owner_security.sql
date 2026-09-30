-- Owner portal security: two-step sign-in, "sign out every device", and a
-- security event log the portal can show.
--
-- Both tables are reachable only through the service-role client inside the
-- edge functions: RLS is on with no policies, and anon/authenticated hold no
-- grants. Nothing here is exposed to a browser directly.

-- One row, always. `id` is a boolean pinned to true so a second row cannot exist.
create table if not exists public.owner_security (
  id               boolean primary key default true check (id),
  -- Base32 authenticator secret, set once two-step sign-in is confirmed.
  totp_secret      text,
  -- Secret shown during setup, not yet proven with a code. Expires after 15 minutes.
  totp_pending     text,
  totp_pending_at  timestamptz,
  totp_enabled     boolean not null default false,
  -- Last 30-second time step a code was accepted for. A code is single use:
  -- the step must move forward, so a code seen over someone's shoulder, or
  -- replayed from a captured request, is refused.
  totp_last_step   bigint not null default 0,
  -- Every session token carries the epoch it was issued in. Raising this
  -- number signs out every device at once.
  session_epoch    integer not null default 0,
  updated_at       timestamptz not null default now()
);

insert into public.owner_security (id) values (true) on conflict (id) do nothing;

alter table public.owner_security enable row level security;
revoke all on public.owner_security from anon, authenticated;

comment on table public.owner_security is
  'Owner portal two-step secret and session epoch. Service role only. To switch two-step off after losing a phone: update owner_security set totp_enabled = false, totp_secret = null;';

-- What happened, for the portal's Security tab and for alerts.
create table if not exists public.security_events (
  id           bigserial primary key,
  -- login_ok, login_failed, locked_caller, locked_global, new_device,
  -- twostep_on, twostep_off, signout_all
  kind         text not null,
  -- Salted hash of the caller's address, as in owner_login_attempts. Enough to
  -- tell devices apart; not reversible to an IP.
  client_hash  text,
  detail       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists security_events_recent_idx on public.security_events (created_at desc);
create index if not exists security_events_kind_idx on public.security_events (kind, created_at desc);

alter table public.security_events enable row level security;
revoke all on public.security_events from anon, authenticated;

comment on table public.security_events is
  'Owner portal security log. Service role only. Kept 90 days.';

-- The lockout across all callers counts every failure in the last hour, which
-- the existing (client_hash, attempted_at) index cannot answer cheaply.
create index if not exists owner_login_attempts_failures_idx
  on public.owner_login_attempts (attempted_at desc) where not succeeded;

-- Retention: 90 days of security history is plenty to spot a pattern, and
-- nothing older is worth holding.
select cron.schedule(
  'prune-security-events',
  '17 4 * * *',
  $$delete from public.security_events where created_at < now() - interval '90 days'$$
);
