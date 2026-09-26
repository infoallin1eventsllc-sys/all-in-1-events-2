// Claude-powered conversation and briefings, using the official Anthropic SDK.
// A manual tool loop so every action runs through Haven's safety controller.
import fs from "node:fs";
import { TOOL_DEFS, makeToolRunner, homeState } from "./tools.js";

const MAX_TOOL_ROUNDS = 8;
const MAX_HISTORY_MESSAGES = 60; // start a fresh conversation past this

export async function createClaudeAgent(home, { apiKey, model, effort, promptPath, reflectionPath = new URL("../../prompts/reflection.md", import.meta.url), fetch }) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey, ...(fetch ? { fetch } : {}) });
  const template = fs.readFileSync(promptPath, "utf8");
  // Rendered once at startup and never changed, so it caches across requests.
  const systemText = template
    .replaceAll("{{HOME_NAME}}", home.config.home.name)
    .replaceAll("{{TIMEZONE}}", home.config.home.timezone);
  const system = [{ type: "text", text: systemText, cache_control: { type: "ephemeral" } }];
  const conversations = new Map();
  const reflectionText = fs.readFileSync(reflectionPath, "utf8");

  async function call(messages, { tools = TOOL_DEFS } = {}) {
    return client.beta.messages.create({
      model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort },
      system,
      ...(tools.length ? { tools } : {}),
      messages,
    });
  }

  function textOf(response) {
    return response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  }

  return {
    kind: "claude",
    model,

    // One chat turn. origin is "agent" for a homeowner request.
    async chat(text, { conversationId = "default", origin = "agent", panelRoom = null } = {}) {
      let messages = conversations.get(conversationId) || [];
      if (messages.length > MAX_HISTORY_MESSAGES) messages = [];
      const runTool = makeToolRunner(home, origin);
      const actions = [];

      // Volatile context goes in the user turn, after the cached system prompt.
      messages.push({
        role: "user",
        content: [
          { type: "text", text: `<house_state time="${home.now()}">\n${homeState(home)}\n</house_state>` },
          ...(panelRoom ? [{ type: "text", text: `The homeowner is speaking at the ${home.config.rooms.find((r) => r.id === panelRoom)?.name || panelRoom} panel. When they don't name a room, they mean this one.` }] : []),
          { type: "text", text },
        ],
      });

      let reply = "";
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const response = await call(messages);
        messages.push({ role: "assistant", content: response.content });

        if (response.stop_reason === "refusal") {
          reply = "I can't help with that one.";
          break;
        }
        if (response.stop_reason === "pause_turn") continue;
        if (response.stop_reason !== "tool_use") {
          reply = textOf(response) || (response.stop_reason === "max_tokens" ? "Sorry, that reply got cut off." : "");
          break;
        }

        const results = [];
        for (const block of response.content.filter((b) => b.type === "tool_use")) {
          let result;
          try {
            result = await runTool(block.name, block.input);
          } catch (err) {
            result = { status: "error", message: String(err.message || err) };
          }
          if (block.name === "control_device" || block.name === "run_scene") actions.push(result);
          results.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: typeof result === "string" ? result : JSON.stringify(result),
            ...(result?.status === "error" ? { is_error: true } : {}),
          });
        }
        messages.push({ role: "user", content: results });
      }

      // Keep the history append-only; if we stopped mid-loop, close it cleanly.
      conversations.set(conversationId, lastIsAssistant(messages) ? messages : []);
      return { reply: reply || "Done.", actions };
    },

    // Write a briefing from a digest. No tools: briefings inform, they don't act.
    async briefing(label, digest) {
      const response = await call([{
        role: "user",
        content: `Write the "${label}" briefing. Reply with the title on the first line, then the body.\n\n<digest>\n${digest}\n</digest>`,
      }], { tools: [] });
      if (response.stop_reason === "refusal") return null;
      const [title, ...rest] = textOf(response).split("\n");
      return { title: title.replace(/^#+\s*|\*\*/g, "").trim(), body: rest.join("\n").trim() };
    },

    // The reflection agent: reviews the day and returns structured findings
    // for the learner. JSON output is enforced by the API schema.
    async reflect(dayLog) {
      const response = await client.beta.messages.create({
        model,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort, format: { type: "json_schema", schema: REFLECTION_SCHEMA } },
        system: reflectionText,
        messages: [{ role: "user", content: `<day>\n${JSON.stringify(dayLog, null, 2)}\n</day>` }],
      });
      if (response.stop_reason !== "end_turn") return null;
      const out = JSON.parse(textOf(response));
      return {
        notes: out.notes,
        likes: out.likes,
        dislikes: out.dislikes,
        suggestions: out.suggestions.map((x) => {
          try { return { device: x.device, command: JSON.parse(x.command_json), time: x.time, text: x.text }; } catch { return null; }
        }).filter(Boolean),
      };
    },

    reset(conversationId = "default") {
      conversations.delete(conversationId);
    },
  };
}

function lastIsAssistant(messages) {
  return messages.length > 0 && messages[messages.length - 1].role === "assistant";
}

const strings = { type: "array", items: { type: "string" } };
export const REFLECTION_SCHEMA = {
  type: "object",
  properties: {
    notes: strings,
    likes: strings,
    dislikes: strings,
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          device: { type: "string" },
          command_json: { type: "string" },
          time: { type: "string" },
          text: { type: "string" },
        },
        required: ["device", "command_json", "time", "text"],
        additionalProperties: false,
      },
    },
  },
  required: ["notes", "likes", "dislikes", "suggestions"],
  additionalProperties: false,
};
