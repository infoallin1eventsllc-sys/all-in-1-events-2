// Sending one email, for functions that are not the runner.
//
// The runner reaches SendGrid through _shared/channels.ts, which also carries
// every social publishing adapter. `intake` is a public endpoint on the hot
// path of a booking, and pulling Meta, LinkedIn and TikTok code into it to send
// one confirmation would cost cold-start time and widen its surface for no
// benefit. So the email call lives here on its own.
//
// NOTE: channels.ts carries a second copy of sendEmail, used by the runner.
// The duplication should end by having channels.ts import this module; it has
// not, because redeploying the runner is a 122 KB round trip through a model
// and that is its own risk. As of 8 Sep the two have diverged: this one has a
// request timeout, a bounded error string and plain-language status hints, and
// the runner's does not. The RETURN CONTRACT is still identical, which is what
// callers depend on — but if you change that, change it in both.
//
// The contract that matters: with no key configured this reports `mocked` and
// does NOT claim delivery. Callers must treat mocked as "nothing was sent",
// because a system that says it emailed a client when it did not is worse than
// one that never tries.

export type EmailResult = {
  ok: boolean;
  mocked: boolean;
  provider: "sendgrid";
  providerId?: string;
  error?: string;
};

export async function sendEmail(args: {
  to: string;
  subject: string;
  body: string;
  fromEmail?: string;
  fromName?: string;
}): Promise<EmailResult> {
  const key = Deno.env.get("SENDGRID_API_KEY");
  const from = args.fromEmail || Deno.env.get("SENDGRID_FROM_EMAIL") || "";
  if (!key || !from) return { ok: true, mocked: true, provider: "sendgrid" };

  let resp: Response;
  try {
    resp = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      // This runs inside `intake`, on the hot path of a booking. Without a
      // timeout a slow or hanging SendGrid holds the whole request open and the
      // person who just filled in the form watches a spinner. Ten seconds is
      // long enough for a normal send and short enough that a bad day for
      // SendGrid is not also a bad day for the booking form.
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        personalizations: [{ to: [{ email: args.to }] }],
        from: { email: from, name: args.fromName || Deno.env.get("SENDGRID_FROM_NAME") || undefined },
        subject: args.subject,
        content: [{ type: "text/plain", value: args.body }],
      }),
    });
  } catch (e) {
    // A timeout or a network failure is a failure to send, not an exception for
    // the caller to handle. Returning it keeps the booking itself intact.
    return { ok: false, mocked: false, provider: "sendgrid", error: `sendgrid unreachable: ${String(e).slice(0, 200)}` };
  }

  if (resp.status >= 200 && resp.status < 300) {
    return {
      ok: true,
      mocked: false,
      provider: "sendgrid",
      providerId: resp.headers.get("x-message-id") || undefined,
    };
  }

  // What comes back gets stored in messages.error and read by a human later, so
  // it is worth saying what the status actually means. 403 is the one that
  // matters: the key is fine and the From address was never verified, which is
  // not something anyone guesses from "403 Forbidden".
  const detail = (await resp.text().catch(() => "")).slice(0, 500);
  const hint = resp.status === 401
    ? " — SendGrid rejected the API key"
    : resp.status === 403
    ? " — the From address is not a verified sender on this SendGrid account"
    : resp.status === 429
    ? " — rate limited by SendGrid"
    : "";
  return { ok: false, mocked: false, provider: "sendgrid", error: `${resp.status}${hint}: ${detail}` };
}
