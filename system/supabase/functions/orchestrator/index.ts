// Orchestrator — the "always-on" brain.
// Runs on a schedule (pg_cron) or on demand. It gathers business goals,
// current CRM state, and durable memory, asks Claude for a short plan, and
// enqueues concrete tasks for the runner to execute.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serviceClient, getSetting } from "../_shared/supabase.ts";
import { callClaude, extractJson, DEFAULT_MODEL } from "../_shared/claude.ts";
import { contextBlock } from "../_shared/context.ts";
import { json, corsHeaders } from "../_shared/cors.ts";
import { authorizedRun } from "../_shared/runauth.ts";

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

  // The anon key alone no longer triggers runs — see _shared/runauth.ts.
  if (!(await authorizedRun(req, sb))) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

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

    // The shared context layer: the same business brief every agent reads.
    const business = await contextBlock(sb);

    const system =
      `You are the marketing operations agent for ${(profile as Record<string, unknown>).name}.\n\n` +
      `${business}\n\n` +
      `You plan a small batch of concrete marketing tasks each run. Be practical and non-repetitive. ` +
      `When planning generate_content tasks, set payload.topic to a SPECIFIC angle aimed at one of ` +
      `the customer profiles above (e.g. their pains or buying triggers) — never a generic "update for our audience". ` +
      `Also set payload.icp to the exact name of the customer profile you are targeting, so effort per profile ` +
      `can be measured later. If a "What actually happened" section appears above, treat its guidance as ` +
      `instructions about THIS cycle, not background reading. ` +
      `Only use these task types: generate_content, send_email, send_sms, publish_content, follow_up_lead. ` +
      `Respect autonomy="${(agent as Record<string, unknown>).autonomy}": in "draft" mode, prefer generate_content and follow_up_lead ` +
      `(a human approves before anything is sent/published). Never invent contact details.`;

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
      // Adaptive thinking spends from the same output budget as the answer.
      // At 2000 the reasoning consumed it all and the plan JSON was truncated
      // mid-object, so extractJson returned null and the run enqueued nothing
      // while reporting success. The plan itself is only a few hundred tokens;
      // the headroom is for the thinking that precedes it.
      maxTokens: 8000,
    });

    // An unparseable reply is a failed run, not a successful one. It used to
    // fall back to a truncated string and record status="success" with zero
    // tasks — indistinguishable, on the dashboard, from a cycle that genuinely
    // had nothing to do. This is the same class of silent failure that let the
    // system produce placeholder copy for two weeks without complaining.
    const plan = extractJson<Plan>(result.text);
    if (!plan) {
      const detail = result.mocked
        ? "no working Anthropic key, so the planner returned placeholder text"
        : `model reply was not valid JSON (${result.text.length} chars, ${result.usage?.output_tokens ?? "?"} output tokens \u2014 likely truncated)`;
      throw new Error(`could not parse a plan: ${detail}`);
    }

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

    return json({
      ok: true, mocked: result.mocked, summary: plan.summary, tasks_created: created,
      // Surfaced rather than swallowed: a planning run that silently fell back
      // to placeholder output looks identical to one that worked.
      ...(result.error ? { error: result.error } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await sb.from("agent_runs").update({
      status: "error", error: message, finished_at: new Date().toISOString(),
    }).eq("id", run?.id);
    return json({ ok: false, error: message }, 500);
  }
});
