// Live Cards: the only thing allowed to change an account's plan.
// NOT DEPLOYED. Written and reviewed on 24 Nov 2026; Otis decides when it goes live.
//
// This address is public, because Stripe cannot sign in. The signature on each
// message is the proof of who sent it:
//   - A message with no signature, a wrong signature, or one older than five
//     minutes is refused before a single field is read.
//   - Every message id is recorded once (lc_billing_events). A repeat of a
//     message already handled does nothing.
//   - The plan is never copied from the message. The message only says "look
//     at this subscription"; the current state is then read from Stripe
//     directly, so late or out-of-order messages cannot leave a wrong plan.
//   - The app cannot write the plan at all (database grants), so there is no
//     second door.
//
// Secrets: STRIPE_SECRET_KEY, LC_STRIPE_WEBHOOK_SECRET (this endpoint's own
// signing secret, separate from the invoice webhook's).
//
// Deploy with verify_jwt = false.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { serviceClient } from "../_shared/supabase.ts";
import { getSubscription, verifyStripeSignature } from "../_shared/stripe.ts";

const MAX_BODY_BYTES = 256 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const reply = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

class WriteFailed extends Error {}
function must<T extends { error: { message: string } | null }>(r: T, what: string): T {
  if (r.error) throw new WriteFailed(`${what}: ${r.error.message}`);
  return r;
}

/** Paid and current, as Stripe reports it. Anything else is the free plan. */
const isActive = (status: string) => status === "active" || status === "trialing";

/** Set the plan from what Stripe says about the subscription right now. */
async function syncFromSubscription(sb: SupabaseClient, subscriptionId: string, userIdHint: string | null) {
  const sub = await getSubscription(subscriptionId);
  if (sub.metadata?.product !== "live-cards") return { handled: false, note: "not a Live Cards subscription" };

  // Who it belongs to: the row that already holds this subscription, or the
  // account id we stamped on the subscription when the checkout was opened.
  const { data: byId } = must(
    await sb.from("lc_accounts").select("user_id").eq("stripe_subscription_id", sub.id).maybeSingle(),
    "find account",
  );
  const stamped = String(sub.metadata?.user_id ?? "");
  const userId = byId?.user_id ?? (UUID.test(stamped) ? stamped : null);
  if (!userId) return { handled: false, note: "no account for this subscription" };
  // The checkout's own reference must agree with the stamp. A mismatch means
  // something is wrong, and nothing is changed.
  if (userIdHint && userIdHint !== userId) return { handled: false, note: "account reference mismatch" };

  const plan = isActive(sub.status) ? "pro" : "free";
  must(
    await sb.from("lc_accounts").upsert({
      user_id: userId,
      plan,
      stripe_customer_id: String(sub.customer),
      stripe_subscription_id: sub.id,
    }, { onConflict: "user_id" }),
    "set plan",
  );

  if (plan === "free") {
    // Back on the free plan: one card stays public (the oldest), and the
    // "Made with" line returns. Nothing is deleted.
    const { data: cards } = must(
      await sb.from("lc_cards").select("id, data, published").eq("owner", userId).order("created_at", { ascending: true }),
      "list cards",
    );
    for (const [i, c] of (cards ?? []).entries()) {
      const data = { ...(c.data as Record<string, unknown>), showMade: true };
      must(
        await sb.from("lc_cards").update({ data, published: i === 0 ? c.published : false }).eq("id", c.id),
        "apply free plan limits",
      );
    }
  }
  return { handled: true, plan, user: userId.slice(0, 8) };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply({ ok: false, error: "POST only" }, 405);
  if (Number(req.headers.get("content-length") ?? "0") > MAX_BODY_BYTES) return reply({ ok: false, error: "too large" }, 413);

  // The exact bytes Stripe signed. Parsing first would break the signature.
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return reply({ ok: false, error: "too large" }, 413);

  const check = await verifyStripeSignature(
    raw,
    req.headers.get("stripe-signature"),
    Deno.env.get("LC_STRIPE_WEBHOOK_SECRET")?.trim() ?? "",
  );
  if (!check.ok) {
    // The reason is logged, not returned: it would tell a forger what to fix.
    console.error("rejected Live Cards webhook:", check.reason);
    return reply({ ok: false, error: "invalid signature" }, 400);
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(raw);
  } catch {
    return reply({ ok: false, error: "invalid JSON" }, 400);
  }
  const eventId = typeof event.id === "string" && /^evt_[A-Za-z0-9]+$/.test(event.id) ? event.id : "";
  const eventType = typeof event.type === "string" ? event.type.slice(0, 80) : "";
  const object = ((event.data as { object?: Record<string, unknown> } | undefined)?.object) ?? {};
  if (!eventId || !eventType) return reply({ ok: false, error: "not an event" }, 400);

  const sb = serviceClient();

  // Claim the event. The primary key makes a second delivery lose the race.
  const claim = await sb.from("lc_billing_events").insert({ event_id: eventId, type: eventType });
  if (claim.error) {
    if (claim.error.code === "23505") return reply({ ok: true, duplicate: true });
    console.error("could not record event:", claim.error.message);
    return reply({ ok: false, error: "try again" }, 500);
  }

  let result: Record<string, unknown> = { handled: false };
  try {
    switch (eventType) {
      case "checkout.session.completed": {
        if (object.mode !== "subscription" || !object.subscription) break;
        const ref = typeof object.client_reference_id === "string" && UUID.test(object.client_reference_id)
          ? object.client_reference_id : null;
        result = await syncFromSubscription(sb, String(object.subscription), ref);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed": {
        if (typeof object.id === "string") result = await syncFromSubscription(sb, object.id, null);
        break;
      }
      default:
        // Acknowledged and ignored, so Stripe does not retry it for days.
        result = { handled: false, ignored: eventType };
    }
  } catch (err) {
    // Release the claim so Stripe's retry is processed, and say 500 so it does retry.
    console.error("Live Cards webhook not applied, released for retry:", eventId, err instanceof Error ? err.message : String(err));
    await sb.from("lc_billing_events").delete().eq("event_id", eventId);
    return reply({ ok: false, error: "try again" }, 500);
  }

  return reply({ ok: true, event: eventId, type: eventType, ...result });
});
