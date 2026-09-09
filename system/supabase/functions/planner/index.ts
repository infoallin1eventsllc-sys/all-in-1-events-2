// Meridian Stack Planner — the one server call the planner app makes.
//
// Public on purpose: the planner is a sales tool clients use without an
// account. Two things need a model — the advisor's blueprint and a custom
// workflow trace — and both come through here so the Claude key never leaves
// the server. Cost is bounded by a per-address hourly allowance (see migration
// 0017) and by hard caps on input length and output tokens. Nothing about the
// caller is kept except a salted hash of the address for that allowance.
import { callClaude, extractJson, keyAvailable } from "../_shared/claude.ts";
import { serviceClient } from "../_shared/supabase.ts";

const MODEL = "claude-sonnet-5"; // the workhorse tier: plenty for a proposal, priced for a public tool
const FIELD_MAX = 600;
const PLAN_MAX = 20_000; // a plan the client exported, not free-form input

// Per action, per address, per hour. Sending a plan is the point of the tool,
// so its allowance is counted separately from the model calls (migration 0018).
const LIMITS: Record<string, number> = { advisor: 12, simulate: 12, send_plan: 5 };

/* -------------------------------------------------------- the spend ceiling --
   The per-address allowance above bounds what one visitor can cost. It does not
   bound the total, and this endpoint is deliberately open to any origin: the
   planner is a public sales tool and the front end that calls it is downloadable
   by anyone. So a copy of that front end, pointed back at this endpoint, would
   spend Meridian's Anthropic credit with no upper limit — the per-address cap
   only asks the abuser to rotate addresses.

   This is that upper limit. Every allowed model call is already recorded in
   planner_requests, so the ceiling is a count over the last 24 hours rather than
   a new table to keep.

   Rolling 24 hours, not a calendar day, for two reasons: no timezone or
   daylight-saving arithmetic to get wrong, and a midnight reset would let
   someone burn the budget twice in ten minutes by straddling it.

   The number lives in settings so it can be changed with one UPDATE and no
   redeploy, the same way the run secret is handled:

     update settings set value = '{"model_calls_per_day": 120}'::jsonb
      where key = 'planner_budget';

   Worst case per call is roughly ten cents — 5,000 output tokens on Sonnet 5 at
   $10 per million, plus input and thinking — so 60 is about $6 a day at the
   ceiling, and the ceiling is only reached under abuse. */
const MODEL_ACTIONS = ["advisor", "simulate"];
const DEFAULT_DAILY_MODEL_CALLS = 60;

async function modelCallsLeft(sb: ReturnType<typeof serviceClient>): Promise<number> {
  const { data } = await sb.from("settings").select("value").eq("key", "planner_budget").maybeSingle();
  const cap = Number((data?.value as { model_calls_per_day?: number } | null)?.model_calls_per_day);
  const limit = Number.isFinite(cap) && cap >= 0 ? cap : DEFAULT_DAILY_MODEL_CALLS;

  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count, error } = await sb
    .from("planner_requests")
    .select("ip_hash", { count: "exact", head: true })
    .in("action", MODEL_ACTIONS)
    .gte("created_at", since);

  // If the count cannot be read, do not treat that as permission to spend.
  if (error) return 0;
  return Math.max(0, limit - (count ?? 0));
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });

async function ipHash(req: Request): Promise<string> {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
    req.headers.get("cf-connecting-ip") || "unknown";
  const salt = Deno.env.get("RUN_SECRET") ?? "planner";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${ip}`));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const clean = (v: unknown): string => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, FIELD_MAX);

const VOICE = `You write for Meridian Interface, a Houston web and software studio that designs and builds agentic tech stacks for growing businesses. Plain words a business owner understands. Short sentences. No hype, no buzzwords, no exclamation marks. Never claim a certification (SOC 2, ISO 27001, HIPAA) or an audit result; describe what the design does and what the business would still have to obtain. Costs are estimates and say so. Name real, current tools and models; when you name a Claude model use these ids and prices per million tokens: Claude Sonnet 5 ($2 in / $10 out) for everyday work, Claude Opus 5 ($5 / $25) for hard judgement, Claude Haiku 4.5 ($1 / $5) for high-volume simple tasks. The five layers are: 1 Foundation model, 2 Orchestration (LangGraph or Temporal), 3 Memory and context (pgvector, Qdrant, Redis, Mem0), 4 Tools and protocols (MCP servers, OpenAPI, sandboxed code), 5 Governance (approval gates, PII masking, tracing with Langfuse/OpenTelemetry, per-agent identity). A person approves anything over an agreed threshold; say so where it applies. Answer with one JSON object and nothing else.`;

const ADVISOR_SHAPE = `{
  "summary": "3-5 sentences: what to automate first for this business and why, in plain words",
  "stackLayers": [ { "layer": "1. Foundation model", "component": "the choice", "role": "what it does for this business", "status": "Recommended | Optional | Later", "estimatedCost": "$X - $Y / mo (estimate)" } ],
  "phasedDeployment": [ { "phase": "Weeks 1-2: ...", "impact": "one line on what changes for the business", "actions": ["3-5 concrete actions"] } ],
  "guardrailRecommendations": ["4-6 specific rules: who approves what, what is masked, what the agents may never do"],
  "projectedMetrics": { "monthlyHoursSaved": 120, "headcountEquivalentLeverage": "0.7 FTE", "projectedMonthlySavings": "$4,200 (estimate)", "paybackWeeks": 9 }
}`;

const SIMULATE_SHAPE = `{ "steps": [ {
  "agentName": "name of the agent",
  "role": "its job in one line",
  "thought": "what it is reasoning about at this step, first person, 1-2 sentences",
  "toolCall": { "server": "mcp-<system>", "tool": "verb_noun", "args": { } },
  "toolResult": { },
  "guardrailCheck": { "passed": true, "rule": "the rule that was checked" },
  "requiresHumanApproval": false,
  "humanPrompt": "only when requiresHumanApproval is true: the question put to the person"
} ] }`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ ok: false, error: "bad JSON" }, 400); }
  const action = clean(body.action);

  if (action === "status") {
    // `ai` is what the front end reads to decide whether to offer the advisor.
    // A spent budget is reported the same way an absent key is, so the page it
    // already renders for "offline" covers this with no change at the client.
    const sb = serviceClient();
    const ready = (await keyAvailable()) && (await modelCallsLeft(sb)) > 0;
    return json({ ok: true, ai: ready, model: MODEL });
  }
  if (!(action in LIMITS)) return json({ ok: false, error: "unknown action" }, 400);

  const sb = serviceClient();

  /* Checked before planner_allow, which RECORDS the call it permits. Checking
     after would let refused calls count against the ceiling and drain it. */
  if (MODEL_ACTIONS.includes(action) && (await modelCallsLeft(sb)) <= 0) {
    return json({
      ok: false,
      error:
        "The AI advisor has reached its limit for today. Everything else on this page still works, and Meridian can run this with you on a call — the Send button below files your plan either way.",
    }, 503);
  }

  const { data: allowed, error: rlErr } = await sb.rpc("planner_allow", {
    p_ip_hash: await ipHash(req), p_action: action, p_limit: LIMITS[action], p_window: "1 hour",
  });
  if (rlErr) return json({ ok: false, error: "planner unavailable" }, 503);
  if (!allowed) return json({ ok: false, error: "hourly allowance used" }, 429);

  // Sending a plan needs no model, so it works even with the advisor offline.
  if (action === "send_plan") return await sendPlan(body);

  if (!(await keyAvailable())) {
    return json({ ok: false, error: "The AI advisor is offline right now. Everything else on this page still works, and Meridian can run this with you on a call." }, 503);
  }

  if (action === "advisor") {
    const p = {
      companyName: clean(body.companyName), industry: clean(body.industry), stage: clean(body.stage),
      teamSize: clean(body.teamSize), monthlyBudget: clean(body.monthlyBudget), currentTools: clean(body.currentTools),
      painPoints: clean(body.painPoints), targetAutonomyGoal: clean(body.targetAutonomyGoal),
    };
    if (!p.companyName && !p.painPoints) return json({ ok: false, error: "Tell us at least the company and what slows it down." }, 400);

    const r = await callClaude({
      model: MODEL, thinking: true, maxTokens: 5000, system: VOICE,
      prompt: `Write a stack plan for this business.

Company: ${p.companyName || "(not given)"}
Industry: ${p.industry || "(not given)"}
Stage: ${p.stage || "(not given)"}
Team: ${p.teamSize || "(not given)"}
Monthly budget for AI and infrastructure: ${p.monthlyBudget || "(not given)"}
Tools already in use: ${p.currentTools || "(not given)"}
What slows them down: ${p.painPoints || "(not given)"}
How far they want automation to go: ${p.targetAutonomyGoal || "(not given)"}

Give exactly five stackLayers, one per layer in order, and three phases. Keep the whole plan inside the stated budget where one is given, and say if it cannot be. Return JSON in this shape:
${ADVISOR_SHAPE}`,
    });
    if (r.mocked) return json({ ok: false, error: r.error ? `The AI advisor could not answer: ${r.error}` : "The AI advisor is offline right now." }, 503);
    const blueprint = extractJson<Record<string, unknown>>(r.text);
    if (!blueprint || !Array.isArray(blueprint.stackLayers)) return json({ ok: false, error: "The advisor gave an answer this page could not read. Try again." }, 502);
    return json({ ok: true, blueprint, model: MODEL, usage: r.usage });
  }

  // simulate
  const goal = clean(body.goal);
  const ctx = clean(body.companyContext) || "a growing business that wants automation with a person approving anything that matters";
  if (goal.length < 8) return json({ ok: false, error: "Describe the goal in a sentence." }, 400);
  const r = await callClaude({
    model: MODEL, thinking: false, maxTokens: 4000, system: VOICE,
    prompt: `Trace how a small team of agents would carry out this goal, step by step, for ${ctx}.

Goal: ${goal}

Write 4 to 6 steps. Each step is one agent doing one thing with one tool. At least one step must stop for a person (requiresHumanApproval true, with a humanPrompt) before money moves, a customer is contacted, or a record is changed. Tool servers are MCP servers named after the system, e.g. mcp-hubspot, mcp-quickbooks, mcp-gmail. Return JSON in this shape:
${SIMULATE_SHAPE}`,
  });
  if (r.mocked) return json({ ok: false, error: "The AI simulator is offline right now." }, 503);
  const parsed = extractJson<{ steps?: unknown[] }>(r.text);
  const steps = Array.isArray(parsed?.steps) ? parsed!.steps : null;
  if (!steps || steps.length === 0) return json({ ok: false, error: "The simulator gave an answer this page could not read. Try again." }, 502);
  return json({ ok: true, steps, model: MODEL, usage: r.usage });
});

/**
 * The client sends the plan they just built to Meridian.
 *
 * This is what turns the planner from a brochure into a lead source: the
 * person who spent twenty minutes choosing a stack is the most qualified
 * enquiry the studio gets, and until now the only thing they could do with the
 * result was download a file. The plan goes to the same `intake` webhook the
 * website's booking form uses, so it lands as a contact with an activity and a
 * queued follow-up — one lead path, not two.
 *
 * The webhook secret stays server-side, which is the reason this hop exists at
 * all rather than the browser calling intake directly.
 */
async function sendPlan(body: Record<string, unknown>): Promise<Response> {
  const email = clean(body.email).toLowerCase();
  const phone = clean(body.phone);
  if (!email && !phone) return json({ ok: false, error: "Add an email address or a phone number so we can reply." }, 400);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ ok: false, error: "That email address does not look right." }, 400);
  }

  const plan = String(body.plan ?? "").trim().slice(0, PLAN_MAX);
  if (plan.length < 40) return json({ ok: false, error: "Build a plan first, then send it." }, 400);

  const name = clean(body.name);
  const company = clean(body.company);
  const note = clean(body.note);
  const stage = clean(body.stage);

  const message = [
    "Sent from the Meridian Stack Planner.",
    stage ? `Stage: ${stage}` : null,
    note ? `What they said: ${note}` : null,
    "",
    "--- the plan they built ---",
    plan,
  ].filter((l) => l !== null).join("\n");

  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/intake`;
  const secret = Deno.env.get("WEBHOOK_SECRET");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret ? { "x-webhook-secret": secret } : {}),
        ...(anon ? { authorization: `Bearer ${anon}` } : {}),
      },
      body: JSON.stringify({
        name: name || null, email: email || null, phone: phone || null, company: company || null,
        message,
        source: "meridian-website:stack-planner",
        consent_email: !!email,
      }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || out?.ok === false) {
      return json({ ok: false, error: "We could not file that just now. Email it to otis@meridianinterface.com and it will not be lost." }, 502);
    }
    return json({ ok: true });
  } catch {
    return json({ ok: false, error: "We could not reach the studio's system. Email the plan to otis@meridianinterface.com and it will not be lost." }, 502);
  }
}
