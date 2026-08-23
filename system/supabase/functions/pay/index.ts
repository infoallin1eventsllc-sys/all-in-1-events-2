// Payment links for invoices — the owner-facing half.
//
// Creates a hosted Stripe Checkout page for an invoice and returns its URL,
// which the owner sends to the client. The client pays on Stripe's domain; no
// card data ever reaches this system, and nothing here decides that an invoice
// is paid. That decision arrives separately and signed, at `pay-webhook`.
//
// verify_jwt = false because the browser calls this with an owner session
// token rather than a Supabase session — the same arrangement `owner` uses.
// Every action below requires that token.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { serviceClient, getSetting } from "../_shared/supabase.ts";
import { json, corsHeaders } from "../_shared/cors.ts";
import { ownerTokenValid, tokenFrom } from "../_shared/ownertoken.ts";
import { createCheckoutSession, stripeKey, stripeMode } from "../_shared/stripe.ts";

type PaymentSettings = {
  /** Where Stripe returns the client afterwards. */
  site_url?: string;
  /** Offer ACH bank transfer beside cards. Default on: at this studio's
      invoice sizes the fee difference is measured in thousands. */
  allow_bank_transfer?: boolean;
};

const DEFAULT_SITE = "https://meridianinterface.com";

async function paymentSettings(sb: SupabaseClient): Promise<Required<PaymentSettings>> {
  const s = await getSetting<PaymentSettings>(sb, "payments", {});
  return {
    site_url: (Deno.env.get("SITE_URL") ?? s.site_url ?? DEFAULT_SITE).replace(/\/$/, ""),
    allow_bank_transfer: s.allow_bank_transfer !== false,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid JSON" }, 400);
  }

  const sb = serviceClient();
  const action = String(body.action ?? "");

  // Whether payments are set up at all. Deliberately says nothing secret: the
  // portal uses it to decide between showing the button and explaining why it
  // is missing.
  if (action === "status") {
    return json({
      ok: true,
      configured: !!stripeKey(),
      mode: stripeMode(),
      webhook_configured: !!Deno.env.get("STRIPE_WEBHOOK_SECRET"),
    });
  }

  if (!(await ownerTokenValid(tokenFrom(req, body)))) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  switch (action) {
    /* ------------------------------------------------ create a pay link --- */
    case "create_link": {
      const invoiceId = String(body.invoice_id ?? "").trim();
      if (!invoiceId) return json({ ok: false, error: "invoice_id required" }, 400);

      if (!stripeKey()) {
        return json({
          ok: false,
          error:
            "Stripe is not connected yet. Add STRIPE_SECRET_KEY as a Supabase Edge Function secret.",
        }, 400);
      }

      // The amount comes from the invoice row, read here with the service
      // role. It is never accepted from the caller: an amount the browser can
      // set is an amount the client can set.
      const { data: invoice, error: invErr } = await sb
        .from("owner_invoices")
        .select("id, client_name, client_email, total_amount, total_cents, status")
        .eq("id", invoiceId)
        .maybeSingle();

      if (invErr) return json({ ok: false, error: invErr.message }, 500);
      if (!invoice) return json({ ok: false, error: `invoice ${invoiceId} not found` }, 404);

      const amountCents = Number(invoice.total_cents ?? 0);
      if (!Number.isInteger(amountCents) || amountCents <= 0) {
        return json({
          ok: false,
          error: `invoice ${invoiceId} has no positive amount to charge`,
        }, 400);
      }
      // Stripe's own ceiling for a single charge.
      if (amountCents > 99_999_999) {
        return json({
          ok: false,
          error:
            "This invoice is above the single-charge limit. Bill it in stages, or take it by bank transfer.",
        }, 400);
      }

      if (String(invoice.status).toLowerCase() === "paid") {
        return json({ ok: false, error: "this invoice is already marked paid" }, 409);
      }

      // Reuse a live link rather than opening a second checkout for the same
      // money. The unique partial index enforces this at the database too.
      const { data: open } = await sb
        .from("payments")
        .select("id, amount_cents, provider_session_id, checkout_url, expires_at, status")
        .eq("invoice_id", invoiceId)
        .in("status", ["created", "processing"])
        .maybeSingle();

      // Only reuse a link that is still usable: same amount, still has a URL,
      // and not past Stripe's expiry. A lapsed link sent to a client is worse
      // than no link, because it looks like the payment failed.
      const stillValid = open?.checkout_url &&
        open.amount_cents === amountCents &&
        (!open.expires_at || new Date(open.expires_at).getTime() > Date.now() + 60_000);

      if (stillValid && body.force !== true) {
        return json({
          ok: true,
          reused: true,
          payment_id: open!.id,
          session_id: open!.provider_session_id,
          url: open!.checkout_url,
          expires_at: open!.expires_at,
          note: "An unpaid payment link already exists for this invoice.",
        });
      }

      // Anything left open but unusable is retired, or the one-open-per-invoice
      // index will reject the new row.
      if (open) {
        await sb.from("payments")
          .update({ status: "expired", updated_at: new Date().toISOString() })
          .eq("id", open.id);
      }

      const settings = await paymentSettings(sb);
      const description = `Invoice ${invoice.id}${
        invoice.client_name ? ` — ${invoice.client_name}` : ""
      }`;

      // Insert first, so a session that gets created but whose response is
      // lost still has a row to reconcile against. A payment we cannot see is
      // worse than one that failed.
      const { data: row, error: insErr } = await sb
        .from("payments")
        .insert({
          invoice_id: invoiceId,
          provider: "stripe",
          amount_cents: amountCents,
          currency: "usd",
          status: "created",
          client_email: invoice.client_email ?? null,
        })
        .select("id")
        .single();

      if (insErr) return json({ ok: false, error: `could not record payment: ${insErr.message}` }, 500);

      try {
        const session = await createCheckoutSession({
          amountCents,
          currency: "usd",
          description,
          invoiceId,
          clientEmail: invoice.client_email,
          successUrl: `${settings.site_url}/?paid=${encodeURIComponent(invoiceId)}`,
          cancelUrl: `${settings.site_url}/?payment_cancelled=${encodeURIComponent(invoiceId)}`,
          allowBankTransfer: settings.allow_bank_transfer,
          // Keyed to the payment row, so a retried request returns Stripe's
          // first answer instead of opening another checkout.
          idempotencyKey: `pay_${row.id}`,
        });

        await sb.from("payments")
          .update({
            provider_session_id: session.id,
            checkout_url: session.url,
            expires_at: session.expires_at
              ? new Date(session.expires_at * 1000).toISOString()
              : null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);

        return json({
          ok: true,
          payment_id: row.id,
          session_id: session.id,
          url: session.url,
          amount_cents: amountCents,
          expires_at: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
          mode: stripeMode(),
          bank_transfer_offered: settings.allow_bank_transfer,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await sb.from("payments")
          .update({ status: "failed", error: message, updated_at: new Date().toISOString() })
          .eq("id", row.id);
        return json({ ok: false, error: message }, 502);
      }
    }

    /* -------------------------------------------- what has been collected -- */
    case "list": {
      const invoiceId = body.invoice_id ? String(body.invoice_id) : null;
      let q = sb.from("payments")
        .select("id, invoice_id, provider, status, method, amount_cents, currency, error, created_at, paid_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (invoiceId) q = q.eq("invoice_id", invoiceId);
      const { data, error } = await q;
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true, payments: data ?? [] });
    }

    default:
      return json({ ok: false, error: `unknown action: ${action}` }, 400);
  }
});
