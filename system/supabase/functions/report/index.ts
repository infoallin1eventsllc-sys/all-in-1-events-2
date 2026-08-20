// Report — generates a plain-language owner summary from CRM data for a period
// (default: last 7 days) and stores it in `reports`. Scheduled weekly via pg_cron.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serviceClient, getSetting } from "../_shared/supabase.ts";
import { callClaude, DEFAULT_MODEL } from "../_shared/claude.ts";
import { json, corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = serviceClient();

  const days = 7;
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const periodStart = since.slice(0, 10);
  const periodEnd = new Date().toISOString().slice(0, 10);

  // Gather the week's numbers.
  const [leads, deals, messages, content] = await Promise.all([
    sb.from("contacts").select("id, lifecycle_stage, source, created_at").gte("created_at", since),
    sb.from("deals").select("id, stage, amount, created_at").gte("created_at", since),
    sb.from("messages").select("id, channel, status, direction").gte("created_at", since),
    sb.from("content_items").select("id, channel, status").gte("created_at", since),
  ]);

  const leadRows = leads.data ?? [];
  const dealRows = deals.data ?? [];
  const msgRows = messages.data ?? [];
  const contentRows = content.data ?? [];

  const metrics = {
    period: { start: periodStart, end: periodEnd },
    new_leads: leadRows.length,
    new_leads_by_source: countBy(leadRows, "source"),
    deals_won: dealRows.filter((d) => d.stage === "won" || d.stage === "completed").length,
    pipeline_value: dealRows.filter((d) => ["new", "quoted"].includes(d.stage))
      .reduce((s, d) => s + Number(d.amount ?? 0), 0),
    emails_sent: msgRows.filter((m) => m.channel === "email" && m.status === "sent").length,
    sms_sent: msgRows.filter((m) => m.channel === "sms" && m.status === "sent").length,
    content_published: contentRows.filter((c) => c.status === "published").length,
    content_awaiting_approval: contentRows.filter((c) => c.status === "pending_approval").length,
  };

  const profile = await getSetting(sb, "business_profile", { name: "Your Business" }) as Record<string, unknown>;
  const agent = await getSetting(sb, "agent", { model: DEFAULT_MODEL }) as Record<string, unknown>;

  const out = await callClaude({
    system: `You are the marketing assistant for ${profile.name}. Write a short, upbeat but honest ` +
      `weekly summary for a busy owner with no marketing background. Plain language, no jargon. ` +
      `3-5 short paragraphs or bullets. End with one clear suggested next step.`,
    prompt: `Here are this week's numbers as JSON:\n${JSON.stringify(metrics, null, 2)}\n\n` +
      `Write the owner summary. Be specific about what happened and what it means.`,
    model: String(agent.model || DEFAULT_MODEL),
    maxTokens: 1200,
  });

  const { data: report } = await sb.from("reports").insert({
    kind: "owner_summary",
    title: `Weekly summary — ${periodStart} to ${periodEnd}`,
    period_start: periodStart, period_end: periodEnd,
    body: out.text, metrics,
  }).select("id").single();

  return json({ ok: true, report_id: report?.id, mocked: out.mocked, metrics });
});

function countBy(rows: Record<string, unknown>[], key: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = String(r[key] ?? "unknown");
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
