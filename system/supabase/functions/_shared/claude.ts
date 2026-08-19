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
  const key = Deno.env.get("ANTHROPIC_API_KEY");
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

function mockFor(prompt: string): string {
  if (/\bplan\b|ONLY JSON|"tasks"/i.test(prompt)) {
    return JSON.stringify({
      summary: "[mock] Follow up new leads and draft one seasonal post.",
      tasks: [
        { type: "follow_up_lead" },
        { type: "generate_content", payload: { channel: "instagram", kind: "post", topic: "Seasonal highlight" } },
      ],
    });
  }
  if (/follow-up|outreach|invites a reply/i.test(prompt)) {
    return JSON.stringify({
      subject: "Thanks for reaching out",
      body: "[mock draft] Hi there — thanks so much for getting in touch! We'd love to help make your event unforgettable. Could you share your date and guest count? I'll put together a couple of options right away. (This is placeholder text — add an Anthropic key for real, personalized copy.)",
    });
  }
  if (/write a|content|post|caption/i.test(prompt)) {
    return JSON.stringify({
      title: "[mock draft] Your Event, Elevated",
      body: "[mock draft] ✨ From lighting to photo booths to a DJ that keeps the floor packed — we handle the details so you can enjoy the night. Booking now for the season. DM us to reserve your date. (Placeholder text — add an Anthropic key for real, on-brand copy.)",
    });
  }
  return "[mock] Placeholder copy generated without an Anthropic API key. Add ANTHROPIC_API_KEY to produce real content.";
}
