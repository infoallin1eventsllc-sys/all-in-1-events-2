// Intake — public webhook that captures a lead into the CRM, logs the activity,
// and enqueues a follow-up. Accepts either a flat contact shape
//   { name, email, phone, message, source }
// or the Meridian website's booking envelope
//   { type: "appointment", payload: { clientName, clientEmail, clientPhone,
//     companyName, serviceType, serviceTitle, preferredDate, preferredTimeSlot,
//     budgetRange, notes, ... } }
// Public endpoint (verify_jwt = false); protected by an optional shared secret
// in the `x-webhook-secret` header (set WEBHOOK_SECRET to enforce; a browser
// form can't keep a secret, so the checks below are what guard it there):
//   - body capped at 16 KB, fields trimmed to sane lengths, email format checked
//   - honeypot: a filled `bot-field` / `website` field is accepted and dropped
//   - at most RATE_PER_HOUR submissions per client IP (stored hashed)
//   - an existing contact is never overwritten: known fields stay, new ones fill blanks
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

  let raw: Record<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return json({ ok: false, error: "request too large" }, 413);
    raw = JSON.parse(text);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("not an object");
  } catch {
    return json({ ok: false, error: "invalid JSON" }, 400);
  }

  // Unwrap the { type, payload } envelope the site uses; else treat as flat.
  const isEnvelope = !!raw && typeof raw === "object" && "payload" in raw && !!raw.payload && typeof raw.payload === "object" && !Array.isArray(raw.payload);
  const p = (isEnvelope ? raw.payload : raw) as Record<string, unknown>;
  const kind = str(raw.type, 40) ?? "";
  const isAppointment = kind === "appointment";

  // Bots fill every field; people never see these. Answer as if it worked.
  if (str(p["bot-field"] ?? p.website, 200)) return json({ ok: true, contact_id: null, deal_id: null });

  const email = str(p.email ?? p.clientEmail, 254)?.toLowerCase() ?? null;
  const fullName = str(p.name ?? p.full_name ?? p.clientName, 120);
  const phone = str(p.phone ?? p.clientPhone, 40);
  const company = str(p.company ?? p.companyName, 160);
  const source = str(p.source, 80) ?? (isAppointment ? "meridian-website:booking" : "meridian-website");
  if (email && !EMAIL_RE.test(email)) return json({ ok: false, error: "invalid email" }, 400);
  if (phone && !/^[+\d][\d\s().-]{5,}$/.test(phone)) return json({ ok: false, error: "invalid phone" }, 400);

  // Build a readable message. For bookings, summarise the request.
  let message = str(p.message ?? p.details ?? p.notes, 4000);
  if (isAppointment) {
    const parts = [
      str(p.serviceTitle ?? p.serviceType, 160),
      str(p.preferredDate, 40) ? `on ${str(p.preferredDate, 40)}` : null,
      str(p.preferredTimeSlot, 60),
      str(p.budgetRange, 60) ? `budget ${str(p.budgetRange, 60)}` : null,
    ].filter(Boolean).join(" · ");
    message = [`Booking request: ${parts}`, str(p.notes, 4000) ? `Notes: ${str(p.notes, 4000)}` : null].filter(Boolean).join(" — ");
  }

  if (!email && !phone) return json({ ok: false, error: "email or phone required" }, 400);

  const sb = serviceClient();

  // Rate limit per client IP (hashed: the raw address isn't kept).
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "";
  const ipHash = ip ? await sha256(`intake:${ip}`) : null;
  if (ipHash) {
    const { count } = await sb.from("activities").select("id", { count: "exact", head: true })
      .eq("meta->>ip_hash", ipHash).gte("occurred_at", new Date(Date.now() - 3600_000).toISOString());
    if ((count ?? 0) >= RATE_PER_HOUR) return json({ ok: false, error: "too many submissions; try again later" }, 429);
  }
  // Keep only the known fields of the submission, not whatever else was posted.
  const submitted = { type: kind || null, name: fullName, email, phone, company, source, message };

  // Upsert on email when present; otherwise insert a fresh contact.
  let contactId: string | undefined;
  // deno-lint-ignore no-explicit-any
  let existing: any = null;
  if (email) {
    const { data } = await sb.from("contacts").select("id, full_name, phone, company, meta").eq("email", email).maybeSingle();
    existing = data;
    contactId = data?.id;
  }
  if (!contactId) {
    const { data, error } = await sb.from("contacts").insert({
      full_name: fullName, email, phone, company, source,
      lifecycle_stage: "lead",
      // Someone who wrote in with an email expects a reply by email; SMS needs an explicit opt-in.
      consent_email: p.consent_email === undefined ? !!email : p.consent_email === true,
      consent_sms: p.consent_sms === true,
      meta: { message, via: "intake", submitted },
    }).select("id").single();
    if (error) { console.error("intake: contact insert", error.message); return json({ ok: false, error: "could not save" }, 500); }
    contactId = data.id;
  } else {
    // Anyone can post any address, so a submission never replaces what we know
    // about an existing contact: it only fills blanks, and the message is logged
    // as an activity below.
    const fill: Record<string, unknown> = {};
    if (!existing.full_name && fullName) fill.full_name = fullName;
    if (!existing.phone && phone) fill.phone = phone;
    if (!existing.company && company) fill.company = company;
    fill.meta = { ...(existing.meta ?? {}), message, last_submitted: submitted };
    await sb.from("contacts").update(fill).eq("id", contactId);
  }

  await sb.from("activities").insert({
    contact_id: contactId, type: isAppointment ? "booking" : "note", direction: "inbound",
    subject: isAppointment ? "New booking request" : "New inquiry", body: message,
    meta: { source, via: "intake", ip_hash: ipHash },
  });

  // For a booking, also open a deal in the pipeline.
  let dealId: string | undefined;
  if (isAppointment) {
    const amount = parseBudget(String(p.budgetRange ?? ""));
    const { data: deal } = await sb.from("deals").insert({
      contact_id: contactId,
      title: str(p.serviceTitle ?? p.serviceType, 160) ?? "Design project",
      stage: "quoted",
      amount,
      event_date: /^\d{4}-\d{2}-\d{2}$/.test(str(p.preferredDate, 10) ?? "") ? str(p.preferredDate, 10) : null,
      details: {
        service_type: str(p.serviceType, 160),
        time_slot: str(p.preferredTimeSlot, 60),
        budget_range: str(p.budgetRange, 60),
        appointment_id: str(p.id, 80),
      },
    }).select("id").single();
    dealId = deal?.id;
  }

  // Queue a follow-up, deduped per contact per day: repeat submissions don't
  // stack, but a returning customer's new inquiry on a later day is followed up.
  const day = new Date().toISOString().slice(0, 10);
  await sb.from("tasks").upsert(
    { type: "follow_up_lead", payload: { contact_id: contactId }, priority: 50, dedupe_key: `follow_up_lead:${contactId}:${day}` },
    { onConflict: "dedupe_key", ignoreDuplicates: true },
  );

  return json({ ok: true, contact_id: contactId, deal_id: dealId ?? null });
});

const MAX_BODY = 16_000;
const RATE_PER_HOUR = 5;
const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;

/** A trimmed string of at most `max` characters, or null. Non-strings (objects, arrays) are ignored. */
function str(v: unknown, max: number): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  // Drop control characters (they also break the XHTML dashboard) and trim.
  const t = String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  return t ? t.slice(0, max) : null;
}

async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Parse the low end of a budget range like "$3,000 - $5,000" -> 3000.
function parseBudget(s: string): number | null {
  const m = s.replace(/,/g, "").match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}
