// Runner — drains the task queue. Claims a batch of ready tasks (concurrency-safe
// via claim_tasks()), executes each by type, and records the outcome. Failed
// tasks are re-scheduled with backoff until max_attempts.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { serviceClient, getSetting } from "../_shared/supabase.ts";
import { callClaude, DEFAULT_MODEL } from "../_shared/claude.ts";
import { sendEmail, sendSms, publishContent } from "../_shared/channels.ts";
import { json, corsHeaders } from "../_shared/cors.ts";

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
      return await generateContent(sb, task);
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

  const out = await callClaude({
    system: `You write ${kind} content for ${profile.name}. Voice: ${profile.voice}. ` +
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

  const autonomy = String(agent.autonomy || "draft");
  const { data } = await sb.from("content_items").insert({
    channel, kind, title, body,
    status: autonomy === "auto" ? "approved" : "pending_approval",
    created_by: "agent",
    meta: { mocked: out.mocked, topic },
  }).select("id").single();

  return { content_item_id: data?.id, status: autonomy === "auto" ? "approved" : "pending_approval", mocked: out.mocked };
}

// Draft (draft mode) or send (auto mode) a first-touch follow-up to a new lead.
async function followUpLead(sb: SupabaseClient, task: Task) {
  const contactId = String(task.payload.contact_id ?? "");
  const { data: contact } = await sb.from("contacts").select("*").eq("id", contactId).maybeSingle();
  if (!contact) throw new Error(`contact ${contactId} not found`);
  const { profile, agent } = await agentCfg(sb);

  const out = await callClaude({
    system: `You write brief, warm first-touch outreach for ${profile.name}. Voice: ${profile.voice}. ` +
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
    meta: { mocked: out.mocked, reason: "lead_follow_up" },
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

async function sendEmailTask(sb: SupabaseClient, task: Task) {
  const messageId = String(task.payload.message_id ?? "");
  const { data: msg } = await sb.from("messages").select("*").eq("id", messageId).maybeSingle();
  if (!msg) throw new Error(`message ${messageId} not found`);
  const res = await sendEmail({ to: msg.to_addr, subject: msg.subject ?? "", body: msg.body ?? "" });
  await sb.from("messages").update({
    status: res.ok ? "sent" : "failed",
    provider: res.provider, provider_id: res.providerId ?? null,
    error: res.error ?? null, sent_at: res.ok ? new Date().toISOString() : null,
    meta: { ...(msg.meta ?? {}), mocked: res.mocked },
  }).eq("id", messageId);
  if (!res.ok) throw new Error(res.error ?? "send failed");
  return { sent: true, mocked: res.mocked, provider: res.provider };
}

async function sendSmsTask(sb: SupabaseClient, task: Task) {
  const messageId = String(task.payload.message_id ?? "");
  const { data: msg } = await sb.from("messages").select("*").eq("id", messageId).maybeSingle();
  if (!msg) throw new Error(`message ${messageId} not found`);
  const res = await sendSms({ to: msg.to_addr, body: msg.body ?? "" });
  await sb.from("messages").update({
    status: res.ok ? "sent" : "failed",
    provider: res.provider, provider_id: res.providerId ?? null,
    error: res.error ?? null, sent_at: res.ok ? new Date().toISOString() : null,
    meta: { ...(msg.meta ?? {}), mocked: res.mocked },
  }).eq("id", messageId);
  if (!res.ok) throw new Error(res.error ?? "send failed");
  return { sent: true, mocked: res.mocked, provider: res.provider };
}

async function publishContentTask(sb: SupabaseClient, task: Task) {
  const itemId = String(task.payload.content_item_id ?? "");
  const { data: item } = await sb.from("content_items").select("*").eq("id", itemId).maybeSingle();
  if (!item) throw new Error(`content_item ${itemId} not found`);
  if (item.status !== "approved" && item.status !== "scheduled") {
    throw new Error(`content_item ${itemId} not approved (status=${item.status})`);
  }
  const res = publishContent(item.channel ?? "content", { title: item.title, body: item.body });
  await sb.from("content_items").update({
    status: res.ok ? "published" : "failed",
    published_at: res.ok ? new Date().toISOString() : null,
    external_id: res.providerId ?? null,
    meta: { ...(item.meta ?? {}), publish: res },
  }).eq("id", itemId);
  if (!res.ok) throw new Error(res.error ?? "publish failed");
  return { published: true, mocked: res.mocked, channel: item.channel };
}
