// Owner portal backend — the Internal Invoice & Pricing Manager's server side.
//
// Why this exists: the portal used to check its passcode in the browser and
// keep invoices in localStorage. Vite inlines any VITE_-prefixed value into the
// shipped bundle, so the passcode was readable by anyone who opened the site's
// JavaScript, and the records lived on exactly one device with no backup.
//
// Here the passcode is compared against a Supabase secret that never leaves the
// server, and invoices sit in Postgres behind deny-by-default RLS, reachable
// only through the service-role client this function holds.
//
// Public endpoint (verify_jwt = false) because the browser calls it without a
// Supabase session. Its own auth is below: passcode -> short-lived signed
// token -> every other action requires that token.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { serviceClient } from "../_shared/supabase.ts";
import { json, corsHeaders } from "../_shared/cors.ts";

const SESSION_TTL_SECONDS = 60 * 60 * 8; // one working day
const MAX_FAILURES = 8;
const THROTTLE_WINDOW_MINUTES = 15;

/* ---------------------------------------------------------------- crypto -- */

/**
 * Signing key for session tokens. A dedicated OWNER_SESSION_SECRET is
 * preferred; otherwise derive from the service-role key, which is always
 * present in the edge runtime and never reaches a browser. Deriving rather than
 * using it directly means a leaked token cannot be reversed into the key.
 */
async function signingKey(): Promise<CryptoKey> {
  const material =
    Deno.env.get("OWNER_SESSION_SECRET") ??
    `owner-session|${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}`;
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(material),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const unb64url = (s: string) => {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function issueToken(): Promise<string> {
  const payload = JSON.stringify({ exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS });
  const body = b64url(new TextEncoder().encode(payload));
  const sig = await crypto.subtle.sign("HMAC", await signingKey(), new TextEncoder().encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

async function tokenValid(token: string | undefined): Promise<boolean> {
  if (!token || !token.includes(".")) return false;
  const [body, sig] = token.split(".");
  try {
    const ok = await crypto.subtle.verify(
      "HMAC",
      await signingKey(),
      unb64url(sig),
      new TextEncoder().encode(body),
    );
    if (!ok) return false;
    const { exp } = JSON.parse(new TextDecoder().decode(unb64url(body)));
    return typeof exp === "number" && exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

/** Compare without leaking how much of the passcode matched via timing. */
function constantTimeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  // Fold the length difference in rather than returning early on it.
  let diff = ab.length ^ bb.length;
  const n = Math.max(ab.length, bb.length);
  for (let i = 0; i < n; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

/** Salted hash of the caller IP — enough to throttle, not a visitor log. */
async function clientHash(req: Request): Promise<string> {
  const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const salt = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "salt";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}|${ip}`));
  return b64url(new Uint8Array(digest)).slice(0, 32);
}

/* ------------------------------------------------------------- mapping --- */

// deno-lint-ignore no-explicit-any
const rowToInvoice = (r: any) => ({
  id: r.id,
  clientName: r.client_name,
  clientCompany: r.client_company,
  clientEmail: r.client_email,
  clientPhone: r.client_phone,
  issueDate: r.issue_date,
  dueDate: r.due_date,
  lineItems: r.line_items ?? [],
  subtotal: Number(r.subtotal),
  discountPercentage: Number(r.discount_percentage),
  taxPercentage: Number(r.tax_percentage),
  totalAmount: Number(r.total_amount),
  status: r.status,
  notes: r.notes,
  isOwnerOnly: r.is_owner_only,
  createdAt: r.created_at,
});

// deno-lint-ignore no-explicit-any
const invoiceToRow = (i: any) => ({
  id: String(i.id),
  client_name: String(i.clientName ?? ""),
  client_company: String(i.clientCompany ?? ""),
  client_email: String(i.clientEmail ?? ""),
  client_phone: String(i.clientPhone ?? ""),
  issue_date: String(i.issueDate ?? ""),
  due_date: String(i.dueDate ?? ""),
  line_items: Array.isArray(i.lineItems) ? i.lineItems : [],
  subtotal: Number(i.subtotal ?? 0),
  discount_percentage: Number(i.discountPercentage ?? 0),
  tax_percentage: Number(i.taxPercentage ?? 0),
  total_amount: Number(i.totalAmount ?? 0),
  status: String(i.status ?? "Draft"),
  notes: String(i.notes ?? ""),
  is_owner_only: i.isOwnerOnly !== false,
  updated_at: new Date().toISOString(),
});

/* --------------------------------------------------------------- login --- */

async function handleLogin(sb: SupabaseClient, req: Request, passcode: unknown) {
  // Trim the stored secret. Supabase's secret Value field is a multi-line
  // textarea, so a trailing newline is easy to save by accident — and since the
  // submitted passcode is trimmed, an untrimmed secret could never match. That
  // failure is indistinguishable from a wrong passcode, which makes it a
  // miserable thing to debug. Leading/trailing whitespace in a passcode carries
  // no value worth this cost.
  const expected = Deno.env.get("OWNER_PASSCODE")?.trim();
  if (!expected) {
    // Say so plainly rather than rejecting every attempt as "wrong". A silent
    // permanent failure is exactly the bug this whole change exists to undo.
    return json({ ok: false, error: "not_configured" }, 503);
  }

  const hash = await clientHash(req);
  const since = new Date(Date.now() - THROTTLE_WINDOW_MINUTES * 60_000).toISOString();
  const { count } = await sb
    .from("owner_login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("client_hash", hash)
    .eq("succeeded", false)
    .gte("attempted_at", since);

  if ((count ?? 0) >= MAX_FAILURES) {
    return json({ ok: false, error: "too_many_attempts", retryAfterMinutes: THROTTLE_WINDOW_MINUTES }, 429);
  }

  const submitted = typeof passcode === "string" ? passcode.trim() : "";
  const ok = submitted.length > 0 && constantTimeEqual(submitted, expected);
  await sb.from("owner_login_attempts").insert({ client_hash: hash, succeeded: ok });

  if (!ok) {
    return json({ ok: false, error: "invalid_passcode", remaining: MAX_FAILURES - (count ?? 0) - 1 }, 401);
  }
  return json({ ok: true, token: await issueToken(), expiresIn: SESSION_TTL_SECONDS });
}

/* ---------------------------------------------------------------- serve --- */

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

  if (action === "login") return await handleLogin(sb, req, body.passcode);

  if (action === "status") {
    const secret = Deno.env.get("OWNER_PASSCODE")?.trim();
    return json({ ok: true, configured: !!secret });
  }

  // A deliberately non-revealing self-check: confirms the stored secret's shape
  // without disclosing it, so a login that can never succeed is diagnosable
  // without anyone reading the passcode aloud. It reports length, whether stray
  // whitespace was saved around it, and its first and last character — enough
  // to spot a paste mishap, far too little to reconstruct the value.
  if (action === "selfcheck") {
    const raw = Deno.env.get("OWNER_PASSCODE") ?? "";
    return json({
      ok: true,
      configured: raw.trim().length > 0,
      length: raw.trim().length,
      hadSurroundingWhitespace: raw !== raw.trim(),
      hasInnerWhitespace: /\s/.test(raw.trim()),
      firstChar: raw.trim().slice(0, 1),
      lastChar: raw.trim().slice(-1),
    });
  }

  // Everything past this point needs a valid session.
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "") ||
    String(body.token ?? "");
  if (!(await tokenValid(token))) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  switch (action) {
    case "health": {
      // What the machinery is doing, and what is wrong with it.
      //
      // The weekly report describes marketing. This describes the system that
      // does the marketing — schedules, queue, failures — plus Key Router,
      // which lives outside this project entirely and is therefore probed
      // rather than queried.
      const since = new Date(Date.now() - 24 * 3600_000).toISOString();

      const [alerts, runs, queue, content, messages, perf, agentCfg] = await Promise.all([
        sb.from("system_alerts").select("*").is("resolved_at", null)
          .order("last_seen", { ascending: false }),
        sb.from("agent_runs").select("status, summary, tasks_created, started_at, finished_at, error")
          .order("started_at", { ascending: false }).limit(5),
        sb.from("tasks").select("status"),
        sb.from("content_items").select("status"),
        sb.from("messages").select("status"),
        sb.from("settings").select("value").eq("key", "performance").maybeSingle(),
        sb.from("settings").select("value").eq("key", "agent").maybeSingle(),
      ]);

      const tally = (rows: { status: string }[] | null) => {
        const out: Record<string, number> = {};
        for (const r of rows ?? []) out[r.status] = (out[r.status] ?? 0) + 1;
        return out;
      };

      // Schedules, via a function that narrows cron's internals to what the
      // portal shows. `last_run` null means never, which is different from
      // stopped — the alert wording keeps that distinction.
      const { data: schedules } = await sb.rpc("cron_health");

      /* ---- Key Router ------------------------------------------------
         A separate service on separate infrastructure. When KEYROUTER_URL is
         unset it is not deployed, and saying "unreachable" would be wrong —
         there is nothing to reach. */
      const krUrl = Deno.env.get("KEYROUTER_URL");
      const krToken = Deno.env.get("KEYROUTER_AUTH_TOKEN");
      let keyrouter: Record<string, unknown>;
      if (!krUrl) {
        keyrouter = { state: "not_deployed",
          detail: "Key Router has not been deployed. The marketing system falls back to a direct Anthropic call, or to mock output when no key exists." };
      } else {
        const started = Date.now();
        try {
          const res = await fetch(`${krUrl.replace(/\/$/, "")}/v1/status`, {
            headers: krToken ? { authorization: `Bearer ${krToken}` } : {},
            signal: AbortSignal.timeout(5000),
          });
          const body = await res.json().catch(() => ({}));
          keyrouter = res.ok
            ? { state: "up", ms: Date.now() - started, fleet: body.keys ?? body.fleet ?? [] }
            : { state: "error", ms: Date.now() - started, status: res.status,
                detail: `Key Router answered ${res.status}. Marketing falls back to a direct call.` };
        } catch (err) {
          keyrouter = { state: "unreachable", ms: Date.now() - started,
            detail: `Could not reach Key Router: ${err instanceof Error ? err.message : String(err)}. Marketing falls back to a direct call, so nothing stops — but key rotation and metering are not happening.` };
        }
      }

      const agent = (agentCfg.data?.value ?? {}) as Record<string, unknown>;

      // A key being SET is not the same as a key that works — an invalid one
      // degrades to mock silently and everything keeps running. So mode is
      // decided by whether real output actually exists, not by configuration.
      const { count: realOutput } = await sb
        .from("content_items")
        .select("id", { count: "exact", head: true })
        .eq("meta->>mocked", "false");
      const keyConfigured = !!Deno.env.get("ANTHROPIC_API_KEY") || !!krUrl;
      const mode = (realOutput ?? 0) > 0 ? "live"
        : keyConfigured ? "configured_but_still_mocking" : "mock";

      return json({
        ok: true,
        generated_at: new Date().toISOString(),
        alerts: alerts.data ?? [],
        marketing: {
          mode,
          key_configured: keyConfigured,
          real_outputs: realOutput ?? 0,
          autonomy: agent.autonomy ?? "draft",
          model: agent.model ?? null,
          recent_runs: runs.data ?? [],
          errors_24h: (runs.data ?? []).filter((r) => r.status === "error" &&
            r.started_at > since).length,
          tasks: tally(queue.data),
          content: tally(content.data),
          messages: tally(messages.data),
          performance: perf.data?.value ?? null,
        },
        schedules: schedules ?? null,
        keyrouter,
      });
    }

    case "catalogue": {
      // The pricing catalogue: every rate, the benchmark tiers, and the
      // freelancer-vs-boutique-vs-agency comparison.
      //
      // This used to be imported straight into the website's source, which
      // meant it was compiled into the JavaScript every visitor downloads. No
      // public page rendered it — which is exactly why nobody noticed — but the
      // whole price list, and the competitive positioning with it, could be
      // read out of the bundle by anyone who opened it.
      //
      // It comes through here now, behind the same token that guards the
      // invoices, so a client sees a price when Otis sends one and not before.
      const { data, error } = await sb
        .from("settings").select("value").eq("key", "pricing_catalogue").maybeSingle();
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true, catalogue: data?.value ?? null });
    }

    case "list": {
      const { data, error } = await sb
        .from("owner_invoices")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true, invoices: (data ?? []).map(rowToInvoice) });
    }

    case "save": {
      const invoice = body.invoice as Record<string, unknown> | undefined;
      if (!invoice?.id) return json({ ok: false, error: "invoice.id required" }, 400);
      const { data, error } = await sb
        .from("owner_invoices")
        .upsert(invoiceToRow(invoice), { onConflict: "id" })
        .select("*")
        .single();
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true, invoice: rowToInvoice(data) });
    }

    case "delete": {
      const id = String(body.id ?? "");
      if (!id) return json({ ok: false, error: "id required" }, 400);
      const { error } = await sb.from("owner_invoices").delete().eq("id", id);
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true, deleted: id });
    }

    case "import": {
      // One-time lift of whatever is still sitting in a browser. Existing ids
      // win, so re-running it cannot clobber a server copy that has since been
      // edited.
      const list = Array.isArray(body.invoices) ? body.invoices : [];
      if (!list.length) return json({ ok: true, imported: 0 });
      const { data, error } = await sb
        .from("owner_invoices")
        .upsert(list.map(invoiceToRow), { onConflict: "id", ignoreDuplicates: true })
        .select("id");
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true, imported: data?.length ?? 0 });
    }

    /* ------------------------------------------------ marketing approvals -- */
    // The approval queue has had no button. The dashboard function cannot be
    // one — Supabase serves it as text/plain — and the CLI is not something
    // the owner opens. These actions are the button; the portal renders them.

    case "content_list": {
      const { data, error } = await sb
        .from("content_items")
        .select("id, channel, kind, title, body, image_url, status, meta, created_at, published_at, external_id")
        .in("status", ["pending_approval", "scheduled", "approved", "published", "failed"])
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) return json({ ok: false, error: error.message }, 500);
      const { data: chans } = await sb.from("channels").select("key, label");
      return json({ ok: true, items: data ?? [], channels: chans ?? [] });
    }

    case "content_approve": {
      const id = String(body.id ?? "");
      if (!id) return json({ ok: false, error: "id required" }, 400);
      const { data: item } = await sb.from("content_items").select("id, status, channel, meta").eq("id", id).maybeSingle();
      if (!item) return json({ ok: false, error: "not found" }, 404);
      if (!["pending_approval", "failed", "rejected"].includes(item.status)) {
        return json({ ok: false, error: `cannot approve an item that is ${item.status}` }, 409);
      }
      const { publish: _p, publish_pending: _q, ...meta } = (item.meta ?? {}) as Record<string, unknown>;
      await sb.from("content_items").update({
        status: "approved",
        meta: { ...meta, approved_at: new Date().toISOString(), approved_by: "owner" },
      }).eq("id", id);
      await sb.from("tasks").insert({ type: "publish_content", payload: { content_item_id: id }, priority: 20 });
      return json({ ok: true, id, status: "approved", queued: "publish_content" });
    }

    case "content_reject": {
      const id = String(body.id ?? "");
      if (!id) return json({ ok: false, error: "id required" }, 400);
      const reason = String(body.reason ?? "").slice(0, 300);
      const { data: item } = await sb.from("content_items").select("id, meta").eq("id", id).maybeSingle();
      if (!item) return json({ ok: false, error: "not found" }, 404);
      await sb.from("content_items").update({
        status: "rejected",
        meta: { ...((item.meta ?? {}) as Record<string, unknown>), rejected_reason: reason || "rejected by owner", rejected_at: new Date().toISOString() },
      }).eq("id", id);
      return json({ ok: true, id, status: "rejected" });
    }

    case "content_update": {
      // Edit the words before approving. A rendered video keeps its clip —
      // the caption under it changes, the on-screen text does not.
      const id = String(body.id ?? "");
      if (!id) return json({ ok: false, error: "id required" }, 400);
      const patch: Record<string, unknown> = {};
      if (typeof body.title === "string") patch.title = body.title.slice(0, 300);
      if (typeof body.body === "string") patch.body = body.body.slice(0, 5000);
      if (!Object.keys(patch).length) return json({ ok: false, error: "nothing to update" }, 400);
      const { data, error } = await sb.from("content_items").update(patch)
        .eq("id", id).eq("status", "pending_approval").select("id, title, body").maybeSingle();
      if (error) return json({ ok: false, error: error.message }, 500);
      if (!data) return json({ ok: false, error: "only items awaiting approval can be edited" }, 409);
      return json({ ok: true, item: data });
    }

    case "channels_status": {
      // Which platforms are wired. Booleans only — a credential's presence is
      // the owner's business, its value never leaves the server. Each entry
      // carries the one line that turns it on, so the portal can show it
      // beside the switch instead of sending him to a document.
      const { data } = await sb.from("settings").select("value").eq("key", "channels").maybeSingle();
      const stored = (data?.value ?? {}) as Record<string, string | undefined>;
      const has = (setting: string, env: string) => !!(Deno.env.get(env) || stored[setting]);
      const line = (k: string) => `select public.set_channel('${k}', 'PASTE_VALUE_HERE');`;
      return json({
        ok: true,
        connections: [
          { key: "video", label: "Video rendering (Shotstack)", connected: has("shotstack_api_key", "SHOTSTACK_API_KEY"),
            what: "Turns video scripts into 20-second branded clips for TikTok, Reels, Facebook and LinkedIn.",
            needs: ["shotstack_api_key"], lines: [line("shotstack_api_key")], signup: "https://shotstack.io" },
          { key: "tiktok", label: "TikTok", connected: has("tiktok_client_key", "TIKTOK_CLIENT_KEY") && has("tiktok_client_secret", "TIKTOK_CLIENT_SECRET") && has("tiktok_refresh_token", "TIKTOK_REFRESH_TOKEN"),
            what: "Posts approved videos to your TikTok account. Private-only until TikTok audits the app.",
            needs: ["tiktok_client_key", "tiktok_client_secret", "tiktok_refresh_token"],
            lines: [line("tiktok_client_key"), line("tiktok_client_secret"), line("tiktok_refresh_token")], signup: "https://developers.tiktok.com" },
          { key: "meta", label: "Instagram + Facebook", connected: has("meta_page_token", "META_PAGE_TOKEN") && has("meta_page_id", "META_PAGE_ID"),
            what: "Posts and Reels to Instagram, posts and video to your Facebook Page.",
            needs: ["meta_page_id", "meta_page_token", "meta_ig_user_id"],
            lines: [line("meta_page_id"), line("meta_page_token"), line("meta_ig_user_id")], signup: "https://business.facebook.com" },
          { key: "linkedin", label: "LinkedIn", connected: has("linkedin_token", "LINKEDIN_TOKEN") && has("linkedin_org_urn", "LINKEDIN_ORG_URN"),
            what: "Posts and video to your company page.",
            needs: ["linkedin_org_urn", "linkedin_token"], lines: [line("linkedin_org_urn"), line("linkedin_token")], signup: "https://www.linkedin.com/developers" },
          { key: "webhook", label: "Automation webhook (Make / Zapier)", connected: has("webhook_url", "CHANNEL_WEBHOOK_URL"),
            what: "Hands every approved post to an automation tool that can reach any platform without API approvals.",
            needs: ["webhook_url"], lines: [line("webhook_url")], signup: "https://www.make.com" },
          { key: "email", label: "Email (SendGrid)", connected: !!(Deno.env.get("SENDGRID_API_KEY") && Deno.env.get("SENDGRID_FROM_EMAIL")),
            what: "Sends approved lead follow-ups. Until then Send is off and drafts are kept.",
            needs: ["SENDGRID_API_KEY", "SENDGRID_FROM_EMAIL"], lines: [], signup: "https://sendgrid.com",
            note: "These two go in as Supabase Edge Function secrets, not through set_channel." },
        ],
      });
    }

    case "message_list": {
      const { data, error } = await sb
        .from("messages")
        .select("id, contact_id, channel, to_addr, subject, body, status, error, meta, created_at, sent_at, contacts(full_name)")
        .in("status", ["draft", "queued", "sent", "failed"])
        .eq("direction", "outbound")
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) return json({ ok: false, error: error.message }, 500);
      const provider = !!(Deno.env.get("SENDGRID_API_KEY") && Deno.env.get("SENDGRID_FROM_EMAIL"));
      return json({ ok: true, messages: data ?? [], email_provider_connected: provider });
    }

    case "message_send": {
      const id = String(body.id ?? "");
      if (!id) return json({ ok: false, error: "id required" }, 400);
      const { data: msg } = await sb.from("messages").select("id, status, channel, to_addr").eq("id", id).maybeSingle();
      if (!msg) return json({ ok: false, error: "not found" }, 404);
      if (!["draft", "failed"].includes(msg.status)) return json({ ok: false, error: `cannot send a message that is ${msg.status}` }, 409);
      if (!msg.to_addr) return json({ ok: false, error: "this contact has no address to send to" }, 409);
      const { data: full } = await sb.from("messages").select("meta").eq("id", id).maybeSingle();
      await sb.from("messages").update({
        status: "queued", error: null,
        // The owner's stamp. The database refuses to queue or send without it.
        meta: { ...((full?.meta ?? {}) as Record<string, unknown>), approved_by: "owner", approved_at: new Date().toISOString() },
      }).eq("id", id);
      await sb.from("tasks").insert({
        type: msg.channel === "sms" ? "send_sms" : "send_email",
        payload: { message_id: id },
        priority: 40,
      });
      return json({ ok: true, id, status: "queued" });
    }

    case "message_reject": {
      const id = String(body.id ?? "");
      if (!id) return json({ ok: false, error: "id required" }, 400);
      const { data: msg } = await sb.from("messages").select("id, meta").eq("id", id).maybeSingle();
      if (!msg) return json({ ok: false, error: "not found" }, 404);
      await sb.from("messages").update({
        status: "failed",
        error: "rejected by owner",
        meta: { ...((msg.meta ?? {}) as Record<string, unknown>), rejected_reason: "owner" },
      }).eq("id", id);
      return json({ ok: true, id, status: "rejected" });
    }

    default:
      return json({ ok: false, error: `unknown action: ${action}` }, 400);
  }
});
