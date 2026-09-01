/**
 * Website → CRM bridge.
 *
 * Forwards a lead from any form on this site into the Meridian marketing
 * system's `intake` edge function, which creates the contact, logs the activity
 * and enqueues a follow-up for the agent to draft.
 *
 * WHY A PROXY RATHER THAN CALLING SUPABASE FROM THE BROWSER:
 *  - `intake` supports an optional `x-webhook-secret`. A browser cannot hold a
 *    secret, so calling it directly means either running the endpoint wide open
 *    or shipping the secret to every visitor. Here the secret stays server-side.
 *  - The request is same-origin, so it needs no CSP change and no CORS round
 *    trip.
 *  - It gives one place to drop obvious spam before it reaches the CRM.
 *
 * Environment (Netlify → Site settings → Environment variables):
 *   MERIDIAN_INTAKE_URL   required, the intake function URL
 *   MERIDIAN_WEBHOOK_SECRET  optional, must match Supabase's WEBHOOK_SECRET
 */

const MAX_FIELD = 2000;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "POST only" });
  }

  const intakeUrl = process.env.MERIDIAN_INTAKE_URL;
  if (!intakeUrl) {
    return json(503, {
      ok: false,
      error: "not_configured",
      message:
        "MERIDIAN_INTAKE_URL is not set. Add it in Netlify → Site settings → " +
        "Environment variables, then redeploy. See system/README.md."
    });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { ok: false, error: "invalid JSON" });
  }

  // Honeypot: a field hidden from people but filled by naive bots. Answer 200
  // so the bot believes it succeeded and does not retry with a variation.
  if (typeof body.company_website === "string" && body.company_website.trim()) {
    return json(200, { ok: true, skipped: true });
  }

  const email = clean(body.email).toLowerCase();
  const phone = clean(body.phone);
  if (!email && !phone) {
    return json(400, { ok: false, error: "Enter an email address so we can reach you." });
  }
  // Deliberately permissive: real addresses that fail strict regexes are far
  // more common than the spam this would stop, and intake validates too.
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json(400, { ok: false, error: "That email address does not look right." });
  }

  const payload = {
    name: clean(body.name) || null,
    email: email || null,
    phone: phone || null,
    company: clean(body.company) || null,
    message: clean(body.message) || null,
    // Which form this came from — lets the agent tailor follow-up, and shows
    // up in the CRM as the contact's source.
    source: clean(body.source) || "website",
    consent_email: body.consent_email !== false
  };

  const headers = { "Content-Type": "application/json" };
  if (process.env.MERIDIAN_WEBHOOK_SECRET) {
    headers["x-webhook-secret"] = process.env.MERIDIAN_WEBHOOK_SECRET;
  }

  try {
    const res = await fetch(intakeUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      // intake replied with something that is not JSON — surface the status
      // rather than pretending the lead was captured.
      return json(502, {
        ok: false,
        error: "bad_upstream",
        message: "The CRM returned an unexpected response (" + res.status + ")."
      });
    }

    if (!res.ok || data.ok === false) {
      return json(502, {
        ok: false,
        error: "intake_error",
        message: data.error || "The CRM rejected this lead."
      });
    }

    return json(200, { ok: true });
  } catch (err) {
    return json(502, {
      ok: false,
      error: "unreachable",
      message: "Could not reach the CRM: " + err.message
    });
  }
};

function clean(v) {
  return typeof v === "string" ? v.trim().slice(0, MAX_FIELD) : "";
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body)
  };
}
