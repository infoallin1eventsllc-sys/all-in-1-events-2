// Authenticator-app codes (TOTP, RFC 6238) for the owner portal's two-step sign-in.
//
// Written here rather than pulled from a package because it is forty lines of
// arithmetic over Web Crypto, and a dependency on the login path of the one
// portal that holds client records is a supply-chain risk for no gain. It is
// the standard every authenticator app speaks: HMAC-SHA1, 30-second steps,
// 6 digits. Checked against the RFC 6238 test vectors (see SESSION.md).
//
// No imports on purpose, so it runs unchanged under Deno and Node for testing.

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const STEP_SECONDS = 30;
const DIGITS = 6;

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0, value = 0, out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Uint8Array {
  const clean = text.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error("invalid base32");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** A new 160-bit secret, the size RFC 4226 recommends, as base32. */
export function newSecret(): string {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}

/** The code for one time step. `digits` exists only so the RFC's 8-digit vectors can be checked. */
export async function codeAt(secret: string, step: number, digits = DIGITS): Promise<string> {
  const counter = new Uint8Array(8);
  let n = step;
  for (let i = 7; i >= 0; i--) {
    counter[i] = n & 255;
    n = Math.floor(n / 256);
  }
  // A plain ArrayBuffer copy: newer TypeScript refuses a Uint8Array whose
  // buffer might be shared, and older versions have no way to say it is not.
  const raw = base32Decode(secret);
  const keyBytes = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
  const key = await crypto.subtle.importKey(
    "raw", keyBytes, { name: "HMAC", hash: "SHA-1" }, false, ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, counter));
  const off = mac[mac.length - 1] & 15;
  const bin = ((mac[off] & 127) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export const stepAt = (unixSeconds: number) => Math.floor(unixSeconds / STEP_SECONDS);

/**
 * The time step a code belongs to, or null. One step either side is accepted,
 * because a phone's clock drifts and a code typed at second 29 arrives at 31.
 * The caller must refuse a step at or below the last one accepted: that is what
 * makes each code single use.
 */
export async function matchStep(secret: string, code: string, nowSeconds: number): Promise<number | null> {
  const typed = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(typed)) return null;
  const now = stepAt(nowSeconds);
  for (const step of [now, now - 1, now + 1]) {
    const expected = await codeAt(secret, step);
    let diff = 0;
    for (let i = 0; i < DIGITS; i++) diff |= expected.charCodeAt(i) ^ typed.charCodeAt(i);
    if (diff === 0) return step;
  }
  return null;
}

/** The link an authenticator app reads from a QR code. */
export function otpauthUri(secret: string): string {
  const label = encodeURIComponent("Meridian Interface:Owner Portal");
  const issuer = encodeURIComponent("Meridian Interface");
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}
