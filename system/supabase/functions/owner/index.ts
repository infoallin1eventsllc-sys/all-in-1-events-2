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
import { allow, callerKey } from "../_shared/ratelimit.ts";
import { unsubToken } from "../_shared/unsub.ts";
import {
  SESSION_TTL_SECONDS, currentEpoch, issueOwnerToken, ownerTokenValid, tokenFrom,
} from "../_shared/ownertoken.ts";
import { alertOwner, clientHash, deviceLabel, isNewDevice, logEvent } from "../_shared/security.ts";
import { matchStep, newSecret, otpauthUri } from "../_shared/totp.ts";

const MAX_FAILURES = 8;
/** Calls of any kind allowed per caller per hour, on top of the login throttle.
 *  A working portal session makes a few hundred requests across a day, so this
 *  is a ceiling on a script — including one holding a stolen session token,
 *  which the login throttle below would never see. */
const MAX_CALLS_PER_HOUR = 600;
const THROTTLE_WINDOW_MINUTES = 15;

/** Wrong sign-ins allowed per hour across EVERY caller together.
 *
 *  The per-caller throttle above counts by address, and an attacker rotating
 *  addresses never trips it. This one counts all failures, so a spread-out
 *  guessing run closes sign-in for everyone until it stops. The owner is shut
 *  out too while it lasts; that is the trade, and the alert email says so.
 *  The owner's own mistyping sits far below it: a busy week in September
 *  had four wrong passcodes in a day. */
const GLOBAL_MAX_FAILURES_PER_HOUR = 40;

/** How long a two-step setup code stays valid before it must be started again. */
const TWOSTEP_SETUP_MINUTES = 15;

/* ---------------------------------------------------------------- crypto -- */

// Session tokens are issued and verified in _shared/ownertoken.ts, and the
// address hash lives in _shared/security.ts. This file carried its own copies
// until 30 Sep, and the two had to be kept byte-identical by hand.

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

type SecurityRow = {
  totp_secret: string | null;
  totp_pending: string | null;
  totp_pending_at: string | null;
  totp_enabled: boolean;
  totp_last_step: number;
  session_epoch: number;
};

async function securityRow(sb: SupabaseClient): Promise<SecurityRow | null> {
  const { data, error } = await sb.from("owner_security")
    .select("totp_secret, totp_pending, totp_pending_at, totp_enabled, totp_last_step, session_epoch")
    .eq("id", true).maybeSingle();
  if (error || !data) return null;
  return { ...data, totp_last_step: Number(data.totp_last_step), session_epoch: Number(data.session_epoch) } as SecurityRow;
}

/**
 * Accept a two-step code exactly once. The step must move forward, and the
 * update only lands if nobody else moved it first, so the same code cannot
 * sign in twice even from two requests racing each other.
 */
async function consumeCode(sb: SupabaseClient, secret: string, code: unknown, lastStep: number): Promise<boolean> {
  const step = await matchStep(secret, String(code ?? ""), Math.floor(Date.now() / 1000));
  if (step === null || step <= lastStep) return false;
  const { data } = await sb.from("owner_security")
    .update({ totp_last_step: step, updated_at: new Date().toISOString() })
    .eq("id", true).lt("totp_last_step", step).select("id");
  return (data?.length ?? 0) === 1;
}

/**
 * Raise the session epoch, which signs out every device, and hand back a fresh
 * token so the device that asked stays signed in. Optimistic: the update only
 * lands against the epoch we read, so two at once cannot both "succeed" and
 * leave one caller holding a token for an epoch that never existed.
 */
async function bumpEpoch(sb: SupabaseClient, extra: Record<string, unknown> = {}): Promise<string | null> {
  const epoch = await currentEpoch();
  if (epoch === null) return null;
  const { data } = await sb.from("owner_security")
    .update({ ...extra, session_epoch: epoch + 1, updated_at: new Date().toISOString() })
    .eq("id", true).eq("session_epoch", epoch).select("id");
  if ((data?.length ?? 0) !== 1) return null;
  return await issueOwnerToken(epoch + 1);
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

async function handleLogin(sb: SupabaseClient, req: Request, passcode: unknown, code: unknown) {
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
  const hourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
  const [mine, everyone] = await Promise.all([
    sb.from("owner_login_attempts").select("id", { count: "exact", head: true })
      .eq("client_hash", hash).eq("succeeded", false).gte("attempted_at", since),
    sb.from("owner_login_attempts").select("id", { count: "exact", head: true })
      .eq("succeeded", false).gte("attempted_at", hourAgo),
  ]);
  const count = mine.count ?? 0;

  if (count >= MAX_FAILURES) {
    return json({ ok: false, error: "too_many_attempts", retryAfterMinutes: THROTTLE_WINDOW_MINUTES }, 429);
  }
  if ((everyone.count ?? 0) >= GLOBAL_MAX_FAILURES_PER_HOUR) {
    // Logged at most every ten minutes: during an attack this branch runs on
    // every request, and the log should show the lockout, not be flooded by it.
    const tenAgo = new Date(Date.now() - 10 * 60_000).toISOString();
    const { count: recent } = await sb.from("security_events").select("id", { count: "exact", head: true })
      .eq("kind", "locked_global").gte("created_at", tenAgo);
    if ((recent ?? 0) === 0) await logEvent(sb, "locked_global", hash, { failures_last_hour: everyone.count });
    await alertOwner(sb, "locked_global", "Portal sign-in closed after repeated wrong passcodes", [
      `There have been ${everyone.count} wrong sign-ins to your owner portal in the last hour, from more than one device.`,
      "That pattern looks like someone guessing, so sign-in is closed for everyone, you included, until an hour passes without it.",
      "Your client records were not reached: nothing is readable without signing in.",
    ]);
    return json({ ok: false, error: "locked", retryAfterMinutes: 60 }, 429);
  }

  const sec = await securityRow(sb);
  if (!sec) return json({ ok: false, error: "unavailable" }, 503);

  const submitted = typeof passcode === "string" ? passcode.trim() : "";
  const passOk = submitted.length > 0 && constantTimeEqual(submitted, expected);
  // The code is only spent when the passcode was right: a wrong passcode must
  // not burn the owner's current code for them.
  const codeOk = !sec.totp_enabled ||
    (passOk && !!sec.totp_secret && await consumeCode(sb, sec.totp_secret, code, sec.totp_last_step));
  const ok = passOk && codeOk;
  // Asked BEFORE this attempt is recorded: once the success row exists, every
  // device looks like one that has signed in before.
  const fresh = ok ? await isNewDevice(sb, hash) : false;
  await sb.from("owner_login_attempts").insert({ client_hash: hash, succeeded: ok });

  if (!ok) {
    await logEvent(sb, "login_failed", hash, { twoStep: sec.totp_enabled });
    if (count + 1 >= MAX_FAILURES) {
      await logEvent(sb, "locked_caller", hash, {});
      await alertOwner(sb, "locked_caller", "A device was locked out of your portal", [
        `${deviceLabel(hash)} got the sign-in wrong ${MAX_FAILURES} times in ${THROTTLE_WINDOW_MINUTES} minutes and is locked out for ${THROTTLE_WINDOW_MINUTES} minutes.`,
        "If that was you mistyping, there is nothing to do.",
      ]);
    }
    // One answer for a wrong passcode and a wrong code, so a guesser never
    // learns which half they got right.
    return json({
      ok: false,
      error: sec.totp_enabled ? "invalid_credentials" : "invalid_passcode",
      remaining: MAX_FAILURES - count - 1,
    }, 401);
  }

  await logEvent(sb, "login_ok", hash, { newDevice: fresh, twoStep: sec.totp_enabled });
  if (fresh) {
    await logEvent(sb, "new_device", hash, {});
    await alertOwner(sb, `new_device_${hash}`, "New sign-in to your owner portal", [
      `Someone signed in to your owner portal from ${deviceLabel(hash)}, which has not signed in during the last 30 days.`,
      sec.totp_enabled
        ? "They used your passcode and a two-step code from your authenticator app."
        : "They used your passcode. Two-step sign-in is OFF, so the passcode alone was enough.",
      "If this was you on a new phone, computer or network, there is nothing to do.",
    ], 24 * 60);
  }
  return json({ ok: true, token: await issueOwnerToken(sec.session_epoch), expiresIn: SESSION_TTL_SECONDS });
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

  // In front of every action, login and `status` included. The failed-login
  // throttle inside handleLogin counts only wrong passcodes; this counts
  // requests, which is what a script with a valid token spends.
  if (!(await allow(sb, await callerKey(req, "owner"), MAX_CALLS_PER_HOUR))) {
    return json({ ok: false, error: "too_many_requests" }, 429);
  }

  const action = String(body.action ?? "");

  if (action === "login") return await handleLogin(sb, req, body.passcode, body.code);

  if (action === "status") {
    const secret = Deno.env.get("OWNER_PASSCODE")?.trim();
    // Whether to show the code box. Public on purpose: it says a second factor
    // exists, which tells a guesser nothing useful except that guessing the
    // passcode alone will not be enough.
    const sec = await securityRow(sb);
    return json({ ok: true, configured: !!secret, twoStep: !!sec?.totp_enabled });
  }

  // `selfcheck` was removed on 8 Sep 2026. It sat here, ABOVE the token gate,
  // and returned the passcode's length, whether whitespace was saved around it,
  // and its first and last character — to anyone who asked. It was written to
  // diagnose a paste mishap without reading the secret aloud, and the reasoning
  // was that this is "far too little to reconstruct the value". That is true on
  // its own and beside the point: it narrows a brute-force search for free, and
  // the throttle it would run against counts failures per IP hash, which
  // rotating addresses defeats. A shape oracle on an unauthenticated endpoint
  // is not worth a debugging convenience.
  //
  // To diagnose a login that cannot succeed, use `status` (configured or not),
  // and if that is not enough, re-set the secret. Do not reintroduce this.

  // Everything past this point needs a valid session.
  if (!(await ownerTokenValid(tokenFrom(req, body)))) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  switch (action) {
    /* ---------------------------------------------------------- security --
       The portal's Security tab. Everything here needs a signed-in session
       (the gate above), and every change is logged and emailed. */
    case "security_status": {
      const sec = await securityRow(sb);
      if (!sec) return json({ ok: false, error: "unavailable" }, 503);
      const here = await clientHash(req);
      const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
      const [events, failures] = await Promise.all([
        sb.from("security_events").select("kind, client_hash, created_at")
          .not("kind", "like", "alert_%").gte("created_at", monthAgo)
          .order("created_at", { ascending: false }).limit(60),
        sb.from("owner_login_attempts").select("id", { count: "exact", head: true })
          .eq("succeeded", false).gte("attempted_at", dayAgo),
      ]);
      return json({
        ok: true,
        twoStep: sec.totp_enabled,
        thisDevice: deviceLabel(here),
        failedSignInsLast24h: failures.count ?? 0,
        // Labels, never the raw hash: the portal has no use for it.
        events: (events.data ?? []).map((e) => ({
          kind: e.kind,
          device: deviceLabel(e.client_hash),
          thisDevice: e.client_hash === here,
          at: e.created_at,
        })),
      });
    }

    case "twostep_begin": {
      const sec = await securityRow(sb);
      if (!sec) return json({ ok: false, error: "unavailable" }, 503);
      if (sec.totp_enabled) return json({ ok: false, error: "already_on" }, 409);
      // The secret leaves the server exactly once, here, to the signed-in
      // owner, so it can be put into an authenticator app. It is never logged.
      const secret = newSecret();
      await sb.from("owner_security").update({
        totp_pending: secret, totp_pending_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("id", true);
      return json({ ok: true, secret, uri: otpauthUri(secret), expiresInMinutes: TWOSTEP_SETUP_MINUTES });
    }

    case "twostep_confirm": {
      const sec = await securityRow(sb);
      if (!sec) return json({ ok: false, error: "unavailable" }, 503);
      if (sec.totp_enabled) return json({ ok: false, error: "already_on" }, 409);
      const started = sec.totp_pending_at ? Date.parse(sec.totp_pending_at) : 0;
      if (!sec.totp_pending || Date.now() - started > TWOSTEP_SETUP_MINUTES * 60_000) {
        return json({ ok: false, error: "setup_expired" }, 410);
      }
      const step = await matchStep(sec.totp_pending, String(body.code ?? ""), Math.floor(Date.now() / 1000));
      if (step === null) return json({ ok: false, error: "invalid_code" }, 400);
      // Turning it on signs out every other device: a session opened with the
      // passcode alone should not outlive the switch to passcode-plus-code.
      const token = await bumpEpoch(sb, {
        totp_secret: sec.totp_pending, totp_enabled: true, totp_last_step: step,
        totp_pending: null, totp_pending_at: null,
      });
      if (!token) return json({ ok: false, error: "unavailable" }, 503);
      const here = await clientHash(req);
      await logEvent(sb, "twostep_on", here, {});
      await alertOwner(sb, "twostep_on", "Two-step sign-in is now on", [
        `Two-step sign-in was turned on from ${deviceLabel(here)}. Signing in now needs your passcode and a code from your authenticator app.`,
        "Every other device was signed out.",
      ], 1);
      return json({ ok: true, token, expiresIn: SESSION_TTL_SECONDS });
    }

    case "twostep_off": {
      const sec = await securityRow(sb);
      if (!sec) return json({ ok: false, error: "unavailable" }, 503);
      if (!sec.totp_enabled || !sec.totp_secret) return json({ ok: false, error: "already_off" }, 409);
      // A stolen session must not be able to strip the second factor, so this
      // asks for a current code as well.
      if (!(await consumeCode(sb, sec.totp_secret, body.code, sec.totp_last_step))) {
        return json({ ok: false, error: "invalid_code" }, 400);
      }
      const token = await bumpEpoch(sb, { totp_secret: null, totp_enabled: false });
      if (!token) return json({ ok: false, error: "unavailable" }, 503);
      const here = await clientHash(req);
      await logEvent(sb, "twostep_off", here, {});
      await alertOwner(sb, "twostep_off", "Two-step sign-in was turned OFF", [
        `Two-step sign-in was turned off from ${deviceLabel(here)}. Your passcode alone now opens the portal.`,
        "Every other device was signed out.",
      ], 1);
      return json({ ok: true, token, expiresIn: SESSION_TTL_SECONDS });
    }

    case "signout_all": {
      const token = await bumpEpoch(sb);
      if (!token) return json({ ok: false, error: "unavailable" }, 503);
      const here = await clientHash(req);
      await logEvent(sb, "signout_all", here, {});
      await alertOwner(sb, "signout_all", "Every other device was signed out", [
        `${deviceLabel(here)} signed out every other device from your owner portal.`,
      ], 1);
      return json({ ok: true, token, expiresIn: SESSION_TTL_SECONDS });
    }

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
          { key: "clipkit", label: "Video rendering (Clipkit)", connected: has("clipkit_api_key", "CLIPKIT_API_KEY"),
            what: "The renderer behind the approved sizzle. Turns the agents' video scripts into motion pieces in the website's own palette, for TikTok, Reels, Facebook and LinkedIn. Uses Clipkit render credits.",
            needs: ["clipkit_api_key"], lines: [line("clipkit_api_key")], signup: "https://clipkit.dev" },
          { key: "video", label: "Video rendering (Shotstack, fallback)", connected: has("shotstack_api_key", "SHOTSTACK_API_KEY"),
            what: "Older type-card renderer; used only when Clipkit is not connected.",
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
      const { data: msg } = await sb.from("messages")
        .select("id, status, channel, to_addr, body, contact_id, meta").eq("id", id).maybeSingle();
      if (!msg) return json({ ok: false, error: "not found" }, 404);
      if (!["draft", "failed"].includes(msg.status)) return json({ ok: false, error: `cannot send a message that is ${msg.status}` }, 409);
      if (!msg.to_addr) return json({ ok: false, error: "this contact has no address to send to" }, 409);

      /* -------------------------------------------------- marketing rules --
         Everything the agent writes is marketing under US CAN-SPAM: it exists
         to win work. Only messages about something already in motion are
         transactional and exempt. Getting that backwards is the expensive
         mistake, so the exemption is a short allow-list and everything else is
         treated as marketing.

         Two things must be true before a marketing email may be queued, and
         neither is a warning: they are refusals. A send that cannot carry a
         working opt-out, or that goes to somebody who already opted out, is
         the violation itself - and the moment to stop it is here, not after
         SendGrid has delivered it. */
      const meta = (msg.meta ?? {}) as Record<string, unknown>;
      const TRANSACTIONAL = ["booking_confirmation", "invoice", "payment_receipt"];
      const isMarketing = msg.channel === "email" &&
        !TRANSACTIONAL.includes(String(meta.reason ?? ""));

      let bodyToSend = String(msg.body ?? "");

      if (isMarketing) {
        const { data: prof } = await sb.from("settings").select("value").eq("key", "business_profile").maybeSingle();
        const profile = (prof?.value ?? {}) as Record<string, string | undefined>;
        const postal = String(profile.postal_address ?? "").trim();

        if (!postal) {
          return json({
            ok: false,
            error: "no_postal_address",
            message:
              "Marketing email has to carry a real postal address, and none is set. Add one to settings.business_profile as \"postal_address\" and send again. (A booking confirmation or an invoice is transactional and is not held by this.)",
          }, 409);
        }

        if (msg.contact_id) {
          const { data: contact } = await sb.from("contacts")
            .select("consent_email").eq("id", msg.contact_id).maybeSingle();
          if (contact && contact.consent_email === false) {
            return json({
              ok: false,
              error: "unsubscribed",
              message: "This contact has opted out of marketing email. Transactional messages are still allowed.",
            }, 409);
          }
        }

        // The link is signed for this contact, so it cannot be edited into
        // someone else's unsubscribe, and it never expires.
        if (msg.contact_id && !/unsubscribe/i.test(bodyToSend)) {
          const token = await unsubToken(String(msg.contact_id));
          const site = String(profile.website ?? "meridianinterface.com").replace(/^https?:\/\//, "").replace(/\/$/, "");
          const link = `https://${site}/unsubscribe?t=${token}`;
          bodyToSend = `${bodyToSend}\n\n\n---\n${String(profile.name ?? "Meridian Interface")}\n${postal}\n\nDon't want these? Unsubscribe: ${link}\nThis is a marketing email. Messages about work in progress are sent separately.`;
        }
      }

      // The result of this update was previously discarded. The database has
      // triggers that refuse to queue a message - the owner-approval stamp,
      // and now the compliance rules below it - and a refusal arrives here as
      // an error on the update, not an exception. Ignoring it reported "queued"
      // for a row still sitting in draft, and then queued a task to send it.
      // Check it, and stop before the task is created.
      const { error: queueErr } = await sb.from("messages").update({
        status: "queued", error: null,
        // What is recorded is what gets sent, footer included.
        body: bodyToSend,
        // The owner's stamp. The database refuses to queue or send without it.
        meta: {
          ...meta,
          approved_by: "owner",
          approved_at: new Date().toISOString(),
          ...(isMarketing ? { compliance_footer: true } : { transactional: true }),
        },
      }).eq("id", id);
      if (queueErr) return json({ ok: false, error: "not_queued", message: queueErr.message }, 409);
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
