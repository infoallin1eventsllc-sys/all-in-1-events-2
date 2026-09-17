-- The owner login throttle counts failures per salted IP hash: 8 wrong
-- passcodes in 15 minutes and that caller is locked out. That stops one
-- machine guessing. It is blind, by construction, to the attack that matters
-- once money moves through this system: many machines guessing a few times
-- each. Nothing in the system could see that, because nothing looked at the
-- failures in aggregate.
--
-- This looks. It does not block -- a blocker keyed on a spoofable signal is a
-- denial-of-service against the owner -- it raises an alert the portal and the
-- weekly report already surface, so a distributed attempt is visible within
-- five minutes instead of never.
create or replace function public.watch_owner_login()
returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  failures int;
  sources  int;
begin
  select count(*), count(distinct client_hash)
    into failures, sources
  from public.owner_login_attempts
  where succeeded = false and attempted_at > now() - interval '15 minutes';

  -- Six distinct sources failing is the distributed signal. One source cannot
  -- reach 8 before the throttle stops it, so a single person mistyping their
  -- own passcode can never trip this.
  if sources >= 6 or failures >= 25 then
    perform public.raise_alert(
      'owner_login_bruteforce', 'critical',
      'Someone is guessing the owner passcode',
      failures || ' failed owner logins from ' || sources ||
      ' different sources in the last 15 minutes. The per-source throttle is '
      || 'holding, but this is a spread-out attempt rather than a typo. '
      || 'Change OWNER_PASSCODE, and rotate OWNER_SESSION_SECRET to sign out '
      || 'every existing session.',
      'owner',
      jsonb_build_object('failures', failures, 'distinct_sources', sources)
    );
  else
    perform public.clear_alert('owner_login_bruteforce');
  end if;
end $function$;

revoke all on function public.watch_owner_login() from anon, authenticated;

-- Both security tables grow forever otherwise. The throttle only ever reads a
-- 15-minute window and the rate buckets a one-hour one, so anything older is
-- dead weight on the index that the throttle depends on being fast.
create or replace function public.prune_security_tables()
returns void language sql security definer set search_path to 'public' as $function$
  with a as (delete from public.owner_login_attempts where attempted_at < now() - interval '30 days' returning 1)
  select null::void from a;
$function$;

revoke all on function public.prune_security_tables() from anon, authenticated;

select cron.schedule('owner-login-watch', '*/5 * * * *', 'select public.watch_owner_login()');
select cron.schedule('security-prune',    '40 4 * * *',  'select public.prune_security_tables()');
