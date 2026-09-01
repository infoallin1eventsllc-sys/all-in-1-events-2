/**
 * Owner passcode sessions.
 *
 * A passcode is only protection if the CHECK happens on the server. Comparing
 * it in the browser protects nothing — the page and its script are served to
 * anyone, so the comparison can be read and skipped. So the passcode is checked
 * here, and the data functions refuse to answer without a token this file
 * signed.
 *
 * The passcode itself is never sent back to the browser and never stored there.
 * It is exchanged once for a short-lived signed token.
 *
 * The signing key is derived from the passcode, so changing OWNER_PASSCODE
 * immediately invalidates every existing session — no separate revocation step,
 * and one environment variable to configure instead of two.
 */

const crypto = require("crypto");

const SESSION_MS = 12 * 60 * 60 * 1000;   // 12 hours
const MIN_PASSCODE_LENGTH = 8;

function b64url(buf) {
  return Buffer.from(buf).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function signingKey(passcode) {
  // Domain-separated so the key is never simply the passcode itself.
  return crypto.createHmac("sha256", "420-owner-session-v1").update(passcode).digest();
}

function sign(payloadB64, passcode) {
  return b64url(crypto.createHmac("sha256", signingKey(passcode)).update(payloadB64).digest());
}

function issueToken(passcode) {
  const payload = b64url(JSON.stringify({ exp: Date.now() + SESSION_MS }));
  return payload + "." + sign(payload, passcode);
}

/**
 * Returns { ok, reason }. Never throws on malformed input — a hostile caller
 * controls the token entirely.
 */
function verifyToken(token, passcode) {
  if (!passcode) return { ok: false, reason: "not_configured" };
  if (typeof token !== "string" || !token.includes(".")) return { ok: false, reason: "malformed" };

  const idx = token.lastIndexOf(".");
  const payloadB64 = token.slice(0, idx);
  const providedSig = token.slice(idx + 1);
  const expectedSig = sign(payloadB64, passcode);

  if (!timingSafeEqualStr(providedSig, expectedSig)) return { ok: false, reason: "bad_signature" };

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!payload || typeof payload.exp !== "number") return { ok: false, reason: "malformed" };
  if (Date.now() > payload.exp) return { ok: false, reason: "expired" };

  return { ok: true };
}

/**
 * Constant-time string compare. A plain `===` returns as soon as two bytes
 * differ, and that timing difference is measurable — it lets an attacker
 * recover a secret one character at a time.
 */
function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  // timingSafeEqual throws on length mismatch, which would itself leak length.
  // Hash both first so the compared buffers are always the same size.
  const ha = crypto.createHash("sha256").update(bufA).digest();
  const hb = crypto.createHash("sha256").update(bufB).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Strip surrounding whitespace from a passcode.
 *
 * Both sides need this. Netlify's environment-variable field routinely keeps a
 * trailing newline off a paste, and a passphrase copied from notes or a
 * password manager arrives with a leading space just as often. Without this,
 * an owner who pasted the passcode correctly on both ends gets "That passcode
 * is not right" and has no way to see why — the one failure mode that looks
 * exactly like a forgotten password.
 *
 * Applied at every read of OWNER_PASSCODE, not just here, because the token
 * signing key is derived from that value: normalising in one place and not
 * another would issue tokens under a key the verifier does not reconstruct.
 */
function normalizePasscode(value) {
  return typeof value === "string" ? value.trim() : "";
}

function checkPasscode(supplied, expected) {
  const want = normalizePasscode(expected);
  const got = normalizePasscode(supplied);
  if (!want) return { ok: false, reason: "not_configured" };
  if (want.length < MIN_PASSCODE_LENGTH) return { ok: false, reason: "too_short" };
  if (!got) return { ok: false, reason: "missing" };
  return timingSafeEqualStr(got, want) ? { ok: true } : { ok: false, reason: "wrong" };
}

/** Pulls a session token from either header the client might use. */
function tokenFromEvent(event) {
  const h = event.headers || {};
  const auth = h.authorization || h.Authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  return h["x-owner-token"] || h["X-Owner-Token"] || null;
}

module.exports = {
  normalizePasscode,
  SESSION_MS,
  MIN_PASSCODE_LENGTH,
  issueToken,
  verifyToken,
  checkPasscode,
  tokenFromEvent
};
