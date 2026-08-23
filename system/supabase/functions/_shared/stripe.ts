// Stripe, over plain fetch.
//
// Two jobs: create a hosted Checkout Session, and verify that an incoming
// webhook really came from Stripe. The SDK is not used — the whole surface
// needed here is two HTTP calls and one HMAC, and a dependency that ships a
// Node compatibility layer into an edge isolate for that is a poor trade.
//
// Why HOSTED Checkout rather than an embedded card form:
//   - The card number never touches our page or our server. PCI scope stays at
//     the simplest tier (SAQ-A) instead of the one with audits in it.
//   - Apple Pay and Google Pay appear automatically on supported devices. They
//     are wallets riding on the card rails, not separate processors. Embedding
//     the form instead would mean registering and re-verifying our own domain
//     with Apple before Apple Pay would show at all; on Stripe's own page that
//     is already done.
//   - Stripe maintains the page: 3-D Secure prompts, bank redirects, decline
//     messages, translations, accessibility.

const API = "https://api.stripe.com/v1";

export function stripeKey(): string | null {
  return Deno.env.get("STRIPE_SECRET_KEY")?.trim() || null;
}

/** Test keys start sk_test_, live keys sk_live_. Worth surfacing: sending a
    real client to a test checkout takes fake money and looks identical. */
export function stripeMode(): "test" | "live" | "unset" {
  const k = stripeKey();
  if (!k) return "unset";
  return k.startsWith("sk_live_") ? "live" : "test";
}

/** Flatten nested objects/arrays into Stripe's bracketed form encoding. */
function formEncode(obj: Record<string, unknown>, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item !== null && typeof item === "object") {
          out.push(...formEncode(item as Record<string, unknown>, `${key}[${i}]`));
        } else {
          out.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`);
        }
      });
    } else if (typeof v === "object") {
      out.push(...formEncode(v as Record<string, unknown>, key));
    } else {
      out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return out;
}

export type StripeError = { error: string; code?: string };

async function stripePost<T>(
  path: string,
  params: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<T> {
  const key = stripeKey();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");

  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
      // Stripe replays the first response for a repeated key, so a
      // double-clicked button cannot open two checkouts for one invoice.
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: formEncode(params).join("&"),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.error?.message ?? `Stripe responded ${res.status}`;
    throw new Error(msg);
  }
  return body as T;
}

export type CheckoutSession = { id: string; url: string; expires_at?: number };

export async function createCheckoutSession(args: {
  amountCents: number;
  currency: string;
  description: string;
  invoiceId: string;
  clientEmail?: string | null;
  successUrl: string;
  cancelUrl: string;
  /** Bank transfer is ~$5 flat against ~2.9% + 30c. On a five-figure invoice
      that is the difference between a rounding error and a week's income. */
  allowBankTransfer: boolean;
  idempotencyKey: string;
}): Promise<CheckoutSession> {
  const methods = args.allowBankTransfer ? ["card", "us_bank_account"] : ["card"];

  return await stripePost<CheckoutSession>("/checkout/sessions", {
    mode: "payment",
    payment_method_types: methods,
    // The amount is passed from the invoice row read server-side. It is never
    // taken from the browser: a price the client can edit is not a price.
    line_items: [{
      quantity: 1,
      price_data: {
        currency: args.currency,
        unit_amount: args.amountCents,
        product_data: { name: args.description },
      },
    }],
    customer_email: args.clientEmail || undefined,
    client_reference_id: args.invoiceId,
    // Carried through every event Stripe sends back, so the webhook can find
    // the invoice without trusting anything in the redirect.
    metadata: { invoice_id: args.invoiceId },
    payment_intent_data: { metadata: { invoice_id: args.invoiceId } },
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
  }, args.idempotencyKey);
}

/* -------------------------------------------------------- webhook auth --- */

const toHex = (b: ArrayBuffer) =>
  Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");

/** Compare without leaking how much matched via timing. */
function constantTimeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  let diff = ab.length ^ bb.length;
  const n = Math.max(ab.length, bb.length);
  for (let i = 0; i < n; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

export type SignatureCheck = { ok: boolean; reason?: string };

/**
 * Verify a `Stripe-Signature` header against the raw request body.
 *
 * This is the only thing standing between "Stripe says this invoice is paid"
 * and "anyone on the internet who knows the URL says this invoice is paid".
 * The endpoint has to be public — Stripe cannot present a Supabase JWT — so
 * the signature *is* the authentication.
 *
 * Two checks, both required. The HMAC proves the body was written by someone
 * holding the endpoint secret. The timestamp proves it is not a genuine old
 * message replayed later; without it, anyone who ever captured one valid
 * "paid" callback could resend it forever.
 *
 * `payload` must be the exact bytes received. Parsing and re-serialising the
 * JSON first changes the signature and everything fails in a way that looks
 * like a Stripe problem.
 */
export async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  toleranceSeconds = 300,
): Promise<SignatureCheck> {
  if (!header) return { ok: false, reason: "no Stripe-Signature header" };
  if (!secret) return { ok: false, reason: "STRIPE_WEBHOOK_SECRET is not configured" };

  let timestamp = "";
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k === "t") timestamp = v;
    // Stripe sends one v1 per active secret during a rotation.
    else if (k === "v1") signatures.push(v);
  }
  if (!timestamp || !signatures.length) return { ok: false, reason: "malformed signature header" };

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age)) return { ok: false, reason: "bad timestamp" };
  if (age > toleranceSeconds) return { ok: false, reason: `timestamp outside tolerance (${age}s)` };

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`),
  );
  const expected = toHex(mac);

  // Every candidate is compared, and the result is folded in rather than
  // returned early, so the reply time does not reveal which one matched.
  let matched = false;
  for (const candidate of signatures) {
    if (constantTimeEqual(expected, candidate)) matched = true;
  }
  return matched ? { ok: true } : { ok: false, reason: "signature mismatch" };
}
