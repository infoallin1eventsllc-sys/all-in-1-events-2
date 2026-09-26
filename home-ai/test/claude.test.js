// Exercises the Claude tool loop against a mocked Messages API: checks the
// request shape and that the AI's tool calls go through the safety controller.
import { test } from "node:test";
import assert from "node:assert/strict";
import { testHome } from "./helpers.js";
import { createClaudeAgent } from "../src/agent/claude.js";

function mockApi(responses) {
  const requests = [];
  const fetch = async (url, init) => {
    requests.push({ url: String(url), headers: new Headers(init.headers), body: JSON.parse(init.body) });
    const content = responses.shift();
    const stop_reason = content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn";
    return new Response(JSON.stringify({
      id: `msg_${requests.length}`, type: "message", role: "assistant", model: "claude-opus-5",
      content, stop_reason, stop_details: null, usage: { input_tokens: 10, output_tokens: 10 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { fetch, requests };
}

async function agentWith(home, responses) {
  const api = mockApi(responses);
  const agent = await createClaudeAgent(home, {
    apiKey: "test", model: "claude-opus-5", effort: "medium", fetch: api.fetch,
    promptPath: new URL("../prompts/agent-system.md", import.meta.url),
  });
  return { agent, requests: api.requests };
}

test("Claude turns lights on through the controller and replies", async () => {
  const home = await testHome();
  const { agent, requests } = await agentWith(home, [
    [{ type: "tool_use", id: "t1", name: "control_device", input: { device_id: "light.kitchen", command: { on: true } } }],
    [{ type: "text", text: "Kitchen lights are on." }],
  ]);
  const r = await agent.chat("lights on in the kitchen please");
  assert.equal(r.reply, "Kitchen lights are on.");
  assert.equal(home.registry.get("light.kitchen").state.on, true);

  const first = requests[0];
  assert.match(first.headers.get("anthropic-beta"), /server-side-fallback-2026-07-01/);
  assert.equal(first.body.fallbacks, "default");
  assert.equal(first.body.model, "claude-opus-5");
  assert.equal(first.body.system[0].cache_control.type, "ephemeral");
  assert.match(first.body.system[0].text, /The Williams Residence/);
  const toolResult = requests[1].body.messages.at(-1).content[0];
  assert.equal(toolResult.type, "tool_result");
  assert.match(toolResult.content, /"status":"done"/);
});

test("Claude cannot unlock a door on its own", async () => {
  const home = await testHome();
  const { agent, requests } = await agentWith(home, [
    [{ type: "tool_use", id: "t1", name: "control_device", input: { device_id: "lock.front", command: { locked: false } } }],
    [{ type: "text", text: "Waiting for your confirmation." }],
  ]);
  await agent.chat("unlock the front door");
  assert.equal(home.registry.get("lock.front").state.locked, true);
  assert.match(requests[1].body.messages.at(-1).content[0].content, /needs_confirmation/);
  assert.equal(home.controller.pendingList().length, 1);
});
