-- 0014_health_checks_output.sql
--
-- The health check watched whether the machinery ran and never whether it
-- produced anything real. This adds the two checks that would have caught the
-- placeholder outage on day one, and stops retired placeholder drafts from
-- reading as failed sends. Full function re-stated because plpgsql bodies
-- cannot be patched in place.

create or replace function public.check_system_health()
returns table(raised integer, cleared integer)
language plpgsql security definer set search_path to 'public', 'cron' as $function$
declare
  v_raised int := 0;
  v_cleared int := 0;
  r record;
  n int;
  v_last timestamptz;
  v_err text;
  m int;
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

  -- Only sends that were attempted. Placeholder drafts retired in bulk are
  -- marked failed too (the status list has no 'rejected'), and those were
  -- never sent to anyone.
  select count(*) into n from messages
  where status = 'failed' and created_at > now() - interval '7 days'
    and coalesce(meta->>'rejected_reason', '') <> 'placeholder';
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

  -- Is what it produced real? This is the check that was missing. For two
  -- weeks every run above reported success while the Anthropic call failed
  -- on an invalid key and the system wrote placeholder copy instead: 25
  -- items, all filler, and nothing here looked at a single one of them. The
  -- machinery running is not the same as the machinery working.
  select count(*), max(err) into n, v_err from (
    select meta->>'error' as err from content_items
     where created_by = 'agent' and created_at > now() - interval '24 hours'
       and (meta->>'mocked')::boolean is true
    union all
    select meta->>'error' from messages
     where direction = 'outbound' and created_at > now() - interval '24 hours'
       and (meta->>'mocked')::boolean is true
  ) x;
  select count(*) into m from agent_runs
  where status = 'success' and started_at > now() - interval '30 hours'
    and tokens_in is null;
  if n > 0 or m > 0 then
    perform public.raise_alert('placeholder_output', 'critical',
      'The AI is not writing — output is placeholder text',
      case when n > 0 then n || ' draft(s)' else 'The planning run' end
        || ' in the last day came out as filler, not real copy. The call to Anthropic is failing'
        || ' — usually the API key — and the system is writing placeholder text so the pipeline'
        || ' keeps moving. Nothing it produced today is usable. Reason recorded: '
        || coalesce(left(v_err, 200), 'not recorded'),
      'marketing', jsonb_build_object('placeholder_items', n, 'planner_runs_without_tokens', m, 'error', v_err));
    v_raised := v_raised + 1;
  else perform public.clear_alert('placeholder_output'); end if;

  -- Silence. The planner is scheduled daily; if nothing it drafted has landed
  -- in two days, either it is not running (caught above) or it is running and
  -- deciding to do nothing — which is worth a look either way.
  select max(created_at) into v_last from content_items where created_by = 'agent';
  if v_last is not null and v_last < now() - interval '2 days' then
    perform public.raise_alert('no_recent_drafts', 'warning', 'No new drafts for two days',
      'The last draft the system wrote was ' || to_char(v_last, 'Mon DD HH24:MI') || ' UTC. The planner may be'
        || ' choosing to hold volume flat (it says so in its run summary) or something upstream is stuck.',
      'marketing', jsonb_build_object('last_draft', v_last));
    v_raised := v_raised + 1;
  else perform public.clear_alert('no_recent_drafts'); end if;

  return query select v_raised, v_cleared;
end $function$;
