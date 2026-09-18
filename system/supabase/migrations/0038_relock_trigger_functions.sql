-- Re-lock the trigger functions' EXECUTE grants.
--
-- NOTE ON THE NUMBER: this file is 0038, but the remote ledger recorded it as
-- "0036_relock_trigger_functions" (version 20260918225551) because it was
-- applied before anyone noticed 0036 and 0037 were already taken. It runs last
-- either way -- Supabase orders by the version timestamp, not the name -- so
-- the ledger entry is a misnomer, not a mis-ordering. Do not re-apply it to
-- "fix" the name.
--
-- Migration 0033 revoked these. The security advisor flagged them again on
-- 18 Sep, and the reason is worth writing down: migrations 0034 and 0035
-- redefined require_owner_approval and require_marketing_compliance with
-- CREATE OR REPLACE FUNCTION to add the owner_booking_alert exemption, and
-- CREATE OR REPLACE RESETS a function's ACL to the default, which grants
-- EXECUTE to PUBLIC. The revoke was silently undone by a later, unrelated
-- change. Nothing failed; only the linter noticed.
--
-- ANY future migration that redefines one of these must re-run the revoke
-- below, or the same regression happens again.
--
-- Revoking is safe: Postgres invokes a trigger function internally when the
-- trigger fires and does not check the invoking user's EXECUTE privilege. The
-- grants only ever governed calling them directly over /rest/v1/rpc/, which
-- fails anyway ("trigger functions can only be called as triggers") -- so this
-- is defence in depth rather than a hole being closed, but it is the state the
-- linter and the architecture both expect.
--
-- Verified after applying: an INSERT of approved content without
-- meta.approved_by = 'owner' is still refused by the trigger, and no probe row
-- was left behind.

revoke all on function public.require_owner_approval()        from public, anon, authenticated;
revoke all on function public.require_marketing_compliance()  from public, anon, authenticated;
revoke all on function public.validate_video_scenes()         from public, anon, authenticated;
revoke all on function public.money_mentioned(text, text)     from public, anon, authenticated;

grant execute on function public.require_owner_approval()       to service_role;
grant execute on function public.require_marketing_compliance() to service_role;
grant execute on function public.validate_video_scenes()        to service_role;
grant execute on function public.money_mentioned(text, text)    to service_role;
