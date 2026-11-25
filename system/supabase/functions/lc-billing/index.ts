// Live Cards: start a plan checkout, or open Stripe's page to manage a plan.
// NOT DEPLOYED. Written and reviewed on 24 Nov 2026; Otis decides when it goes live.
//
// What keeps this safe:
//   - The caller must be a signed-in Live Cards account. The token is checked
//     with the auth server here, not just decoded.
//   - The browser sends one word ("checkout" or "portal"). It never sends a
//     price, an amount, an account id or a return address. The price is a
//     server secret; the account is whoever the token belongs to; the return
//     addresses are fixed to our own site.
//   - This function never changes a plan. Only the signed webhook does.
//   - Card numbers are typed on Stripe's page. They never reach this code.
//
// Secrets (Supabase Edge Function secrets, never in the website):
//   STRIPE_SECRET_KEY      already used by invoice payments
//   LC_STRIPE_PRICE_ID     the plan's Stripe price id (price_...)
//   LC_SITE_ORIGIN         optional, defaults to https://meridianinterface.com
//
// Deploy with verify_jwt = true.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { allow } from "../_shared/ratelimit.ts";
import { createPlanCheckout, createPortalSession, stripeKey } from "../_shared/stripe.ts";

const ORIGIN = (Deno.env.get("LC_SITE_ORIGIN")?.trim() || "https://meridianinterface.com").replace(/\/+$/, "");

// Only our own site may call this from a browser.
const cors = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const reply = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ ok: false, error: "POST only" }, 405);
  if (Number(req.headers.get("content-length") ?? "0") > 2048) return reply({ ok: false, error: "too large" }, 413);

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return reply({ ok: false, error: "Please sign in." }, 401);

  const sb = serviceClient();
  const { data: who, error: whoErr } = await sb.auth.getUser(token);
  const user = who?.user;
  if (whoErr || !user) return reply({ ok: false, error: "Please sign in again." }, 401);

  // Per account, not per address: a signed-in caller cannot dodge it by moving networks.
  if (!(await allow(sb, `lc-billing:${user.id}`, 10))) return reply({ ok: false, error: "Too many tries. Wait a while and try again." }, 429);

  let action = "";
  try {
    const body = await req.json();
    action = typeof body?.action === "string" ? body.action : "";
  } catch { /* handled below */ }
  if (action !== "checkout" && action !== "portal") return reply({ ok: false, error: "Unknown request." }, 400);

  if (!stripeKey()) return reply({ ok: false, error: "Payments are not switched on yet." }, 503);

  const { data: acct, error: acctErr } = await sb.from("lc_accounts")
    .select("plan, blocked, stripe_customer_id").eq("user_id", user.id).maybeSingle();
  if (acctErr) return reply({ ok: false, error: "Try again in a moment." }, 500);
  // An account whose card was taken down cannot buy its way back. It can still open the portal to cancel.
  if (acct?.blocked && action === "checkout") return reply({ ok: false, error: "This account cannot buy a plan. Contact Meridian Interface." }, 403);

  try {
    if (action === "portal") {
      if (!acct?.stripe_customer_id) return reply({ ok: false, error: "There is no plan to manage on this account." }, 400);
      const portal = await createPortalSession(acct.stripe_customer_id, `${ORIGIN}/studio/`);
      return reply({ ok: true, url: portal.url });
    }

    if (acct?.plan === "pro") return reply({ ok: false, error: "This account already has the plan." }, 409);
    const priceId = Deno.env.get("LC_STRIPE_PRICE_ID")?.trim() ?? "";
    if (!/^price_[A-Za-z0-9]+$/.test(priceId)) return reply({ ok: false, error: "Payments are not switched on yet." }, 503);

    const session = await createPlanCheckout({
      priceId,
      userId: user.id,
      email: user.email,
      customerId: acct?.stripe_customer_id ?? null,
      // The success page only shows a message. Arriving there changes nothing.
      successUrl: `${ORIGIN}/studio/?plan=thanks`,
      cancelUrl: `${ORIGIN}/studio/?plan=cancelled`,
      // A double tap within ten minutes reopens the same checkout, not a second one.
      idempotencyKey: `lc-plan-${user.id}-${Math.floor(Date.now() / 600_000)}`,
    });
    return reply({ ok: true, url: session.url });
  } catch (err) {
    // The detail is logged for the owner; the caller gets nothing a prober could use.
    console.error("lc-billing failed:", err instanceof Error ? err.message : String(err));
    return reply({ ok: false, error: "The payment page could not be opened. Try again in a moment." }, 502);
  }
});
