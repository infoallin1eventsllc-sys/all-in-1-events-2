// Thin wrapper around the Anthropic Messages API for edge functions.
// Uses the official SDK. Degrades to a deterministic mock when
// ANTHROPIC_API_KEY is not set, so the whole pipeline is testable
// end-to-end before any key is added.
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
