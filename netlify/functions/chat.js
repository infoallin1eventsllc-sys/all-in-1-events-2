/**
 * Event Concierge — chat backend.
 *
 * The Anthropic API key lives only here, in the function's environment. It must
 * never reach the browser: anyone holding it can spend against your account.
 *
 * Degrades rather than breaks. With no key configured this returns a specific
 * `not_configured` response, and the page falls back to its scripted answers
 * and tells the visitor that is what is happening — the same
 * demo-until-you-add-a-key behaviour the Meridian system uses.
 *
 * Setup: Netlify → Site settings → Environment variables → ANTHROPIC_API_KEY.
 */

const Anthropic = require("@anthropic-ai/sdk");

const MODEL = "claude-opus-5";
const MAX_TOKENS = 2048;      // a cap, not a target — the prompt asks for brevity
const MAX_MESSAGE = 800;
const MAX_HISTORY = 10;

const SYSTEM_PROMPT = [
  "You are the Event Concierge for All in 1 Events, a luxury event production",
  "company: photo booths (including a Magic Mirror booth), lighting design, VIP",
  "lounge rentals and full event planning.",
  "",
  "Be brief and concrete — two or three sentences unless asked for detail.",
  "Packages start around $1,500 for a photo booth with an attendant and scale",
  "with lighting, VIP lounge and full production.",
  "",
  "Never invent a firm quote, a confirmed booking, or availability for a",
  "specific date: you cannot see the calendar. When someone wants either, tell",
  "them to use the Start Inquiry button so a person can confirm.",
  "If you do not know something, say so rather than guessing."
].join("\n");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "POST only" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json(503, {
      error: "not_configured",
      message:
        "ANTHROPIC_API_KEY is not set. Add it in Netlify → Site settings → " +
        "Environment variables, then redeploy."
    });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "invalid JSON" });
  }

  const message =
    typeof body.message === "string" ? body.message.trim().slice(0, MAX_MESSAGE) : "";
  if (!message) return json(400, { error: "message required" });

  // Keep only well-formed turns and cap the window. An unbounded history on a
  // public endpoint is the easy way to run up a bill.
  const history = Array.isArray(body.history)
    ? body.history
        .filter(
          (m) =>
            m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
        )
        .slice(-MAX_HISTORY)
        .map((m) => ({ role: m.role, content: String(m.content).slice(0, MAX_MESSAGE) }))
    : [];

  // The client appends the outgoing message to history before sending, so drop
  // the duplicate rather than asking the model the same thing twice.
  const last = history[history.length - 1];
  const messages =
    last && last.role === "user" && last.content === message
      ? history
      : [...history, { role: "user", content: message }];

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      // Low effort suits short factual concierge answers and keeps latency and
      // cost down. Preferred over disabling thinking, which can leak internal
      // tags into the reply.
      output_config: { effort: "low" },
      // If a safety classifier declines, the API retries on a fallback model
      // inside the same call rather than the visitor getting nothing.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      messages
    });

    // A refusal is a 200 with no useful text — check before reading content.
    if (response.stop_reason === "refusal") {
      return json(200, {
        reply:
          "I can't help with that one. For anything about your event, use Start " +
          "Inquiry and a person will get back to you."
      });
    }

    const reply = (Array.isArray(response.content) ? response.content : [])
      .filter((b) => b && b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    if (!reply) return json(502, { error: "empty", message: "The model returned no text." });

    return json(200, { reply });
  } catch (err) {
    // Surface the provider's own message — "invalid x-api-key" tells whoever is
    // setting this up exactly what is wrong, where "chat failed" does not.
    const status = err && err.status;
    if (status === 401) {
      return json(502, {
        error: "auth",
        message: "The Anthropic API key was rejected. Re-copy the full key from console.anthropic.com."
      });
    }
    if (status === 429) {
      return json(502, { error: "rate_limit", message: "Rate limited — try again shortly." });
    }
    return json(502, { error: "upstream", message: (err && err.message) || "Unknown error" });
  }
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body)
  };
}
