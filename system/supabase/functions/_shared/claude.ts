// Thin wrapper around the Anthropic Messages API for edge functions.
// Uses the official SDK. Degrades to a deterministic mock when
// ANTHROPIC_API_KEY is not set, so the whole pipeline is testable
// end-to-end before any key is added.
import Anthropic from "npm:@anthropic-ai/sdk@0.68.0";

export const DEFAULT_MODEL = "claude-opus-5";

export type ClaudeResult = {
  text: string;
  mocked: boolean;
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
  return !!Deno.env.get("ANTHROPIC_API_KEY");
}

export async function callClaude(opts: CallOpts): Promise<ClaudeResult> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  const model = opts.model || DEFAULT_MODEL;

  // Mock mode: no key yet. Return something structured so downstream code works.
  if (!key) {
    return { text: mockFor(opts.prompt), mocked: true };
  }

  const client = new Anthropic({ apiKey: key });
  const body: Record<string, unknown> = {
    model,
    max_tokens: opts.maxTokens ?? 4000,
    system: opts.system,
    messages: [{ role: "user", content: opts.prompt }],
  };
  if (opts.thinking) body.thinking = { type: "adaptive" };

  // deno-lint-ignore no-explicit-any
  const resp: any = await client.messages.create(body as any);
  const text = (resp.content ?? [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("\n")
    .trim();
  return { text, mocked: false, usage: resp.usage };
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
  if (/plan/i.test(prompt)) {
    return JSON.stringify({
      summary: "[mock] Draft one welcome email and one social post for pending leads.",
      tasks: [
        { type: "generate_content", payload: { channel: "content", kind: "post", topic: "Weekly highlight" } },
      ],
    });
  }
  return "[mock] This is placeholder copy generated without an Anthropic API key. Add ANTHROPIC_API_KEY to produce real content.";
}
