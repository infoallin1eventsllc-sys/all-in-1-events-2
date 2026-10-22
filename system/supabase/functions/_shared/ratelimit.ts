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

/**
 * The caller's address, as the platform sees it.
 *
 * Measured on 22 Oct with a header echo: Supabase's edge sets
 * cf-connecting-ip to the real caller and Cloudflare refuses requests that
 * try to supply it, and it rewrites X-Forwarded-For so the first entry is the
 * real caller (a forged value is discarded). True-Client-IP, by contrast,
 * passes through whatever the caller sends, so it is never read here.
 *
 * IPv6 is keyed by its /64. One subscriber is routinely handed a whole /64,
 * so keying on the full address would give a single person 2^64 fresh rate
 * limit buckets.
 */
export function clientIp(req: Request): string {
  const raw = (req.headers.get("cf-connecting-ip") ??
    (req.headers.get("x-forwarded-for") ?? "").split(",")[0]).trim();
  if (!raw) return "unknown";
  if (!raw.includes(":")) return raw;
  // Expand "::" just enough to take the first four groups.
  const [head, tail = ""] = raw.toLowerCase().split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const groups = raw.includes("::") ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t] : h;
  return `${groups.slice(0, 4).map((g) => g || "0").join(":")}::/64`;
}

/** Salt for hashing addresses: a server secret, never a public constant. */
export function addressSalt(): string {
  const s = Deno.env.get("RUN_SECRET") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!s) throw new Error("no server secret available to salt caller addresses");
  return s;
}

/** Salted, truncated hash of the caller's address. Never reversible to an IP. */
export async function callerKey(req: Request, scope: string): Promise<string> {
  const ip = clientIp(req);
  const salt = addressSalt();
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
