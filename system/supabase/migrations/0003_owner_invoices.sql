-- Owner invoices — move the Internal Invoice & Pricing Manager off the browser.
--
-- Until now invoices lived in one browser's localStorage and the portal's
-- passcode was compared in client JavaScript. Because the site is built with
-- Vite, a VITE_-prefixed passcode is inlined into the shipped bundle in plain
-- text — marking it "Sensitive" in the host's dashboard hides it from that
-- dashboard and from nobody else. So the records had no backup, existed on
-- exactly one device, and the lock was decorative.
--
-- This table is the durable side of the fix. The passcode check moves to the
-- `owner` edge function, where the secret never reaches a browser.

create table if not exists public.owner_invoices (
  id                  text primary key,
  client_name         text not null default '',
  client_company      text not null default '',
  client_email        text not null default '',
  client_phone        text not null default '',
  issue_date          text not null default '',
  due_date            text not null default '',
  line_items          jsonb not null default '[]'::jsonb,
  subtotal            numeric(12,2) not null default 0,
  discount_percentage numeric(6,3) not null default 0,
  tax_percentage      numeric(6,3) not null default 0,
  total_amount        numeric(12,2) not null default 0,
  status              text not null default 'Draft',
  notes               text not null default '',
  is_owner_only       boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists owner_invoices_created_idx
  on public.owner_invoices (created_at desc);

-- Deny by default. Only the service role — which lives in the edge function and
-- never in a browser — may read or write. No policy is created on purpose:
-- with RLS enabled and no policy, anon and authenticated get nothing.
alter table public.owner_invoices enable row level security;

comment on table public.owner_invoices is
  'Internal studio invoices. Service-role only; reached exclusively through the `owner` edge function, which verifies the owner passcode server-side.';

-- Failed-login throttle.
--
-- A four-digit-ish passcode over an open endpoint is guessable in minutes
-- without one. Attempts are keyed by a salted hash of the caller IP, never the
-- IP itself, so the table cannot become a visitor log.
create table if not exists public.owner_login_attempts (
  id           bigserial primary key,
  client_hash  text not null,
  succeeded    boolean not null default false,
  attempted_at timestamptz not null default now()
);

create index if not exists owner_login_attempts_lookup_idx
  on public.owner_login_attempts (client_hash, attempted_at desc);

alter table public.owner_login_attempts enable row level security;

comment on table public.owner_login_attempts is
  'Rate-limit ledger for the owner portal. client_hash is a salted hash of the caller IP, not the IP.';

-- Keep the ledger from growing without bound. Nothing here is worth retaining
-- beyond the throttle window.
create or replace function public.prune_owner_login_attempts()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.owner_login_attempts
  where attempted_at < now() - interval '24 hours';
$$;
