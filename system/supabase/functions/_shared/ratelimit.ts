// One rate limiter, shared by every public endpoint.
//
// The 16 Sep security review left two endpoints unlimited because the only
// limiter available (planner_allow) writes a row per request. site-images is
// called once per page load, so limiting it that way would have written a
// database row per visitor per pageview — a limiter that costs more than the
// abuse it prevents. public.rate_allow counts instead: one row per caller per
// window, incremented in place.
//
// The IP is salted and hashed before it is used as a key. That is enough to
// tell two callers apart for an hour and not enough to reconstruct a visitor
// log, which matters because the privacy policy says this site does not keep
// one.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/** Salted, truncated hash of the caller's address. Never reversible to an IP. */
export async function callerKey(req: Request, scope: string): Promise<string> {
  const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const salt = Deno.env.get("RUN_SECRET") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "rate";
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${scope}|${salt}|${ip}`));
  const hex = [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${scope}:${hex.slice(0, 32)}`;
}

/**
 * True when the caller may proceed.
 *
 * Fails CLOSED on a database error. An endpoint that answers "try again" during
 * a database blip is a minor annoyance; one that waves everything through
 * precisely when the database is struggling is how a bad minute becomes an
 * outage.
 */
export async function allow(
  sb: SupabaseClient,
  key: string,
  limit: number,
  window = "1 hour",
): Promise<boolean> {
  const { data, error } = await sb.rpc("rate_allow", {
    p_key: key,
    p_limit: limit,
    p_window: window,
  });
  if (error) return false;
  return data === true;
}
