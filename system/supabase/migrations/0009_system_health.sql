-- 0009_system_health.sql
-- The system's own voice: somewhere for it to say when something is wrong.
--
-- Applied to production Aug 21 2026 as four incremental migrations
-- (system_health_alerts, system_health_checks, health_check_never_run_fix,
-- cron_health_view). This file is those four consolidated, dumped back out of
-- the live database so it matches byte-for-byte what is actually running.
-- Every statement is idempotent.

-- ---------------------------------------------------------------------------
-- Open problems, not a history of every problem that ever was.
-- ---------------------------------------------------------------------------
create table if not exists public.system_alerts (
  id          uuid primary key default gen_random_uuid(),
  code        text        not null,   -- stable identity, e.g. cron_silent:marketing-runner
  severity    text        not null check (severity in ('critical','warning','info')),
  title       text        not null,   -- what the owner reads first
  detail      text        not null,   -- what it means for the business
  component   text        not null,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  seen_count  integer     not null default 1,
  resolved_at timestamptz,
  notified_at timestamptz,            -- reserved: set once an alert has been emailed
  meta        jsonb       not null default '{}'::jsonb
);

-- One open row per code. A condition that keeps holding bumps the counter
-- rather than filling the table; the same code may appear again later as a
-- fresh row once the first has been resolved.
create unique index if not exists system_alerts_open_code
  on public.system_alerts (code) where resolved_at is null;

create index if not exists system_alerts_open
  on public.system_alerts (severity, last_seen desc) where resolved_at is null;

alter table public.system_alerts enable row level security;  -- deny-by-default, no policies

create or replace function public.raise_alert(
  p_code text, p_severity text, p_title text, p_detail text,
  p_component text, p_meta jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  insert into public.system_alerts (code, severity, title, detail, component, meta)
  values (p_code, p_severity, p_title, p_detail, p_component, p_meta)
  on conflict (code) where resolved_at is null
  do update set
    last_seen  = now(),
    seen_count = public.system_alerts.seen_count + 1,
    severity   = excluded.severity,
    detail     = excluded.detail,
    meta       = excluded.meta;
end $function$;

create or replace function public.clear_alert(p_code text)
returns void language sql security definer set search_path to 'public' as $function$
  update public.system_alerts set resolved_at = now()
  where code = p_code and resolved_at is null;
$function$;

-- ---------------------------------------------------------------------------
-- The checks. Each raises while its condition holds and clears when it stops,
-- so the alert list is current state rather than an archive.
--
-- Each schedule carries its own grace period. One shared threshold would either
-- cry wolf over the weekly report or stay silent for hours while the two-minute
-- runner is dead.
--
-- Never-run is `info`, never `critical`: you can only say something stopped if
-- you saw it start. An alert list that cries wolf on day one teaches its reader
-- to ignore it.
-- ---------------------------------------------------------------------------
create or replace function public.check_system_health()
returns table(raised integer, cleared integer)
language plpgsql security definer set search_path to 'public', 'cron' as $function$
declare
  v_raised int := 0;
  v_cleared int := 0;
  r record;
  n int;
  v_last timestamptz;
begin
  for r in
    select j.jobname, j.schedule,
           max(d.start_time) as last_run,
           count(d.*) as runs,
           case j.jobname
             when 'marketing-runner'       then interval '20 minutes'
             when 'marketing-healthcheck'  then interval '90 minutes'
             when 'marketing-analyze'      then interval '30 hours'
             when 'marketing-orchestrator' then interval '30 hours'
             when 'marketing-report'       then interval '9 days'
             else interval '2 days'
           end as grace
    from cron.job j left join cron.job_run_details d on d.jobid = j.jobid
    where j.jobname like 'marketing-%'
    group by j.jobname, j.schedule
  loop
    if r.runs = 0 then
      -- Newly scheduled, or its first window has not come round yet. Worth
      -- showing so a genuinely dead schedule is not invisible, but it is not
      -- an incident and must not read like one.
      perform public.raise_alert(
        'cron_never:' || r.jobname, 'info',
        r.jobname || ' has not run yet',
        'Scheduled "' || r.schedule || '" but no run recorded so far. Expected shortly after it '
          || 'was set up; if this is still here tomorrow, something is wrong with the schedule.',
        'marketing', jsonb_build_object('job', r.jobname, 'schedule', r.schedule));
      perform public.clear_alert('cron_silent:' || r.jobname);
      v_raised := v_raised + 1;
    elsif r.last_run < now() - r.grace then
      perform public.raise_alert(
        'cron_silent:' || r.jobname, 'critical',
        r.jobname || ' has stopped running',
        'Last ran ' || to_char(r.last_run, 'Mon DD HH24:MI') || ' UTC and is overdue on its "'
          || r.schedule || '" schedule. It ran before, so this is a stop rather than a '
          || 'misconfiguration. Whatever it does is not happening.',
        'marketing', jsonb_build_object('job', r.jobname, 'last_run', r.last_run));
      perform public.clear_alert('cron_never:' || r.jobname);
      v_raised := v_raised + 1;
    else
      perform public.clear_alert('cron_silent:' || r.jobname);
      perform public.clear_alert('cron_never:' || r.jobname);
      v_cleared := v_cleared + 1;
    end if;
  end loop;

  select count(*) into n from agent_runs
  where status = 'error' and started_at > now() - interval '24 hours';
  if n > 0 then
    perform public.raise_alert('agent_errors', 'critical', 'The planning agent errored',
      n || ' run(s) failed in the last 24 hours. Planning has stopped producing work; '
        || 'drafting and follow-ups will dry up until it recovers.',
      'marketing', jsonb_build_object('count', n));
    v_raised := v_raised + 1;
  else perform public.clear_alert('agent_errors'); end if;

  select count(*) into n from tasks where status = 'failed';
  if n > 0 then
    perform public.raise_alert('tasks_failed', 'warning', n || ' task(s) gave up after retrying',
      'These exhausted their retries and will not be attempted again. Each one is a piece of '
        || 'work — a draft, a follow-up, a publish — that never happened.',
      'marketing', jsonb_build_object('count', n));
    v_raised := v_raised + 1;
  else perform public.clear_alert('tasks_failed'); end if;

  select count(*) into n from messages
  where status = 'failed' and created_at > now() - interval '7 days';
  if n > 0 then
    perform public.raise_alert('messages_failed', 'critical', n || ' message(s) failed to send',
      'A lead was written to and never received it. This is the most expensive kind of failure '
        || 'here, because the person is expecting a reply.',
      'marketing', jsonb_build_object('count', n));
    v_raised := v_raised + 1;
  else perform public.clear_alert('messages_failed'); end if;

  select count(*) into n from content_items
  where status = 'failed' and updated_at > now() - interval '7 days';
  if n > 0 then
    perform public.raise_alert('publish_failed', 'warning', n || ' approved post(s) failed to publish',
      'You approved these and the channel rejected them — usually an expired token. '
        || 'The exact error from the platform is stored on each item.',
      'marketing', jsonb_build_object('count', n));
    v_raised := v_raised + 1;
  else perform public.clear_alert('publish_failed'); end if;

  select count(*), min(created_at) into n, v_last from content_items
  where status = 'pending_approval';
  if n >= 5 and v_last < now() - interval '7 days' then
    perform public.raise_alert('approval_backlog', 'warning', n || ' drafts waiting on you',
      'The oldest has been waiting since ' || to_char(v_last, 'Mon DD') || '. Nothing reaches an '
        || 'audience until you approve it, so the system cannot learn what works.',
      'marketing', jsonb_build_object('count', n, 'oldest', v_last));
    v_raised := v_raised + 1;
  else perform public.clear_alert('approval_backlog'); end if;

  return query select v_raised, v_cleared;
end $function$;

-- pg_cron's tables are not reachable through PostgREST. This narrows them to
-- the columns the health panel actually shows.
create or replace function public.cron_health()
returns table(job text, schedule text, last_run timestamptz,
              last_status text, runs_24h integer, failures_24h integer)
language sql security definer set search_path to 'public', 'cron' as $function$
  select
    j.jobname::text,
    j.schedule::text,
    max(d.start_time) as last_run,
    (array_agg(d.status order by d.start_time desc))[1]::text as last_status,
    count(*) filter (where d.start_time > now() - interval '24 hours')::int as runs_24h,
    count(*) filter (where d.start_time > now() - interval '24 hours'
                       and d.status <> 'succeeded')::int as failures_24h
  from cron.job j
  left join cron.job_run_details d on d.jobid = j.jobid
  where j.jobname like 'marketing-%'
  group by j.jobname, j.schedule
  order by j.jobname;
$function$;

revoke all on function public.raise_alert(text,text,text,text,text,jsonb) from anon, authenticated;
revoke all on function public.clear_alert(text)                          from anon, authenticated;
revoke all on function public.check_system_health()                      from anon, authenticated;
revoke all on function public.cron_health()                              from anon, authenticated;

-- Every fifteen minutes: often enough that a problem is fresh when you see it,
-- rare enough to stay invisible.
select cron.unschedule('marketing-healthcheck')
 where exists (select 1 from cron.job where jobname = 'marketing-healthcheck');

select cron.schedule('marketing-healthcheck', '*/15 * * * *',
                     $$ select public.check_system_health(); $$);
