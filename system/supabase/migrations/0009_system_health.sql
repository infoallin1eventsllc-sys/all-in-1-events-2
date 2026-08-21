-- 0009_system_health.sql
-- The system's own voice: somewhere for it to say when something is wrong.
--
-- Applied to production Aug 21 2026 as four incremental migrations
-- (system_health_alerts, system_health_checks, health_check_never_run_fix,
-- cron_health_view) and consolidated here. Every statement is idempotent, so
-- running this file against that database converges rather than conflicts.

-- ---------------------------------------------------------------------------
-- Open problems, not a history of every problem that ever was.
-- ---------------------------------------------------------------------------
create table if not exists system_alerts (
  id           uuid primary key default gen_random_uuid(),
  code         text        not null,   -- stable identity, e.g. cron_silent:marketing-runner
  severity     text        not null check (severity in ('critical','warning','info')),
  title        text        not null,   -- what the owner reads first
  detail       text,                   -- what it means for the business
  component    text        not null default 'marketing',
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  seen_count   int         not null default 1,
  resolved_at  timestamptz
);

-- One open row per code. A condition that keeps holding bumps the counter
-- instead of filling the table; the same code may appear again later as a
-- fresh row once the first has been resolved.
create unique index if not exists system_alerts_open_code
  on system_alerts (code) where resolved_at is null;

create index if not exists system_alerts_open_seen
  on system_alerts (last_seen desc) where resolved_at is null;

alter table system_alerts enable row level security;  -- deny-by-default, no policies

create or replace function raise_alert(
  p_code text, p_severity text, p_title text,
  p_detail text default null, p_component text default 'marketing'
) returns void language sql security definer set search_path = public as $$
  insert into system_alerts (code, severity, title, detail, component)
  values (p_code, p_severity, p_title, p_detail, p_component)
  on conflict (code) where resolved_at is null do update
    set last_seen  = now(),
        seen_count = system_alerts.seen_count + 1,
        severity   = excluded.severity,
        title      = excluded.title,
        detail     = excluded.detail;
$$;

create or replace function clear_alert(p_code text)
returns void language sql security definer set search_path = public as $$
  update system_alerts set resolved_at = now()
   where code = p_code and resolved_at is null;
$$;

-- ---------------------------------------------------------------------------
-- The checks. Each raises while its condition holds and clears when it stops,
-- so the alert list is current state rather than an archive.
-- ---------------------------------------------------------------------------
create or replace function check_system_health()
returns jsonb language plpgsql security definer set search_path = public, cron as $$
declare
  j record; n int; oldest timestamptz; raised int := 0;
begin
  -- Schedules that have gone quiet. A job that has never run is not a job that
  -- has stopped running: you can only say something stopped if you saw it
  -- start. Never-run is informational and says exactly that, otherwise
  -- creating a schedule raises a critical before its first window arrives.
  for j in
    select c.jobname, c.schedule,
           count(d.runid)                                  as runs,
           max(d.end_time)                                 as last_run,
           count(*) filter (where d.status = 'failed')     as failures
      from cron.job c
      left join cron.job_run_details d on d.jobid = c.jobid
     where c.active and c.jobname like 'marketing-%'
     group by c.jobname, c.schedule
  loop
    if j.runs = 0 then
      perform raise_alert('cron_never_ran:' || j.jobname, 'info',
        j.jobname || ' has not run yet',
        'Scheduled ' || j.schedule || ' but its first run has not come round. Nothing is wrong yet.');
      raised := raised + 1;
    elsif j.last_run < now() - interval '90 minutes' then
      perform raise_alert('cron_silent:' || j.jobname, 'critical',
        j.jobname || ' has stopped running',
        'Last ran ' || to_char(j.last_run, 'Mon DD HH24:MI') || ' UTC and is overdue. Whatever it does is not happening.');
      raised := raised + 1;
    else
      perform clear_alert('cron_silent:' || j.jobname);
      perform clear_alert('cron_never_ran:' || j.jobname);
    end if;
  end loop;

  -- The planning agent erroring out.
  select count(*) into n from agent_runs
   where status = 'error' and started_at > now() - interval '24 hours';
  if n > 0 then
    perform raise_alert('agent_errors', 'critical',
      n || ' planning run' || case when n = 1 then '' else 's' end || ' failed today',
      'The agent that decides what to do next is erroring. No new work is being planned.');
    raised := raised + 1;
  else
    perform clear_alert('agent_errors');
  end if;

  -- Work that retried until it gave up.
  select count(*) into n from tasks where status = 'failed';
  if n > 0 then
    perform raise_alert('tasks_dead', 'warning',
      n || ' task' || case when n = 1 then '' else 's' end || ' gave up after retrying',
      'These will not be attempted again without you.');
    raised := raised + 1;
  else
    perform clear_alert('tasks_dead');
  end if;

  -- Messages that never reached anyone.
  select count(*) into n from messages
   where status = 'failed' and created_at > now() - interval '7 days';
  if n > 0 then
    perform raise_alert('messages_failed', 'critical',
      n || ' message' || case when n = 1 then '' else 's' end || ' failed to send',
      'Someone expecting to hear from you did not. Check the email and SMS keys.');
    raised := raised + 1;
  else
    perform clear_alert('messages_failed');
  end if;

  -- Content approved but never published.
  select count(*) into n from content_items
   where status = 'failed' and created_at > now() - interval '7 days';
  if n > 0 then
    perform raise_alert('publish_failed', 'warning',
      n || ' approved post' || case when n = 1 then '' else 's' end || ' failed to publish',
      'You approved these and they did not go out. The channel connection is likely broken.');
    raised := raised + 1;
  else
    perform clear_alert('publish_failed');
  end if;

  -- The bottleneck that is usually the owner, said without scolding.
  select count(*), min(created_at) into n, oldest
    from content_items where status = 'pending_approval';
  if n >= 5 and oldest < now() - interval '3 days' then
    perform raise_alert('approval_backlog', 'warning',
      n || ' drafts waiting on you',
      'The oldest has been waiting since ' || to_char(oldest, 'Mon DD') || '.');
    raised := raised + 1;
  else
    perform clear_alert('approval_backlog');
  end if;

  return jsonb_build_object('checked_at', now(), 'open_after_check', raised);
end $$;

-- pg_cron's tables are not reachable through PostgREST. This narrows them to
-- the columns the health panel actually shows.
create or replace function cron_health()
returns table (jobname text, schedule text, active boolean,
               last_run timestamptz, last_status text, runs bigint, failures bigint)
language sql security definer set search_path = public, cron as $$
  select c.jobname, c.schedule, c.active,
         max(d.end_time)                                as last_run,
         (array_agg(d.status order by d.end_time desc nulls last))[1] as last_status,
         count(d.runid)                                 as runs,
         count(*) filter (where d.status = 'failed')    as failures
    from cron.job c
    left join cron.job_run_details d on d.jobid = c.jobid
   where c.jobname like 'marketing-%'
   group by c.jobname, c.schedule, c.active
   order by c.jobname;
$$;

revoke all on function raise_alert(text,text,text,text,text) from anon, authenticated;
revoke all on function clear_alert(text)                     from anon, authenticated;
revoke all on function check_system_health()                 from anon, authenticated;
revoke all on function cron_health()                         from anon, authenticated;

-- Every fifteen minutes: often enough that a problem is fresh when you see it,
-- rare enough to stay invisible.
select cron.unschedule('marketing-healthcheck')
 where exists (select 1 from cron.job where jobname = 'marketing-healthcheck');

select cron.schedule('marketing-healthcheck', '*/15 * * * *',
                     $$select check_system_health()$$);
