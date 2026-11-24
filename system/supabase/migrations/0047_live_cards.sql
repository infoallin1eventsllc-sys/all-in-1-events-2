-- 0047 Live Cards: client-made digital cards with their own accounts, public links and uploads.
-- NOT APPLIED. Written and checked inside a rolled-back transaction on 24 Nov 2026; Otis decides when it goes live.
-- Everything here is new and self-contained (prefix lc_, bucket live-cards). It does not touch the marketing system's tables.
--
-- Shape: Supabase Auth accounts (email code). One row per card in lc_cards. A published, unblocked card can be read by anyone;
-- only its owner can change it. Uploads live in the public bucket "live-cards" under a folder named after the owner's user id.

create table if not exists public.lc_accounts (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  plan       text not null default 'free' check (plan in ('free','pro')),
  created_at timestamptz not null default now()
);
comment on table public.lc_accounts is 'Live Cards: one row per client account. plan is set only by the owner (service role), never by the client.';

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
comment on column public.lc_cards.blocked is 'Set by the owner (service role) to take a reported card offline. Clients cannot change it.';

create table if not exists public.lc_reports (
  id         bigint generated always as identity primary key,
  slug       text not null check (length(slug) between 3 and 40),
  reason     text not null check (length(reason) between 3 and 500),
  created_at timestamptz not null default now()
);

-- Links a client may not take: site paths and names that would mislead.
create or replace function public.lc_slug_reserved(p_slug text) returns boolean
language sql immutable set search_path = '' as $$
  select p_slug = any (array['admin','api','app','card','cards','c','studio','live','live-cards','meridian','meridianinterface','meridian-interface',
    'otis','otis-williams','owner','support','help','login','signin','signup','account','settings','terms','privacy','sample','demo','test','www','mail','null','undefined'])
$$;

create or replace function public.lc_slug_available(p_slug text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'
     and not public.lc_slug_reserved(p_slug)
     and not exists (select 1 from public.lc_cards c where c.slug = p_slug)
$$;

-- Guard rails on every write a client makes. The service role (the owner's tools) skips them.
create or replace function public.lc_cards_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_role  text := coalesce(auth.role(), 'service_role');
  v_plan  text;
  v_count int;
  v_limit int;
begin
  new.updated_at := now();
  if v_role = 'service_role' then return new; end if;

  if tg_op = 'INSERT' then
    new.owner   := auth.uid();
    new.blocked := false;
    if public.lc_slug_reserved(new.slug) then raise exception 'That link is reserved. Try another.' using errcode = '23505'; end if;
    insert into public.lc_accounts(user_id) values (new.owner) on conflict do nothing;
    select plan into v_plan from public.lc_accounts where user_id = new.owner;
    v_limit := case v_plan when 'pro' then 5 else 1 end;
    select count(*) into v_count from public.lc_cards where owner = new.owner;
    if v_count >= v_limit then raise exception 'Your plan allows % card(s).', v_limit using errcode = 'P0001'; end if;
  else
    new.owner      := old.owner;
    new.blocked    := old.blocked;
    new.created_at := old.created_at;
    if new.slug <> old.slug and public.lc_slug_reserved(new.slug) then raise exception 'That link is reserved. Try another.' using errcode = '23505'; end if;
  end if;
  return new;
end $$;
drop trigger if exists lc_cards_guard on public.lc_cards;
create trigger lc_cards_guard before insert or update on public.lc_cards for each row execute function public.lc_cards_guard();

-- A client removes their own account, cards and account row. Their uploaded files are removed by the app first (storage policy below).
create or replace function public.lc_delete_account() returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not signed in.' using errcode = '28000'; end if;
  delete from public.lc_cards where owner = v_uid;
  delete from public.lc_accounts where user_id = v_uid;
  delete from auth.users where id = v_uid;
end $$;

alter table public.lc_accounts enable row level security;
alter table public.lc_cards    enable row level security;
alter table public.lc_reports  enable row level security;

drop policy if exists lc_accounts_read_own on public.lc_accounts;
create policy lc_accounts_read_own on public.lc_accounts for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists lc_cards_read_public on public.lc_cards;
create policy lc_cards_read_public on public.lc_cards for select to anon, authenticated using (published and not blocked);
drop policy if exists lc_cards_read_own on public.lc_cards;
create policy lc_cards_read_own on public.lc_cards for select to authenticated using (owner = (select auth.uid()));
drop policy if exists lc_cards_insert_own on public.lc_cards;
create policy lc_cards_insert_own on public.lc_cards for insert to authenticated with check (owner = (select auth.uid()));
drop policy if exists lc_cards_update_own on public.lc_cards;
create policy lc_cards_update_own on public.lc_cards for update to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
drop policy if exists lc_cards_delete_own on public.lc_cards;
create policy lc_cards_delete_own on public.lc_cards for delete to authenticated using (owner = (select auth.uid()));

drop policy if exists lc_reports_insert_any on public.lc_reports;
create policy lc_reports_insert_any on public.lc_reports for insert to anon, authenticated with check (true);

revoke all on public.lc_accounts, public.lc_cards, public.lc_reports from anon, authenticated;
grant select on public.lc_accounts to authenticated;
grant select on public.lc_cards to anon, authenticated;
grant insert (slug, data, published), update (slug, data, published), delete on public.lc_cards to authenticated;
grant insert (slug, reason) on public.lc_reports to anon, authenticated;

revoke all on function public.lc_slug_available(text), public.lc_delete_account(), public.lc_cards_guard(), public.lc_slug_reserved(text) from public, anon, authenticated;
grant execute on function public.lc_slug_available(text) to anon, authenticated;
grant execute on function public.lc_delete_account() to authenticated;

-- Uploads: public to read by direct link, 25 MB per file, pictures and video only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('live-cards', 'live-cards', true, 26214400, array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists lc_files_insert_own on storage.objects;
create policy lc_files_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'live-cards' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists lc_files_update_own on storage.objects;
create policy lc_files_update_own on storage.objects for update to authenticated
  using (bucket_id = 'live-cards' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists lc_files_delete_own on storage.objects;
create policy lc_files_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'live-cards' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- Needed so a client can list and remove their own files (upsert and account deletion). It does not let anyone list other folders.
drop policy if exists lc_files_list_own on storage.objects;
create policy lc_files_list_own on storage.objects for select to authenticated
  using (bucket_id = 'live-cards' and (storage.foldername(name))[1] = (select auth.uid())::text);
