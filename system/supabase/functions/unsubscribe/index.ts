// Unsubscribe — the link at the bottom of every marketing email.
//
// US CAN-SPAM rules require that a commercial email carry a working opt-out
// that needs nothing from the recipient beyond one click, and that acting on
// it takes effect promptly. This is that endpoint. It is deliberately the
// smallest thing that can be correct.
//
// Public (verify_jwt = false): the person clicking is not logged in and never
// will be. The token IS the authorisation - an HMAC over the contact id, so a
// link cannot be edited into someone else's unsubscribe, and holding one tells
// you nothing about any other contact.
//
// Two properties worth stating, because both are easy to get wrong:
//
//   1. GET must not be the only way in, and it must be safe to prefetch. Mail
//      clients and security scanners follow links in email before a human ever
//      sees them. So a GET reports what the link WOULD do and changes nothing;
//      the POST does the work. A scanner cannot unsubscribe someone by looking.
//   2. It is idempotent and it never says "no". Clicking twice is fine.
//      An expired, malformed or unknown token still answers "you are
//      unsubscribed" rather than an error, because the alternative is a person
//      who wants out being shown a failure page.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { json, corsHeaders } from "../_shared/cors.ts";
import { verifyUnsubToken } from "../_shared/unsub.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  let token = url.searchParams.get("t") ?? "";

  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    token = String((body as Record<string, unknown>).token ?? token);
  } else if (req.method !== "GET") {
    return json({ ok: false, error: "GET or POST only" }, 405);
  }

  const contactId = await verifyUnsubToken(token);

  // A link that is being previewed rather than clicked. Say what it does,
  // touch nothing.
  if (req.method === "GET") {
    return json({
      ok: true,
      action: "confirm",
      valid: !!contactId,
      message: contactId
        ? "This link will stop marketing email to this address. Confirm to apply it."
        : "This link is not readable, but you can still stop marketing email by replying to any message.",
    });
  }

  // Nothing to act on, and still not an error: the person asked to be left
  // alone and should be told they will be.
  if (!contactId) {
    return json({
      ok: true,
      unsubscribed: true,
      note: "no readable token — nothing to change, but treat this address as opted out",
    });
  }

  const sb = serviceClient();
  const { data: contact } = await sb
    .from("contacts").select("id, email, consent_email").eq("id", contactId).maybeSingle();

  if (!contact) {
    return json({ ok: true, unsubscribed: true, note: "contact no longer exists" });
  }

  if (contact.consent_email) {
    await sb.from("contacts")
      .update({ consent_email: false })
      .eq("id", contactId);

    // Logged so the reason a contact stopped receiving mail is visible in the
    // CRM rather than being an unexplained flag.
    await sb.from("activities").insert({
      contact_id: contactId,
      type: "note",
      direction: "inbound",
      subject: "Unsubscribed from marketing email",
      body: "The recipient used the unsubscribe link. Transactional messages (booking confirmations, invoices) are unaffected.",
      meta: { source: "unsubscribe_link" },
    });
  }

  return json({
    ok: true,
    unsubscribed: true,
    already: !contact.consent_email,
    message:
      "Done. You will not receive marketing email from Meridian Interface. Messages about work in progress — a booking confirmation or an invoice — are not affected.",
  });
});
