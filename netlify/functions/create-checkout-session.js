/**
 * Stripe Checkout Session creator.
 *
 * WHY A SERVER FUNCTION AT ALL: the Stripe secret key must never reach the
 * browser — anyone holding it can issue refunds and read your customer list.
 * It lives only in this function's environment. The browser sends a cart, this
 * function prices it and returns a redirect URL.
 *
 * WHY PRICES ARE NOT TAKEN FROM THE REQUEST: the browser is untrusted. If the
 * client sent prices, a customer could edit them to $0 before submitting. Line
 * items are priced here from the server-side catalog and the request is only
 * allowed to choose product ids, sizes and quantities.
 *
 * SETUP: see 420-friendly/PAYMENTS-SETUP.md. Requires STRIPE_SECRET_KEY in the
 * Netlify environment and the `stripe` package installed.
 */

// Server-side price list, in cents. Must stay in step with
// 420-friendly/assets/products.js — that file is display only.
const CATALOG = {
  "vibrant-hoodie":       { name: "Vibrant Series Hoodie", cents: 12000 },
  "vibrant-tee":          { name: "Vibrant Logo Tee", cents: 4500 },
  "smoke-signal-crew":    { name: "Smoke Signal Crewneck", cents: 9500 },
  "blazed-beanie":        { name: "Blazed Beanie", cents: 3500 },
  "terpene-joggers":      { name: "Terpene Joggers", cents: 8500 },
  "haze-snapback":        { name: "Haze Snapback", cents: 4000 },
  "sesh-socks":           { name: "Sesh Socks (2-Pack)", cents: 1800 },
  "midnight-windbreaker": { name: "Midnight Windbreaker", cents: 14000 }
};

const FREE_SHIPPING_OVER_CENTS = 10000;
const FLAT_SHIPPING_CENTS = 800;
const MAX_QTY_PER_LINE = 10;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    // Explicit, actionable failure rather than a generic 500.
    return json(503, {
      error: "not_configured",
      message:
        "STRIPE_SECRET_KEY is not set. Add it in Netlify under Site settings → " +
        "Environment variables, then redeploy. See PAYMENTS-SETUP.md."
    });
  }

  let cart;
  try {
    cart = JSON.parse(event.body || "{}").cart;
  } catch {
    return json(400, { error: "Malformed request body" });
  }
  if (!Array.isArray(cart) || cart.length === 0) {
    return json(400, { error: "Cart is empty" });
  }

  const line_items = [];
  let subtotal = 0;
  for (const line of cart) {
    const product = CATALOG[line && line.id];
    if (!product) {
      return json(400, { error: "Unknown product: " + String(line && line.id) });
    }
    const qty = Math.floor(Number(line.qty));
    if (!Number.isFinite(qty) || qty < 1 || qty > MAX_QTY_PER_LINE) {
      return json(400, { error: "Invalid quantity for " + product.name });
    }
    const size = typeof line.size === "string" ? line.size.slice(0, 12) : "";
    subtotal += product.cents * qty;
    line_items.push({
      quantity: qty,
      price_data: {
        currency: "usd",
        unit_amount: product.cents,
        product_data: { name: product.name + (size ? " — " + size : "") }
      }
    });
  }

  const shipping = subtotal >= FREE_SHIPPING_OVER_CENTS ? 0 : FLAT_SHIPPING_CENTS;

  try {
    const stripe = require("stripe")(secret);
    const origin =
      (event.headers && (event.headers.origin || "https://" + event.headers.host)) || "";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      // Card, Apple Pay and Google Pay all ride on the "card" method and appear
      // automatically on supporting devices. Cash App Pay is its own method and
      // is US-only — enable it in the Stripe dashboard first, or this errors.
      payment_method_types: paymentMethods(),
      shipping_options: shipping
        ? [{
            shipping_rate_data: {
              type: "fixed_amount",
              fixed_amount: { amount: shipping, currency: "usd" },
              display_name: "Standard shipping (3–5 business days)"
            }
          }]
        : [{
            shipping_rate_data: {
              type: "fixed_amount",
              fixed_amount: { amount: 0, currency: "usd" },
              display_name: "Free shipping"
            }
          }],
      shipping_address_collection: { allowed_countries: ["US", "CA"] },
      success_url: origin + "/420-friendly/checkout.html?paid=1&session_id={CHECKOUT_SESSION_ID}",
      cancel_url: origin + "/420-friendly/cart.html?canceled=1"
    });

    return json(200, { url: session.url });
  } catch (err) {
    // Surface Stripe's own message: "Cash App Pay is not enabled" is far more
    // useful to whoever is setting this up than "payment failed".
    return json(502, { error: "stripe_error", message: err.message });
  }
};

function paymentMethods() {
  // Comma-separated override, e.g. STRIPE_PAYMENT_METHODS="card,cashapp,link".
  // Defaults to card only so a fresh install works before extra methods are
  // switched on in the Stripe dashboard.
  const raw = process.env.STRIPE_PAYMENT_METHODS;
  if (!raw) return ["card"];
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return list.length ? list : ["card"];
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };
}
