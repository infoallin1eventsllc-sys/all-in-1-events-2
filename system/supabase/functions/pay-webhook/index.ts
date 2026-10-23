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

/** Ask Stripe what actually paid, rather than guessing from the session.
 *  Bounded: a slow Stripe must not hold the webhook past Stripe's own timeout,
 *  which would make it retry an event we were halfway through. */
async function fetchPaymentMethod(paymentIntentId: string): Promise<string | null> {
  const key = Deno.env.get("STRIPE_SECRET_KEY")?.trim();
  if (!key || !/^pi_[A-Za-z0-9]+$/.test(paymentIntentId)) return null;
  try {
    const res = await fetch(
      `https://api.stripe.com/v1/payment_intents/${paymentIntentId}?expand[]=payment_method`,
      { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return null;
    const pi = await res.json();
    return readableMethod(pi?.payment_method);
  } catch {
    return null;
  }
}

/** A write that failed. Thrown so the event is released and Stripe retries it. */
class WriteFailed extends Error {}
function must<T extends { error: { message: string } | null }>(r: T, what: string): T {
  if (r.error) throw new WriteFailed(`${what}: ${r.error.message}`);
  return r;
}

/**
 * Record a payment, and mark its invoice paid only when the money matches.
 *
 * The invoice comes from OUR payments row, created by `pay` when it opened the
 * checkout, never from the event. Until 22 Oct a session with no row of ours
 * fell back to metadata.invoice_id or client_reference_id, and either could
 * name any invoice: a Stripe Payment Link accepts client_reference_id straight
 * from its URL, so paying a dollar through any link in this account could
 * have marked any invoice Paid. Now a payment we did not open is recorded for
 * the owner to look at and touches no invoice, and a known one marks its
 * invoice Paid only when the amount and currency are the ones we asked for.
 */
async function markPaid(
  sb: SupabaseClient,
  sessionId: string,
  paymentIntentId: string | null,
  amountCents: number | null,
  currency: string | null,
  claimedInvoice: string | null,
  paymentIdMeta: string | null,
) {
  const method = paymentIntentId ? await fetchPaymentMethod(paymentIntentId) : null;
  const now = new Date().toISOString();

  let { data: payment } = must(
    await sb.from("payments")
      .select("id, invoice_id, amount_cents, currency, status")
      .eq("provider_session_id", sessionId)
      .maybeSingle(),
    "read payment",
  );

  // `pay` writes the session id back after Stripe answers. If that write was
  // lost, the row is still ours: `pay` put its id in the session's metadata,
  // which only this account's secret key can set (unlike client_reference_id,
  // which a Payment Link takes from its URL). Only a row not yet bound to any
  // session can be claimed this way.
  if (!payment && paymentIdMeta && /^[0-9a-f-]{36}$/i.test(paymentIdMeta)) {
    const found = must(
      await sb.from("payments")
        .select("id, invoice_id, amount_cents, currency, status")
        .eq("id", paymentIdMeta)
        .is("provider_session_id", null)
        .maybeSingle(),
      "read payment by id",
    );
    payment = found.data;
    if (payment) {
      must(await sb.from("payments").update({ provider_session_id: sessionId }).eq("id", payment.id), "bind session");
    }
  }

  if (!payment) {
    // Money that arrived with no matching row is exactly the thing that must
    // not vanish quietly, so it is written down; and exactly the thing that
    // must not clear an invoice, so invoice_id stays empty.
    must(
      await sb.from("payments").insert({
        invoice_id: null,
        provider: "stripe",
        provider_session_id: sessionId,
        provider_payment_id: paymentIntentId,
        amount_cents: amountCents && amountCents > 0 ? amountCents : 1,
        currency: (currency ?? "usd").toLowerCase(),
        status: "paid",
        method,
        paid_at: now,
        error: `paid through a checkout this system did not open; no invoice was marked paid` +
          (claimedInvoice ? ` (the checkout named invoice ${claimedInvoice.slice(0, 60)})` : ""),
      }),
      "record unmatched payment",
    );
    return { payment_id: null, invoice_id: null, method, matched: false };
  }

  const amountOk = amountCents !== null && amountCents === Number(payment.amount_cents);
  const currencyOk = (currency ?? "").toLowerCase() === String(payment.currency ?? "").toLowerCase();

  must(
    await sb.from("payments").update({
      status: "paid",
      paid_at: now,
      updated_at: now,
      provider_payment_id: paymentIntentId,
      method,
      error: amountOk && currencyOk ? null
        : `Stripe reported ${amountCents ?? "?"} ${currency ?? "?"}, the checkout was for ` +
          `${payment.amount_cents} ${payment.currency}; the invoice was left for the owner`,
    }).eq("id", payment.id),
    "mark payment paid",
  );

  let invoiceMarked = false;
  if (payment.invoice_id && amountOk && currencyOk) {
    must(
      await sb.from("owner_invoices")
        .update({ status: "Paid", updated_at: now })
        .eq("id", payment.invoice_id),
      "mark invoice paid",
    );
    invoiceMarked = true;
  }

  return { payment_id: payment.id, invoice_id: payment.invoice_id, method, matched: true, invoice_marked: invoiceMarked };
}

/** Largest body accepted. Stripe's checkout events are a few kilobytes. */
const MAX_BODY_BYTES = 256 * 1024;

const reply = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply({ ok: false, error: "POST only" }, 405);
  if (Number(req.headers.get("content-length") ?? "0") > MAX_BODY_BYTES) {
    return reply({ ok: false, error: "too large" }, 413);
  }

  // The exact bytes Stripe signed. Parsing first and re-serialising would
  // change the payload and break every signature.
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return reply({ ok: false, error: "too large" }, 413);

  const check = await verifyStripeSignature(
    raw,
    req.headers.get("stripe-signature"),
    Deno.env.get("STRIPE_WEBHOOK_SECRET")?.trim() ?? "",
  );
  if (!check.ok) {
    // 400, and nothing is recorded. Stripe will retry a genuine event; a
    // forged one gets no second look either. The reason is logged, not
    // returned: it would tell a forger which part they got wrong.
    console.error("rejected webhook:", check.reason);
    return reply({ ok: false, error: "invalid signature" }, 400);
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(raw);
  } catch {
    return reply({ ok: false, error: "invalid JSON" }, 400);
  }

  const sb = serviceClient();
  const eventId = String(event.id ?? "");
  const eventType = String(event.type ?? "");
  // deno-lint-ignore no-explicit-any
  const object = (event.data as any)?.object ?? {};

  // Stripe retries until it gets a 2xx and says plainly that an event may
  // arrive more than once. Claiming the id first means a retry cannot apply
  // the same payment twice; the insert conflicts and we stop here.
  //
  // Only a unique-key conflict is a duplicate (22 Oct). Any other failure used
  // to be answered "duplicate, 200" as well, so a database blip at the wrong
  // moment told Stripe a payment had been handled when nothing was written,
  // and Stripe never sent it again. Now it is a 500 and Stripe retries.
  if (eventId) {
    const { error: claimErr } = await sb
      .from("payment_events")
      .insert({ event_id: eventId, provider: "stripe", event_type: eventType });
    if (claimErr) {
      if (claimErr.code === "23505") return reply({ ok: true, duplicate: true, event: eventId });
      console.error("could not claim event", eventId, claimErr.message);
      return reply({ ok: false, error: "try again" }, 500);
    }
  }

  const sessionId = String(object.id ?? "");
  // Only ever reported, never acted on: see markPaid.
  const claimedInvoice = String(object.metadata?.invoice_id ?? object.client_reference_id ?? "") || null;
  const paymentIdMeta = object.metadata?.payment_id ? String(object.metadata.payment_id) : null;
  const paymentIntentId = object.payment_intent ? String(object.payment_intent) : null;
  const amountCents = typeof object.amount_total === "number" ? object.amount_total : null;
  const currency = typeof object.currency === "string" ? object.currency : null;
  const now = new Date().toISOString();

  let result: Record<string, unknown> = { handled: false };

  try {
    switch (eventType) {
      case "checkout.session.completed": {
        // Cards and wallets settle immediately and arrive here already paid.
        // A bank debit does not: the session completes with payment_status
        // "unpaid" and clears days later via async_payment_succeeded. Treating
        // this event alone as payment would mark bank transfers paid before the
        // money moved.
        if (String(object.payment_status) === "paid") {
          result = await markPaid(sb, sessionId, paymentIntentId, amountCents, currency, claimedInvoice, paymentIdMeta);
          result.handled = "paid";
        } else {
          // Only from "created": events can arrive out of order, and a late
          // "completed, unpaid" must not drag a settled payment back.
          must(
            await sb.from("payments")
              .update({ status: "processing", provider_payment_id: paymentIntentId, updated_at: now })
              .eq("provider_session_id", sessionId)
              .eq("status", "created"),
            "mark processing",
          );
          result = { handled: "processing", note: "bank debit initiated; awaiting settlement" };
        }
        break;
      }

      case "checkout.session.async_payment_succeeded": {
        result = await markPaid(sb, sessionId, paymentIntentId, amountCents, currency, claimedInvoice, paymentIdMeta);
        result.handled = "paid_async";
        break;
      }

      case "checkout.session.async_payment_failed": {
        must(
          await sb.from("payments")
            .update({ status: "failed", error: "bank debit failed to settle", updated_at: now })
            .eq("provider_session_id", sessionId)
            .in("status", ["created", "processing"]),
          "mark failed",
        );
        result = { handled: "failed" };
        break;
      }

      case "checkout.session.expired": {
        must(
          await sb.from("payments")
            .update({ status: "expired", updated_at: now })
            .eq("provider_session_id", sessionId)
            .in("status", ["created", "processing"]),
          "mark expired",
        );
        result = { handled: "expired" };
        break;
      }

      case "charge.refunded": {
        const pi = object.payment_intent ? String(object.payment_intent) : null;
        // A partial refund leaves most of the money paid. Only a full refund
        // reopens the invoice (22 Oct: any refund at all used to).
        const full = object.refunded === true;
        if (pi && full) {
          const { data: refunded } = must(
            await sb.from("payments")
              .update({ status: "refunded", updated_at: now })
              .eq("provider_payment_id", pi)
              .select("invoice_id")
              .maybeSingle(),
            "mark refunded",
          );
          // The invoice goes back to owing. Leaving it "Paid" after a refund
          // would quietly overstate income.
          if (refunded?.invoice_id) {
            must(
              await sb.from("owner_invoices")
                .update({ status: "Issued", updated_at: now })
                .eq("id", refunded.invoice_id),
              "reopen invoice",
            );
          }
          result = { handled: "refunded" };
        } else if (pi) {
          must(
            await sb.from("payments")
              .update({
                error: `partly refunded: ${Number(object.amount_refunded ?? 0)} of ${Number(object.amount ?? 0)} cents`,
                updated_at: now,
              })
              .eq("provider_payment_id", pi),
            "note partial refund",
          );
          result = { handled: "partial_refund" };
        }
        break;
      }

      default:
        // Everything else is acknowledged and ignored. Returning an error for an
        // event we do not care about would make Stripe retry it for days.
        result = { handled: false, ignored: eventType };
    }
  } catch (err) {
    // Release the claim so Stripe's retry is processed rather than taken for
    // a duplicate, and say 500 so that it does retry.
    console.error("webhook not applied, released for retry:", eventId, err instanceof Error ? err.message : String(err));
    if (eventId) await sb.from("payment_events").delete().eq("event_id", eventId);
    return reply({ ok: false, error: "try again" }, 500);
  }

  return reply({ ok: true, event: eventId, type: eventType, ...result });
});
