-- A counting rate limiter, so every public endpoint can have one.
--
-- The existing planner_allow inserts a row per request. That is fine for the
-- planner, where a request means a model call, and wrong everywhere else: the
-- site-images endpoint is hit once per page load, so limiting it that way would
-- write a database row per visitor per pageview. The limiter would cost more
-- than the attack it prevents, which is why two endpoints were left unlimited
-- in the 16 Sep review.
--
-- This counts instead of logging. One row per caller per window, incremented in
-- place, so a thousand requests from one address cost one row and one UPDATE.
create table if not exists public.rate_buckets (
  key          text        not null,
  window_start timestamptz not null,
  count        integer     not null default 0,
  primary key (key, window_start)
);

alter table public.rate_buckets enable row level security;

create index if not exists rate_buckets_window_idx
  on public.rate_buckets (window_start);

-- Fixed-window counter. Returns true while the caller is under the limit.
--
-- security definer so an edge function reaches it through the service role
-- without the table being exposed; search_path is pinned so the function body
-- cannot be redirected by a caller-controlled path.
create or replace function public.rate_allow(
  p_key    text,
  p_limit  integer,
  p_window interval
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  w timestamptz;
  n integer;
begin
  -- Floor the clock to the window boundary, so every caller in the same window
  -- shares a row and the key space cannot be grown by timing requests.
  w := to_timestamp(
         floor(extract(epoch from now()) / extract(epoch from p_window))
         * extract(epoch from p_window)
       );

  insert into public.rate_buckets (key, window_start, count)
  values (p_key, w, 1)
  on conflict (key, window_start)
    do update set count = public.rate_buckets.count + 1
  returning count into n;

  -- Opportunistic cleanup: roughly one call in two hundred pays for it, which
  -- keeps the table bounded without a cron job or a slow delete on the hot path.
  if random() < 0.005 then
    delete from public.rate_buckets where window_start < now() - interval '2 days';
  end if;

  return n <= p_limit;
end;
$$;

-- Nothing reaches this except the service role. anon and authenticated must not
-- be able to burn another caller's allowance, or read how close anyone is to it.
revoke all on function public.rate_allow(text, integer, interval) from public;
revoke all on function public.rate_allow(text, integer, interval) from anon, authenticated;
grant execute on function public.rate_allow(text, integer, interval) to service_role;
