// The Haven API routes, shared by the home server (http.js) and the
// browser-only demo build. Each route: [method, path regex, needs owner
// token, handler(url, body, match)].

import { SENSOR_TYPES } from "./core/registry.js";
import { blockOf } from "./learning.js";
import { localParts } from "./core/time.js";

export function createRoutes(home) {
  return [
    ["GET", /^\/api\/health$/, false, () => ({ ok: true })],
    ["GET", /^\/api\/state$/, true, () => ({
      ...home.registry.snapshot(),
      people: home.presence.list(),
      pending: home.controller.pendingList(),
      scenes: Object.fromEntries(Object.entries(home.config.scenes).map(([k, v]) => [k, v.label])),
      agent: { kind: home.agent.kind, model: home.agent.model || null },
      adapter: home.adapter.name,
      channels: home.notifier.channelNames(),
      now: home.now(),
      timezone: home.config.home.timezone,
      daypart: blockOf(localParts(home.config.home.timezone).hhmm),
      suggestions: home.learner.pendingSuggestions().map(({ id, text, type }) => ({ id, text, type })),
    })],
    ["GET", /^\/api\/events$/, true, (url) => home.store.recent.slice(-Math.min(500, Number(url.searchParams.get("limit")) || 100))],
    ["POST", /^\/api\/devices\/([\w.]+)$/, true, (url, body, m) =>
      home.controller.execute({ device: m[1], command: body.command, origin: "owner", reason: body.reason || "Haven app" })],
    ["POST", /^\/api\/scenes\/(\w+)$/, true, (url, body, m) => home.controller.runScene(m[1], "owner", "Haven app")],
    ["POST", /^\/api\/confirm\/(\w+)$/, true, (url, body, m) => home.controller.confirm(m[1], body.approve !== false)],
    ["POST", /^\/api\/chat$/, true, (url, body) => {
      if (typeof body.text !== "string" || !body.text.trim()) return { status: 400, error: "text is required" };
      return home.agent.chat(body.text.slice(0, 2000), { conversationId: String(body.conversationId || "app") });
    }],
    ["POST", /^\/api\/presence$/, true, (url, body) =>
      home.presence.update(body.person || "owner", body.kind, { trusted: true })],
    ["POST", /^\/api\/briefing$/, true, () => home.briefings.send()],

    ["GET", /^\/api\/energy$/, true, () => home.energy.report()],

    // What Haven has learned about the homeowner.
    ["GET", /^\/api\/profile$/, true, () => home.learner.view()],
    ["POST", /^\/api\/feedback$/, true, (url, body) => home.learner.feedback(body.feeling, { room: body.room, origin: "owner" })],
    ["POST", /^\/api\/suggestions\/(\w+)$/, true, (url, body, m) => home.learner.respond(m[1], body.accept === true)],
    ["POST", /^\/api\/profile\/forget$/, true, (url, body) => home.learner.forget(String(body.id || ""))],
    ["POST", /^\/api\/profile\/reflect$/, true, () => home.reflection.run()],

    // Apple Shortcuts: plain-text replies so Siri can read them aloud.
    ["POST", /^\/api\/shortcut\/ask$/, true, async (url, body) => {
      const r = await home.agent.chat(String(body.text || "status").slice(0, 2000), { conversationId: "siri" });
      return { text: r.reply };
    }],
    ["POST", /^\/api\/shortcut\/garage$/, true, async (url, body) => {
      const door = home.registry.get("garage.door");
      const action = body.action || "toggle";
      const target = action === "toggle" ? (door.state.door === "closed" ? "open" : "closed") : action === "open" ? "open" : "closed";
      const r = await home.controller.execute({ device: "garage.door", command: { door: target }, origin: "owner", reason: "Car / Siri button" });
      return { text: r.message };
    }],

    // Simulator controls (only with the simulator adapter).
    ["POST", /^\/api\/sim\/sensor$/, true, (url, body) => {
      if (home.adapter.name !== "simulator") return { status: 400, error: "Simulator is off." };
      const d = home.registry.get(body.device);
      if (!d) return { status: 404, error: "No such device" };
      // Only sensor readings can be faked; switches, locks and doors still
      // have to go through the safety controller.
      const sensorOnly = SENSOR_TYPES.has(d.type) ||
        (d.type === "thermostat" && Object.keys(body.state || {}).every((k) => k === "current" || k === "humidity"));
      if (!sensorOnly) return { status: 400, error: `${d.name} isn't a sensor. Control it through the app instead.` };
      home.adapter.sensor(body.device, body.state || {});
      return { status: "done" };
    }],
  ];
}
