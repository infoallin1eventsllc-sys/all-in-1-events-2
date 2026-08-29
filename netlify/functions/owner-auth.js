/**
 * Owner passcode → session token.
 *
 * The passcode lives in the function environment, never in the site. The
 * browser posts a candidate here; on a match it gets back a short-lived signed
 * token, and the passcode itself is never stored client-side.
 *
 * Setup: Netlify → Site settings → Environment variables → OWNER_PASSCODE.
 */

const { issueToken, checkPasscode, normalizePasscode, SESSION_MS, MIN_PASSCODE_LENGTH } =
  require("../shared/owner-session");

// Netlify functions are stateless, so there is no reliable place to keep a
// lockout counter across invocations. A fixed delay on every failure is what
// remains available: it cuts a brute-force attempt to a few tries per second
// per connection. Passcode LENGTH is what actually protects this — see the
// note returned by `too_short` below.
const FAILURE_DELAY_MS = 700;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "POST only" });
  }

  const expected = normalizePasscode(process.env.OWNER_PASSCODE);

  let supplied = "";
  try {
    supplied = String(JSON.parse(event.body || "{}").passcode || "");
  } catch {
    return json(400, { ok: false, error: "invalid JSON" });
  }

  const result = checkPasscode(supplied, expected);

  if (result.ok) {
    return json(200, { ok: true, token: issueToken(expected), expiresIn: SESSION_MS });
  }

  if (result.reason === "not_configured") {
    return json(503, {
      ok: false,
      error: "not_configured",
      message:
        "OWNER_PASSCODE is not set. Add it in Netlify → Site settings → " +
        "Environment variables, then redeploy."
    });
  }

  if (result.reason === "too_short") {
    // Refuse to run with a weak passcode rather than implying it is safe.
    return json(503, {
      ok: false,
      error: "weak_passcode",
      message:
        "OWNER_PASSCODE is shorter than " + MIN_PASSCODE_LENGTH + " characters. " +
        "Because this endpoint cannot hold a lockout counter between requests, " +
        "length is the protection — use a long passphrase."
    });
  }

  await new Promise((r) => setTimeout(r, FAILURE_DELAY_MS));
  // Deliberately vague: distinguishing "wrong" from "missing" tells a guesser
  // whether the field was even read.
  return json(401, { ok: false, error: "wrong_passcode", message: "That passcode is not right." });
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body)
  };
}
