-- The allowance is per action, not per caller.
--
-- As first written, planner_allow counted every row for an address inside the
-- window whatever the action was, so a client who used their twelve AI drafts
-- could no longer send the resulting plan to Meridian. Sending a plan is the
-- point of the tool; it must never be the thing that runs out because the
-- advisor was used. Counting within the action keeps the two budgets separate.
create or replace function public.planner_allow(p_ip_hash text, p_action text, p_limit int, p_window interval)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  n int;
begin
  delete from public.planner_requests where created_at < now() - interval '2 days';
  select count(*) into n
    from public.planner_requests
   where ip_hash = p_ip_hash
     and action = p_action
     and created_at > now() - p_window;
  if n >= p_limit then
    return false;
  end if;
  insert into public.planner_requests (ip_hash, action) values (p_ip_hash, p_action);
  return true;
end;
$$;

revoke all on function public.planner_allow(text, text, int, interval) from public, anon, authenticated;
