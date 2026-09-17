// What the client actually picked — the half of the saved-list flow that was
// missing.
//
// A client saves products on the site, sends the list as a booking, and the
// items land correctly in contacts.meta.raw.payload.notes and in the booking
// activity. Nothing then showed them to Otis. No email is sent to the owner
// anywhere in this system, and the owner portal has no leads screen at all:
// its actions are invoices, content, messages and health. So the one question
// that has to be answered before an invoice can be written — what did they
// choose? — could only be answered by querying the database by hand.
//
// This is a separate function rather than more actions on `owner` for the same
// reason site-images is: `owner` is a large, money-adjacent surface, and
// adding to it means redeploying all of it. Same auth, smaller blast radius.
//
// verify_jwt = false: the browser calls this with the owner session token that
// `owner` issues after a passcode login, not a Supabase session. Every action
// here requires that token — this is client contact data, and none of it is
// public.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { json, corsHeaders } from "../_shared/cors.ts";
import { ownerTokenValid, tokenFrom } from "../_shared/ownertoken.ts";
import { allow, callerKey } from "../_shared/ratelimit.ts";

/** Calls allowed per caller per hour. The portal makes one per page view. */
const MAX_CALLS_PER_HOUR = 240;
const MAX_LIMIT = 100;

type PickedItem = { title: string; detail: string | null };

/**
 * Pull the saved items back out of the note the site composed.
 *
 * The format is this project's own (see bucketAsNote in the website's
 * src/lib/bucket.ts), so this is parsing our own output, not guessing at a
 * stranger's. It still has to fail softly: a note typed by hand, or written by
 * an older version of the site, must come back as an empty list and leave the
 * raw text intact rather than throwing and taking the whole lead list down.
 */
function parseNote(note: string): { items: PickedItem[]; saidByClient: string | null } {
  if (!note) return { items: [], saidByClient: null };

  const [itemBlock, ...saidParts] = note.split("\nWhat they said:\n");
  const saidByClient = saidParts.length ? saidParts.join("\nWhat they said:\n").trim() || null : null;

  const items: PickedItem[] = [];
  for (const line of itemBlock.split("\n")) {
    const numbered = line.match(/^\s*\d+\.\s+(.*\S)\s*$/);
    if (!numbered) continue;
    // The subtitle is the last parenthesised group at the end of the line.
    // Titles themselves contain em dashes and can contain brackets, so anchor
    // to the end rather than taking the first "(" found.
    const withDetail = numbered[1].match(/^(.*?)\s*\(([^()]*)\)$/);
    items.push(
      withDetail
        ? { title: withDetail[1].trim(), detail: withDetail[2].trim() || null }
        : { title: numbered[1].trim(), detail: null },
    );
  }
  return { items, saidByClient };
}

// deno-lint-ignore no-explicit-any
function shapeLead(contact: any, activity: any, deal: any) {
  const payload = contact?.meta?.raw?.payload ?? {};
  const note = String(payload.notes ?? "");
  const { items, saidByClient } = parseNote(note);

  return {
    appointmentId: payload.id ?? null,
    receivedAt: activity?.occurred_at ?? contact?.created_at ?? null,
    client: {
      name: contact?.full_name ?? payload.clientName ?? null,
      email: contact?.email ?? null,
      phone: contact?.phone ?? null,
      company: contact?.company ?? null,
    },
    // What they picked, ready to become invoice lines. Deliberately carries no
    // price: what each item costs is decided by Meridian Interface staff, in
    // the invoice, after the conversation.
    items,
    itemCount: items.length,
    saidByClient,
    rawNote: note || null,
    serviceTitle: payload.serviceTitle ?? null,
    preferredTimeSlot: payload.preferredTimeSlot ?? null,
    source: contact?.source ?? payload.source ?? null,
    contactId: contact?.id ?? null,
    deal: deal ? { id: deal.id, title: deal.title, stage: deal.stage } : null,
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

  if (!(await allow(sb, await callerKey(req, "leads"), MAX_CALLS_PER_HOUR))) {
    return json({ ok: false, error: "too_many_requests" }, 429);
  }

  // No unauthenticated action at all. Unlike site-images there is nothing here
  // a visitor has any business reading.
  if (!(await ownerTokenValid(tokenFrom(req, body)))) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const action = String(body.action ?? "list");

  if (action !== "list") return json({ ok: false, error: `unknown action ${action}` }, 400);

  const limit = Math.min(Math.max(Number(body.limit ?? 25) || 25, 1), MAX_LIMIT);
  const onlyWithItems = body.only_with_items === true;

  // Booking activities carry the time the request actually arrived; the
  // contact row may be older, because a returning client is upserted on email.
  const { data: activities, error: actErr } = await sb
    .from("activities")
    .select("id, contact_id, deal_id, subject, body, occurred_at")
    .eq("subject", "New booking request")
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (actErr) return json({ ok: false, error: actErr.message }, 500);
  if (!activities?.length) return json({ ok: true, leads: [], count: 0 });

  const contactIds = [...new Set(activities.map((a) => a.contact_id).filter(Boolean))];
  const dealIds = [...new Set(activities.map((a) => a.deal_id).filter(Boolean))];

  const [{ data: contacts }, { data: deals }] = await Promise.all([
    sb.from("contacts").select("id, full_name, email, phone, company, source, meta, created_at")
      .in("id", contactIds.length ? contactIds : ["00000000-0000-0000-0000-000000000000"]),
    dealIds.length
      ? sb.from("deals").select("id, title, stage").in("id", dealIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  // deno-lint-ignore no-explicit-any
  const byId = <T extends { id: string }>(rows: any[] | null) =>
    new Map<string, T>((rows ?? []).map((r) => [r.id, r as T]));
  const contactMap = byId(contacts);
  const dealMap = byId(deals as unknown[] as { id: string }[]);

  const leads = activities
    .map((a) =>
      shapeLead(
        contactMap.get(String(a.contact_id)),
        a,
        a.deal_id ? dealMap.get(String(a.deal_id)) : null,
      )
    )
    .filter((l) => (onlyWithItems ? l.itemCount > 0 : true));

  return json({ ok: true, leads, count: leads.length });
});
