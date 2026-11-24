// Live Cards: the owner's moderation desk. Read reports, find a card, take it
// down or restore it, set a plan by hand, remove an account's uploaded files.
// NOT DEPLOYED. Written and tested on 24 Nov 2026; Otis decides when it goes live.
//
// What keeps this safe:
//   - Every request must carry a valid owner session token, the same one the
//     Studio portal uses (passcode, plus the code when two-step is on). There
//     is no action a visitor or a Live Cards client can run here.
//   - It is the only place outside the payment webhook that can change a plan
//     or a block, and every change is written to the security log.
//   - Inputs are checked for shape before they reach the database. Search
//     text is reduced to letters, numbers, spaces and dashes.
//   - Client emails are shown only here, to the owner. They are never part of
//     a public card unless the client typed one onto it.
//
// Deploy with verify_jwt = false (it does its own owner check, like `leads`).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { allow, callerKey } from "../_shared/ratelimit.ts";
import { ownerTokenValid, tokenFrom } from "../_shared/ownertoken.ts";
import { clientHash, logEvent } from "../_shared/security.ts";

const BUCKET = "live-cards";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_CALLS_PER_HOUR = 600;

type Card = { id: string; owner: string; slug: string; data: Record<string, unknown>; published: boolean; blocked: boolean; updated_at: string };

const fail = (error: string, status = 400) => json({ ok: false, error }, status);

async function emailOf(sb: SupabaseClient, userId: string): Promise<string | null> {
  try {
    const { data } = await sb.auth.admin.getUserById(userId);
    return data?.user?.email ?? null;
  } catch {
    return null;
  }
}

async function shape(sb: SupabaseClient, cards: Card[]) {
  const owners = [...new Set(cards.map((c) => c.owner))];
  const { data: accts } = owners.length
    ? await sb.from("lc_accounts").select("user_id, plan, blocked, stripe_subscription_id").in("user_id", owners)
    : { data: [] };
  const acct = new Map((accts ?? []).map((a) => [a.user_id, a]));
  const emails = new Map(await Promise.all(owners.map(async (o) => [o, await emailOf(sb, o)] as const)));
  return cards.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: String(c.data?.name ?? ""),
    company: String(c.data?.company ?? ""),
    published: c.published,
    blocked: c.blocked || acct.get(c.owner)?.blocked === true,
    updated_at: c.updated_at,
    account: {
      id: c.owner,
      email: emails.get(c.owner) ?? null,
      plan: acct.get(c.owner)?.plan ?? "free",
      pays_through_stripe: !!acct.get(c.owner)?.stripe_subscription_id,
    },
  }));
}

async function removeFiles(sb: SupabaseClient, userId: string): Promise<number> {
  const { data: files, error } = await sb.storage.from(BUCKET).list(userId, { limit: 100 });
  if (error) throw new Error(error.message);
  const paths = (files ?? []).map((f) => `${userId}/${f.name}`);
  if (!paths.length) return 0;
  const { error: delErr } = await sb.storage.from(BUCKET).remove(paths);
  if (delErr) throw new Error(delErr.message);
  return paths.length;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("POST only", 405);
  if (Number(req.headers.get("content-length") ?? "0") > 4096) return fail("too large", 413);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("invalid JSON");
  }

  const sb = serviceClient();
  if (!(await allow(sb, await callerKey(req, "lc-admin"), MAX_CALLS_PER_HOUR))) return fail("too_many_requests", 429);

  // Nothing here is for visitors or clients. No token, no answer.
  if (!(await ownerTokenValid(tokenFrom(req, body)))) return fail("unauthorized", 401);

  const action = String(body.action ?? "");
  const device = await clientHash(req).catch(() => null);

  try {
    switch (action) {
      case "overview": {
        const count = async (table: string, col: string, val: unknown) => {
          const q = sb.from(table).select("*", { count: "exact", head: true });
          const { count: n, error } = await (col ? q.eq(col, val) : q);
          if (error) throw new Error(error.message);
          return n ?? 0;
        };
        return json({
          ok: true,
          cards: await count("lc_cards", "", null),
          published: await count("lc_cards", "published", true),
          blocked_accounts: await count("lc_accounts", "blocked", true),
          paid_accounts: await count("lc_accounts", "plan", "pro"),
          open_reports: await count("lc_reports", "handled", false),
        });
      }

      case "reports": {
        const all = body.show === "all";
        let q = sb.from("lc_reports").select("id, slug, reason, handled, created_at").order("created_at", { ascending: false }).limit(100);
        if (!all) q = q.eq("handled", false);
        const { data: reports, error } = await q;
        if (error) throw new Error(error.message);
        const slugs = [...new Set((reports ?? []).map((r) => r.slug))];
        const { data: cards } = slugs.length
          ? await sb.from("lc_cards").select("id, owner, slug, data, published, blocked, updated_at").in("slug", slugs)
          : { data: [] };
        const bySlug = new Map((await shape(sb, (cards ?? []) as Card[])).map((c) => [c.slug, c]));
        return json({ ok: true, reports: (reports ?? []).map((r) => ({ ...r, card: bySlug.get(r.slug) ?? null })) });
      }

      case "report_done": {
        const id = Number(body.id);
        if (!Number.isSafeInteger(id) || id < 1) return fail("bad report id");
        const { error } = await sb.from("lc_reports").update({ handled: body.handled !== false }).eq("id", id);
        if (error) throw new Error(error.message);
        return json({ ok: true });
      }

      case "cards": {
        const q = String(body.q ?? "").toLowerCase().replace(/[^a-z0-9 -]/g, "").trim().slice(0, 40);
        const cols = "id, owner, slug, data, published, blocked, updated_at";
        let found: Card[] = [];
        if (!q) {
          const { data, error } = await sb.from("lc_cards").select(cols).order("updated_at", { ascending: false }).limit(30);
          if (error) throw new Error(error.message);
          found = (data ?? []) as Card[];
        } else {
          const [a, b] = await Promise.all([
            sb.from("lc_cards").select(cols).ilike("slug", `%${q.replace(/ /g, "-")}%`).limit(30),
            sb.from("lc_cards").select(cols).ilike("data->>name", `%${q}%`).limit(30),
          ]);
          if (a.error || b.error) throw new Error((a.error ?? b.error)!.message);
          const seen = new Set<string>();
          for (const c of [...(a.data ?? []), ...(b.data ?? [])] as Card[]) if (!seen.has(c.id)) { seen.add(c.id); found.push(c); }
        }
        return json({ ok: true, cards: await shape(sb, found.slice(0, 30)) });
      }

      case "take_down":
      case "restore": {
        const cardId = String(body.card_id ?? "");
        if (!UUID.test(cardId)) return fail("bad card id");
        const blocked = action === "take_down";
        const { error } = await sb.rpc("lc_set_blocked", { p_card: cardId, p_blocked: blocked });
        if (error) return fail(error.code === "P0002" ? "That card no longer exists." : "Could not change the card. Try again.", error.code === "P0002" ? 404 : 500);
        await logEvent(sb, blocked ? "lc_card_taken_down" : "lc_card_restored", device, { card: cardId });
        return json({ ok: true, blocked });
      }

      case "set_plan": {
        const userId = String(body.user_id ?? "");
        const plan = String(body.plan ?? "");
        if (!UUID.test(userId)) return fail("bad account id");
        if (plan !== "free" && plan !== "pro") return fail("plan must be free or pro");
        const { data: before } = await sb.from("lc_accounts").select("plan, stripe_subscription_id").eq("user_id", userId).maybeSingle();
        const { error } = await sb.from("lc_accounts").upsert({ user_id: userId, plan }, { onConflict: "user_id" });
        if (error) throw new Error(error.message);
        await logEvent(sb, "lc_plan_set_by_owner", device, { account: userId, from: before?.plan ?? "free", to: plan });
        // Setting a plan here does not touch Stripe. If the client pays there, Stripe's next message will set the plan again.
        return json({ ok: true, plan, pays_through_stripe: !!before?.stripe_subscription_id });
      }

      case "remove_files": {
        const userId = String(body.user_id ?? "");
        if (!UUID.test(userId)) return fail("bad account id");
        const removed = await removeFiles(sb, userId);
        await logEvent(sb, "lc_files_removed", device, { account: userId, removed });
        return json({ ok: true, removed });
      }

      default:
        return fail("unknown action");
    }
  } catch (err) {
    console.error("lc-admin failed:", action, err instanceof Error ? err.message : String(err));
    return fail("Something went wrong. Try again in a moment.", 500);
  }
});
