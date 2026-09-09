-- 0025_planner_spend_alert.sql
--
-- The Stack Planner now stops spending at a ceiling (planner/index.ts). A
-- ceiling nobody is told about is only half of it: the day it engages, visitors
-- start being turned away and the first Otis would hear of it is a client
-- mentioning the advisor did not work.
--
-- This puts that on the System Health panel, which already renders whatever
-- raise_alert produces — so no change is needed anywhere in the website.
--
-- Written as its own function rather than folded into check_system_health(),
-- deliberately: that function is ninety lines of working, tested code and
-- rewriting all of it to append twenty would risk the ninety for the twenty.
-- The existing cron entry runs both, in order.
--
-- Two levels, because "busy" and "spent" call for different reactions:
--   info    — over 60% of the allowance. Nobody is being refused yet. Mentioned
--             only because normal traffic is a handful of calls a day, so this
--             is worth a glance.
--   warning — the allowance is gone and the advisor is refusing people. Carries
--             the line that raises the ceiling, so the fix is a copy-paste.
--
-- Both clear themselves when usage drops back, so the panel shows current state
-- rather than a history of every busy afternoon.

create or replace function public.check_planner_spend()
returns void
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_limit int;
  v_used  int;
begin
  -- Read the ceiling defensively: the row can be missing, and the value is
  -- hand-edited JSON, so anything but a number is treated as unset.
  select case when jsonb_typeof(value->'model_calls_per_day') = 'number'
              then (value->>'model_calls_per_day')::int end
    into v_limit
    from public.settings where key = 'planner_budget';
  v_limit := coalesce(v_limit, 60);

  -- The same rolling window the planner itself enforces, so the panel and the
  -- endpoint can never disagree about whether the allowance is gone.
  select count(*) into v_used
    from public.planner_requests
   where action in ('advisor', 'simulate')
     and created_at > now() - interval '24 hours';

  if v_limit > 0 and v_used >= v_limit then
    perform public.raise_alert(
      'planner_budget_spent', 'warning',
      'The Stack Planner has used its whole allowance',
      v_used || ' of ' || v_limit || ' model calls in the last 24 hours, so the advisor is '
        || 'turning visitors away until that drops back. Sending a plan still works, so leads '
        || 'are not being lost. Normal use is a handful a day: this is either real interest or '
        || 'a copy of the planner''s front end pointed at this endpoint. To raise the ceiling: '
        || 'update settings set value = ''{"model_calls_per_day": 120}''::jsonb '
        || 'where key = ''planner_budget'';',
      'planner', jsonb_build_object('used', v_used, 'limit', v_limit));
    perform public.clear_alert('planner_busy');

  elsif v_limit > 0 and v_used * 10 >= v_limit * 6 then
    perform public.raise_alert(
      'planner_busy', 'info',
      'The Stack Planner is unusually busy',
      v_used || ' of ' || v_limit || ' model calls in the last 24 hours. Nothing is wrong and '
        || 'nobody is being refused. Worth knowing only because normal is a handful a day.',
      'planner', jsonb_build_object('used', v_used, 'limit', v_limit));
    perform public.clear_alert('planner_budget_spent');

  else
    perform public.clear_alert('planner_budget_spent');
    perform public.clear_alert('planner_busy');
  end if;
end $function$;

revoke all on function public.check_planner_spend() from anon, authenticated;

-- Same fifteen-minute entry, now running both checks.
select cron.unschedule('marketing-healthcheck')
 where exists (select 1 from cron.job where jobname = 'marketing-healthcheck');

select cron.schedule('marketing-healthcheck', '*/15 * * * *',
                     $$ select public.check_system_health(); select public.check_planner_spend(); $$);
