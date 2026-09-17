-- 0032 revoked EXECUTE from anon and authenticated, which does nothing on its
-- own: Postgres grants EXECUTE on a new function to PUBLIC, and anon and
-- authenticated inherit it from there. Both functions were therefore callable
-- by anyone over /rest/v1/rpc/. Supabase's own linter caught it.
-- Revoking from PUBLIC is the grant that actually matters.
revoke all on function public.watch_owner_login() from public, anon, authenticated;
revoke all on function public.prune_security_tables() from public, anon, authenticated;
grant execute on function public.watch_owner_login() to service_role;
grant execute on function public.prune_security_tables() to service_role;

-- require_owner_approval runs as the definer with whatever search_path the
-- caller happens to have. It resolves public.money_mentioned by name, so a
-- caller able to set search_path could shadow that with their own function and
-- talk the trigger into letting a priced message through. Pin it.
alter function public.require_owner_approval() set search_path to 'public';
