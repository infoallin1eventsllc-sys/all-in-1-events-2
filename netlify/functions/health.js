/**
 * Uptime check. Point a monitor at it (UptimeRobot, Better Stack, Netlify's
 * own) and it says whether functions are running and which integrations are
 * configured — as booleans, never values.
 *
 *   GET /.netlify/functions/health
 *   → { ok: true, at: "...", configured: { stripe: true, crm: false, ... } }
 *
 * The booleans are the useful part: a monitor can alert the day a variable
 * is deleted or scoped wrongly, which is the failure that otherwise shows up
 * as a customer email. Nothing here is secret — "stripe: true" tells an
 * attacker nothing they cannot learn by opening the checkout page.
 */

exports.handler = async (event) => {
  if (event.httpMethod !== "GET" && event.httpMethod !== "HEAD") {
    return json(405, { ok: false, error: "GET only" });
  }
  return json(200, {
    ok: true,
    at: new Date().toISOString(),
    configured: {
      stripe: !!process.env.STRIPE_SECRET_KEY,
      crm: !!process.env.MERIDIAN_INTAKE_URL,
      concierge: !!process.env.ANTHROPIC_API_KEY,
      ownerPasscode: !!process.env.OWNER_PASSCODE
    }
  });
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body)
  };
}
