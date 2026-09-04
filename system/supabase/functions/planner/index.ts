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
const LIMIT_PER_HOUR = 12;
const FIELD_MAX = 600;

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
    return json({ ok: true, ai: await keyAvailable(), model: MODEL });
  }
  if (action !== "advisor" && action !== "simulate") return json({ ok: false, error: "unknown action" }, 400);

  const sb = serviceClient();
  const { data: allowed, error: rlErr } = await sb.rpc("planner_allow", {
    p_ip_hash: await ipHash(req), p_action: action, p_limit: LIMIT_PER_HOUR, p_window: "1 hour",
  });
  if (rlErr) return json({ ok: false, error: "planner unavailable" }, 503);
  if (!allowed) return json({ ok: false, error: "hourly allowance used" }, 429);

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
