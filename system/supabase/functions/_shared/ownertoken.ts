// Verifying an owner session token, for functions other than `owner` itself.
//
// `owner` issues these after a passcode login: a base64url JSON payload
// carrying an expiry, HMAC-SHA256 signed. Any function in this project can
// check one, because the signing material is environment the edge runtime
// injects everywhere — no shared state, no second login.
//
// This is verify-only on purpose. Issuing tokens stays in one place; a second
// module able to mint sessions is a second place to get session minting wrong.
//
// NOTE: `owner/index.ts` still carries its own byte-identical copy of the
// signing-key derivation and the verify below. That duplication should be
// removed by having `owner` import this module — it is left for now only
// because redeploying a large, working, money-adjacent function to make a
// cosmetic change is a poor trade. If you change the scheme here, change it
// there in the same commit, or sessions silently stop validating in one of the
// two places.

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

const unb64url = (s: string) => {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

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
    const { exp } = JSON.parse(new TextDecoder().decode(unb64url(body)));
    return typeof exp === "number" && exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

/** Pull the token from an Authorization header or a JSON body field. */
export function tokenFrom(req: Request, body: Record<string, unknown>): string {
  return (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "") ||
    String(body.token ?? "");
}
