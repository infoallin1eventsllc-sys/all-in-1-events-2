-- Meridian Stack Planner: a public edge function that spends model tokens on
-- behalf of anonymous visitors. The only thing standing between it and a bill
-- is this allowance: N calls per hashed address per window. The address is
-- hashed before it is stored and rows older than two days are swept on the
-- way through, so nothing identifying accumulates.

create table if not exists public.planner_requests (
  id         bigserial primary key,
  ip_hash    text        not null,
  action     text        not null,
  created_at timestamptz not null default now()
);
create index if not exists planner_requests_ip_time on public.planner_requests (ip_hash, created_at desc);

alter table public.planner_requests enable row level security;
-- No policies on purpose: only the service role (the edge function) reads or writes.

-- Returns true and records the call when the caller is under the limit;
-- false, recording nothing, when they are over it.
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
   where ip_hash = p_ip_hash and created_at > now() - p_window;
  if n >= p_limit then
    return false;
  end if;
  insert into public.planner_requests (ip_hash, action) values (p_ip_hash, p_action);
  return true;
end;
$$;

revoke all on function public.planner_allow(text, text, int, interval) from public, anon, authenticated;
