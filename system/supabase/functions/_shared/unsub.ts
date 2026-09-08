// Signing and checking the unsubscribe links in outgoing email.
//
// The token is `<contactId>.<hmac>`, base64url. It carries no expiry on
// purpose: an unsubscribe link in a two-year-old email must still work, and
// "your opt-out link expired" is not an answer anyone should have to accept.
//
// The signing material is the service-role key, which the edge runtime injects
// everywhere and which never reaches a browser. It is derived rather than used
// directly, so a token cannot be worked back into the key. Same reasoning as
// _shared/ownertoken.ts, and deliberately a different derivation string so a
// token from one system is meaningless to the other.
const PURPOSE = "unsubscribe-v1";

async function signingKey(): Promise<CryptoKey> {
  const material = `${PURPOSE}|${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}`;
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

/** The token to put in a link for this contact. */
export async function unsubToken(contactId: string): Promise<string> {
  const body = b64url(new TextEncoder().encode(contactId));
  const sig = await crypto.subtle.sign("HMAC", await signingKey(), new TextEncoder().encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

/** The contact id a token vouches for, or null. Never throws. */
export async function verifyUnsubToken(token: string | undefined): Promise<string | null> {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  try {
    const ok = await crypto.subtle.verify(
      "HMAC",
      await signingKey(),
      unb64url(sig),
      new TextEncoder().encode(body),
    );
    if (!ok) return null;
    const id = new TextDecoder().decode(unb64url(body));
    // Shaped like a uuid, or it is not one of ours.
    return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
  } catch {
    return null;
  }
}
