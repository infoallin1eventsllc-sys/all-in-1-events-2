-- Two loose ends from the 14 Nov 2026 full diagnostic. Neither was exploitable;
-- both now match how everything else in this schema is set up. Applied live on
-- 14 Nov through the SQL editor path; this file keeps the repo in step.
--
-- 1. require_sms_consent() was the one function in public still executable by
--    PUBLIC (and so by anon and authenticated). It is a trigger function, so it
--    could not be called through the API anyway, but every sibling grants
--    EXECUTE to postgres and service_role only, and the odd one out is the one
--    that gets missed in the next review. Triggers do not check EXECUTE when
--    they fire: messages_sms_consent was confirmed still enabled afterwards.
revoke execute on function public.require_sms_consent() from public, anon, authenticated;

-- 2. v_channel_performance ran with its owner's rights, which means it would
--    read past row level security for anyone ever granted SELECT on it. Nobody
--    is (anon and authenticated have no privilege on any table or view here),
--    so this changes nothing today. With security_invoker the view obeys the
--    caller's own rights, so a future stray GRANT cannot turn it into a way
--    round RLS. service_role bypasses RLS and still sees every row (checked:
--    24 before, 24 after).
alter view public.v_channel_performance set (security_invoker = true);
