// Channel adapters. Each returns a normalized result. When the relevant
// provider key is absent the adapter runs in mock mode (no external call),
// so the queue/runner can be exercised end-to-end before go-live.

export type SendResult = {
  ok: boolean;
  mocked: boolean;
  provider: string;
  providerId?: string;
  error?: string;
};

// ---- Email via SendGrid -----------------------------------------------------
export async function sendEmail(args: {
  to: string;
  subject: string;
  body: string;
  fromEmail?: string;
  fromName?: string;
}): Promise<SendResult> {
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
    return { ok: true, mocked: false, provider: "sendgrid", providerId: resp.headers.get("x-message-id") || undefined };
  }
  return { ok: false, mocked: false, provider: "sendgrid", error: `${resp.status}: ${await resp.text()}` };
}

// ---- SMS via Twilio ---------------------------------------------------------
export async function sendSms(args: { to: string; body: string }): Promise<SendResult> {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_FROM_NUMBER");
  if (!sid || !token || !from) return { ok: true, mocked: true, provider: "twilio" };

  const form = new URLSearchParams({ To: args.to, From: from, Body: args.body });
  const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${sid}:${token}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  const data = await resp.json().catch(() => ({}));
  if (resp.status >= 200 && resp.status < 300) {
    return { ok: true, mocked: false, provider: "twilio", providerId: data.sid };
  }
  return { ok: false, mocked: false, provider: "twilio", error: `${resp.status}: ${data.message || ""}` };
}

// ---- Publish content --------------------------------------------------------
// Social/CMS publishing needs per-platform OAuth (Meta, Google, WordPress).
// Those adapters land in Phase 2; for now publishing a content item marks it
// published in a mock so the approval → publish flow is exercisable.
export function publishContent(_channel: string, _item: { title?: string | null; body: string }): SendResult {
  return { ok: true, mocked: true, provider: `${_channel}:stub` };
}
