-- Two health checks were crying wolf, and burying the one that was right.
--
-- As of 16 Sep three alerts were open: tasks_failed (946 firings),
-- approval_backlog (663) and no_recent_drafts (607). Only the middle one was
-- true. An owner who learns that the System Health tab is usually wrong stops
-- reading it, and then the one real alert arrives in a room where nobody is
-- listening. That is the actual failure mode being fixed here.
--
--   tasks_failed had no time window at all. Three collect_video tasks were
--   deliberately superseded on 7 Sep -- their `error` column literally reads
--   "superseded: the owner asked for the narrated reel on LinkedIn" -- and the
--   check re-raised them every fifteen minutes for ten days. Every sibling
--   check (messages_failed, publish_failed) already scopes to seven days; this
--   one was simply missed. Now three days.
--
--   no_recent_drafts fired whenever the last agent draft was over two days
--   old, with no regard for WHY. The planner has run successfully every day
--   and chosen not to write, because 45 drafts and 10 pending approvals are
--   already queued -- its run summaries say so in as many words. Declining to
--   add to a backlog nobody is clearing is correct behaviour, not a fault. It
--   now fires only when nothing explains the silence: either the planner has
--   stopped running, or there is no backlog holding it back.
--
-- approval_backlog is deliberately untouched. It is accurate, it is the root
-- cause of the quiet planner, and it is the one thing on that tab that should
-- be shouting.
--
-- The cron sweep also now covers crm-snapshot (migration 0028), so a backup
-- that stops running raises an alert like anything else.
--
-- Result on apply: 3 open alerts became 1 (approval_backlog), plus an expected
-- info notice that crm-snapshot has not had its first run yet.
create or replace function public.check_system_health()
returns table (raised int, cleared int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_raised int := 0;
  v_cleared int := 0;
  r record;
  n int;
  v_last timestamptz;
  v_err text;
  m int;
  v_backlog int;
  v_planner_ok boolean;
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
             when 'crm-snapshot'           then interval '30 hours'
             else interval '2 days'
           end as grace
    from cron.job j left join cron.job_run_details d on d.jobid = j.jobid
    where j.jobname like 'marketing-%' or j.jobname = 'crm-snapshot'
    group by j.jobname, j.schedule
  loop
    if r.runs = 0 then
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

  -- CHANGED: scoped to three days, matching its sibling checks.
  select count(*) into n from tasks
  where status = 'failed' and updated_at > now() - interval '3 days';
  if n > 0 then
    perform public.raise_alert('tasks_failed', 'warning', n || ' task(s) gave up after retrying',
      'These exhausted their retries and will not be attempted again. Each one is a piece of '
        || 'work — a draft, a follow-up, a publish — that never happened.',
      'marketing', jsonb_build_object('count', n));
    v_raised := v_raised + 1;
  else perform public.clear_alert('tasks_failed'); end if;

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

  select count(*), max(err) into n, v_err from (
    select meta->>'error' as err from content_items
     where created_by = 'agent' and created_at > now() - interval '24 hours'
       and (meta->>'mocked')::boolean is true
       and status <> 'rejected'
    union all
    select meta->>'error' from messages
     where direction = 'outbound' and created_at > now() - interval '24 hours'
       and (meta->>'mocked')::boolean is true
       and coalesce(meta->>'rejected_reason', '') <> 'placeholder'
  ) x;
  select case when tokens_in is null then 1 else 0 end into m from agent_runs
  where status = 'success' and started_at > now() - interval '30 hours'
  order by started_at desc limit 1;
  m := coalesce(m, 0);
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

  -- CHANGED: silence is only a fault when nothing explains it.
  select count(*) into v_backlog from content_items where status = 'pending_approval';
  select exists (
    select 1 from agent_runs
     where status = 'success' and started_at > now() - interval '30 hours'
  ) into v_planner_ok;

  select max(created_at) into v_last from content_items where created_by = 'agent';
  if v_last is not null
     and v_last < now() - interval '2 days'
     and not (v_planner_ok and v_backlog >= 5) then
    perform public.raise_alert('no_recent_drafts', 'warning', 'No new drafts for two days',
      'The last draft the system wrote was ' || to_char(v_last, 'Mon DD HH24:MI') || ' UTC, and '
        || 'nothing explains the silence: '
        || case when not v_planner_ok then 'the planner has not completed a run in the last 30 hours.'
                else 'there is no approval backlog holding it back.' end,
      'marketing', jsonb_build_object('last_draft', v_last, 'backlog', v_backlog, 'planner_ran', v_planner_ok));
    v_raised := v_raised + 1;
  else perform public.clear_alert('no_recent_drafts'); end if;

  return query select v_raised, v_cleared;
end
$$;
