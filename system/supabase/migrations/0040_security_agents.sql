-- Security agents: what they read, and two locks tightened while here.
--
-- The `security-agent` edge function runs two agents:
--   watch  every 15 minutes: is someone trying to get in right now?
--   audit  once a day: are the doors still locked the way they were built?
-- Both read the database through the two functions below, which return
-- COUNTS AND NAMES ONLY. Nothing an outsider typed (a form message, a
-- passcode guess) ever reaches the model that writes the alert, so an
-- attacker cannot talk the agent into reporting "all clear".

-- ---------------------------------------------------------------- hardening --

-- Supabase grants anon and authenticated full rights on every public table by
-- default. Row-level security with no policies already refuses them, so today
-- this changes nothing that works. It removes the second way in: one mistaken
-- policy, or one table created without RLS, would otherwise be readable by
-- anyone holding the public anon key, which ships in every browser. The
-- website never reads tables directly; every call goes through an edge
-- function holding the service role.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated, public;

-- The snapshot table holds a full copy of the client records. Its schema is
-- already closed to anon and authenticated; RLS makes it a second lock, like
-- every table in public.
alter table backup.snapshots enable row level security;

-- ------------------------------------------------------------------ signals --

-- p_limits: each endpoint's hourly per-caller limit, keyed by rate-limit scope
-- (owner, leads, pay, siteimg, unsub, intake), passed in by the agent so the
-- numbers live next to the functions that enforce them.
create or replace function public.security_signals(p_limits jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  out jsonb;
begin
  with b as (
    select split_part(key, ':', 1) as scope, key, count
    from public.rate_buckets
    where window_start >= date_trunc('hour', now()) - interval '1 hour'
  ), s as (
    select scope,
           count(distinct key) as callers,
           coalesce(max(count), 0) as max_calls,
           count(*) filter (where count > coalesce((p_limits ->> scope)::int, 2147483647)) as callers_over_limit,
           coalesce(sum(greatest(count - coalesce((p_limits ->> scope)::int, 2147483647), 0)), 0) as refused_requests
    from b group by scope
  )
  select jsonb_build_object(
    'endpoints', coalesce((select jsonb_object_agg(scope, jsonb_build_object(
        'callers', callers, 'max_calls', max_calls,
        'callers_over_limit', callers_over_limit, 'refused_requests', refused_requests)) from s), '{}'::jsonb),
    'signin', (select jsonb_build_object(
        'failures_1h', count(*) filter (where not succeeded),
        'failing_devices_1h', count(distinct client_hash) filter (where not succeeded),
        'successes_1h', count(*) filter (where succeeded))
      from public.owner_login_attempts where attempted_at > now() - interval '1 hour'),
    'events_1h', coalesce((select jsonb_object_agg(kind, n) from (
        select kind, count(*) as n from public.security_events
        where created_at > now() - interval '1 hour' and kind not like 'alert\_%'
        group by kind) e), '{}'::jsonb),
    -- Form input that looks like an attack tool probing for a weakness, not
    -- a person asking for a website. Counted by type; the text itself stays
    -- in the database.
    'suspicious_input_1h', (select jsonb_build_object(
        'script_injection', count(*) filter (where t ~* '<\s*script|javascript:|onerror\s*=|onload\s*='),
        'sql_injection',    count(*) filter (where t ~* 'union\s+(all\s+)?select|\m(or|and)\s+1\s*=\s*1\M|;\s*drop\s+table|pg_sleep\s*\(|information_schema'),
        'path_traversal',   count(*) filter (where t ~* '\.\./\.\./|/etc/passwd|%2e%2e%2f'),
        'template_injection', count(*) filter (where t ~* '\{\{[^}]{0,40}\}\}|\$\{[^}]{0,40}\}'),
        'oversized',        count(*) filter (where length(t) > 20000))
      from (
        select coalesce(meta::text, '') || ' ' || coalesce(full_name, '') || ' ' || coalesce(company, '') || ' ' || coalesce(notes, '') as t
        from public.contacts where created_at > now() - interval '1 hour' or updated_at > now() - interval '1 hour'
      ) c),
    'open_alerts', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'severity', severity))
      from public.system_alerts where resolved_at is null and component in ('owner', 'security')), '[]'::jsonb)
  ) into out;
  return out;
end $$;

-- ------------------------------------------------------------------- audit --

create or replace function public.security_audit()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'tables_without_rls', (select coalesce(jsonb_agg(n.nspname || '.' || c.relname order by 1), '[]'::jsonb)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('public', 'backup') and c.relkind in ('r', 'p') and not c.relrowsecurity),
    'public_table_grants', (select coalesce(jsonb_agg(distinct table_schema || '.' || table_name), '[]'::jsonb)
      from information_schema.role_table_grants
      where table_schema in ('public', 'backup') and grantee in ('anon', 'authenticated', 'PUBLIC')),
    'policies_for_public_roles', (select coalesce(jsonb_agg(schemaname || '.' || tablename || ':' || policyname), '[]'::jsonb)
      from pg_policies
      where schemaname in ('public', 'backup') and roles && array['public', 'anon', 'authenticated']::name[]),
    'exposed_privileged_functions', (select coalesce(jsonb_agg(p.proname order by p.proname), '[]'::jsonb)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
        and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))),
    'public_buckets', (select coalesce(jsonb_agg(id order by id), '[]'::jsonb) from storage.buckets where public),
    'last_backup_at', (select max(taken_at) from backup.snapshots),
    'twostep_on', (select totp_enabled from public.owner_security where id),
    'run_secret_set', (select coalesce(length(value ->> 'value'), 0) > 0 from public.settings where key = 'run_secret')
  );
$$;

-- Service role only, like every privileged function in this project. Stated
-- after the definitions on purpose: CREATE OR REPLACE resets a function's ACL
-- to EXECUTE-for-PUBLIC, which silently undid migration 0033 once.
revoke all on function public.security_signals(jsonb) from public, anon, authenticated;
revoke all on function public.security_audit()        from public, anon, authenticated;
grant execute on function public.security_signals(jsonb) to service_role;
grant execute on function public.security_audit()        to service_role;

-- --------------------------------------------------------------- schedules --

-- Safe to schedule before the function is deployed: invoke_edge posts through
-- pg_net and nothing waits on the answer, so until then each call is a
-- harmless 404, and the first run after deploy is the first real one.
select cron.schedule('security-watch', '*/15 * * * *', $$select public.invoke_edge('security-agent', '{"mode":"watch"}'::jsonb)$$);
select cron.schedule('security-audit', '5 13 * * *',  $$select public.invoke_edge('security-agent', '{"mode":"audit"}'::jsonb)$$);
