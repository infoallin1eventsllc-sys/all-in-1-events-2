// Tell Otis a booking arrived.
//
// Nothing in this system did. A client would save products on the site, send
// the list, get their acknowledgement — and the studio found out only if
// somebody happened to open the portal. Otis believed he was being emailed;
// he was not.
//
// This runs on pg_cron rather than inside `intake` on purpose. `intake` is 343
// lines on the hot path of a booking, and redeploying it from a web session
// means re-sending every line through a model, which is how a silent
// transcription error reaches the one endpoint a client's booking depends on.
// A two-minute delay on an alert costs nothing; a corrupted intake costs the
// booking. So the alert is its own small function, and intake is left alone.
//
// It carries the items the client picked and NO PRICE, because it cannot know
// one — what the work costs is decided by Meridian Interface staff, in the
// invoice, after the conversation. If the CLIENT typed a figure in their own
// note it is passed through unchanged: that is information Otis needs, and the
// database rule that normally refuses a message naming money exempts this one
// precisely because it goes to his address and nowhere else.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { serviceClient, getSetting } from "../_shared/supabase.ts";
import { json, corsHeaders } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";
import { authorizedRun } from "../_shared/runauth.ts";

/** How far back to consider a booking worth alerting on.
 *
 *  Bounded so that switching this on, or turning it back on after an outage,
 *  never floods the inbox with every booking the CRM has ever held. Anything
 *  older than this is history, and history is what the portal is for. */
const LOOKBACK_HOURS = 24;

/** Most alerts to send in one pass. A real day never approaches this; a bad
 *  loop would, and a cap is cheaper than an apology to a mail provider. */
const MAX_PER_RUN = 20;

const DEFAULT_OWNER_EMAIL = "otis@meridianinterface.com";
const PORTAL_HINT = "Open the portal and look under Saved Lists to price it.";

async function ownerEmail(sb: SupabaseClient): Promise<string> {
  const s = await getSetting<{ email?: string }>(sb, "owner_notify", {});
  return (s.email ?? "").trim() || DEFAULT_OWNER_EMAIL;
}

// deno-lint-ignore no-explicit-any
function alertBody(contact: any, activity: any): string {
  const payload = contact?.meta?.raw?.payload ?? {};
  const note = String(payload.notes ?? "").trim();

  const who = [
    contact?.full_name ? `Name    : ${contact.full_name}` : null,
    contact?.company ? `Company : ${contact.company}` : null,
    contact?.email ? `Email   : ${contact.email}` : null,
    contact?.phone ? `Phone   : ${contact.phone}` : null,
    payload.id ? `Ref     : ${payload.id}` : null,
  ].filter(Boolean).join("\n");

  return [
    "A client sent you their saved list.",
    "",
    who,
    "",
    "WHAT THEY PICKED",
    // The note is already formatted by the site (bucketAsNote). Passing it
    // through whole means a format this function has never seen still arrives
    // readable, rather than being parsed into nothing.
    note || "(no items were attached to this booking)",
    "",
    PORTAL_HINT,
    "",
    "— Meridian Interface",
  ].join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = serviceClient();
  if (!(await authorizedRun(req, sb))) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const since = new Date(Date.now() - LOOKBACK_HOURS * 3600_000).toISOString();

  const { data: activities, error: actErr } = await sb
    .from("activities")
    .select("id, contact_id, occurred_at")
    .eq("subject", "New booking request")
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: true })
    .limit(MAX_PER_RUN);

  if (actErr) return json({ ok: false, error: actErr.message }, 500);
  if (!activities?.length) return json({ ok: true, sent: 0, considered: 0 });

  // One alert per booking, ever. Keyed on the activity rather than the contact,
  // because a returning client is upserted onto the same contact row and their
  // second booking deserves its own alert.
  const { data: already } = await sb
    .from("messages")
    .select("meta")
    .eq("meta->>reason", "owner_booking_alert")
    .gte("created_at", since);

  const alerted = new Set(
    (already ?? []).map((m) => String((m.meta as { activity_id?: string })?.activity_id ?? "")),
  );

  const pending = activities.filter((a) => !alerted.has(String(a.id)));
  if (!pending.length) return json({ ok: true, sent: 0, considered: activities.length });

  const to = await ownerEmail(sb);
  const { data: contacts } = await sb
    .from("contacts")
    .select("id, full_name, email, phone, company, meta")
    .in("id", [...new Set(pending.map((a) => a.contact_id).filter(Boolean))]);
  const byId = new Map((contacts ?? []).map((c) => [c.id, c]));

  let sent = 0;
  for (const activity of pending) {
    const contact = byId.get(String(activity.contact_id));
    const body = alertBody(contact, activity);
    const subject = `New booking — ${contact?.full_name ?? "a client"} sent their saved list`;

    const res = await sendEmail({ to, subject, body });

    // Recorded either way, and honestly: `sent` only when a provider took it.
    // A row claiming delivery that never happened is worse than no row, because
    // the dedupe above would then suppress the retry forever.
    const { error: insErr } = await sb.from("messages").insert({
      contact_id: activity.contact_id,
      channel: "email",
      direction: "outbound",
      to_addr: to,
      subject,
      body,
      status: res.ok && !res.mocked ? "sent" : "draft",
      sent_at: res.ok && !res.mocked ? new Date().toISOString() : null,
      meta: {
        reason: "owner_booking_alert",
        automatic: true,
        activity_id: activity.id,
        mocked: res.mocked,
        ...(res.mocked ? { not_connected: "no email provider connected" } : {}),
        ...(res.error ? { error: res.error } : {}),
      },
    });

    // A failed insert must not be silent: without the row the next run would
    // send the same alert again, every two minutes, forever.
    if (insErr) console.error("owner alert row failed:", insErr.message);
    else if (res.ok && !res.mocked) sent++;
  }

  return json({ ok: true, sent, considered: activities.length, pending: pending.length });
});
