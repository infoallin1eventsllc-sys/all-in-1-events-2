-- Nightly snapshots of the irreplaceable tables.
--
-- On 9 Sep 2026 a cleanup deleted eight deals, of which five were real, plus a
-- contact and ten activities. They could not be recovered, because nothing in
-- this project kept a copy of anything. That is the failure this defends
-- against: not a disk dying, but a wrong WHERE clause run with the service
-- role. A snapshot in the same database is useless against the first and
-- exactly right against the second.
--
-- Deliberately its own schema. PostgREST serves `public` only, so nothing here
-- is reachable over the API no matter what happens to a policy in public.
create schema if not exists backup;
revoke all on schema backup from public, anon, authenticated;

create table if not exists backup.snapshots (
  id         bigserial primary key,
  taken_at   timestamptz not null default now(),
  reason     text        not null default 'scheduled',
  row_counts jsonb       not null,
  payload    jsonb       not null,
  bytes      integer     not null
);

create index if not exists snapshots_taken_at_idx on backup.snapshots (taken_at desc);

-- Take one snapshot.
--
-- Whole tables, as JSON. The CRM is small — a few hundred rows — so a full copy
-- costs less than the machinery needed to work out what changed, and a full
-- copy is what someone wants at the moment they need it.
create or replace function public.take_crm_snapshot(p_reason text default 'scheduled')
returns bigint
language plpgsql
security definer
set search_path = public, backup, pg_temp
as $$
declare
  doc     jsonb;
  counts  jsonb;
  n       integer;
  new_id  bigint;
begin
  select jsonb_build_object(
    'contacts',       coalesce((select jsonb_agg(to_jsonb(t)) from public.contacts t), '[]'::jsonb),
    'deals',          coalesce((select jsonb_agg(to_jsonb(t)) from public.deals t), '[]'::jsonb),
    'activities',     coalesce((select jsonb_agg(to_jsonb(t)) from public.activities t), '[]'::jsonb),
    'messages',       coalesce((select jsonb_agg(to_jsonb(t)) from public.messages t), '[]'::jsonb),
    'owner_invoices', coalesce((select jsonb_agg(to_jsonb(t)) from public.owner_invoices t), '[]'::jsonb),
    'content_items',  coalesce((select jsonb_agg(to_jsonb(t)) from public.content_items t), '[]'::jsonb),
    'settings',       coalesce((select jsonb_agg(to_jsonb(t)) from public.settings t), '[]'::jsonb),
    'campaigns',      coalesce((select jsonb_agg(to_jsonb(t)) from public.campaigns t), '[]'::jsonb)
  ) into doc;

  select jsonb_build_object(
    'contacts',       jsonb_array_length(doc->'contacts'),
    'deals',          jsonb_array_length(doc->'deals'),
    'activities',     jsonb_array_length(doc->'activities'),
    'messages',       jsonb_array_length(doc->'messages'),
    'owner_invoices', jsonb_array_length(doc->'owner_invoices'),
    'content_items',  jsonb_array_length(doc->'content_items'),
    'settings',       jsonb_array_length(doc->'settings'),
    'campaigns',      jsonb_array_length(doc->'campaigns')
  ) into counts;

  n := length(doc::text);

  -- A runaway table should not turn the backup into the outage. If the CRM
  -- ever outgrows this, the snapshot stops and says so rather than filling the
  -- database with copies of itself.
  if n > 40 * 1024 * 1024 then
    raise exception 'snapshot would be % MB; move to file-based backups before it grows further', round(n / 1048576.0, 1);
  end if;

  insert into backup.snapshots (reason, row_counts, payload, bytes)
  values (p_reason, counts, doc, n)
  returning id into new_id;

  -- Keep 30 days, and always keep the 7 most recent whatever their age, so a
  -- month away from the desk cannot leave zero copies.
  delete from backup.snapshots
   where taken_at < now() - interval '30 days'
     and id not in (select id from backup.snapshots order by taken_at desc limit 7);

  return new_id;
end;
$$;

revoke all on function public.take_crm_snapshot(text) from public, anon, authenticated;
grant execute on function public.take_crm_snapshot(text) to service_role;

-- What is in the vault, without pulling the payloads out.
create or replace function public.list_crm_snapshots()
returns table (id bigint, taken_at timestamptz, reason text, row_counts jsonb, kb numeric)
language sql
security definer
set search_path = public, backup, pg_temp
as $$
  select id, taken_at, reason, row_counts, round(bytes / 1024.0, 1)
  from backup.snapshots
  order by taken_at desc;
$$;

revoke all on function public.list_crm_snapshots() from public, anon, authenticated;
grant execute on function public.list_crm_snapshots() to service_role;

-- Restore is deliberately NOT automated.
--
-- Reading a snapshot back is one select; deciding what to do with it is a
-- judgement call that depends on what went wrong, and a one-command restore
-- invites someone to overwrite good data with old data at 2am. This returns
-- the rows for a table so they can be inspected and reinserted deliberately.
--
-- To restore, typed rows come back with:
--   select * from jsonb_populate_recordset(null::public.deals,
--                   public.read_crm_snapshot(<id>, 'deals'));
-- Verified on 16 Sep: rows rebuilt this way were byte-identical to live.
create or replace function public.read_crm_snapshot(p_id bigint, p_table text)
returns jsonb
language sql
security definer
set search_path = public, backup, pg_temp
as $$
  select payload -> p_table from backup.snapshots where id = p_id;
$$;

revoke all on function public.read_crm_snapshot(bigint, text) from public, anon, authenticated;
grant execute on function public.read_crm_snapshot(bigint, text) to service_role;

-- Daily, before the working day starts in Houston.
select cron.schedule('crm-snapshot', '15 8 * * *', $$select public.take_crm_snapshot('scheduled')$$);
