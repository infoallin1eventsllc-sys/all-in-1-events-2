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
  const expected = Deno.env.get("OWNER_PASSCODE");
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

  const ok = typeof passcode === "string" && constantTimeEqual(passcode, expected);
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
    return json({ ok: true, configured: !!Deno.env.get("OWNER_PASSCODE") });
  }

  // Everything past this point needs a valid session.
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "") ||
    String(body.token ?? "");
  if (!(await tokenValid(token))) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  switch (action) {
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

    default:
      return json({ ok: false, error: `unknown action: ${action}` }, 400);
  }
});
