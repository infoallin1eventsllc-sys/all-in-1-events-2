// Thin wrapper around the Anthropic Messages API for edge functions.
//
// Three modes, picked automatically:
//   1. KEYROUTER_URL set   → route through Key Router, which holds the keys,
//      meters usage per key and rotates before a quota runs out. No Anthropic
//      key lives here at all — that is the point of routing through it.
//   2. ANTHROPIC_API_KEY   → call Anthropic directly with the SDK.
//   3. neither             → deterministic mock, so the whole pipeline stays
//      testable end-to-end before any key exists.
import Anthropic from "npm:@anthropic-ai/sdk@0.68.0";
import { serviceClient } from "./supabase.ts";

export const DEFAULT_MODEL = "claude-opus-5";

export type ClaudeResult = {
  text: string;
  mocked: boolean;
  error?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
};

type CallOpts = {
  system: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
  thinking?: boolean; // adaptive thinking for harder reasoning (e.g. planning)
};

export function hasKey(): boolean {
  return !!Deno.env.get("ANTHROPIC_API_KEY") || !!Deno.env.get("KEYROUTER_URL");
}

/**
 * Where the Anthropic key comes from.
 *
 * The edge secret is still preferred and nothing changes when it is set
 * correctly. The `settings` fallback exists because the Secrets page can
 * silently keep an old value: this project spent two weeks producing
 * placeholder copy with a 16-character string in that field, and repeated
 * saves did not change it.
 *
 * A key is only accepted if it looks like one. That matters more than it
 * sounds — the whole failure was a field holding something that was not a key,
 * and treating it as one produced a 401 on every call with nothing to show for
 * it. A label typed into either place is now ignored rather than sent.
 *
 * `settings` is service-role only behind deny-by-default RLS, the same place
 * the run secret lives for the same reason: it can be rotated with one UPDATE
 * and no redeploy.
 */
const looksLikeKey = (v: string | undefined | null): boolean =>
  !!v && v.startsWith("sk-ant-") && v.length > 40 && !/\s/.test(v);

let settingsKey: string | null | undefined; // undefined = not looked up yet

async function resolveKey(): Promise<string | undefined> {
  const env = Deno.env.get("ANTHROPIC_API_KEY")?.trim();
  if (looksLikeKey(env)) return env;

  if (settingsKey === undefined) {
    try {
      const { data } = await serviceClient()
        .from("settings").select("value").eq("key", "anthropic").maybeSingle();
      const k = String((data?.value as { api_key?: string } | null)?.api_key ?? "").trim();
      settingsKey = looksLikeKey(k) ? k : null;
    } catch {
      settingsKey = null;
    }
  }
  return settingsKey ?? undefined;
}

/** Rough token estimate for the pre-flight routing decision (~4 chars/token). */
function estimateTokens(opts: CallOpts): number {
  const chars = (opts.system?.length ?? 0) + (opts.prompt?.length ?? 0);
  return Math.max(1, Math.ceil(chars / 4) + (opts.maxTokens ?? 4000));
}

/** Shape the Anthropic Messages body once, for either transport. */
function buildBody(opts: CallOpts, model: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    max_tokens: opts.maxTokens ?? 4000,
    system: opts.system,
    messages: [{ role: "user", content: opts.prompt }],
  };
  if (opts.thinking) body.thinking = { type: "adaptive" };
  return body;
}

/**
 * Call Anthropic via Key Router. Key Router owns the secret, so nothing here
 * needs one; we send the request body as `payload` and it returns Anthropic's
 * reply untouched under `response`.
 */
async function viaKeyRouter(opts: CallOpts, model: string): Promise<ClaudeResult> {
  const base = Deno.env.get("KEYROUTER_URL")!.replace(/\/$/, "");
  const token = Deno.env.get("KEYROUTER_AUTH_TOKEN");

  const res = await fetch(`${base}/v1/route`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      tokens: estimateTokens(opts),
      payload: buildBody(opts, model),
    }),
  });

  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error || `key router responded ${res.status}`);

  // deno-lint-ignore no-explicit-any
  const reply: any = j.response ?? {};
  const text = (reply.content ?? [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("\n")
    .trim();
  return { text, mocked: false, usage: reply.usage };
}

export async function callClaude(opts: CallOpts): Promise<ClaudeResult> {
  const key = await resolveKey();
  const routerUrl = Deno.env.get("KEYROUTER_URL");
  const model = opts.model || DEFAULT_MODEL;

  // Mock mode: nothing configured yet. Structured output keeps downstream code
  // working so the pipeline can be exercised before any key exists.
  if (!key && !routerUrl) {
    return { text: mockFor(opts.prompt), mocked: true };
  }

  if (routerUrl) {
    try {
      return await viaKeyRouter(opts, model);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      // Key Router being down must not take marketing down with it: fall back
      // to a direct call when we still hold a key, otherwise to mock.
      if (!key) return { text: mockFor(opts.prompt), mocked: true, error: reason };
    }
  }

  // Unreachable in practice (the router branch returns either way when there is
  // no key), but it keeps `key` provably defined for the SDK call below.
  if (!key) return { text: mockFor(opts.prompt), mocked: true };

  const client = new Anthropic({ apiKey: key });
  const body = buildBody(opts, model);

  try {
    // deno-lint-ignore no-explicit-any
    const resp: any = await client.messages.create(body as any);
    const text = (resp.content ?? [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("\n")
      .trim();
    return { text, mocked: false, usage: resp.usage };
  } catch (err) {
    // Key missing/invalid/rate-limited → degrade to mock so the pipeline keeps
    // running. Surface the reason so the dashboard/logs can show it.
    const reason = err instanceof Error ? err.message : String(err);
    return { text: mockFor(opts.prompt), mocked: true, error: reason };
  }
}

// Parse the first JSON object/array found in a model response.
export function extractJson<T = unknown>(text: string): T | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : text;
  const start = candidate.search(/[[{]/);
  if (start === -1) return null;
  try {
    return JSON.parse(candidate.slice(start)) as T;
  } catch {
    // Try to locate a balanced object as a fallback.
    try {
      const objMatch = candidate.match(/[[{][\s\S]*[\]}]/);
      return objMatch ? (JSON.parse(objMatch[0]) as T) : null;
    } catch {
      return null;
    }
  }
}

/**
 * Placeholder copy used whenever there is no working Anthropic key.
 *
 * This must read as MERIDIAN INTERFACE — a web and software studio — and not as
 * the events client this system was first built for. It shipped that way, and
 * every draft in the approval queue came out asking web-design leads for their
 * "date and guest count". Placeholder text still reaches a human: the owner
 * reads it in the approval queue, and with autonomy set to `auto` a lead would
 * receive it. Keep it on-brand, keep the [mock] marker, and keep it consistent
 * with settings.content_rules — plain words, real prices, no filler verbs.
 */
function mockFor(prompt: string): string {
  if (/\bplan\b|ONLY JSON|"tasks"/i.test(prompt)) {
    return JSON.stringify({
      summary: "[mock] Follow up new leads and draft one post about what a site actually costs.",
      tasks: [
        { type: "follow_up_lead" },
        { type: "generate_content", payload: { channel: "instagram", kind: "post", topic: "What a small-business website costs" } },
      ],
    });
  }
  if (/follow-up|outreach|invites a reply/i.test(prompt)) {
    return JSON.stringify({
      subject: "Thanks for reaching out",
      body: "[mock draft] Thanks for getting in touch. So I can give you a real number rather than a range: what does the business do, and is this a new site or a rebuild of one you already have? If there is a site now, send me the address and I will tell you what I would change before you spend anything. (This is placeholder text — add an Anthropic key for real, personalised copy.)",
    });
  }
  // The summary branch must come before the content branch: the report prompt
  // ("Write the owner summary...") also matches /write a/, and used to fall
  // through to the caption mock — a weekly report that read like an Instagram
  // post. Keyed on phrases only the report prompt contains.
  if (/owner summary|week's numbers/i.test(prompt)) {
    return "[mock] This week: leads came in and were followed up, drafts were queued for your approval, and the pipeline advanced. (Placeholder summary — add an Anthropic key for a real one written from the actual numbers. The metrics shown beside this text are real either way.)\n\nSuggested next step: review the approval queue.";
  }
  if (/write a|content|post|caption/i.test(prompt)) {
    return JSON.stringify({
      title: "[mock draft] What a small-business website actually costs",
      body: "[mock draft] A single landing page is $3,800. A 3-7 page business site is $8,500. Those are the real numbers, published on our site, because a quote you cannot get without a sales call is not a price. What is not included: we do not run your ads, and we do not promise a Google ranking. What is: a site you can edit yourself without calling us. (Placeholder text — add an Anthropic key for real, on-brand copy.)",
    });
  }
  return "[mock] Placeholder copy generated without an Anthropic API key. Add ANTHROPIC_API_KEY to produce real content.";
}
