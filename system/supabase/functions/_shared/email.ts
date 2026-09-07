// Sending one email, for functions that are not the runner.
//
// The runner reaches SendGrid through _shared/channels.ts, which also carries
// every social publishing adapter. `intake` is a public endpoint on the hot
// path of a booking, and pulling Meta, LinkedIn and TikTok code into it to send
// one confirmation would cost cold-start time and widen its surface for no
// benefit. So the email call lives here on its own.
//
// NOTE: channels.ts still carries a byte-identical sendEmail. That duplication
// should end by having channels.ts import this module — it is left for now only
// because redeploying the runner is a 122 KB round trip through a model, which
// is its own risk. If you change the contract here, change it there too.
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

  const resp = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: args.to }] }],
      from: { email: from, name: args.fromName || Deno.env.get("SENDGRID_FROM_NAME") || undefined },
      subject: args.subject,
      content: [{ type: "text/plain", value: args.body }],
    }),
  });
  if (resp.status >= 200 && resp.status < 300) {
    return {
      ok: true,
      mocked: false,
      provider: "sendgrid",
      providerId: resp.headers.get("x-message-id") || undefined,
    };
  }
  return { ok: false, mocked: false, provider: "sendgrid", error: `${resp.status}: ${await resp.text()}` };
}
