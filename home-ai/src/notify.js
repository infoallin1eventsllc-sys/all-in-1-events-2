// Notifications to the homeowner.
//
// Every message goes to the Haven app live feed. Push channels (ntfy,
// Pushover) reach the iPhone lock screen, and iOS mirrors them to the Apple
// Watch automatically when the phone is locked. Urgent alerts use each
// service's highest priority so they break through Focus modes.
//
// During quiet hours, non-urgent messages are held and rolled into the next
// briefing instead of buzzing someone's wrist at 2am.
import { inWindow, localParts } from "./core/time.js";

export const PRIORITY = { INFO: "info", NORMAL: "normal", URGENT: "urgent" };

export class Notifier {
  constructor({ config, bus, env = process.env }) {
    this.config = config;
    this.bus = bus;
    this.env = env;
    this.held = [];
    this.channels = [];
    if (env.NTFY_TOPIC) this.channels.push(ntfyChannel(env));
    if (env.PUSHOVER_TOKEN && env.PUSHOVER_USER) this.channels.push(pushoverChannel(env));
  }

  channelNames() {
    return ["app", ...this.channels.map((c) => c.name)];
  }

  isQuietHours() {
    const s = this.config.settings;
    return inWindow(localParts(this.config.home.timezone).hhmm, s.quietHoursStart, s.quietHoursEnd);
  }

  // message: { title, body, priority, actions?: [{label, url|confirmId}], tag? }
  async send(message) {
    const msg = { priority: PRIORITY.NORMAL, ...message };
    const quiet = msg.priority !== PRIORITY.URGENT && this.isQuietHours();
    const pushed = msg.priority !== PRIORITY.INFO && !quiet;
    this.bus.publish("notification", { ...msg, held: quiet, pushed });
    if (quiet) {
      this.held.push(msg);
      return { delivered: ["app"], held: true };
    }
    if (!pushed) return { delivered: ["app"] };
    const results = await Promise.allSettled(this.channels.map((c) => c.send(msg)));
    const delivered = ["app"];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") delivered.push(this.channels[i].name);
      else this.bus.publish("notify_error", { channel: this.channels[i].name, error: String(r.reason?.message || r.reason) });
    });
    return { delivered };
  }

  takeHeld() {
    const h = this.held;
    this.held = [];
    return h;
  }
}

function ntfyChannel(env) {
  const base = (env.NTFY_URL || "https://ntfy.sh").replace(/\/$/, "");
  return {
    name: "ntfy",
    async send(msg) {
      const headers = {
        Title: ascii(msg.title),
        Priority: msg.priority === PRIORITY.URGENT ? "5" : "3",
        Tags: msg.priority === PRIORITY.URGENT ? "rotating_light" : "house",
      };
      if (env.NTFY_TOKEN) headers.Authorization = `Bearer ${env.NTFY_TOKEN}`;
      if (msg.clickUrl) headers.Click = msg.clickUrl;
      const res = await fetch(`${base}/${encodeURIComponent(env.NTFY_TOPIC)}`, {
        method: "POST", headers, body: msg.body, signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`ntfy ${res.status}`);
    },
  };
}

function pushoverChannel(env) {
  return {
    name: "pushover",
    async send(msg) {
      const body = new URLSearchParams({
        token: env.PUSHOVER_TOKEN, user: env.PUSHOVER_USER,
        title: msg.title, message: msg.body,
        priority: msg.priority === PRIORITY.URGENT ? "1" : "0",
        ...(msg.clickUrl ? { url: msg.clickUrl } : {}),
      });
      const res = await fetch("https://api.pushover.net/1/messages.json", { method: "POST", body, signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`pushover ${res.status}`);
    },
  };
}

// HTTP headers must be ASCII; ntfy titles with emoji or ° would be rejected.
function ascii(s) {
  return String(s).replace(/°/g, " deg").replace(/[^\x20-\x7E]/g, "");
}
