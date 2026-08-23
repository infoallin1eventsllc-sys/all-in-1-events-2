-- 0011_payments.sql
-- Taking money for an invoice, without ever touching a card number.
--
-- Applied to production Aug 23 2026 as two migrations (payments,
-- payments_checkout_url) and consolidated here, written from the live schema
-- rather than from memory. Idempotent throughout.
--
-- The shape of the thing: a payment is recorded here as an intention, the
-- client is sent to Stripe's own hosted page, and the only thing that comes
-- back is a signed message saying what happened. Card data never reaches this
-- system, which keeps the business out of PCI-DSS scope beyond the simplest
-- tier.

-- Exact cents, computed by Postgres rather than JavaScript. numeric arithmetic
-- is exact; binary floating point is not, and "$8,500.00 became 849999 cents"
-- is a bug you discover from a customer complaint.
alter table public.owner_invoices
  add column if not exists total_cents bigint
  generated always as ((round((total_amount * (100)::numeric)))::bigint) stored;

create table if not exists public.payments (
  id                  uuid primary key default gen_random_uuid(),
  invoice_id          text references public.owner_invoices(id) on delete set null,

  provider            text not null default 'stripe'
                        check (provider in ('stripe','paypal')),
  -- Checkout Session id (cs_...) — the handle we created.
  provider_session_id text,
  -- Payment Intent id (pi_...) — the handle that actually moved money.
  provider_payment_id text,

  -- What we asked for, frozen at creation. If the invoice is edited later, the
  -- payment still records what the client was actually shown and charged.
  amount_cents        bigint not null check (amount_cents > 0),
  currency            text   not null default 'usd',

  status              text not null default 'created'
    check (status in ('created','processing','paid','failed','expired','refunded')),

  -- card | apple_pay | google_pay | us_bank_account | paypal, filled in from
  -- the processor once known, so the fee question can be answered from data.
  method              text,
  client_email        text,
  error               text,

  -- The hosted checkout URL, kept so an unpaid link can be re-sent without
  -- opening a second checkout for the same invoice. Stripe expires these after
  -- about 24 hours, which is why expires_at travels with it: a lapsed link
  -- sent to a client looks like a failed payment.
  checkout_url        text,
  expires_at          timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  paid_at             timestamptz
);

create unique index if not exists payments_session_idx
  on public.payments (provider, provider_session_id)
  where provider_session_id is not null;

create index if not exists payments_invoice_idx
  on public.payments (invoice_id, created_at desc);

-- One open attempt per invoice at a time. A client who reloads the pay page
-- should not generate a second live checkout for the same money.
create unique index if not exists payments_one_open_per_invoice
  on public.payments (invoice_id)
  where status in ('created','processing');

alter table public.payments enable row level security;  -- deny-by-default, no policies

-- Every processor event already applied.
--
-- Processors retry webhooks until they get a 2xx, and are explicit that an
-- event may arrive more than once. Without this, one retry of
-- checkout.session.completed is a second payment recorded against the same
-- invoice. The primary key is the processor's own event id, so a retry simply
-- conflicts and the handler stops.
create table if not exists public.payment_events (
  event_id     text primary key,
  provider     text not null default 'stripe',
  event_type   text,
  payment_id   uuid references public.payments(id) on delete set null,
  received_at  timestamptz not null default now()
);

alter table public.payment_events enable row level security;

comment on table public.payments is
  'One row per attempt to collect an invoice. Never contains card data.';
comment on table public.payment_events is
  'Processor event ids already applied. Exists so a webhook retry cannot pay an invoice twice.';
