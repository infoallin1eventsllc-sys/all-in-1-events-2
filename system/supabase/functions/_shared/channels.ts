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
// Real channel adapters, each behind its own credentials. A channel whose
// credentials are absent degrades to the mock stub — the approval → publish
// flow keeps working end to end before any account exists, and each channel
// lights up the moment its credentials are supplied. No redeploy either way:
// configuration is read per call.
//
// Configuration lives in the `settings` table under key "channels" (RLS
// deny-by-default, service-role only), with same-named Deno env secrets taking
// precedence when set. The settings path exists because it can be updated with
// one SQL statement — no dashboard trip, no multi-line-textarea traps.
//
// What is DELIBERATELY absent: ad platforms (Google Ads, Meta Ads, TikTok
// Ads). Publishing a post costs nothing; an ads API spends money on a budget
// you set in their dashboard. That is a different decision from a content
// system, it deserves its own approval flow, and it is out of scope here on
// purpose — not as an oversight.

export type ChannelConfig = {
  /** Generic outbound webhook — point it at Make/Zapier/n8n/anything.
      Receives {channel, kind, title, body, image_url} as JSON POST. */
  webhook_url?: string;
  /** Optional shared secret sent as x-webhook-secret so the receiving
      scenario can reject posts that are not ours. */
  webhook_secret?: string;
  /** Meta (Facebook Page + Instagram Business) via the Graph API. */
  meta_page_id?: string;
  meta_page_token?: string;
  meta_ig_user_id?: string;
  /** LinkedIn organization posts. urn like "urn:li:organization:123". */
  linkedin_org_urn?: string;
  linkedin_token?: string;
};

// deno-lint-ignore no-explicit-any
export async function loadChannelConfig(sb: any): Promise<ChannelConfig> {
  const { data } = await sb.from("settings").select("value").eq("key", "channels").maybeSingle();
  const stored = (data?.value ?? {}) as ChannelConfig;
  const env = (k: string) => Deno.env.get(k) || undefined;
  return {
    webhook_url: env("CHANNEL_WEBHOOK_URL") ?? stored.webhook_url,
    webhook_secret: env("CHANNEL_WEBHOOK_SECRET") ?? stored.webhook_secret,
    meta_page_id: env("META_PAGE_ID") ?? stored.meta_page_id,
    meta_page_token: env("META_PAGE_TOKEN") ?? stored.meta_page_token,
    meta_ig_user_id: env("META_IG_USER_ID") ?? stored.meta_ig_user_id,
    linkedin_org_urn: env("LINKEDIN_ORG_URN") ?? stored.linkedin_org_urn,
    linkedin_token: env("LINKEDIN_TOKEN") ?? stored.linkedin_token,
  };
}

export type PublishItem = {
  title?: string | null;
  body: string;
  kind?: string | null;
  image_url?: string | null;
};

/** Generic webhook: the universal adapter. One URL covers every platform an
    automation tool can reach, with no per-platform API approval at all. */
async function publishViaWebhook(cfg: ChannelConfig, channel: string, item: PublishItem): Promise<SendResult> {
  const resp = await fetch(cfg.webhook_url!, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cfg.webhook_secret ? { "x-webhook-secret": cfg.webhook_secret } : {}),
    },
    body: JSON.stringify({
      source: "meridian-marketing",
      channel,
      kind: item.kind ?? "post",
      title: item.title ?? null,
      body: item.body,
      // data: URIs are our generated cards — meaningless to a webhook consumer
      // and enormous, so only real image URLs travel.
      image_url: item.image_url?.startsWith("http") ? item.image_url : null,
    }),
  });
  const text = await resp.text();
  if (resp.status >= 200 && resp.status < 300) {
    return { ok: true, mocked: false, provider: "webhook", providerId: `${resp.status}` };
  }
  return { ok: false, mocked: false, provider: "webhook", error: `${resp.status}: ${text.slice(0, 300)}` };
}

/** Facebook Page post; when the item has a real image and an IG user is
    configured, also publishes to Instagram (container → publish). */
async function publishViaMeta(cfg: ChannelConfig, channel: string, item: PublishItem): Promise<SendResult> {
  const G = "https://graph.facebook.com/v21.0";
  const msg = [item.title, item.body].filter(Boolean).join("\n\n");
  const wantsIg = channel === "instagram";
  const realImage = item.image_url?.startsWith("http") ? item.image_url : undefined;

  if (wantsIg) {
    if (!cfg.meta_ig_user_id) {
      return { ok: false, mocked: false, provider: "meta", error: "instagram channel but meta_ig_user_id not configured" };
    }
    if (!realImage) {
      // Instagram requires media. Generated data-URI cards cannot be uploaded
      // by URL, so this is a real constraint, stated rather than fudged.
      return { ok: false, mocked: false, provider: "meta", error: "instagram requires a hosted image; this item has none" };
    }
    const create = await fetch(`${G}/${cfg.meta_ig_user_id}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: realImage, caption: msg, access_token: cfg.meta_page_token }),
    });
    const cj = await create.json().catch(() => ({}));
    if (!create.ok || !cj.id) {
      return { ok: false, mocked: false, provider: "meta", error: `ig container: ${create.status} ${JSON.stringify(cj).slice(0, 200)}` };
    }
    const pub = await fetch(`${G}/${cfg.meta_ig_user_id}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: cj.id, access_token: cfg.meta_page_token }),
    });
    const pj = await pub.json().catch(() => ({}));
    if (!pub.ok || !pj.id) {
      return { ok: false, mocked: false, provider: "meta", error: `ig publish: ${pub.status} ${JSON.stringify(pj).slice(0, 200)}` };
    }
    return { ok: true, mocked: false, provider: "meta:instagram", providerId: pj.id };
  }

  const post = await fetch(`${G}/${cfg.meta_page_id}/feed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: msg, access_token: cfg.meta_page_token }),
  });
  const j = await post.json().catch(() => ({}));
  if (!post.ok || !j.id) {
    return { ok: false, mocked: false, provider: "meta", error: `page feed: ${post.status} ${JSON.stringify(j).slice(0, 200)}` };
  }
  return { ok: true, mocked: false, provider: "meta:page", providerId: j.id };
}

/** LinkedIn organization post via the UGC API. */
async function publishViaLinkedIn(cfg: ChannelConfig, item: PublishItem): Promise<SendResult> {
  const msg = [item.title, item.body].filter(Boolean).join("\n\n");
  const resp = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.linkedin_token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author: cfg.linkedin_org_urn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: msg },
          shareMediaCategory: "NONE",
        },
      },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    }),
  });
  const j = await resp.json().catch(() => ({}));
  if (resp.status >= 200 && resp.status < 300) {
    return { ok: true, mocked: false, provider: "linkedin", providerId: j.id ?? resp.headers.get("x-restli-id") ?? undefined };
  }
  return { ok: false, mocked: false, provider: "linkedin", error: `${resp.status}: ${JSON.stringify(j).slice(0, 300)}` };
}

/**
 * Publish one approved item to its channel.
 *
 * Adapter choice: the channel's own platform when its credentials exist,
 * else the generic webhook when configured, else the mock stub. The webhook
 * fallback is what makes every channel reachable TODAY — an automation tool
 * on the receiving end can post to TikTok, Instagram, or anything else,
 * without this system waiting on any platform's API approval.
 */
// deno-lint-ignore no-explicit-any
export async function publishContent(sb: any, channel: string, item: PublishItem): Promise<SendResult> {
  const cfg = await loadChannelConfig(sb);

  try {
    if ((channel === "facebook" || channel === "instagram") && cfg.meta_page_token) {
      return await publishViaMeta(cfg, channel, item);
    }
    if (channel === "linkedin" && cfg.linkedin_token && cfg.linkedin_org_urn) {
      return await publishViaLinkedIn(cfg, item);
    }
    if (cfg.webhook_url) {
      return await publishViaWebhook(cfg, channel, item);
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, mocked: false, provider: channel, error: reason };
  }

  // Nothing configured for this channel — same honest stub as before.
  return { ok: true, mocked: true, provider: `${channel}:stub` };
}
