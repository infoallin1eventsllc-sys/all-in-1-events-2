/**
 * Per-IP request throttle for the functions that cost money or reach a
 * third party: the concierge (every call bills the Anthropic key), lead
 * capture (every call hits the CRM), checkout (every call creates a Stripe
 * session) and the owner passcode (every call is a guess).
 *
 * HONEST ABOUT WHAT THIS IS
 *
 * The counters live in this function instance's memory. Netlify runs as many
 * instances as traffic needs and recycles them, so a determined attacker who
 * spreads requests across instances sees a looser limit than the number here,
 * and a cold start resets everything. It stops the common case — one client
 * in a loop, a script hammering one endpoint — and it is cheap. It is not the
 * only line:
 *
 *   - The Anthropic key has a monthly spend limit set in console.anthropic.com.
 *     That is the real cap on the concierge; this is the first speed bump.
 *   - Netlify's own rate limiting (Site configuration → Firewall → Traffic
 *     rules) works across instances. Turn it on there for a hard ceiling.
 *
 * Netlify puts the real client address in x-nf-client-connection-ip. The
 * x-forwarded-for fallback is for local `netlify dev`.
 */

const buckets = new Map();
const MAX_TRACKED = 5000;

function clientIp(event) {
  const h = (event && event.headers) || {};
  return (
    h["x-nf-client-connection-ip"] ||
    String(h["x-forwarded-for"] || "").split(",")[0].trim() ||
    "unknown"
  );
}

/**
 * Returns null when the request may proceed, or a complete 429 response to
 * return as-is. `name` only labels the log line.
 */
function throttled(event, { limit, windowMs, name }) {
  const ip = clientIp(event);
  const now = Date.now();

  // Keyed by function AND address. On Netlify each function is its own bundle
  // with its own copy of this map, so the name changes nothing there; under
  // `netlify dev` and in the test harness every function shares one process,
  // and without it ten lead submissions would count against the checkout limit.
  const key = name + "|" + ip;
  let b = buckets.get(key);
  if (!b || now > b.reset) {
    b = { count: 0, reset: now + windowMs };
    buckets.set(key, b);
  }
  b.count += 1;

  // Keep the map bounded on a busy instance: sweep expired entries once it
  // grows past a few thousand addresses.
  if (buckets.size > MAX_TRACKED) {
    for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k);
  }

  if (b.count <= limit) return null;

  const retryAfter = Math.max(1, Math.ceil((b.reset - now) / 1000));
  if (b.count === limit + 1) {
    // Log once per window per address, not once per rejected request.
    console.warn("[throttle]", name, "limit reached for", ip, "retry in", retryAfter + "s");
  }
  return {
    statusCode: 429,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Retry-After": String(retryAfter)
    },
    body: JSON.stringify({
      ok: false,
      error: "rate_limited",
      message: "Too many requests from this connection. Wait a moment and try again."
    })
  };
}

module.exports = { throttled, clientIp };
