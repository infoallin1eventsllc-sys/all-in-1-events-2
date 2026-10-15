-- Nightly snapshots: every table with business data, plus the list of files.
--
-- 0028 copied eight CRM tables. Since then the project gained tables that hold
-- real work and would hurt to lose: payments and their events, the media
-- library, the brand brain and departments, Stack Planner requests, the agents'
-- memory and the weekly reports. Otis asked (15 Oct) for automatic backups of
-- everything, so the snapshot now takes all of them.
--
-- Left out on purpose:
--   channels, owner_security     credentials and the two-step secret. A copy
--                                 outlives a rotation, so a leaked or replaced
--                                 key would live on in 30 days of backups.
--                                 Credentials are re-entered, not restored.
--   agent_runs, tasks, system_alerts, security_events, owner_login_attempts,
--   rate_buckets                  logs and counters, rebuilt by the system.
--
-- Files in Storage are not database rows; the snapshot records which files
-- exist (bucket, path, size, type, date) so a loss can at least be listed.
-- The files themselves need the off-site copy (see system/BACKUPS.md).
--
-- The list of tables is data, not code: add a table to `tables` below and the
-- copy, the row counts and the restore all pick it up.
create or replace function public.take_crm_snapshot(p_reason text default 'scheduled')
returns bigint
language plpgsql
security definer
set search_path = public, backup, pg_temp
as $$
declare
  tables  text[] := array[
    'contacts', 'deals', 'activities', 'messages', 'owner_invoices',
    'content_items', 'settings', 'campaigns',
    'payments', 'payment_events', 'media_assets', 'brand_brain', 'departments',
    'planner_requests', 'memory', 'reports'
  ];
  t       text;
  rows    jsonb;
  doc     jsonb := '{}'::jsonb;
  counts  jsonb := '{}'::jsonb;
  n       integer;
  new_id  bigint;
begin
  foreach t in array tables loop
    -- A table that has been dropped or renamed is reported, not fatal: the
    -- rest of the backup is worth more than stopping over one name.
    if to_regclass('public.' || t) is null then
      counts := counts || jsonb_build_object(t, 'missing');
      continue;
    end if;
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x', t) into rows;
    doc := doc || jsonb_build_object(t, rows);
    counts := counts || jsonb_build_object(t, jsonb_array_length(rows));
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
           'bucket', o.bucket_id, 'path', o.name,
           'bytes', (o.metadata->>'size')::bigint, 'type', o.metadata->>'mimetype',
           'updated_at', o.updated_at) order by o.bucket_id, o.name), '[]'::jsonb)
    into rows
    from storage.objects o;
  doc := doc || jsonb_build_object('storage_files', rows);
  counts := counts || jsonb_build_object('storage_files', jsonb_array_length(rows));

  n := length(doc::text);

  -- A runaway table should not turn the backup into the outage. If the data
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
