// Runner — drains the task queue. Claims a batch of ready tasks (concurrency-safe
// via claim_tasks()), executes each by type, and records the outcome. Failed
// tasks are re-scheduled with backoff until max_attempts.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { serviceClient, getSetting } from "../_shared/supabase.ts";
import { callClaude, DEFAULT_MODEL } from "../_shared/claude.ts";
import { contextBlock } from "../_shared/context.ts";
import { sendEmail, sendSms, publishContent } from "../_shared/channels.ts";
import { cardDataUri, kickerFor } from "../_shared/card.ts";
import { hostCard } from "../_shared/cardhost.ts";
import { submitRender, collectRender, parseScript, videoKey, videoConfigured, type VideoScript, type RenderHandle } from "../_shared/video.ts";
import { json, corsHeaders } from "../_shared/cors.ts";
import { authorizedRun } from "../_shared/runauth.ts";

type Task = {
  id: string;
  type: string;
  attempts: number;
  max_attempts: number;
  payload: Record<string, unknown>;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = serviceClient();

  // The anon key alone no longer triggers runs — see _shared/runauth.ts.
  if (!(await authorizedRun(req, sb))) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const { data: claimed, error } = await sb.rpc("claim_tasks", { p_limit: 10, p_worker: "runner" });
  if (error) return json({ ok: false, error: error.message }, 500);

  const results: Record<string, unknown>[] = [];
  for (const task of (claimed ?? []) as Task[]) {
    try {
      const result = await handle(sb, task);
      await sb.from("tasks").update({
        status: "done", result, error: null, locked_at: null, locked_by: null,
      }).eq("id", task.id);
      results.push({ id: task.id, type: task.type, status: "done" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const willRetry = task.attempts < task.max_attempts;
      await sb.from("tasks").update({
        status: willRetry ? "pending" : "failed",
        error: message,
        locked_at: null,
        locked_by: null,
        // exponential backoff: 2^attempts minutes
        run_at: willRetry
          ? new Date(Date.now() + Math.pow(2, task.attempts) * 60_000).toISOString()
          : new Date().toISOString(),
      }).eq("id", task.id);
      results.push({ id: task.id, type: task.type, status: willRetry ? "retry" : "failed", error: message });
    }
  }

  return json({ ok: true, processed: results.length, results });
});

async function handle(sb: SupabaseClient, task: Task): Promise<Record<string, unknown>> {
  switch (task.type) {
    case "generate_content":
      return String(task.payload.kind ?? "") === "video"
        ? await generateVideo(sb, task)
        : await generateContent(sb, task);
    case "collect_video":
      return await collectVideo(sb, task);
    case "follow_up_lead":
      return await followUpLead(sb, task);
    case "send_email":
      return await sendEmailTask(sb, task);
    case "send_sms":
      return await sendSmsTask(sb, task);
    case "publish_content":
      return await publishContentTask(sb, task);
    default:
      throw new Error(`Unknown task type: ${task.type}`);
  }
}

// (A) Pick a library image whose tags actually match the text. Returns null
// when nothing genuinely matches, so the caller can generate a branded card.
async function pickLibraryImage(sb: SupabaseClient, text: string): Promise<string | null> {
  const { data: media } = await sb.from("media_assets").select("url, tags");
  if (!media || !media.length) return null;
  const hay = text.toLowerCase();
  let best: string | null = null, bestScore = 0;
  for (const m of media) {
    const score = (m.tags ?? []).reduce((s: number, t: string) => s + (hay.includes(String(t).toLowerCase()) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; best = m.url; }
  }
  return best; // null unless a real tag match was found
}

async function agentCfg(sb: SupabaseClient) {
  const [profile, agent] = await Promise.all([
    getSetting(sb, "business_profile", { name: "Your Business", voice: "warm, professional" }),
    getSetting(sb, "agent", { model: DEFAULT_MODEL, autonomy: "draft" }),
  ]);
  return { profile: profile as Record<string, unknown>, agent: agent as Record<string, unknown> };
}

// Draft a piece of content into the approval queue (never auto-published in draft mode).
async function generateContent(sb: SupabaseClient, task: Task) {
  const { profile, agent } = await agentCfg(sb);
  const channel = String(task.payload.channel ?? "content");
  const kind = String(task.payload.kind ?? "post");
  const topic = String(task.payload.topic ?? "an update for our audience");
  // Which customer profile this piece is aimed at. Stored so `analyze` can
  // report effort per profile instead of guessing from the wording.
  const icp = task.payload.icp ? String(task.payload.icp) : null;

  // Load the shared business context so every draft is written FROM the
  // business — its buyers, services, prices, proof, and rules — rather than
  // from a two-line profile. This is the difference between "a post about web
  // design" and a post only this studio could publish.
  const business = await contextBlock(sb);

  const out = await callClaude({
    system: `You write ${kind} content for ${profile.name}.\n\n${business}\n\n` +
      `Follow the writing rules above exactly. Ground the piece in ONE customer profile's ` +
      `pains or buying triggers, and use only the listed proof points as evidence. ` +
      `Return a short JSON object {"title": "...", "body": "..."} only.`,
    prompt: `Write a ${kind} for the "${channel}" channel about: ${topic}. Keep it on-brand and ready to post.`,
    model: String(agent.model || DEFAULT_MODEL),
    maxTokens: 1200,
  });

  let title: string | null = null;
  let body = out.text;
  try {
    const j = JSON.parse(out.text.replace(/```(?:json)?|```/g, "").trim());
    title = j.title ?? null;
    body = j.body ?? out.text;
  } catch { /* keep raw text as body */ }

  // Three ways to get a picture, best first.
  //
  // (A) A real photo from the library whose tags genuinely match. A photograph
  //     of actual work beats a typographic card on every channel.
  // (B) The branded card, rasterised to a hosted JPEG. Instagram fetches images
  //     by URL and takes JPEG only, so this is the one that makes an Instagram
  //     post possible at all.
  // (C) The same card embedded as a data: URI. Facebook and LinkedIn post as
  //     text, and the dashboard renders this fine, so nothing is lost here
  //     except Instagram — which is why (B) failing is not a task failure.
  const cardTitle = title ?? topic;
  const cardOpts = { title: cardTitle, kicker: kickerFor(kind) };

  const libraryImage = await pickLibraryImage(sb, `${topic} ${kind} ${channel}`);
  const hosted = libraryImage ? null : await hostCard(sb, cardOpts);
  const imageUrl = libraryImage ?? hosted?.url ?? cardDataUri(cardOpts);

  const imageSource = libraryImage ? "library" : hosted ? "hosted_card" : "embedded_card";

  const autonomy = String(agent.autonomy || "draft");
  const { data } = await sb.from("content_items").insert({
    channel, kind, title, body, image_url: imageUrl,
    status: autonomy === "auto" ? "approved" : "pending_approval",
    created_by: "agent",
    // image_source is worth storing: "embedded_card" is the one value that
    // means this item cannot go to Instagram, and that should be visible
    // without re-deriving it from the URL.
    // `error` is the reason this item is placeholder text. Without it a
    // degraded system is indistinguishable from a working one: the pipeline
    // keeps running, drafts keep appearing, and nothing anywhere says the API
    // call failed. This system wrote placeholder copy for two weeks on an
    // invalid key and the only trace was that `mocked` stayed true.
    meta: {
      mocked: out.mocked, topic, icp, image_source: imageSource,
      ...(out.error ? { error: out.error } : {}),
    },
  }).select("id").single();

  return {
    content_item_id: data?.id,
    status: autonomy === "auto" ? "approved" : "pending_approval",
    mocked: out.mocked,
    image_source: imageSource,
  };
}

/**
 * A short video: the AI writes a five-scene script, the renderer is asked for
 * the clip, and a follow-up task collects it when it is done. The item sits at
 * `draft` — out of the approval queue — until there is something to watch.
 *
 * Without a renderer configured the script is still written and the item goes
 * straight to the queue marked not rendered, so the owner can read what the
 * video would say and the missing piece is a credential, not a redesign.
 */
async function generateVideo(sb: SupabaseClient, task: Task) {
  const { profile, agent } = await agentCfg(sb);
  const channel = String(task.payload.channel ?? "tiktok");
  const topic = String(task.payload.topic ?? "an update for our audience");
  const icp = task.payload.icp ? String(task.payload.icp) : null;
  const business = await contextBlock(sb);

  const out = await callClaude({
    system: `You write short vertical videos for ${profile.name} — 20 seconds of large on-screen text, no voiceover.\n\n${business}\n\n` +
      `Follow the writing rules above exactly. Ground the piece in ONE customer profile's pains or buying triggers ` +
      `and use only the listed proof points as evidence. Every line is read on a phone in a second or two, so: ` +
      `hook under 50 characters; each beat under 70; the price line names a real price and what it buys; the CTA ` +
      `sends people to the website, not to the comments. Return ONLY JSON: ` +
      `{"hook":"...","beats":["...","...","..."],"price_line":"...","cta":"...","caption":"...","hashtags":["#..."]}`,
    prompt: `Write the video for the "${channel}" channel about: ${topic}.`,
    model: String(agent.model || DEFAULT_MODEL),
    maxTokens: 1500,
  });

  let script: VideoScript | null = parseScript(out.text);
  if (!script && out.mocked) {
    // Keep the pipeline testable without a key, and keep the marker visible.
    script = {
      hook: `[mock] ${topic}`.slice(0, 50),
      beats: ["[mock] What goes wrong without it", "[mock] What a real one includes", "[mock] What it does not include"],
      price_line: "[mock] Custom 3–7 Page Business Site — $8,500",
      cta: "meridianinterface.com",
      caption: `[mock draft] ${topic} (placeholder — add an Anthropic key for real copy)`,
      hashtags: ["#webdesign", "#houston"],
    };
  }
  if (!script) throw new Error(`video script was not valid JSON (${out.text.length} chars)`);

  const key = await videoKey(`${channel}|${script.hook}|${script.price_line}`);
  const poster = cardDataUri({ title: script.hook, kicker: "SHORT VIDEO" });
  const body = [script.caption, script.hashtags.join(" ")].filter(Boolean).join("\n\n");

  let handle: RenderHandle | null = null;
  let renderError: string | null = null;
  const configured = await videoConfigured(sb);
  if (configured) {
    try {
      handle = await submitRender(sb, script);
    } catch (err) {
      renderError = err instanceof Error ? err.message : String(err);
    }
  }

  const autonomy = String(agent.autonomy || "draft");
  const video = handle
    ? { state: "rendering", provider: handle.provider, render_id: handle.render_id, env: handle.env, key }
    : { state: configured ? "failed" : "not_configured", error: renderError ?? (configured ? undefined : "no video renderer configured (SHOTSTACK_API_KEY)") };

  const { data } = await sb.from("content_items").insert({
    channel, kind: "video", title: script.hook, body, image_url: poster,
    // Out of sight while rendering; visible at once when there is nothing to
    // wait for, so a missing renderer shows up as a queue item saying so.
    status: handle ? "draft" : (autonomy === "auto" ? "approved" : "pending_approval"),
    created_by: "agent",
    meta: {
      mocked: out.mocked, topic, icp, image_source: "embedded_card", script, video,
      ...(out.error ? { error: out.error } : {}),
    },
  }).select("id").single();

  if (handle && data?.id) {
    await sb.from("tasks").insert({
      type: "collect_video",
      payload: { content_item_id: data.id, render_id: handle.render_id, env: handle.env, key, autonomy },
      priority: 30,
      max_attempts: 8,
      run_at: new Date(Date.now() + 40_000).toISOString(),
    });
  }

  return { content_item_id: data?.id, video: video.state, mocked: out.mocked };
}

/** Is the clip ready? Copy it in and put the item in the queue; else come back. */
async function collectVideo(sb: SupabaseClient, task: Task) {
  const itemId = String(task.payload.content_item_id ?? "");
  const handle: RenderHandle = {
    provider: "shotstack",
    render_id: String(task.payload.render_id ?? ""),
    env: String(task.payload.env ?? "v1"),
  };
  const key = String(task.payload.key ?? itemId);
  const { data: item } = await sb.from("content_items").select("id, status, meta, image_url").eq("id", itemId).maybeSingle();
  if (!item) throw new Error(`content_item ${itemId} not found`);

  const res = await collectRender(sb, handle, key);
  const meta = (item.meta ?? {}) as Record<string, unknown>;

  if (res.state === "rendering") {
    // Retry with the runner's backoff. Attempts are capped on the task, so a
    // render that never finishes ends as a failed task, not an eternal poll.
    if (task.attempts >= task.max_attempts) {
      await sb.from("content_items").update({
        status: "failed",
        meta: { ...meta, video: { ...(meta.video as object), state: "failed", error: "render did not finish in time" } },
      }).eq("id", itemId);
      return { video: "failed", error: "timed out" };
    }
    throw new Error("still rendering");
  }
  if (res.state === "failed") {
    await sb.from("content_items").update({
      status: "failed",
      meta: { ...meta, video: { ...(meta.video as object), state: "failed", error: res.error } },
    }).eq("id", itemId);
    return { video: "failed", error: res.error };
  }

  const autonomy = String(task.payload.autonomy ?? "draft");
  await sb.from("content_items").update({
    status: autonomy === "auto" ? "approved" : "pending_approval",
    image_url: res.poster ?? item.image_url,
    meta: {
      ...meta,
      image_source: res.poster ? "video_poster" : meta.image_source,
      video: { ...(meta.video as object), state: "ready", url: res.url, poster: res.poster, bytes: res.bytes },
    },
  }).eq("id", itemId);
  return { video: "ready", url: res.url, bytes: res.bytes };
}

// Draft (draft mode) or send (auto mode) a first-touch follow-up to a new lead.
async function followUpLead(sb: SupabaseClient, task: Task) {
  const contactId = String(task.payload.contact_id ?? "");
  const { data: contact } = await sb.from("contacts").select("*").eq("id", contactId).maybeSingle();
  if (!contact) throw new Error(`contact ${contactId} not found`);
  const { profile, agent } = await agentCfg(sb);

  // Context matters here too: a follow-up that can name the service the lead
  // likely needs, at its real price, reads as competence rather than a form
  // letter. The rules also stop it over-promising to a stranger.
  const business = await contextBlock(sb);

  const out = await callClaude({
    system: `You write brief, warm first-touch outreach for ${profile.name}.\n\n${business}\n\n` +
      `Follow the writing rules above. If their message hints at what they need, you may name ` +
      `the matching service and its price plainly; never quote a timeline or invent details. ` +
      `Return JSON {"subject": "...", "body": "..."} only. Keep body under 120 words, no placeholders.`,
    prompt: `New lead: ${contact.full_name ?? "there"} (source: ${contact.source ?? "website"}). ` +
      `Message they left: ${contact.meta?.message ?? "n/a"}. Write a friendly follow-up that invites a reply.`,
    model: String(agent.model || DEFAULT_MODEL),
    maxTokens: 800,
  });

  let subject = "Thanks for reaching out";
  let body = out.text;
  try {
    const j = JSON.parse(out.text.replace(/```(?:json)?|```/g, "").trim());
    subject = j.subject ?? subject;
    body = j.body ?? out.text;
  } catch { /* keep raw */ }

  const autonomy = String(agent.autonomy || "draft");
  const shouldSend = autonomy === "auto" && contact.consent_email && contact.email;

  const { data: msg } = await sb.from("messages").insert({
    contact_id: contactId, channel: "email", direction: "outbound",
    to_addr: contact.email, subject, body,
    status: shouldSend ? "queued" : "draft",
    meta: {
      mocked: out.mocked, reason: "lead_follow_up",
      ...(out.error ? { error: out.error } : {}),
    },
  }).select("id").single();

  await sb.from("activities").insert({
    contact_id: contactId, type: "email", direction: "outbound",
    subject, body, meta: { drafted_by: "agent", sent: shouldSend },
  });

  if (shouldSend) {
    // Enqueue an actual send task so all outbound goes through one path.
    await sb.from("tasks").insert({ type: "send_email", payload: { message_id: msg?.id }, priority: 40 });
  }
  return { message_id: msg?.id, drafted: true, queued_send: shouldSend, mocked: out.mocked };
}

// A "send" with no provider configured used to be recorded as sent. That is
// the one lie this system must never tell: the owner approved an email to a
// real person and the dashboard said it went. It now fails with the reason,
// and the message stays unsent where the owner can see it.
async function sendEmailTask(sb: SupabaseClient, task: Task) {
  const messageId = String(task.payload.message_id ?? "");
  const { data: msg } = await sb.from("messages").select("*").eq("id", messageId).maybeSingle();
  if (!msg) throw new Error(`message ${messageId} not found`);
  const res = await sendEmail({ to: msg.to_addr, subject: msg.subject ?? "", body: msg.body ?? "" });
  const notConnected = res.mocked ? "no email provider connected — set SENDGRID_API_KEY and SENDGRID_FROM_EMAIL" : null;
  const sent = res.ok && !res.mocked;
  await sb.from("messages").update({
    status: sent ? "sent" : "failed",
    provider: res.provider, provider_id: res.providerId ?? null,
    error: notConnected ?? res.error ?? null, sent_at: sent ? new Date().toISOString() : null,
    meta: { ...(msg.meta ?? {}), mocked: res.mocked },
  }).eq("id", messageId);
  if (!sent) throw new Error(notConnected ?? res.error ?? "send failed");
  return { sent: true, provider: res.provider };
}

async function sendSmsTask(sb: SupabaseClient, task: Task) {
  const messageId = String(task.payload.message_id ?? "");
  const { data: msg } = await sb.from("messages").select("*").eq("id", messageId).maybeSingle();
  if (!msg) throw new Error(`message ${messageId} not found`);
  const res = await sendSms({ to: msg.to_addr, body: msg.body ?? "" });
  const notConnected = res.mocked ? "no SMS provider connected — set the TWILIO_* secrets" : null;
  const sent = res.ok && !res.mocked;
  await sb.from("messages").update({
    status: sent ? "sent" : "failed",
    provider: res.provider, provider_id: res.providerId ?? null,
    error: notConnected ?? res.error ?? null, sent_at: sent ? new Date().toISOString() : null,
    meta: { ...(msg.meta ?? {}), mocked: res.mocked },
  }).eq("id", messageId);
  if (!sent) throw new Error(notConnected ?? res.error ?? "send failed");
  return { sent: true, provider: res.provider };
}

/**
 * Publish an approved item. Video platforms accept the file and finish in
 * their own time; a `pending` result parks the item as `scheduled` with the
 * platform's reference and books another look in ninety seconds. Only a
 * platform's own "complete" moves an item to `published`.
 */
async function publishContentTask(sb: SupabaseClient, task: Task) {
  const itemId = String(task.payload.content_item_id ?? "");
  const { data: item } = await sb.from("content_items").select("*").eq("id", itemId).maybeSingle();
  if (!item) throw new Error(`content_item ${itemId} not found`);
  if (item.status !== "approved" && item.status !== "scheduled") {
    throw new Error(`content_item ${itemId} not approved (status=${item.status})`);
  }
  const meta = (item.meta ?? {}) as Record<string, unknown>;
  const video = (meta.video ?? {}) as { state?: string; url?: string };
  const pending = (meta.publish_pending ?? null) as { ref?: string } | null;

  const res = await publishContent(sb, item.channel ?? "content", {
    title: item.title,
    body: item.body,
    kind: item.kind,
    image_url: item.image_url,
    video_url: video.state === "ready" ? video.url ?? null : null,
    pending_ref: pending?.ref ?? null,
  });

  if (res.pending) {
    await sb.from("content_items").update({
      status: "scheduled",
      meta: { ...meta, publish_pending: { provider: res.provider, ref: res.pending.ref, note: res.pending.note, since: pending ? (meta.publish_pending as { since?: string }).since : new Date().toISOString() } },
    }).eq("id", itemId);
    await sb.from("tasks").insert({
      type: "publish_content",
      payload: { content_item_id: itemId },
      priority: 20,
      max_attempts: 3,
      run_at: new Date(Date.now() + 90_000).toISOString(),
    });
    return { pending: true, provider: res.provider, note: res.pending.note };
  }

  const { publish_pending: _gone, ...rest } = meta;
  await sb.from("content_items").update({
    status: res.ok ? "published" : "failed",
    published_at: res.ok ? new Date().toISOString() : null,
    external_id: res.providerId ?? null,
    meta: { ...rest, publish: res },
  }).eq("id", itemId);
  if (!res.ok) throw new Error(res.error ?? "publish failed");
  return { published: true, mocked: res.mocked, channel: item.channel };
}
