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
//      config.toml pins verify_jwt=true for every function that imports this.
//
// The secret lives in the `settings` table (RLS deny-by-default, service-role
// only) rather than an env secret, so rotating it is one UPDATE with no
// redeploy — and there is exactly one copy for both the SQL side and this one.
//
// The gate FAILS CLOSED, every way it can fail:
//   - A read that errors refuses the run. The platform briefly refuses a few
//     of these reads (5 of ~1,700 on 11 Oct), and treating that as "not
//     configured" opened the gate to anyone holding the anon key.
//   - A missing, empty or short secret refuses the run (22 Oct). It used to
//     open the gate "so seeding order can never lock the system out", but
//     0005 seeds the secret and every cron call sends it, so the only way to
//     reach that branch was a restore, reseed or bad migration — exactly when
//     an open gate would go unnoticed. Refusing makes it loud instead: cron
//     starts getting 401s, which the health check reports.
//   - The comparison is constant-time, so response timing says nothing about
//     how much of a guess was right.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/** Shortest run secret the gate accepts as configured. 0005 seeds 48 chars. */
const MIN_SECRET_LENGTH = 32;

const enc = new TextEncoder();

/** Constant-time string equality. Length is not secret; content is. */
export function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/** Decode one base64url JWT segment. Plain atob rejects '-' and '_'. */
function decodeSegment(seg: string): string {
  const b64 = seg.replace(/-/g, "+").replace(/_/g, "/");
  return atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
}

/**
 * True when the caller's (gateway-verified) JWT carries role=service_role: the
 * operator, not the scheduler. Some actions, such as marking media approved by
 * the owner, are the operator's alone; the run secret is held by the cron
 * path, which the agents drive.
 */
export function isServiceRoleCaller(req: Request): boolean {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  try {
    return JSON.parse(decodeSegment(parts[1]))?.role === "service_role";
  } catch {
    return false;
  }
}

export async function authorizedRun(req: Request, sb: SupabaseClient): Promise<boolean> {
  const { data, error } = await sb.from("settings").select("value").eq("key", "run_secret").maybeSingle();
  if (error) return false; // could not read the gate: refuse rather than open it
  const expected = String((data?.value as { value?: string } | null)?.value ?? "");
  if (expected.length < MIN_SECRET_LENGTH) return false; // unconfigured is not open

  if (safeEqual(req.headers.get("x-run-secret") ?? "", expected)) return true;
  return isServiceRoleCaller(req);
}
