// Picks the agent: Claude when a key is configured, the offline parser
// otherwise. If Claude is unreachable mid-conversation (internet down),
// the request falls through to the offline parser so the house still answers.
import { createLocalAgent } from "./local.js";

export async function createAgent(home, env) {
  return withMemory(home, await pickAgent(home, env));
}

// Every conversation, from the app, voice or Siri, is logged for the
// overnight reflection agent (the homeowner can see and erase it).
function withMemory(home, agent) {
  return {
    ...agent,
    async chat(text, opts) {
      const r = await agent.chat(text, opts);
      home.learner?.logConversation(text, r.reply);
      return r;
    },
  };
}

async function pickAgent(home, env) {
  const local = createLocalAgent(home);
  if (!env.ANTHROPIC_API_KEY) return local;

  let claude;
  try {
    const { createClaudeAgent } = await import("./claude.js");
    claude = await createClaudeAgent(home, {
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.HAVEN_MODEL || "claude-opus-5",
      effort: env.HAVEN_EFFORT || "medium",
      promptPath: new URL("../../prompts/agent-system.md", import.meta.url),
    });
  } catch (err) {
    home.bus.publish("agent_error", { error: `Claude unavailable, using offline mode: ${err.message}` });
    return local;
  }

  return {
    kind: "claude",
    model: claude.model,
    async chat(text, opts) {
      try {
        return await claude.chat(text, opts);
      } catch (err) {
        home.bus.publish("agent_error", { error: String(err.message || err) });
        claude.reset(opts?.conversationId);
        const r = await local.chat(text, opts);
        return { ...r, reply: `${r.reply} (Offline mode: I couldn't reach the AI service.)`, offline: true };
      }
    },
    async briefing(label, digest) {
      try {
        return await claude.briefing(label, digest);
      } catch (err) {
        home.bus.publish("agent_error", { error: String(err.message || err) });
        return null;
      }
    },
    async reflect(dayLog) {
      try {
        return (await claude.reflect(dayLog)) ?? local.reflect(dayLog);
      } catch (err) {
        home.bus.publish("agent_error", { error: String(err.message || err) });
        return local.reflect(dayLog);
      }
    },
    reset: claude.reset,
  };
}
