// Who may trigger a run.
//
// The scheduled functions verify a JWT, but the public anon key satisfies
// that — and the anon key ships in every browser bundle by design. While the
// system only drafted mock text, an uninvited call burned nothing but
// idempotent work. The moment it can publish to real channels or spend against
// a real API key, "anyone with the anon key can trigger a run" becomes a
// spend problem. This closes it.
//
// A caller is authorized when either:
//   1. it presents the shared run secret in `x-run-secret` — this is what the
//      pg_cron path sends via public.invoke_edge(); or
//   2. its (gateway-verified) JWT carries role=service_role — the operator CLI
//      path. Trusting the role claim is sound only because verify_jwt=true
//      means the platform already checked the signature before we ever run.
//
// The secret lives in the `settings` table (RLS deny-by-default, service-role
// only) rather than an env secret, so rotating it is one UPDATE with no
// redeploy — and there is exactly one copy for both the SQL side and this one.
// An empty/absent setting leaves the gate open, so seeding order can never
// lock the system out of itself.
//
// RECOVERED 2026-09-01: this file existed only in the deployed `report`
// function and had never been committed. A redeploy of `runner` and
// `orchestrator` from repo source silently dropped the gate from both, because
// the repo did not know it existed. Uncommitted deployed code is invisible to
// every future change; that is the actual lesson here.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { getSetting } from "./supabase.ts";

export async function authorizedRun(req: Request, sb: SupabaseClient): Promise<boolean> {
  const { value: expected } = await getSetting<{ value: string }>(sb, "run_secret", { value: "" });
  if (!expected) return true; // gate not yet configured — never self-lockout

  if (req.headers.get("x-run-secret") === expected) return true;

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload?.role === "service_role";
  } catch {
    return false;
  }
}
