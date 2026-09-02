// Channel adapters. Each returns a normalized result. When the relevant
// provider key is absent the adapter runs in mock mode (no external call),
// so the queue/runner can be exercised end-to-end before go-live.

export type SendResult = {
  ok: boolean;
  mocked: boolean;
  provider: string;
  providerId?: string;
  error?: string;
  /**
   * The platform accepted the item but is still processing it — every video
   * platform works this way, and Instagram will not publish a Reel until the
   * container says FINISHED. The runner parks the item as `scheduled` and asks
   * again later with `pending_ref`; nothing is marked published on a promise.
   */
  pending?: { ref: string; note: string };
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
      Receives {channel, kind, title, body, image_url, video_url} as JSON POST. */
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
  /** LinkedIn's versioned REST API needs a YYYYMM version header for video. */
  linkedin_version?: string;
  /** TikTok Content Posting API. The refresh token is the durable credential;
      access tokens last a day and are minted from it on every publish. */
  tiktok_client_key?: string;
  tiktok_client_secret?: string;
  tiktok_refresh_token?: string;
  /** PUBLIC_TO_EVERYONE once TikTok has audited the app; SELF_ONLY before. */
  tiktok_privacy?: string;
  /** Shotstack renders the short videos. */
  shotstack_api_key?: string;
  shotstack_env?: string; // "stage" (sandbox, watermarked) or "v1" (production)
  video_music_url?: string; // optional soundtrack, an MP3 URL
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
    linkedin_version: env("LINKEDIN_VERSION") ?? stored.linkedin_version,
    tiktok_client_key: env("TIKTOK_CLIENT_KEY") ?? stored.tiktok_client_key,
    tiktok_client_secret: env("TIKTOK_CLIENT_SECRET") ?? stored.tiktok_client_secret,
    tiktok_refresh_token: env("TIKTOK_REFRESH_TOKEN") ?? stored.tiktok_refresh_token,
    tiktok_privacy: env("TIKTOK_PRIVACY") ?? stored.tiktok_privacy,
    shotstack_api_key: env("SHOTSTACK_API_KEY") ?? stored.shotstack_api_key,
    shotstack_env: env("SHOTSTACK_ENV") ?? stored.shotstack_env,
    video_music_url: env("VIDEO_MUSIC_URL") ?? stored.video_music_url,
  };
}

export type PublishItem = {
  title?: string | null;
  body: string;
  kind?: string | null;
  image_url?: string | null;
  /** A hosted MP4 from _shared/video.ts. Present only for rendered videos. */
  video_url?: string | null;
  /** The platform's reference from an earlier `pending` result, if any. */
  pending_ref?: string | null;
};

const isHosted = (u: string | null | undefined): u is string => !!u && u.startsWith("http");
const trim = (s: unknown, n: number) => JSON.stringify(s ?? "").slice(0, n);

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
      image_url: isHosted(item.image_url) ? item.image_url : null,
      video_url: isHosted(item.video_url) ? item.video_url : null,
    }),
  });
  const text = await resp.text();
  if (resp.status >= 200 && resp.status < 300) {
    return { ok: true, mocked: false, provider: "webhook", providerId: `${resp.status}` };
  }
  return { ok: false, mocked: false, provider: "webhook", error: `${resp.status}: ${text.slice(0, 300)}` };
}

// ---- Meta: Facebook Page + Instagram ----------------------------------------
const GRAPH = "https://graph.facebook.com/v21.0";

/** Facebook Page post; when the item has a real image and an IG user is
    configured, also publishes to Instagram (container → publish). */
async function publishViaMeta(cfg: ChannelConfig, channel: string, item: PublishItem): Promise<SendResult> {
  const msg = [item.title, item.body].filter(Boolean).join("\n\n");
  const wantsIg = channel === "instagram";
  const realImage = isHosted(item.image_url) ? item.image_url : undefined;

  if (wantsIg) {
    if (!cfg.meta_ig_user_id) {
      return { ok: false, mocked: false, provider: "meta", error: "instagram channel but meta_ig_user_id not configured" };
    }
    if (!realImage) {
      // Instagram requires media. Generated data-URI cards cannot be uploaded
      // by URL, so this is a real constraint, stated rather than fudged.
      return { ok: false, mocked: false, provider: "meta", error: "instagram requires a hosted image; this item has none" };
    }
    const create = await fetch(`${GRAPH}/${cfg.meta_ig_user_id}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: realImage, caption: msg, access_token: cfg.meta_page_token }),
    });
    const cj = await create.json().catch(() => ({}));
    if (!create.ok || !cj.id) {
      return { ok: false, mocked: false, provider: "meta", error: `ig container: ${create.status} ${trim(cj, 200)}` };
    }
    return await igPublishContainer(cfg, String(cj.id), "meta:instagram");
  }

  const post = await fetch(`${GRAPH}/${cfg.meta_page_id}/feed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: msg, access_token: cfg.meta_page_token }),
  });
  const j = await post.json().catch(() => ({}));
  if (!post.ok || !j.id) {
    return { ok: false, mocked: false, provider: "meta", error: `page feed: ${post.status} ${trim(j, 200)}` };
  }
  return { ok: true, mocked: false, provider: "meta:page", providerId: j.id };
}

/** media_publish on a container id. */
async function igPublishContainer(cfg: ChannelConfig, creationId: string, provider: string): Promise<SendResult> {
  const pub = await fetch(`${GRAPH}/${cfg.meta_ig_user_id}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: creationId, access_token: cfg.meta_page_token }),
  });
  const pj = await pub.json().catch(() => ({}));
  if (!pub.ok || !pj.id) {
    return { ok: false, mocked: false, provider: "meta", error: `ig publish: ${pub.status} ${trim(pj, 200)}` };
  }
  return { ok: true, mocked: false, provider, providerId: pj.id };
}

/**
 * Video to Meta. Facebook takes a video post in one call and processes it
 * behind the scenes. Instagram Reels is two-phase: create a REELS container
 * from the hosted MP4, wait for Instagram to finish transcoding (30–90
 * seconds, reported through status_code), then publish the container. The
 * wait is returned as `pending`; the runner comes back with the container id.
 */
async function publishViaMetaVideo(cfg: ChannelConfig, channel: string, item: PublishItem): Promise<SendResult> {
  const caption = [item.title, item.body].filter(Boolean).join("\n\n");

  if (channel === "facebook") {
    const post = await fetch(`${GRAPH}/${cfg.meta_page_id}/videos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_url: item.video_url, description: caption, access_token: cfg.meta_page_token }),
    });
    const j = await post.json().catch(() => ({}));
    if (!post.ok || !j.id) {
      return { ok: false, mocked: false, provider: "meta", error: `page video: ${post.status} ${trim(j, 200)}` };
    }
    return { ok: true, mocked: false, provider: "meta:page-video", providerId: j.id };
  }

  if (!cfg.meta_ig_user_id) {
    return { ok: false, mocked: false, provider: "meta", error: "instagram channel but meta_ig_user_id not configured" };
  }

  // Second visit: the container exists, ask whether Instagram is done with it.
  if (item.pending_ref) {
    const st = await fetch(`${GRAPH}/${item.pending_ref}?fields=status_code,status&access_token=${encodeURIComponent(cfg.meta_page_token!)}`);
    const sj = await st.json().catch(() => ({}));
    const code = String(sj.status_code ?? "");
    if (code === "FINISHED") return await igPublishContainer(cfg, item.pending_ref, "meta:reels");
    if (code === "ERROR" || code === "EXPIRED") {
      return { ok: false, mocked: false, provider: "meta", error: `reels container ${code}: ${trim(sj.status, 200)}` };
    }
    return { ok: true, mocked: false, provider: "meta:reels", pending: { ref: item.pending_ref, note: `instagram still processing (${code || "unknown"})` } };
  }

  const create = await fetch(`${GRAPH}/${cfg.meta_ig_user_id}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      media_type: "REELS",
      video_url: item.video_url,
      caption,
      share_to_feed: true,
      access_token: cfg.meta_page_token,
    }),
  });
  const cj = await create.json().catch(() => ({}));
  if (!create.ok || !cj.id) {
    return { ok: false, mocked: false, provider: "meta", error: `reels container: ${create.status} ${trim(cj, 200)}` };
  }
  return { ok: true, mocked: false, provider: "meta:reels", pending: { ref: String(cj.id), note: "instagram is processing the video" } };
}

// ---- LinkedIn ---------------------------------------------------------------

/** LinkedIn organization text post via the UGC API. */
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
  return { ok: false, mocked: false, provider: "linkedin", error: `${resp.status}: ${trim(j, 300)}` };
}

function linkedinHeaders(cfg: ChannelConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${cfg.linkedin_token}`,
    "Content-Type": "application/json",
    "X-Restli-Protocol-Version": "2.0.0",
    // Versioned REST. A version older than a year is rejected outright, so
    // this is configurable rather than frozen into the code.
    "LinkedIn-Version": cfg.linkedin_version || "202506",
  };
}

/**
 * Video to a LinkedIn organization page. Three steps on their side: register
 * the upload and receive one or more part URLs, PUT the bytes, finalize with
 * the ETags. Then LinkedIn transcodes; the post can only be created once the
 * video reports AVAILABLE, so that wait is a `pending` on the video URN.
 */
async function publishViaLinkedInVideo(cfg: ChannelConfig, item: PublishItem): Promise<SendResult> {
  const H = linkedinHeaders(cfg);
  const text = [item.title, item.body].filter(Boolean).join("\n\n");

  // Second visit: uploaded already; is it playable yet?
  if (item.pending_ref) {
    const st = await fetch(`https://api.linkedin.com/rest/videos/${encodeURIComponent(item.pending_ref)}`, { headers: H });
    const sj = await st.json().catch(() => ({}));
    const status = String(sj.status ?? "");
    if (status === "PROCESSING_FAILED" || status === "FAILED") {
      return { ok: false, mocked: false, provider: "linkedin", error: `video processing failed: ${trim(sj, 200)}` };
    }
    if (status !== "AVAILABLE") {
      return { ok: true, mocked: false, provider: "linkedin:video", pending: { ref: item.pending_ref, note: `linkedin still processing (${status || st.status})` } };
    }
    const post = await fetch("https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers: H,
      body: JSON.stringify({
        author: cfg.linkedin_org_urn,
        commentary: text,
        visibility: "PUBLIC",
        distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
        content: { media: { id: item.pending_ref, title: item.title ?? "" } },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      }),
    });
    if (post.status >= 200 && post.status < 300) {
      return { ok: true, mocked: false, provider: "linkedin:video", providerId: post.headers.get("x-restli-id") ?? undefined };
    }
    return { ok: false, mocked: false, provider: "linkedin", error: `post: ${post.status} ${(await post.text()).slice(0, 300)}` };
  }

  // First visit: fetch our MP4, register the upload, push the parts, finalize.
  const src = await fetch(item.video_url!);
  if (!src.ok) return { ok: false, mocked: false, provider: "linkedin", error: `${src.status} fetching the rendered video` };
  const bytes = new Uint8Array(await src.arrayBuffer());

  const init = await fetch("https://api.linkedin.com/rest/videos?action=initializeUpload", {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      initializeUploadRequest: {
        owner: cfg.linkedin_org_urn,
        fileSizeBytes: bytes.length,
        uploadCaptions: false,
        uploadThumbnail: false,
      },
    }),
  });
  const ij = await init.json().catch(() => ({}));
  const v = ij?.value ?? {};
  const parts: Array<{ uploadUrl: string; firstByte: number; lastByte: number }> = v.uploadInstructions ?? [];
  if (!init.ok || !v.video || !parts.length) {
    return { ok: false, mocked: false, provider: "linkedin", error: `initializeUpload: ${init.status} ${trim(ij, 300)}` };
  }

  const etags: string[] = [];
  for (const p of parts) {
    const put = await fetch(p.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: bytes.slice(p.firstByte, p.lastByte + 1),
    });
    if (!put.ok) return { ok: false, mocked: false, provider: "linkedin", error: `upload part ${p.firstByte}-${p.lastByte}: ${put.status}` };
    etags.push(put.headers.get("etag") ?? "");
  }

  const fin = await fetch("https://api.linkedin.com/rest/videos?action=finalizeUpload", {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      finalizeUploadRequest: { video: v.video, uploadToken: v.uploadToken ?? "", uploadedPartIds: etags },
    }),
  });
  if (!fin.ok) return { ok: false, mocked: false, provider: "linkedin", error: `finalizeUpload: ${fin.status} ${(await fin.text()).slice(0, 300)}` };

  return { ok: true, mocked: false, provider: "linkedin:video", pending: { ref: String(v.video), note: "linkedin is processing the video" } };
}

// ---- TikTok -----------------------------------------------------------------
const TT = "https://open.tiktokapis.com/v2";

/**
 * Mint a day-long access token from the durable refresh token. TikTok may
 * hand back a new refresh token with it; when it does, the new one is saved
 * so the next publish does not use a retired credential. Only the settings
 * copy can be updated from here — an env secret is read-only at runtime.
 */
// deno-lint-ignore no-explicit-any
async function tiktokAccessToken(sb: any, cfg: ChannelConfig): Promise<{ token: string; open_id: string } | { error: string }> {
  const form = new URLSearchParams({
    client_key: cfg.tiktok_client_key!,
    client_secret: cfg.tiktok_client_secret!,
    grant_type: "refresh_token",
    refresh_token: cfg.tiktok_refresh_token!,
  });
  const res = await fetch(`${TT}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) {
    return { error: `tiktok token refresh: ${res.status} ${String(j.error_description ?? j.error ?? "").slice(0, 200)}` };
  }
  if (j.refresh_token && j.refresh_token !== cfg.tiktok_refresh_token && !Deno.env.get("TIKTOK_REFRESH_TOKEN")) {
    const { data } = await sb.from("settings").select("value").eq("key", "channels").maybeSingle();
    await sb.from("settings").upsert(
      { key: "channels", value: { ...(data?.value ?? {}), tiktok_refresh_token: j.refresh_token } },
      { onConflict: "key" },
    );
  }
  return { token: String(j.access_token), open_id: String(j.open_id ?? "") };
}

/**
 * TikTok Content Posting API, direct-post flow. TikTok pulls the MP4 from our
 * public URL (the storage domain must be verified in the TikTok developer
 * portal), then processes it; `publish_id` is polled until PUBLISH_COMPLETE.
 *
 * Privacy: an app TikTok has not yet audited may only post SELF_ONLY — the
 * clip lands on the account, visible to its owner alone. That is their rule
 * during review, so the level is chosen from what creator_info says is
 * allowed rather than asserted and refused.
 */
// deno-lint-ignore no-explicit-any
async function publishViaTikTok(sb: any, cfg: ChannelConfig, item: PublishItem): Promise<SendResult> {
  if (!isHosted(item.video_url)) {
    return { ok: false, mocked: false, provider: "tiktok", error: "tiktok requires a rendered video; this item has none" };
  }
  const auth = await tiktokAccessToken(sb, cfg);
  if ("error" in auth) return { ok: false, mocked: false, provider: "tiktok", error: auth.error };
  const H = { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json; charset=UTF-8" };

  // Second visit: how is the upload going?
  if (item.pending_ref) {
    const st = await fetch(`${TT}/post/publish/status/fetch/`, {
      method: "POST", headers: H, body: JSON.stringify({ publish_id: item.pending_ref }),
    });
    const sj = await st.json().catch(() => ({}));
    const status = String(sj?.data?.status ?? "");
    if (status === "PUBLISH_COMPLETE") {
      const ids: string[] = sj?.data?.publicaly_available_post_id ?? sj?.data?.publicly_available_post_id ?? [];
      return { ok: true, mocked: false, provider: "tiktok", providerId: String(ids[0] ?? item.pending_ref) };
    }
    if (status === "FAILED") {
      return { ok: false, mocked: false, provider: "tiktok", error: `tiktok: ${String(sj?.data?.fail_reason ?? "failed")}` };
    }
    return { ok: true, mocked: false, provider: "tiktok", pending: { ref: item.pending_ref, note: `tiktok ${status || `status ${st.status}`}` } };
  }

  const info = await fetch(`${TT}/post/publish/creator_info/query/`, { method: "POST", headers: H });
  const ij = await info.json().catch(() => ({}));
  if (!info.ok || ij?.error?.code && ij.error.code !== "ok") {
    return { ok: false, mocked: false, provider: "tiktok", error: `creator_info: ${info.status} ${String(ij?.error?.message ?? "").slice(0, 200)}` };
  }
  const allowed: string[] = ij?.data?.privacy_level_options ?? [];
  const wanted = cfg.tiktok_privacy || "PUBLIC_TO_EVERYONE";
  const privacy = allowed.includes(wanted) ? wanted : (allowed[0] ?? "SELF_ONLY");

  const caption = [item.title, item.body].filter(Boolean).join("\n\n").slice(0, 2200);
  const init = await fetch(`${TT}/post/publish/video/init/`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      post_info: {
        title: caption,
        privacy_level: privacy,
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
        video_cover_timestamp_ms: 1000,
      },
      source_info: { source: "PULL_FROM_URL", video_url: item.video_url },
    }),
  });
  const j = await init.json().catch(() => ({}));
  const publishId = j?.data?.publish_id;
  if (!init.ok || !publishId) {
    return { ok: false, mocked: false, provider: "tiktok", error: `video/init: ${init.status} ${String(j?.error?.message ?? j?.error?.code ?? "").slice(0, 200)}` };
  }
  const note = privacy === "SELF_ONLY"
    ? "tiktok accepted the video; it will be visible only to the account owner until TikTok audits the app"
    : "tiktok is processing the video";
  return { ok: true, mocked: false, provider: "tiktok", pending: { ref: String(publishId), note } };
}

/**
 * Publish one approved item to its channel.
 *
 * Adapter choice: the channel's own platform when its credentials exist,
 * else the generic webhook when configured, else the mock stub. The webhook
 * fallback is what makes every channel reachable TODAY — an automation tool
 * on the receiving end can post to anything, without this system waiting on
 * any platform's API approval. A video item goes through the platform's video
 * path; a still item through its post path.
 */
// deno-lint-ignore no-explicit-any
export async function publishContent(sb: any, channel: string, item: PublishItem): Promise<SendResult> {
  const cfg = await loadChannelConfig(sb);
  const hasVideo = isHosted(item.video_url);

  try {
    if (channel === "tiktok" && cfg.tiktok_client_key && cfg.tiktok_client_secret && cfg.tiktok_refresh_token) {
      return await publishViaTikTok(sb, cfg, item);
    }
    if ((channel === "facebook" || channel === "instagram") && cfg.meta_page_token) {
      return hasVideo ? await publishViaMetaVideo(cfg, channel, item) : await publishViaMeta(cfg, channel, item);
    }
    if (channel === "linkedin" && cfg.linkedin_token && cfg.linkedin_org_urn) {
      return hasVideo ? await publishViaLinkedInVideo(cfg, item) : await publishViaLinkedIn(cfg, item);
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
