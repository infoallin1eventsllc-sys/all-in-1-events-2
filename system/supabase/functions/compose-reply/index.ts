// Assemble the reply to a client's saved list, out of Otis's own answers.
//
// The client picks products on the site and sends the list. This matches each
// picked item to the Client Answer written for it — the one that says what the
// work includes and, just as importantly, what it does not — and builds a reply
// ready for Otis to read, edit and send.
//
// WHY THERE IS NO MODEL CALL HERE.
//
// The obvious build is "ask Claude to write it". It would be worse. The
// explainers in settings.client_explainers are already client-facing prose
// that Otis wrote and approved; the job is choosing which ones apply, not
// composing new sentences. Handing that text to a model to paraphrase adds one
// real risk — an invented commitment, a timeline, a figure — in exchange for
// nothing, because the words are already right. Assembly is deterministic,
// testable, costs no tokens, and cannot hallucinate a price into a client's
// inbox. If a warmer opening paragraph is wanted later, that is a small
// addition on top of this, not a reason to generate the whole thing.
//
// NOTHING HERE SENDS. Every row is written as `draft`. The database rule
// require_owner_approval refuses to let an outbound message reach `queued` or
// `sent` without meta.approved_by = 'owner', which only the owner portal sets.
// This function could not send if it tried.
//
// NO PRICES. The explainer text carries none by design and the publish script
// refuses to ship any; this never reads the rate card at all.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { serviceClient, getSetting } from "../_shared/supabase.ts";
import { json, corsHeaders } from "../_shared/cors.ts";
import { authorizedRun } from "../_shared/runauth.ts";

/** Only look at recent bookings, so switching this on never drafts a reply to
 *  every lead the CRM has ever held. */
const LOOKBACK_HOURS = 72;
const MAX_PER_RUN = 10;

type Explainer = {
  id: string;
  title: string;
  matches: string[];
  summary: string;
  short: string;
  outcome: string;
  included: string[];
  excluded: string[];
};

type PickedItem = { title: string; detail: string | null };

/** Same parse as the `leads` function: this reads the note the site composed. */
function parseNote(note: string): { items: PickedItem[]; saidByClient: string | null } {
  if (!note) return { items: [], saidByClient: null };
  const [itemBlock, ...saidParts] = note.split("\nWhat they said:\n");
  const saidByClient = saidParts.length ? saidParts.join("\nWhat they said:\n").trim() || null : null;
  const items: PickedItem[] = [];
  for (const line of itemBlock.split("\n")) {
    const numbered = line.match(/^\s*\d+\.\s+(.*\S)\s*$/);
    if (!numbered) continue;
    const withDetail = numbered[1].match(/^(.*?)\s*\(([^()]*)\)$/);
    items.push(
      withDetail
        ? { title: withDetail[1].trim(), detail: withDetail[2].trim() || null }
        : { title: numbered[1].trim(), detail: null },
    );
  }
  return { items, saidByClient };
}

/**
 * Find the Client Answer written for a picked item.
 *
 * Longest fragment wins, which is the rule the explainer file itself states:
 * "complex custom web app" must beat "web app", or the specific answer loses to
 * the general one and the client is told less than Otis actually wrote.
 */
function explainerFor(item: PickedItem, explainers: Explainer[]): Explainer | null {
  const hay = `${item.title} ${item.detail ?? ""}`.toLowerCase();
  let best: Explainer | null = null;
  let bestLen = 0;
  for (const e of explainers) {
    for (const frag of e.matches ?? []) {
      const f = String(frag).toLowerCase();
      if (f && hay.includes(f) && f.length > bestLen) {
        best = e;
        bestLen = f.length;
      }
    }
  }
  return best;
}

function firstName(full: string | null): string {
  const n = String(full ?? "").trim().split(/\s+/)[0];
  return n || "there";
}

function composeBody(
  contact: { full_name?: string | null },
  items: PickedItem[],
  saidByClient: string | null,
  explainers: Explainer[],
  studio: string,
): { body: string; matched: string[]; unmatched: string[] } {
  const matched: string[] = [];
  const unmatched: string[] = [];
  const blocks: string[] = [];

  items.forEach((item, n) => {
    const e = explainerFor(item, explainers);
    const heading = `${n + 1}. ${e?.title ?? item.title}`;

    if (!e) {
      // No answer written for this one. Say so plainly rather than inventing a
      // description — Otis fills it in before sending, and an obvious gap is
      // far safer than a confident guess about his own product.
      unmatched.push(item.title);
      blocks.push(
        [heading, "", "[No Client Answer is written for this item yet — add a description before sending.]"].join("\n"),
      );
      return;
    }

    matched.push(e.id);
    const parts = [heading, "", e.short];
    if (e.included?.length) {
      parts.push("", "What this includes:", ...e.included.map((i) => `  - ${i}`));
    }
    if (e.excluded?.length) {
      // Kept in deliberately. Naming what is not covered, in writing, before
      // the work starts is what stops a fair question becoming a dispute later.
      parts.push("", "What it does not include:", ...e.excluded.map((i) => `  - ${i}`));
    }
    if (e.outcome) parts.push("", e.outcome);
    blocks.push(parts.join("\n"));
  });

  const body = [
    `Hi ${firstName(contact.full_name ?? null)},`,
    "",
    items.length === 1
      ? "Thanks for sending your list over. Here is what the item you picked involves."
      : `Thanks for sending your list over. Here is what each of the ${items.length} items you picked involves.`,
    "",
    ...blocks.flatMap((b) => [b, ""]),
    // null, not "" — the empty strings above ARE the blank lines between
    // paragraphs. Filtering on "" removed every one of them and produced a
    // wall of text with the greeting welded to the first sentence.
    saidByClient ? `You mentioned: "${saidByClient}"` : null,
    saidByClient ? "" : null,
    "I will come back to you with an itemised quote covering the items above, so you can see exactly what each line is for before deciding anything.",
    "",
    "If I have misread any of this, tell me and I will correct it before pricing it.",
    "",
    studio,
  ].filter((line) => line !== null).join("\n").replace(/\n{3,}/g, "\n\n");

  return { body, matched, unmatched };
}

async function studioName(sb: SupabaseClient): Promise<string> {
  const p = await getSetting<{ name?: string }>(sb, "business_profile", {});
  return (p.name ?? "").trim() || "Meridian Interface";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = serviceClient();
  if (!(await authorizedRun(req, sb))) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const cfg = await getSetting<{ items?: Explainer[] }>(sb, "client_explainers", {});
  const explainers = cfg.items ?? [];
  if (!explainers.length) {
    // Better to say nothing was drafted, and why, than to draft a reply with no
    // answers in it and have Otis discover that in front of a client.
    return json({ ok: false, error: "no client explainers published — run tools/publish-explainers.mjs" }, 503);
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
  if (!activities?.length) return json({ ok: true, drafted: 0, considered: 0 });

  // One draft per booking, ever. Keyed on the activity so a returning client's
  // second list gets its own reply rather than being treated as a duplicate.
  const { data: existing } = await sb
    .from("messages")
    .select("meta")
    .eq("meta->>reason", "saved_list_reply")
    .gte("created_at", since);
  const done = new Set(
    (existing ?? []).map((m) => String((m.meta as { activity_id?: string })?.activity_id ?? "")),
  );

  const pending = activities.filter((a) => !done.has(String(a.id)));
  if (!pending.length) return json({ ok: true, drafted: 0, considered: activities.length });

  const { data: contacts } = await sb
    .from("contacts")
    .select("id, full_name, email, meta")
    .in("id", [...new Set(pending.map((a) => a.contact_id).filter(Boolean))]);
  const byId = new Map((contacts ?? []).map((c) => [c.id, c]));
  const studio = await studioName(sb);

  let drafted = 0;
  const skipped: string[] = [];

  for (const activity of pending) {
    // deno-lint-ignore no-explicit-any
    const contact: any = byId.get(String(activity.contact_id));
    if (!contact?.email) { skipped.push("no email"); continue; }

    const note = String(contact.meta?.raw?.payload?.notes ?? "");
    const { items, saidByClient } = parseNote(note);
    // A booking with no saved items is an ordinary enquiry; the existing
    // follow-up path already handles those, and a reply listing nothing would
    // be worse than no reply.
    if (!items.length) { skipped.push("no items"); continue; }

    const { body, matched, unmatched } = composeBody(contact, items, saidByClient, explainers, studio);
    const subject = items.length === 1
      ? "About the item you picked"
      : `About the ${items.length} items you picked`;

    const { error: insErr } = await sb.from("messages").insert({
      contact_id: contact.id,
      channel: "email",
      direction: "outbound",
      to_addr: contact.email,
      subject,
      body,
      // Draft, always. Sending is the owner's act, and the database enforces it.
      status: "draft",
      meta: {
        reason: "saved_list_reply",
        activity_id: activity.id,
        composed_by: "explainer_assembly",
        explainers_used: matched,
        // Surfaced so the portal can warn before this goes out with a gap in it.
        items_without_an_answer: unmatched,
        appointment_id: contact.meta?.raw?.payload?.id ?? null,
      },
    });

    if (insErr) console.error("saved list reply insert failed:", insErr.message);
    else drafted++;
  }

  return json({ ok: true, drafted, considered: activities.length, pending: pending.length, skipped });
});
