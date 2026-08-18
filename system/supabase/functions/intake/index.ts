// Intake — public webhook that captures a lead (e.g. from the website inquiry
// form) into the CRM, logs the activity, and enqueues a follow-up.
// Public endpoint (verify_jwt = false); protected by an optional shared secret
// in the `x-webhook-secret` header (set WEBHOOK_SECRET to enforce).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { json, corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const secret = Deno.env.get("WEBHOOK_SECRET");
  if (secret && req.headers.get("x-webhook-secret") !== secret) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: "invalid JSON" }, 400);
  }

  const email = String(payload.email ?? "").trim().toLowerCase() || null;
  const fullName = (payload.name ?? payload.full_name ?? null) as string | null;
  const phone = (payload.phone ?? null) as string | null;
  const message = (payload.message ?? payload.details ?? null) as string | null;
  const source = (payload.source ?? "website") as string;

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
      full_name: fullName, email, phone, source,
      lifecycle_stage: "lead",
      consent_email: Boolean(payload.consent_email ?? !!email),
      consent_sms: Boolean(payload.consent_sms ?? false),
      meta: { message, raw: payload },
    }).select("id").single();
    if (error) return json({ ok: false, error: error.message }, 500);
    contactId = data.id;
  } else {
    await sb.from("contacts").update({
      full_name: fullName ?? undefined, phone: phone ?? undefined,
      meta: { message, raw: payload },
    }).eq("id", contactId);
  }

  await sb.from("activities").insert({
    contact_id: contactId, type: "note", direction: "inbound",
    subject: "New inquiry", body: message, meta: { source },
  });

  // Queue a follow-up (deduped so repeat submissions don't stack).
  await sb.from("tasks").upsert(
    { type: "follow_up_lead", payload: { contact_id: contactId }, priority: 50, dedupe_key: `follow_up_lead:${contactId}` },
    { onConflict: "dedupe_key", ignoreDuplicates: true },
  );

  return json({ ok: true, contact_id: contactId });
});
