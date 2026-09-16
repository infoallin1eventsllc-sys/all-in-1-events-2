// Intake — public webhook that captures a lead into the CRM, logs the activity,
// and enqueues a follow-up. Accepts either a flat contact shape
//   { name, email, phone, message, source }
// or the Meridian website's booking envelope
//   { type: "appointment", payload: { clientName, clientEmail, clientPhone,
//     companyName, serviceType, serviceTitle, preferredDate, preferredTimeSlot,
//     budgetRange, notes, ... } }
//
// verify_jwt MUST stay false. The website's booking form posts here from a
// visitor's browser with no Supabase session, so requiring a JWT does not add
// security, it just breaks the form — as it did for two and a half minutes on
// 16 Sep when a redeploy silently defaulted it back to true. A shared secret in
// the `x-webhook-secret` header is honoured when WEBHOOK_SECRET is set, but
// that cannot be the whole defence either: a secret a browser can send is a
// secret in the shipped bundle. So the real protection is below — a per-address
// rate limit, a hard daily ceiling on outbound acknowledgements, and length
// caps on every field.
//
// Why this matters more than a messy CRM: a confirmation email goes to whatever
// address the caller supplies, from Meridian's authenticated sending domain.
// Left open, this endpoint is a way to send mail as Meridian to strangers. The
// cost of that is not a few junk contacts, it is the sending reputation of
// meridianinterface.com and a suspended SendGrid account. Verified open on
// 16 Sep 2026 with a single unauthenticated POST.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { json, corsHeaders } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";
import { allow, callerKey } from "../_shared/ratelimit.ts";

/** Bookings allowed per caller per hour. A real person books once. */
const MAX_PER_IP_PER_HOUR = 5;
/** Acknowledgements the whole site may send in a day, across every caller.
    A rate limit alone is per-address; this is the ceiling a distributed
    flood still cannot cross. Raise it when real volume approaches it. */
const MAX_ACKS_PER_DAY = 60;

/** Longest accepted value per field, in characters. */
const CAP = { name: 120, email: 254, phone: 40, company: 160, message: 4000 } as const;

/** Trim, drop control characters, and cut to length. Never throws. */
const cap = (v: unknown, n: number): string =>
  String(v ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, n);

/** Shape check only — deliverability is SendGrid's problem, not ours. */
const looksLikeEmail = (v: string) => /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(v);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const secret = Deno.env.get("WEBHOOK_SECRET");
  const presentedSecret = secret && req.headers.get("x-webhook-secret") === secret;
  if (secret && !presentedSecret) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  // A caller holding the shared secret is a trusted server-to-server sender and
  // is not throttled. Everyone else — which includes the site's own form — is.
  const sbGate = serviceClient();
  if (!presentedSecret) {
    // `allow` fails closed on a database error, which is the behaviour this
    // endpoint wants: an enquiry lost to a blip is recoverable, an unthrottled
    // mail relay is not.
    if (!(await allow(sbGate, await callerKey(req, "intake"), MAX_PER_IP_PER_HOUR))) {
      return json({
        ok: false,
        error: "too_many_requests",
        message: "We already have a request from you. Email otis@meridianinterface.com if it is urgent.",
      }, 429);
    }
  }

  let raw: Record<string, unknown>;
  try {
    raw = await req.json();
  } catch {
    return json({ ok: false, error: "invalid JSON" }, 400);
  }

  // Unwrap the { type, payload } envelope the site uses; else treat as flat.
  const isEnvelope = !!raw && typeof raw === "object" && "payload" in raw && typeof raw.payload === "object";
  const p = (isEnvelope ? raw.payload : raw) as Record<string, unknown>;
  const kind = String((raw.type ?? "") as string);
  const isAppointment = kind === "appointment";

  // Every field is capped before it reaches the database or an email body.
  // Without this an unauthenticated caller chooses how many megabytes of text
  // get stored per request, and what gets pasted into a message sent from
  // Meridian's domain.
  const emailRaw = cap(p.email ?? p.clientEmail ?? "", CAP.email).toLowerCase();
  const email = emailRaw && looksLikeEmail(emailRaw) ? emailRaw : null;
  if (emailRaw && !email) return json({ ok: false, error: "that email address is not valid" }, 400);
  const fullName = cap(p.name ?? p.full_name ?? p.clientName ?? "", CAP.name) || null;
  const phone = cap(p.phone ?? p.clientPhone ?? "", CAP.phone) || null;
  const company = cap(p.company ?? p.companyName ?? "", CAP.company) || null;
  const source = cap(p.source ?? (isAppointment ? "meridian-website:booking" : "meridian-website"), 120);

  // Build a readable message. For bookings, summarise the request.
  let message = cap(p.message ?? p.details ?? p.notes ?? "", CAP.message) || null;
  if (isAppointment) {
    const parts = [
      cap(p.serviceTitle ?? p.serviceType ?? "", 120),
      p.preferredDate ? `on ${cap(p.preferredDate, 40)}` : null,
      cap(p.preferredTimeSlot ?? "", 60),
      p.budgetRange ? `budget ${cap(p.budgetRange, 60)}` : null,
    ].filter(Boolean).join(" · ");
    const notes = cap(p.notes ?? "", CAP.message);
    message = [`Booking request: ${parts}`, notes ? `Notes: ${notes}` : null].filter(Boolean).join(" — ");
  }

  if (!email && !phone) return json({ ok: false, error: "email or phone required" }, 400);

  // The same client the rate-limit gate above already opened; one connection,
  // not two, and the name the rest of this function expects.
  const sb = sbGate;

  // `raw` is the caller's entire request body, kept so an odd submission can be
  // read back later. Bounded here for the same reason every other field is: it
  // is attacker-chosen and it goes straight into a row.
  const rawKept = (() => {
    try {
      const text = JSON.stringify(raw);
      return text.length <= 8000 ? raw : { truncated: true, bytes: text.length, head: text.slice(0, 8000) };
    } catch {
      return { unserialisable: true };
    }
  })();

  // Upsert on email when present; otherwise insert a fresh contact.
  let contactId: string | undefined;
  if (email) {
    const { data: existing } = await sb.from("contacts").select("id").eq("email", email).maybeSingle();
    contactId = existing?.id;
  }
  if (!contactId) {
    const { data, error } = await sb.from("contacts").insert({
      full_name: fullName, email, phone, company, source,
      lifecycle_stage: "lead",
      consent_email: Boolean(p.consent_email ?? !!email),
      consent_sms: Boolean(p.consent_sms ?? false),
      meta: { message, raw: rawKept },
    }).select("id").single();
    if (error) return json({ ok: false, error: error.message }, 500);
    contactId = data.id;
  } else {
    await sb.from("contacts").update({
      full_name: fullName ?? undefined, phone: phone ?? undefined, company: company ?? undefined,
      meta: { message, raw: rawKept },
    }).eq("id", contactId);
  }

  await sb.from("activities").insert({
    contact_id: contactId, type: isAppointment ? "booking" : "note", direction: "inbound",
    subject: isAppointment ? "New booking request" : "New inquiry", body: message, meta: { source },
  });

  // For a booking, also open a deal in the pipeline.
  let dealId: string | undefined;
  if (isAppointment) {
    const amount = parseBudget(String(p.budgetRange ?? ""));
    const { data: deal } = await sb.from("deals").insert({
      contact_id: contactId,
      title: String(p.serviceTitle ?? p.serviceType ?? "Design project"),
      stage: "quoted",
      amount,
      event_date: (p.preferredDate as string | null) ?? null,
      details: {
        service_type: p.serviceType ?? null,
        time_slot: p.preferredTimeSlot ?? null,
        budget_range: p.budgetRange ?? null,
        appointment_id: p.id ?? null,
      },
    }).select("id").single();
    dealId = deal?.id;
  }

  // Tell them we got it, now.
  //
  // The follow-up below is written by the agent and waits for the owner to
  // approve it, which is right for a considered reply and wrong for an
  // acknowledgement: someone who books at 11pm should not sit in silence until
  // morning wondering whether the form worked. This is a fixed template, not
  // model output — it needs no approval because it promises nothing and says
  // only what is already true.
  //
  // It never fails the booking. The lead is already saved by this point, and a
  // mail provider being down is not a reason to tell a client their booking
  // did not go through.
  if (email) {
    try {
      const recent = new Date(Date.now() - 10 * 60_000).toISOString();
      const { count: alreadySent } = await sb
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("contact_id", contactId)
        .eq("meta->>reason", "booking_confirmation")
        .gte("created_at", recent);

      // A ceiling the whole site shares, not just this caller. The per-address
      // limit above stops one machine; this stops a thousand of them, and it is
      // the difference between a bad afternoon and a burned sending domain.
      const dayAgo = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
      const { count: sentToday } = await sb
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("meta->>reason", "booking_confirmation")
        .gte("created_at", dayAgo);
      const underDailyCap = (sentToday ?? 0) < MAX_ACKS_PER_DAY;

      // A double-submitted form should not send two confirmations.
      if (!alreadySent && underDailyCap) {
        const profile = await sb.from("settings").select("value").eq("key", "business_profile").maybeSingle();
        const studio = String((profile.data?.value as { name?: string } | null)?.name ?? "Meridian Interface");
        const website = String((profile.data?.value as { website?: string } | null)?.website ?? "");

        const first = String(fullName ?? "").trim().split(/\s+/)[0] || "there";
        const when = isAppointment && p.preferredDate
          ? `${p.preferredDate}${p.preferredTimeSlot ? ` at ${p.preferredTimeSlot}` : ""}`
          : "";

        const subject = isAppointment
          ? `We have your booking request${when ? ` for ${when}` : ""}`
          : "We have your message";

        const body = [
          `Hi ${first},`,
          "",
          isAppointment
            ? `Thanks for booking with ${studio}. We have your request${when ? ` for ${when}` : ""} and it is in front of us now.`
            : `Thanks for getting in touch with ${studio}. Your message is in front of us now.`,
          "",
          isAppointment
            ? "This is an automatic acknowledgement so you know the form worked. A person will confirm the time with you and answer anything you asked \u2014 that reply comes from a human, not this message."
            : "This is an automatic acknowledgement so you know the form worked. A person will read it and reply.",
          "",
          website ? `In the meantime, everything we do and what it costs is published at ${website}.` : "",
          "",
          studio,
        ].filter((line) => line !== null).join("\n");

        const res = await sendEmail({ to: email, subject, body });

        // Recorded either way, and honestly: `sent` only when a provider took
        // it. With no provider configured this is a draft that says why.
        await sb.from("messages").insert({
          contact_id: contactId,
          channel: "email",
          direction: "outbound",
          to_addr: email,
          subject,
          body,
          status: res.ok && !res.mocked ? "sent" : "draft",
          sent_at: res.ok && !res.mocked ? new Date().toISOString() : null,
          meta: {
            reason: "booking_confirmation",
            mocked: res.mocked,
            automatic: true,
            ...(res.mocked
              ? { not_connected: "no email provider connected \u2014 set SENDGRID_API_KEY and SENDGRID_FROM_EMAIL" }
              : {}),
            ...(res.error ? { error: res.error } : {}),
          },
        });
      }
    } catch (err) {
      // Logged, never raised: the booking is already safe.
      console.error("booking confirmation failed:", err instanceof Error ? err.message : String(err));
    }
  }

  // Queue a follow-up (deduped so repeat submissions don't stack).
  await sb.from("tasks").upsert(
    { type: "follow_up_lead", payload: { contact_id: contactId }, priority: 50, dedupe_key: `follow_up_lead:${contactId}` },
    { onConflict: "dedupe_key", ignoreDuplicates: true },
  );

  return json({ ok: true, contact_id: contactId, deal_id: dealId ?? null });
});

// Parse the low end of a budget range like "$3,000 - $5,000" -> 3000.
function parseBudget(s: string): number | null {
  const m = s.replace(/,/g, "").match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}
