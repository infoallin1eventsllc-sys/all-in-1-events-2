// Intake — public webhook that captures a lead into the CRM, logs the activity,
// and enqueues a follow-up. Accepts either a flat contact shape
//   { name, email, phone, message, source }
// or the Meridian website's booking envelope
//   { type: "appointment", payload: { clientName, clientEmail, clientPhone,
//     companyName, serviceType, serviceTitle, preferredDate, preferredTimeSlot,
//     budgetRange, notes, ... } }
// Public endpoint (verify_jwt = false); protected by an optional shared secret
// in the `x-webhook-secret` header (set WEBHOOK_SECRET to enforce).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { json, corsHeaders } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const secret = Deno.env.get("WEBHOOK_SECRET");
  if (secret && req.headers.get("x-webhook-secret") !== secret) {
    return json({ ok: false, error: "unauthorized" }, 401);
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

  const email = String((p.email ?? p.clientEmail ?? "") as string).trim().toLowerCase() || null;
  const fullName = (p.name ?? p.full_name ?? p.clientName ?? null) as string | null;
  const phone = (p.phone ?? p.clientPhone ?? null) as string | null;
  const company = (p.company ?? p.companyName ?? null) as string | null;
  const source = (p.source ?? (isAppointment ? "meridian-website:booking" : "meridian-website")) as string;

  // Build a readable message. For bookings, summarise the request.
  let message = (p.message ?? p.details ?? p.notes ?? null) as string | null;
  if (isAppointment) {
    const parts = [
      p.serviceTitle ?? p.serviceType,
      p.preferredDate ? `on ${p.preferredDate}` : null,
      p.preferredTimeSlot,
      p.budgetRange ? `budget ${p.budgetRange}` : null,
    ].filter(Boolean).join(" · ");
    message = [`Booking request: ${parts}`, p.notes ? `Notes: ${p.notes}` : null].filter(Boolean).join(" — ");
  }

  if (!email && !phone) return json({ ok: false, error: "email or phone required" }, 400);

  const sb = serviceClient();

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
      meta: { message, raw },
    }).select("id").single();
    if (error) return json({ ok: false, error: error.message }, 500);
    contactId = data.id;
  } else {
    await sb.from("contacts").update({
      full_name: fullName ?? undefined, phone: phone ?? undefined, company: company ?? undefined,
      meta: { message, raw },
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

      // A double-submitted form should not send two confirmations.
      if (!alreadySent) {
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
