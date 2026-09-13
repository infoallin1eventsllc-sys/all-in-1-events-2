/* 420 FRIENDLY — payment configuration.
 *
 * The six methods Otis asked for come from two providers. No single provider
 * does all of them:
 *
 *   Stripe  → credit/debit cards, Apple Pay, Google Pay, Cash App Pay
 *   PayPal  → PayPal, Venmo
 *
 * Apple Pay and Google Pay are not separate integrations: they are the card
 * method rendered through the device wallet, and appear automatically on a
 * supporting device over HTTPS. Venmo is PayPal-owned and only available
 * through PayPal's SDK (US buyers).
 *
 * ONLY PUBLIC IDENTIFIERS BELONG IN THIS FILE. It is served to every visitor.
 * The Stripe *publishable* key (pk_...) and the PayPal *client id* are designed
 * to be public. The Stripe secret key (sk_...) must never appear here — it
 * lives only in the Netlify function's environment.
 */

const PAYMENTS = {
  // Leave blank until real accounts exist. Blank = the checkout page shows a
  // clear "not connected yet" state instead of a broken button.
  stripePublishableKey: "",   // "pk_live_..." or "pk_test_..."
  paypalClientId: "",         // PayPal REST app client id
  currency: "USD",

  // Where the browser asks for a Stripe Checkout Session.
  checkoutEndpoint: "/.netlify/functions/create-checkout-session",

  // Shipping rules — must match the server function, which is authoritative.
  freeShippingOver: 100,
  flatShipping: 8
};

function stripeConfigured() {
  return /^pk_(test|live)_/.test(PAYMENTS.stripePublishableKey);
}
function paypalConfigured() {
  return PAYMENTS.paypalClientId.trim().length > 10;
}
function anyPaymentConfigured() {
  return stripeConfigured() || paypalConfigured();
}

/* Wallet availability is a device fact, not a config fact: Apple Pay only
 * exists in Safari on Apple hardware, Google Pay needs a supporting browser.
 * Detecting it lets the checkout page say which wallets *this* shopper can use
 * rather than promising all of them to everyone. */
function walletHints() {
  const hints = [];
  const ua = navigator.userAgent || "";
  const applePayLikely =
    (window.ApplePaySession && window.ApplePaySession.canMakePayments &&
     window.ApplePaySession.canMakePayments()) || false;
  if (applePayLikely) hints.push("Apple Pay");
  if (/Chrome|Edg|Android/i.test(ua) && window.PaymentRequest) hints.push("Google Pay");
  return hints;
}

/* Cart → the minimal shape the server prices. Deliberately carries no prices:
 * the function looks them up itself so a tampered cart cannot set its own. */
function cartForCheckout() {
  return getCart().map((l) => ({ id: l.id, size: l.size, qty: l.qty }));
}

async function startStripeCheckout() {
  const cart = cartForCheckout();
  if (!cart.length) throw new Error("Your bag is empty");

  const res = await fetch(PAYMENTS.checkoutEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cart })
  });

  let data = {};
  try {
    data = await res.json();
  } catch {
    throw new Error("The payment service returned an unreadable response");
  }

  if (!res.ok) {
    if (data.error === "not_configured") {
      throw new Error(data.message || "Payments are not configured yet");
    }
    throw new Error(data.message || data.error || "Could not start checkout");
  }
  if (!data.url) throw new Error("No checkout URL was returned");
  window.location.href = data.url;
}
