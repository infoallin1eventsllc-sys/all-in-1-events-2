// Preflight for email — proves the SendGrid setup works before a client is on
// the other end of it.
//
// No email has ever left this system. That makes the whole send path untested
// code sitting on the most important journey the business has: someone books,
// and hears back. The failure worth guarding against is not a wrong key — that
// one is loud and obvious. It is the quiet one: a perfectly valid key, a
// correct payload, and SendGrid refusing every single message because the From
// address was never verified. That comes back as a 403 with an explanation
// most people never read, and from the outside it is indistinguishable from
// working.
//
// So this checks the three things that all have to be true, and names the one
// that is not:
//
//   1. The key exists and authenticates.
//   2. The key actually carries mail.send. A "Restricted Access" key created
//      without that box ticked passes every check except the one that matters,
//      and fails only when a real client is waiting.
//   3. The From address is one SendGrid will send as — either a verified
//      single sender, or any address at a domain that has been authenticated.
//      Checking only the first would report a false failure for anyone who set
//      up domain authentication, which is the better way to do it.
//
// With {"send_to": "you@example.com"} it sends one real email. That is the only
// test that proves the entire path, and it is opt-in rather than the default
// because a diagnostic that sends mail on every call is its own bad idea.
//
// Never returns the API key or any part of it. The From address is not a
// secret and is shown in full, because reading it back is half the diagnosis.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serviceClient } from "./_shared/supabase.ts";
import { json, corsHeaders } from "./_shared/cors.ts";

const SG = "https://api.sendgrid.com/v3";
const TIMEOUT = 10_000;

/** Same gate as keycheck: the run secret, or a service-role caller. */
async function authorized(req: Request): Promise<boolean> {
  const sb = serviceClient();
  const { data } = await sb.from("settings").select("value").eq("key", "run_secret").maybeSingle();
  const expected = String((data?.value as { value?: string } | null)?.value ?? "");
  if (!expected) return true;
  if (req.headers.get("x-run-secret") === expected) return true;
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  try {
    return JSON.parse(atob(token.split(".")[1]))?.role === "service_role";
  } catch {
    return false;
  }
}

async function sg(path: string, key: string): Promise<{ status: number; body: unknown }> {
  try {
    const res = await fetch(`${SG}${path}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  } catch (e) {
    return { status: 0, body: { threw: String(e) } };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!(await authorized(req))) return json({ ok: false, error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const sendTo = String(body.send_to ?? "").trim();

  const key = Deno.env.get("SENDGRID_API_KEY")?.trim();
  const from = Deno.env.get("SENDGRID_FROM_EMAIL")?.trim();
  const fromName = Deno.env.get("SENDGRID_FROM_NAME")?.trim();

  const config = {
    SENDGRID_API_KEY: key
      ? { present: true, length: key.length, starts_with_SG: key.startsWith("SG."), has_whitespace: /\s/.test(key) }
      : { present: false },
    SENDGRID_FROM_EMAIL: from ?? null,
    SENDGRID_FROM_NAME: fromName ?? null,
  };

  if (!key || !from) {
    return json({
      ok: false,
      ready: false,
      config,
      verdict: !key && !from
        ? "Neither secret is set. Email is off: drafts are kept and nothing is sent."
        : !key
        ? "SENDGRID_API_KEY is missing. SENDGRID_FROM_EMAIL alone does nothing."
        : "SENDGRID_FROM_EMAIL is missing. SendGrid refuses a send with no From address.",
      next: "Set both as Supabase Edge Function secrets, then run this again.",
    });
  }

  /* ---- 1. does the key authenticate, and can it send? ------------------- */
  const scopes = await sg("/scopes", key);
  const scopeList: string[] = Array.isArray((scopes.body as { scopes?: string[] })?.scopes)
    ? (scopes.body as { scopes: string[] }).scopes
    : [];
  // A full-access key reports "mail.send"; some report the wildcard instead.
  const canSend = scopeList.includes("mail.send") || scopeList.includes("_rw_");

  if (scopes.status === 401) {
    return json({
      ok: false, ready: false, config,
      key_valid: false,
      verdict: "SendGrid rejected the key (401). It is wrong, revoked, or from a different SendGrid account.",
      next: "Create a new key in SendGrid under Settings > API Keys with Full Access or with Mail Send permission, and paste the whole thing including the leading SG.",
    });
  }
  if (scopes.status !== 200) {
    return json({
      ok: false, ready: false, config, key_valid: null,
      verdict: `Could not reach SendGrid to check the key (status ${scopes.status}).`,
      detail: scopes.body,
    });
  }

  /* ---- 2. will SendGrid send AS this address? --------------------------- */
  // Two ways it can be allowed, and only one of them needs to be true.
  const senders = await sg("/verified_senders", key);
  const senderList = ((senders.body as { results?: { from_email?: string; verified?: boolean }[] })?.results ?? []);
  const verifiedSingle = senderList.some(
    (s) => (s.from_email ?? "").toLowerCase() === from.toLowerCase() && s.verified !== false,
  );

  const domains = await sg("/whitelabel/domains", key);
  const domainList = (Array.isArray(domains.body) ? domains.body : []) as { domain?: string; valid?: boolean }[];
  const fromDomain = from.split("@")[1]?.toLowerCase() ?? "";
  const authedDomain = domainList.find(
    (d) => d.valid && fromDomain && (fromDomain === (d.domain ?? "").toLowerCase() ||
                                     fromDomain.endsWith(`.${(d.domain ?? "").toLowerCase()}`)),
  );

  // A restricted key may be unable to READ either list. That is not a failure
  // to send — it just means this check cannot see the answer, and saying
  // "not verified" would be a lie.
  const couldCheckSenders = senders.status === 200;
  const couldCheckDomains = domains.status === 200;
  const senderOk = verifiedSingle || !!authedDomain;
  const senderUnknown = !senderOk && !(couldCheckSenders && couldCheckDomains);

  /* ---- 3. the only test that proves it: send one --------------------- */
  let testSend: unknown = "not requested — pass {\"send_to\": \"you@example.com\"} to send one real email";
  if (sendTo) {
    try {
      const res = await fetch(`${SG}/mail/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(TIMEOUT),
        body: JSON.stringify({
          personalizations: [{ to: [{ email: sendTo }] }],
          from: { email: from, ...(fromName ? { name: fromName } : {}) },
          subject: "Meridian Interface — email preflight",
          content: [{
            type: "text/plain",
            value: "This is a test from the Meridian Interface booking system.\n\n" +
              "If you are reading it, the whole path works: the API key, the sender address, " +
              "and delivery. Booking confirmations and invoices will reach clients.\n\n" +
              "Nothing was sent to anyone else, and this message is not recorded in the CRM.",
          }],
        }),
      });
      const text = res.ok ? "" : (await res.text()).slice(0, 600);
      testSend = res.ok
        ? { ok: true, status: res.status, message_id: res.headers.get("x-message-id"),
            note: `Accepted by SendGrid for ${sendTo}. Check the inbox, and the spam folder.` }
        : { ok: false, status: res.status, error: text,
            note: res.status === 403
              ? "403 almost always means the From address is not verified. That is item 2 above."
              : "SendGrid rejected the message." };
    } catch (e) {
      testSend = { ok: false, threw: String(e) };
    }
  }

  const ready = canSend && (senderOk || senderUnknown);
  return json({
    ok: true,
    ready,
    config,
    key_valid: true,
    can_send: canSend,
    scopes_sample: scopeList.slice(0, 12),
    sender_identity: {
      from,
      verified_single_sender: couldCheckSenders ? verifiedSingle : "could not read (key lacks permission)",
      authenticated_domain: couldCheckDomains ? (authedDomain?.domain ?? null) : "could not read (key lacks permission)",
      usable: senderOk ? true : senderUnknown ? "unknown" : false,
    },
    test_send: testSend,
    verdict: !canSend
      ? "The key works but does not carry Mail Send permission. Every message will be refused. Recreate it with Full Access, or tick Mail Send under Restricted Access."
      : senderOk
      ? "Key and sender both check out. Send a test to be certain."
      : senderUnknown
      ? "Key is good and can send. The sender address could not be checked because this key cannot read that list — send a test to find out for real."
      : `SendGrid will not send as ${from}: it is neither a verified single sender nor at an authenticated domain. This is the failure that looks like everything working.`,
  });
});
