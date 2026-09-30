// The owner portal's security log and alerts.
//
// Every sign-in, failure, lockout and security change is written to
// public.security_events, which the portal's Security tab reads. The events
// that need a human (a sign-in from a device not seen before, a lockout, a
// security setting changed) also email the owner, capped so an attack cannot
// turn the alert into a flood.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { getSetting } from "./supabase.ts";
import { sendEmail } from "./email.ts";

const DEFAULT_OWNER_EMAIL = "otis@meridianinterface.com";

/** How long a device counts as "seen" after its last successful sign-in. */
const KNOWN_DEVICE_DAYS = 30;

/**
 * Salted hash of the caller's address: enough to tell devices apart and to
 * throttle, never reversible to an IP, which the privacy policy promises.
 * Byte-identical to the hash `owner` has always written to
 * owner_login_attempts, so old rows and new ones describe the same devices.
 */
export async function clientHash(req: Request): Promise<string> {
  const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const salt = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "salt";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}|${ip}`));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").slice(0, 32);
}

/** A short, stable name for a device in the portal and in emails. */
export const deviceLabel = (hash: string | null | undefined) =>
  hash ? `Device ${hash.slice(0, 6).toUpperCase()}` : "Unknown device";

export async function logEvent(
  sb: SupabaseClient,
  kind: string,
  hash: string | null,
  detail: Record<string, unknown> = {},
): Promise<void> {
  // A failed write must never block a sign-in or a lockout; the log is a
  // record, not a gate.
  await sb.from("security_events").insert({ kind, client_hash: hash, detail }).then(() => {}, () => {});
}

/** True when this device has not signed in successfully in the last 30 days. */
export async function isNewDevice(sb: SupabaseClient, hash: string): Promise<boolean> {
  const since = new Date(Date.now() - KNOWN_DEVICE_DAYS * 86_400_000).toISOString();
  const [events, attempts] = await Promise.all([
    sb.from("security_events").select("id", { count: "exact", head: true })
      .eq("kind", "login_ok").eq("client_hash", hash).gte("created_at", since),
    sb.from("owner_login_attempts").select("id", { count: "exact", head: true })
      .eq("succeeded", true).eq("client_hash", hash).gte("attempted_at", since),
  ]);
  return (events.count ?? 0) + (attempts.count ?? 0) === 0;
}

function houstonTime(d = new Date()): string {
  return d.toLocaleString("en-US", {
    timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short",
  }) + " (Houston time)";
}

/**
 * Email the owner, at most once per `kind` per `everyMinutes`.
 *
 * The cap is what stops an attacker triggering a lockout every few minutes and
 * burying the one email that matters. Returns whether a message went out.
 */
export async function alertOwner(
  sb: SupabaseClient,
  kind: string,
  subject: string,
  lines: string[],
  everyMinutes = 60,
): Promise<boolean> {
  // 0 means no cap: the caller has already decided this alert is due.
  if (everyMinutes > 0) {
    const since = new Date(Date.now() - everyMinutes * 60_000).toISOString();
    const { count } = await sb.from("security_events").select("id", { count: "exact", head: true })
      .eq("kind", `alert_${kind}`).gte("created_at", since);
    if ((count ?? 0) > 0) return false;
  }

  const s = await getSetting<{ email?: string }>(sb, "owner_notify", {});
  const to = (s.email ?? "").trim() || DEFAULT_OWNER_EMAIL;
  const body = [
    ...lines,
    "",
    `When: ${houstonTime()}`,
    "",
    "If this was not you:",
    "1. Open meridianinterface.com, go to Portal, then Security, and press Sign out every device.",
    "2. Change OWNER_PASSCODE in Supabase (Edge Functions, then Secrets).",
    "3. Turn on two-step sign-in in the Security tab if it is off.",
    "",
    "Meridian Interface security alert. Sent only to the studio owner.",
  ].join("\n");

  const res = await sendEmail({ to, subject: `Security: ${subject}`, body });
  await logEvent(sb, `alert_${kind}`, null, { subject, delivered: res.ok && !res.mocked, error: res.error ?? null });
  return res.ok && !res.mocked;
}
