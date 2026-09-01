// Orchestrator — the "always-on" brain.
// Runs on a schedule (pg_cron) or on demand. It gathers business goals,
// current CRM state, and durable memory, asks Claude for a short plan, and
// enqueues concrete tasks for the runner to execute.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serviceClient, getSetting } from "../_shared/supabase.ts";
import { callClaude, extractJson, DEFAULT_MODEL } from "../_shared/claude.ts";
import { loadBrandBrain, withBrand } from "../_shared/brand.ts";
import { json, corsHeaders } from "../_shared/cors.ts";

type PlannedTask = { type: string; payload?: Record<string, unknown>; priority?: number };
type Plan = { summary: string; tasks: PlannedTask[] };

const ALLOWED_TASK_TYPES = new Set([
  "generate_content",
  "send_email",
  "send_sms",
  "publish_content",
  "follow_up_lead",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = serviceClient();

  // Open a run record for observability.
  const { data: run } = await sb
    .from("agent_runs")
    .insert({ trigger: "cron", status: "running" })
    .select()
    .single();

  try {
    const [profile, goals, agent] = await Promise.all([
      getSetting(sb, "business_profile", { name: "Your Business", voice: "warm, professional" }),
      getSetting(sb, "goals", { primary: "Book more work", weekly_content_target: 5, follow_up_within_hours: 24 }),
      getSetting(sb, "agent", { model: DEFAULT_MODEL, autonomy: "draft" }),
    ]);

    // Snapshot of current state the agent should reason over.
    const [newLeads, openDeals, recentContent, recentMemory] = await Promise.all([
      sb.from("contacts").select("id, full_name, email, source, created_at")
        .eq("lifecycle_stage", "lead").order("created_at", { ascending: false }).limit(10),
      sb.from("deals").select("id, title, stage, amount").in("stage", ["new", "quoted"]).limit(10),
      sb.from("content_items").select("status, kind, created_at")
        .gte("created_at", new Date(Date.now() - 7 * 864e5).toISOString()),
      sb.from("memory").select("content").order("created_at", { ascending: false }).limit(8),
    ]);

    const publishedThisWeek =
      (recentContent.data ?? []).filter((c) => c.status === "published").length;
    const contentTarget = Number((goals as Record<string, unknown>).weekly_content_target ?? 5);

    const context = {
      business: profile,
      goals,
      state: {
        new_leads: newLeads.data ?? [],
        open_deals: openDeals.data ?? [],
        content_published_this_week: publishedThisWeek,
        weekly_content_target: contentTarget,
      },
      memory: (recentMemory.data ?? []).map((m) => m.content),
    };

    // The planner picks topics, so it needs to know what the business actually
    // sells and who for — otherwise it proposes generic "engagement" content.
    // It gets the same brief the writer does; nothing downstream is improved by
    // planning in ignorance of the brand and then correcting for it later.
    const brand = await loadBrandBrain(sb, String((profile as Record<string, unknown>).brand ?? ""));

    const system = withBrand(
      brand,
      `You are the marketing operations agent for ${(profile as Record<string, unknown>).name}. ` +
      `You plan a small batch of concrete marketing tasks each run. Be practical and non-repetitive. ` +
      `Only use these task types: generate_content, send_email, send_sms, publish_content, follow_up_lead. ` +
      `Respect autonomy="${(agent as Record<string, unknown>).autonomy}": in "draft" mode, prefer generate_content and follow_up_lead ` +
      `(a human approves before anything is sent/published). Never invent contact details.`,
      String((profile as Record<string, unknown>).voice ?? ""),
    );

    const prompt =
      `Here is the current context as JSON:\n\n${JSON.stringify(context, null, 2)}\n\n` +
      `Decide what to do this cycle. Prioritise: (1) follow up brand-new leads within ` +
      `${(goals as Record<string, unknown>).follow_up_within_hours}h, (2) keep content pace toward the weekly target, ` +
      `(3) advance open deals. Return ONLY JSON of the form:\n` +
      `{"summary": "one sentence", "tasks": [{"type": "...", "payload": {...}, "priority": 100}]}\n` +
      `Keep it to at most 5 tasks.`;

    const result = await callClaude({
      system,
      prompt,
      model: String((agent as Record<string, unknown>).model || DEFAULT_MODEL),
      thinking: true,
      maxTokens: 2000,
    });

    const plan = extractJson<Plan>(result.text) ?? { summary: result.text.slice(0, 200), tasks: [] };

    // Enqueue valid tasks, mapping follow_up_lead onto queued leads.
    let created = 0;
    const toInsert: Record<string, unknown>[] = [];
    for (const t of plan.tasks ?? []) {
      if (!ALLOWED_TASK_TYPES.has(t.type)) continue;
      if (t.type === "follow_up_lead") {
        // Fan out to each new lead that has no follow-up task yet.
        for (const lead of newLeads.data ?? []) {
          toInsert.push({
            type: "follow_up_lead",
            payload: { contact_id: lead.id },
            priority: 50,
            dedupe_key: `follow_up_lead:${lead.id}`,
          });
        }
      } else {
        toInsert.push({ type: t.type, payload: t.payload ?? {}, priority: t.priority ?? 100 });
      }
    }
    if (toInsert.length) {
      // Ignore dedupe conflicts (a lead already queued) rather than failing the run.
      const { data: ins } = await sb.from("tasks").upsert(toInsert, {
        onConflict: "dedupe_key",
        ignoreDuplicates: true,
      }).select("id");
      created = ins?.length ?? 0;
    }

    await sb.from("agent_runs").update({
      status: "success",
      summary: plan.summary,
      plan: plan as unknown as Record<string, unknown>,
      tasks_created: created,
      tokens_in: result.usage?.input_tokens ?? null,
      tokens_out: result.usage?.output_tokens ?? null,
      finished_at: new Date().toISOString(),
    }).eq("id", run?.id);

    return json({ ok: true, mocked: result.mocked, summary: plan.summary, tasks_created: created });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await sb.from("agent_runs").update({
      status: "error", error: message, finished_at: new Date().toISOString(),
    }).eq("id", run?.id);
    return json({ ok: false, error: message }, 500);
  }
});
