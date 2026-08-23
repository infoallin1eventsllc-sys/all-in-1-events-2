// The only thing allowed to mark an invoice paid.
//
// This endpoint is public — Stripe cannot present a Supabase JWT — so the
// signature on the request *is* the authentication. Nothing here trusts the
// URL being hit, the shape of the body, or anything the browser said. An
// unsigned or mis-signed request is refused before a single field is read.
//
// Why the browser is never trusted for this: after paying, the client is sent
// to our success_url. That URL is just a string, and anyone can type it. If
// arriving there marked the invoice paid, every invoice in the system could be
// cleared by visiting a link. So the redirect only shows a message; the money
// is recorded here, from a message Stripe signed.
//
// Deploy with verify_jwt = false.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { serviceClient } from "../_shared/supabase.ts";
import { verifyStripeSignature } from "../_shared/stripe.ts";

/** Stripe calls a bank debit "us_bank_account"; the owner calls it a bank
    transfer. Wallet payments report as cards with a wallet name attached. */
function readableMethod(pm: Record<string, unknown> | null | undefined): string | null {
  if (!pm) return null;
  const type = String(pm.type ?? "");
  if (type === "card") {
    const wallet = (pm.card as { wallet?: { type?: string } } | undefined)?.wallet?.type;
    if (wallet === "apple_pay") return "apple_pay";
    if (wallet === "google_pay") return "google_pay";
    return "card";
  }
  return type || null;
}

/** Ask Stripe what actually paid, rather than guessing from the session. */
async function fetchPaymentMethod(paymentIntentId: string): Promise<string | null> {
  const key = Deno.env.get("STRIPE_SECRET_KEY")?.trim();
  if (!key || !paymentIntentId) return null;
  try {
    const res = await fetch(
      `https://api.stripe.com/v1/payment_intents/${paymentIntentId}?expand[]=payment_method`,
      { headers: { Authorization: `Bearer ${key}` } },
    );
    if (!res.ok) return null;
    const pi = await res.json();
    return readableMethod(pi?.payment_method);
  } catch {
    return null;
  }
}

async function markPaid(
  sb: SupabaseClient,
  sessionId: string,
  invoiceId: string | null,
  paymentIntentId: string | null,
  amountCents: number | null,
) {
  const method = paymentIntentId ? await fetchPaymentMethod(paymentIntentId) : null;
  const now = new Date().toISOString();

  const { data: payment } = await sb
    .from("payments")
    .update({
      status: "paid",
      paid_at: now,
      updated_at: now,
      provider_payment_id: paymentIntentId,
      method,
      error: null,
    })
    .eq("provider_session_id", sessionId)
    .select("id, invoice_id, amount_cents")
    .maybeSingle();

  const targetInvoice = payment?.invoice_id ?? invoiceId;

  // A payment whose session we never recorded still gets written down rather
  // than dropped. Money that arrived with no matching row is exactly the thing
  // that must not vanish quietly.
  if (!payment && sessionId) {
    await sb.from("payments").insert({
      invoice_id: targetInvoice,
      provider: "stripe",
      provider_session_id: sessionId,
      provider_payment_id: paymentIntentId,
      amount_cents: amountCents && amountCents > 0 ? amountCents : 1,
      status: "paid",
      method,
      paid_at: now,
      error: "recorded from webhook with no matching local payment row",
    });
  }

  if (targetInvoice) {
    await sb.from("owner_invoices")
      .update({ status: "Paid", updated_at: now })
      .eq("id", targetInvoice);
  }

  return { payment_id: payment?.id ?? null, invoice_id: targetInvoice, method };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "POST only" }), { status: 405 });
  }

  // The exact bytes Stripe signed. Parsing first and re-serialising would
  // change the payload and break every signature.
  const raw = await req.text();

  const check = await verifyStripeSignature(
    raw,
    req.headers.get("stripe-signature"),
    Deno.env.get("STRIPE_WEBHOOK_SECRET")?.trim() ?? "",
  );
  if (!check.ok) {
    // 400, and nothing is recorded. Stripe will retry a genuine event; a
    // forged one gets no second look either.
    console.error("rejected webhook:", check.reason);
    return new Response(JSON.stringify({ ok: false, error: check.reason }), { status: 400 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "invalid JSON" }), { status: 400 });
  }

  const sb = serviceClient();
  const eventId = String(event.id ?? "");
  const eventType = String(event.type ?? "");
  // deno-lint-ignore no-explicit-any
  const object = (event.data as any)?.object ?? {};

  // Stripe retries until it gets a 2xx and says plainly that an event may
  // arrive more than once. Claiming the id first means a retry cannot apply
  // the same payment twice; the insert conflicts and we stop here.
  if (eventId) {
    const { error: dupe } = await sb
      .from("payment_events")
      .insert({ event_id: eventId, provider: "stripe", event_type: eventType });
    if (dupe) {
      return new Response(
        JSON.stringify({ ok: true, duplicate: true, event: eventId }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  const sessionId = String(object.id ?? "");
  const invoiceId = String(object.metadata?.invoice_id ?? object.client_reference_id ?? "") || null;
  const paymentIntentId = object.payment_intent ? String(object.payment_intent) : null;
  const amountCents = typeof object.amount_total === "number" ? object.amount_total : null;
  const now = new Date().toISOString();

  let result: Record<string, unknown> = { handled: false };

  switch (eventType) {
    case "checkout.session.completed": {
      // Cards and wallets settle immediately and arrive here already paid.
      // A bank debit does not: the session completes with payment_status
      // "unpaid" and clears days later via async_payment_succeeded. Treating
      // this event alone as payment would mark bank transfers paid before the
      // money moved.
      if (String(object.payment_status) === "paid") {
        result = await markPaid(sb, sessionId, invoiceId, paymentIntentId, amountCents);
        result.handled = "paid";
      } else {
        await sb.from("payments")
          .update({ status: "processing", provider_payment_id: paymentIntentId, updated_at: now })
          .eq("provider_session_id", sessionId);
        result = { handled: "processing", note: "bank debit initiated; awaiting settlement" };
      }
      break;
    }

    case "checkout.session.async_payment_succeeded": {
      result = await markPaid(sb, sessionId, invoiceId, paymentIntentId, amountCents);
      result.handled = "paid_async";
      break;
    }

    case "checkout.session.async_payment_failed": {
      await sb.from("payments")
        .update({
          status: "failed",
          error: "bank debit failed to settle",
          updated_at: now,
        })
        .eq("provider_session_id", sessionId);
      result = { handled: "failed" };
      break;
    }

    case "checkout.session.expired": {
      await sb.from("payments")
        .update({ status: "expired", updated_at: now })
        .eq("provider_session_id", sessionId)
        .in("status", ["created", "processing"]);
      result = { handled: "expired" };
      break;
    }

    case "charge.refunded": {
      const pi = object.payment_intent ? String(object.payment_intent) : null;
      if (pi) {
        const { data: refunded } = await sb.from("payments")
          .update({ status: "refunded", updated_at: now })
          .eq("provider_payment_id", pi)
          .select("invoice_id")
          .maybeSingle();
        // The invoice goes back to owing. Leaving it "Paid" after a refund
        // would quietly overstate income.
        if (refunded?.invoice_id) {
          await sb.from("owner_invoices")
            .update({ status: "Issued", updated_at: now })
            .eq("id", refunded.invoice_id);
        }
      }
      result = { handled: "refunded" };
      break;
    }

    default:
      // Everything else is acknowledged and ignored. Returning an error for an
      // event we do not care about would make Stripe retry it for days.
      result = { handled: false, ignored: eventType };
  }

  return new Response(
    JSON.stringify({ ok: true, event: eventId, type: eventType, ...result }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
