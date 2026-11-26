-- 0047 Live Cards: client-made digital cards with their own accounts, public links and uploads.
-- NOT APPLIED. Hardened on 24 Nov 2026 and attack-tested in a rolled-back transaction on the real database (55 checks). Fields and file slots added 25 Nov 2026 (headshot, link preview picture,
-- address, hours, review link, payment names; 12 file limit): 73 checks pass on the local stand-in only (../tests/0047_live_cards_attack_test.sql). Otis decides when it goes live.
-- Everything here is new and self-contained (prefix lc_, bucket live-cards). It does not touch the marketing system's tables.
--
-- Security shape (the browser is never trusted):
--   * Accounts are Supabase Auth users (email code). Row level security is on for every table.
--   * A client can only read and change their own card. The public reads ONE card at a time by its exact link name
--     through lc_get_card(); nobody can list cards, so contact details cannot be harvested in bulk.
--   * Whatever a client sends is rebuilt field by field by lc_clean_card(): unknown fields are dropped, text is trimmed and
--     stripped of control characters, links must be http(s), and pictures/video must be the client's OWN uploaded files.
--   * Plan, blocked and owner can only be changed by the owner's tools (service role). Taking a card down blocks the whole account,
--     and a blocked account that deletes itself cannot start over with the same email. Payments set the plan from a
--     signature-checked webhook, never from the app.
--   * Uploads: own folder only, fixed file names (background, logo, headshot, link preview picture), pictures and video only,
--     25 MB each, at most 12 files per account. Only a background may be a video; only a logo may be a PNG.
--   * Reports go through lc_report(), which is throttled, and cannot be read by the public.

create table if not exists public.lc_accounts (
  user_id                uuid primary key references auth.users(id) on delete cascade,
  plan                   text not null default 'free' check (plan in ('free','pro')),
  blocked                boolean not null default false,
  stripe_customer_id     text,
  stripe_subscription_id text,
  created_at             timestamptz not null default now()
);
comment on table public.lc_accounts is 'Live Cards: one row per client account. Written only by the owner tools and the billing webhook (service role).';

create table if not exists public.lc_cards (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  slug       text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'),
  data       jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 16000),
  published  boolean not null default false,
  blocked    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lc_cards_owner_idx on public.lc_cards(owner);

create table if not exists public.lc_reports (
  id         bigint generated always as identity primary key,
  slug       text not null,
  reason     text not null,
  handled    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists lc_reports_recent_idx on public.lc_reports(created_at);

-- Emails that may not hold a publishing account. Filled when a blocked account deletes itself, so signing up again does not wipe the slate.
create table if not exists public.lc_blocklist (
  email      text primary key check (email = lower(email) and length(email) between 3 and 320),
  created_at timestamptz not null default now()
);

create table if not exists public.lc_billing_events (
  event_id   text primary key,
  type       text not null,
  created_at timestamptz not null default now()
);
comment on table public.lc_billing_events is 'Live Cards: payment webhook events already handled, so a replayed event does nothing.';

-- ---------- cleaning what a client sends
create or replace function public.lc_txt(v text, n int) returns text
language sql immutable set search_path = '' as $$
  -- control characters become spaces; hidden text-direction marks (used to disguise names and links) are removed
  select left(btrim(translate(regexp_replace(coalesce(v, ''), '[[:cntrl:]]', ' ', 'g'),
    chr(8234) || chr(8235) || chr(8236) || chr(8237) || chr(8238) || chr(8294) || chr(8295) || chr(8296) || chr(8297), '')), n)
$$;

create or replace function public.lc_link(v text) returns text
language sql immutable set search_path = '' as $$
  select case when public.lc_txt(v, 500) ~ '^https?://[^[:space:]<>"''`]{3,}$' then public.lc_txt(v, 500) else '' end
$$;

-- A picture or video on a card must be a file this account uploaded to its own folder. No other address is accepted.
drop function if exists public.lc_media(text, uuid);
-- p_kind is the slot the file is for: bg (background), logo, photo (headshot) or og (link preview picture).
-- A file is only accepted in its own slot, only a background may be a video, and only a logo may be a PNG (a see-through logo).
create or replace function public.lc_media(v text, p_owner uuid, p_kind text) returns text
language sql immutable set search_path = '' as $$
  select case when p_kind in ('bg','logo','photo','og')
               and coalesce(v, '') ~ ('^https://glzodwhyavexpuusbqjy\.supabase\.co/storage/v1/object/public/live-cards/' || p_owner::text || '/' || p_kind || '-[a-z0-9]{1,16}\.'
                                      || case when p_kind = 'bg' then '(jpg|mp4|mov|webm)' when p_kind = 'logo' then '(jpg|png)' else 'jpg' end || '$')
              then v else '' end
$$;
-- a payment name (Cash App, Venmo): letters, numbers, dash and underscore only
create or replace function public.lc_handle(v text, p_min int, p_max int, p_dash boolean) returns text
language sql immutable set search_path = '' as $$
  select case when coalesce(v, '') ~ ('^[A-Za-z0-9_' || case when p_dash then '-' else '' end || ']{' || p_min || ',' || p_max || '}$') then v else '' end
$$;

create or replace function public.lc_clean_card(p jsonb, p_owner uuid, p_plan text) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  a jsonb := case when jsonb_typeof(p->'actions') = 'object' then p->'actions' else '{}'::jsonb end;
  b jsonb := case when jsonb_typeof(p->'background') = 'object' then p->'background' else '{}'::jsonb end;
  l jsonb := case when jsonb_typeof(p->'logo') = 'object' then p->'logo' else '{}'::jsonb end;
  ph jsonb := case when jsonb_typeof(p->'photo') = 'object' then p->'photo' else '{}'::jsonb end;
  pv jsonb := case when jsonb_typeof(p->'preview') = 'object' then p->'preview' else '{}'::jsonb end;
  v_type  text := case when b->>'type' in ('scene','image','video') then b->>'type' else 'scene' end;
  v_url   text := public.lc_media(b->>'url', p_owner, 'bg');
  v_phone text := regexp_replace(coalesce(a->>'phone', ''), '[^0-9+]', '', 'g');
  v_email text := public.lc_txt(a->>'email', 200);
  v_zelle text := public.lc_txt(a->>'zelle', 200);
  v_zphone text := regexp_replace(coalesce(a->>'zelle', ''), '[^0-9+]', '', 'g');
begin
  if v_type <> 'scene' and v_url = '' then v_type := 'scene'; end if;
  if v_phone !~ '^\+?[0-9]{7,15}$' then v_phone := ''; end if;
  if v_email !~ '^[^[:space:]@<>"'']+@[^[:space:]@<>"'']+\.[^[:space:]@<>"'']+$' then v_email := ''; end if;
  -- Zelle goes to an email or a phone number; anything else is dropped
  if v_zelle !~ '^[^[:space:]@<>"'']+@[^[:space:]@<>"'']+\.[^[:space:]@<>"'']+$' then v_zelle := case when v_zphone ~ '^\+?[0-9]{7,15}$' then v_zphone else '' end; end if;
  return jsonb_build_object(
    'v', 1,
    'name', public.lc_txt(p->>'name', 60), 'company', public.lc_txt(p->>'company', 60),
    'role', public.lc_txt(p->>'role', 60), 'tagline', public.lc_txt(p->>'tagline', 90),
    'accent', case when p->>'accent' ~ '^#[0-9a-fA-F]{6}$' then p->>'accent' else '#2563eb' end,
    'logo', jsonb_build_object('url', public.lc_media(l->>'url', p_owner, 'logo'), 'mark', false,
                               'line1', public.lc_txt(l->>'line1', 24), 'line2', public.lc_txt(l->>'line2', 24)),
    'photo', jsonb_build_object('url', public.lc_media(ph->>'url', p_owner, 'photo')),
    'preview', jsonb_build_object('url', public.lc_media(pv->>'url', p_owner, 'og')),
    'hours', public.lc_txt(p->>'hours', 60),
    'actions', jsonb_build_object(
      'phone', v_phone, 'text', (a->'text') = 'true'::jsonb, 'email', v_email,
      'booking', public.lc_link(a->>'booking'), 'bookingLabel', public.lc_txt(a->>'bookingLabel', 34),
      'website', public.lc_link(a->>'website'), 'facebook', public.lc_link(a->>'facebook'), 'instagram', public.lc_link(a->>'instagram'),
      'linkedin', public.lc_link(a->>'linkedin'), 'tiktok', public.lc_link(a->>'tiktok'), 'youtube', public.lc_link(a->>'youtube'),
      'address', public.lc_txt(a->>'address', 140), 'review', public.lc_link(a->>'review'),
      'cashapp', public.lc_handle(a->>'cashapp', 1, 20, false), 'venmo', public.lc_handle(a->>'venmo', 5, 30, true), 'zelle', v_zelle,
      'leads', (a->'leads') = 'true'::jsonb),
    'background', jsonb_build_object(
      'type', v_type, 'id', case when b->>'id' ~ '^[a-z]{2,12}$' then b->>'id' else 'ocean' end,
      'url', case when v_type = 'scene' then '' else v_url end,
      'fit', case when b->>'fit' = 'band' then 'band' else 'fill' end,
      'bg', case when b->>'bg' ~ '^#[0-9a-fA-F]{6}$' then b->>'bg' else '#000000' end,
      'sound', coalesce(b->'sound', 'true'::jsonb) <> 'false'::jsonb),
    'showMade', case when p_plan = 'pro' then coalesce(p->'showMade', 'true'::jsonb) <> 'false'::jsonb else true end);
end $$;

-- ---------- link names
create or replace function public.lc_slug_reserved(p_slug text) returns boolean
language sql immutable set search_path = '' as $$
  select p_slug = any (array['admin','api','app','card','cards','c','studio','live','live-cards','meridian','meridianinterface','meridian-interface',
    'otis','otis-williams','owner','support','help','login','signin','signup','account','settings','billing','pay','payment','checkout','security',
    'terms','privacy','sample','demo','test','www','mail','null','undefined'])
$$;

create or replace function public.lc_slug_available(p_slug text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'
     and not public.lc_slug_reserved(p_slug)
     and not exists (select 1 from public.lc_cards c where c.slug = p_slug)
$$;

-- ---------- blocked accounts
create or replace function public.lc_is_blocked(p_uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.lc_accounts a where a.user_id = p_uid and a.blocked)
      or exists (select 1 from public.lc_blocklist b join auth.users u on lower(u.email) = b.email where u.id = p_uid)
$$;

-- Owner tools only. Taking a card down blocks the whole account: every card it holds is hidden and it cannot save, publish or upload.
-- Without this, a client whose card was taken down could delete it and publish a fresh one.
create or replace function public.lc_set_blocked(p_card uuid, p_blocked boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  select owner into v_owner from public.lc_cards where id = p_card;
  if v_owner is null then raise exception 'No such card.' using errcode = 'P0002'; end if;
  insert into public.lc_accounts(user_id, blocked) values (v_owner, p_blocked) on conflict (user_id) do update set blocked = excluded.blocked;
  update public.lc_cards set blocked = p_blocked where owner = v_owner;
  if not p_blocked then delete from public.lc_blocklist b using auth.users u where u.id = v_owner and b.email = lower(u.email); end if;
end $$;

-- ---------- guard on every card write
create or replace function public.lc_cards_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  -- Trusted = the owner's own tools: the service role, or a direct database session with no web request behind it.
  v_trusted boolean := coalesce(auth.role(), '') = 'service_role' or (auth.role() is null and session_user <> 'authenticator');
  v_plan  text;
  v_count int;
  v_limit int;
begin
  new.updated_at := now();
  if v_trusted then return new; end if;
  if auth.uid() is null then raise exception 'Not signed in.' using errcode = '28000'; end if;
  if public.lc_is_blocked(auth.uid()) then raise exception 'This account cannot publish cards. Contact Meridian Interface.' using errcode = 'P0001'; end if;

  if tg_op = 'INSERT' then
    new.owner   := auth.uid();
    new.blocked := false;
    if public.lc_slug_reserved(new.slug) then raise exception 'That link is reserved. Try another.' using errcode = '23505'; end if;
    insert into public.lc_accounts(user_id) values (new.owner) on conflict do nothing;
    -- Lock this account's row. Two saves sent at the same instant are then handled one after the other, so the card limit cannot be slipped past.
    select plan into v_plan from public.lc_accounts where user_id = new.owner for update;
    v_limit := case v_plan when 'pro' then 5 else 1 end;
    select count(*) into v_count from public.lc_cards where owner = new.owner;
    if v_count >= v_limit then raise exception 'Your plan allows % card(s).', v_limit using errcode = 'P0001'; end if;
  else
    new.id         := old.id;
    new.owner      := old.owner;
    new.blocked    := old.blocked;
    new.created_at := old.created_at;
    if new.slug <> old.slug and public.lc_slug_reserved(new.slug) then raise exception 'That link is reserved. Try another.' using errcode = '23505'; end if;
    select coalesce((select plan from public.lc_accounts where user_id = new.owner), 'free') into v_plan;
  end if;

  new.data := public.lc_clean_card(new.data, new.owner, v_plan);
  if new.published and new.data->>'name' = '' then raise exception 'Add your name before publishing.' using errcode = 'P0001'; end if;
  return new;
end $$;
drop trigger if exists lc_cards_guard on public.lc_cards;
create trigger lc_cards_guard before insert or update on public.lc_cards for each row execute function public.lc_cards_guard();

-- ---------- the only public doors
create or replace function public.lc_get_card(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select c.data from public.lc_cards c where c.slug = p_slug and c.published and not c.blocked
     and not exists (select 1 from public.lc_accounts a where a.user_id = c.owner and a.blocked)
$$;

create or replace function public.lc_report(p_slug text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_reason text := public.lc_txt(p_reason, 500);
begin
  if length(v_reason) < 3 or coalesce(p_slug, '') !~ '^[a-z0-9-]{3,40}$' then return; end if;
  if not exists (select 1 from public.lc_cards where slug = p_slug and published) then return; end if;
  perform pg_advisory_xact_lock(hashtextextended('lc-report', 0)); -- one at a time, so a burst cannot overshoot the limits below
  if (select count(*) from public.lc_reports where slug = p_slug and created_at > now() - interval '1 hour') >= 5 then return; end if;
  if (select count(*) from public.lc_reports where created_at > now() - interval '1 hour') >= 200 then return; end if;
  insert into public.lc_reports(slug, reason) values (p_slug, v_reason);
end $$;

create or replace function public.lc_delete_account() returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not signed in.' using errcode = '28000'; end if;
  -- A paying account must cancel first. Deleting the account would not stop the card being charged, so it is refused with a plain reason.
  if exists (select 1 from public.lc_accounts where user_id = v_uid and plan = 'pro' and stripe_subscription_id is not null) then
    raise exception 'Cancel your paid plan first (Share, then Manage my plan). Then you can delete your account.' using errcode = 'P0001';
  end if;
  -- A blocked account may still delete itself, but its email is remembered so it cannot simply sign up again.
  if public.lc_is_blocked(v_uid) or exists (select 1 from public.lc_cards where owner = v_uid and blocked) then
    insert into public.lc_blocklist(email) select lower(u.email) from auth.users u where u.id = v_uid and u.email is not null on conflict do nothing;
  end if;
  delete from public.lc_cards where owner = v_uid;
  delete from public.lc_accounts where user_id = v_uid;
  delete from auth.users where id = v_uid;
end $$;

-- how many files the signed-in account already holds (takes no argument, so nobody can count another account's files)
-- It also makes one account's uploads wait for each other, so uploads sent at the same instant cannot slip past the file limit.
create or replace function public.lc_file_count() returns int
language plpgsql volatile security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_n int;
begin
  if v_uid is null or public.lc_is_blocked(v_uid) then return 2147483647; end if;
  perform pg_advisory_xact_lock(hashtextextended('lc-files:' || v_uid::text, 0));
  select count(*)::int into v_n from storage.objects o where o.bucket_id = 'live-cards' and o.name like v_uid::text || '/%';
  return v_n;
end $$;

-- ---------- access rules
alter table public.lc_accounts       enable row level security;
alter table public.lc_cards          enable row level security;
alter table public.lc_reports        enable row level security;
alter table public.lc_billing_events enable row level security;
alter table public.lc_blocklist      enable row level security;

drop policy if exists lc_accounts_read_own on public.lc_accounts;
create policy lc_accounts_read_own on public.lc_accounts for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists lc_cards_read_public on public.lc_cards;
drop policy if exists lc_cards_read_own on public.lc_cards;
create policy lc_cards_read_own on public.lc_cards for select to authenticated using (owner = (select auth.uid()));
drop policy if exists lc_cards_insert_own on public.lc_cards;
create policy lc_cards_insert_own on public.lc_cards for insert to authenticated with check (owner = (select auth.uid()));
drop policy if exists lc_cards_update_own on public.lc_cards;
create policy lc_cards_update_own on public.lc_cards for update to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
drop policy if exists lc_cards_delete_own on public.lc_cards;
create policy lc_cards_delete_own on public.lc_cards for delete to authenticated using (owner = (select auth.uid()));
drop policy if exists lc_reports_insert_any on public.lc_reports;

revoke all on public.lc_accounts, public.lc_cards, public.lc_reports, public.lc_billing_events, public.lc_blocklist from public, anon, authenticated;
grant select (user_id, plan) on public.lc_accounts to authenticated;
grant select, delete on public.lc_cards to authenticated;
grant insert (slug, data, published), update (slug, data, published) on public.lc_cards to authenticated;

revoke all on function public.lc_txt(text,int), public.lc_link(text), public.lc_media(text,uuid,text), public.lc_handle(text,int,int,boolean), public.lc_clean_card(jsonb,uuid,text), public.lc_slug_reserved(text),
  public.lc_slug_available(text), public.lc_cards_guard(), public.lc_get_card(text), public.lc_report(text,text), public.lc_delete_account(), public.lc_file_count(),
  public.lc_is_blocked(uuid), public.lc_set_blocked(uuid,boolean)
  from public, anon, authenticated;
grant execute on function public.lc_slug_available(text), public.lc_get_card(text), public.lc_report(text,text) to anon, authenticated;
grant execute on function public.lc_delete_account() to authenticated;

-- ---------- uploads
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('live-cards', 'live-cards', true, 26214400, array['image/jpeg','image/png','video/mp4','video/quicktime','video/webm'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists lc_files_insert_own on storage.objects;
create policy lc_files_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'live-cards'
              and name ~ ('^' || (select auth.uid())::text || '/(bg-[a-z0-9]{1,16}\.(jpg|mp4|mov|webm)|logo-[a-z0-9]{1,16}\.(jpg|png)|(photo|og)-[a-z0-9]{1,16}\.jpg)$')
              and public.lc_file_count() < 12);
drop policy if exists lc_files_update_own on storage.objects;
drop policy if exists lc_files_delete_own on storage.objects;
create policy lc_files_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'live-cards' and name like (select auth.uid())::text || '/%');
drop policy if exists lc_files_list_own on storage.objects;
create policy lc_files_list_own on storage.objects for select to authenticated
  using (bucket_id = 'live-cards' and name like (select auth.uid())::text || '/%');
grant execute on function public.lc_file_count() to authenticated;
