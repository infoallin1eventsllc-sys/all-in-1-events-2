// Owner session tokens: issued by `owner` after a passcode (and, when two-step
// sign-in is on, a code), checked by every function that serves owner data
// (owner, leads, pay, site-images).
//
// A token is a base64url JSON payload `{exp, ep}`, HMAC-SHA256 signed. `ep` is
// the session epoch from public.owner_security at the moment of issue. Raising
// that number ("Sign out every device" in the portal, or turning two-step on or
// off) makes every earlier token fail here, on every function, at once. Before
// 30 Sep tokens were stateless, so a stolen one stayed good for its full eight
// hours whatever the owner did.
//
// Issuing and verifying now live together in this one module. They used to be
// split, with `owner` carrying its own copy of the verify, and the old comment
// here warned that changing one without the other would silently break
// sessions. One module removes that trap.
import { serviceClient } from "./supabase.ts";

export const SESSION_TTL_SECONDS = 60 * 60 * 8; // one working day

/**
 * A dedicated OWNER_SESSION_SECRET is preferred; otherwise derive from the
 * service-role key, which is always present in the edge runtime and never
 * reaches a browser. Deriving rather than using it directly means a leaked
 * token cannot be reversed into the key.
 */
async function signingKey(): Promise<CryptoKey> {
  const material = Deno.env.get("OWNER_SESSION_SECRET") ??
    `owner-session|${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}`;
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(material),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const unb64url = (s: string) => {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

/**
 * The current session epoch, or null when it cannot be read.
 *
 * Null makes every check fail CLOSED: during a database error the owner is
 * asked to sign in again, which is an annoyance, rather than a revoked token
 * being accepted, which is the thing this exists to prevent.
 */
export async function currentEpoch(): Promise<number | null> {
  const { data, error } = await serviceClient()
    .from("owner_security").select("session_epoch").eq("id", true).maybeSingle();
  if (error || !data) return null;
  return Number(data.session_epoch ?? 0);
}

export async function issueOwnerToken(epoch: number): Promise<string> {
  const payload = JSON.stringify({ exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS, ep: epoch });
  const body = b64url(new TextEncoder().encode(payload));
  const sig = await crypto.subtle.sign("HMAC", await signingKey(), new TextEncoder().encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

export async function ownerTokenValid(token: string | undefined): Promise<boolean> {
  if (!token || !token.includes(".")) return false;
  const [body, sig] = token.split(".");
  try {
    const ok = await crypto.subtle.verify(
      "HMAC",
      await signingKey(),
      unb64url(sig),
      new TextEncoder().encode(body),
    );
    if (!ok) return false;
    const { exp, ep } = JSON.parse(new TextDecoder().decode(unb64url(body)));
    if (typeof exp !== "number" || exp <= Math.floor(Date.now() / 1000)) return false;
    // Tokens minted before epochs existed carry none; they belong to epoch 0,
    // so they stay good until the first "sign out every device".
    const epoch = await currentEpoch();
    return epoch !== null && Number(ep ?? 0) === epoch;
  } catch {
    return false;
  }
}

/** Pull the token from an Authorization header or a JSON body field. */
export function tokenFrom(req: Request, body: Record<string, unknown>): string {
  return (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "") ||
    String(body.token ?? "");
}
