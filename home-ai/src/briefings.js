// Scheduled briefings through the day (morning, midday, evening, night).
// Each one digests what changed since the last briefing and the house's
// current state, then Claude writes it up (or a template does, offline).
import { localParts } from "./core/time.js";
import { describeState } from "./core/controller.js";
import { PRIORITY } from "./notify.js";

export class Briefings {
  constructor({ home }) {
    this.home = home;
    this.sent = new Map(); // briefing id -> local date last sent
    this.lastAt = new Date(Date.now() - 12 * 3600_000).toISOString();
  }

  start() {
    this.timer = setInterval(() => this.check().catch((err) => this.home.bus.publish("briefing_error", { error: String(err.message || err) })), 30_000);
  }

  stop() {
    clearInterval(this.timer);
  }

  async check() {
    const { date, hhmm } = localParts(this.home.config.home.timezone);
    for (const b of this.home.config.settings.briefings) {
      if (hhmm >= b.time && this.sent.get(b.id) !== date && hhmm < addMinutes(b.time, 30)) {
        this.sent.set(b.id, date);
        await this.send(b);
      }
    }
  }

  // Build and deliver one briefing. Also used by "Brief me now" in the app.
  async send(b = { id: "now", label: "House update" }) {
    const digest = this.digest(b.id);
    const written = await this.home.agent.briefing(b.label, digest.text);
    const message = written?.body ? written : template(b, digest);
    this.lastAt = new Date().toISOString();
    await this.home.notifier.send({
      priority: digest.needsAttention ? PRIORITY.NORMAL : b.id === "now" ? PRIORITY.INFO : PRIORITY.NORMAL,
      title: message.title,
      body: message.body,
      tag: `briefing:${b.id}`,
    });
    this.home.bus.publish("briefing", { briefing: b.id, title: message.title, body: message.body });
    return message;
  }

  digest(id) {
    const { registry, store, presence, notifier, controller } = this.home;
    const events = store.since(this.lastAt);
    const count = (pred) => events.filter(pred).length;
    const th = registry.byType("thermostat")[0];
    const wh = registry.byType("water_heater")[0];
    const garage = registry.byType("garage")[0];
    const valve = registry.byType("water_valve")[0];
    const unlocked = registry.byType("lock").filter((l) => !l.state.locked);
    const lightsOn = registry.byType("light").filter((l) => l.state.on);
    const wet = registry.byType("leak").filter((l) => l.state.wet);
    const openContacts = registry.byType("contact").filter((c) => c.state.open);
    const outdoor = registry.byType("temperature")[0];
    const motionRooms = [...new Set(events.filter((e) => e.type === "state" && e.deviceType === "motion" && e.changes.motion?.to).map((e) => e.room))];
    const alerts = events.filter((e) => e.type === "notification" && e.priority === "urgent").map((e) => e.title);
    const held = notifier.takeHeld();
    const refused = events.filter((e) => e.type === "refused").map((e) => e.reason);
    const pending = controller.pendingList().map((p) => p.summary);

    const f = {
      time: this.home.now(),
      briefing: id,
      people: presence.list().map((p) => `${p.name} ${p.home ? "home" : "away"}`).join(", "),
      indoor: `${th.state.current}°F, ${th.state.humidity}% humidity, thermostat ${describeState(th)}, system ${th.state.hvac}`,
      outdoor: outdoor ? `${outdoor.state.value}°F` : "unknown",
      waterHeater: describeState(wh),
      mainWater: describeState(valve),
      garage: garage.state.door,
      unlocked: unlocked.map((l) => l.name),
      lightsOn: lightsOn.map((l) => l.name),
      openDoors: openContacts.map((c) => c.name),
      leaks: wet.map((w) => w.name),
      sinceLast: {
        automations: count((e) => e.type === "action" && e.origin === "automation"),
        yourActions: count((e) => e.type === "action" && e.origin !== "automation"),
        motionIn: motionRooms,
        urgentAlerts: alerts,
        refused,
      },
      heldDuringQuietHours: held.map((h) => `${h.title}: ${h.body}`),
      energy: this.home.energy ? `${this.home.energy.report().todayKwh} kWh so far today, ${this.home.energy.nowKw()} kW now (${this.home.energy.source() === "meter" ? "measured" : "estimated"})` : null,
      newSuggestions: this.home.learner ? this.home.learner.pendingSuggestions().map((x) => x.text) : [],
      waitingForConfirmation: pending,
    };
    const needsAttention = wet.length > 0 || !valve.state.open || unlocked.length > 0 || garage.state.door !== "closed" || pending.length > 0;
    return { facts: f, needsAttention, text: JSON.stringify(f, null, 2) };
  }
}

// Offline briefing, used when Claude isn't configured or reachable.
export function template(b, { facts: f }) {
  const issues = [];
  if (f.leaks.length) issues.push(`Leak at ${f.leaks.join(", ")}.`);
  if (f.mainWater !== "open") issues.push("Main water is off.");
  if (f.garage !== "closed") issues.push(`Garage is ${f.garage}.`);
  if (f.unlocked.length) issues.push(`${f.unlocked.join(" and ")} unlocked.`);
  if (f.openDoors.length) issues.push(`${f.openDoors.join(", ")} open.`);
  if (f.waitingForConfirmation.length) issues.push(`Waiting on you: ${f.waitingForConfirmation.join("; ")}.`);

  const comfort = `Inside it's ${f.indoor.split(",")[0]}, outside ${f.outdoor}.`;
  let body = issues.length ? `${issues.join(" ")} ${comfort}` : `All secure. ${comfort}`;
  if (b.id === "night") {
    body += issues.length ? " Say \"goodnight\" and I'll lock up." : f.lightsOn.length ? ` ${f.lightsOn.length} light(s) still on.` : "";
  }
  if (f.sinceLast.automations) body += ` I handled ${f.sinceLast.automations} thing(s) automatically since the last update.`;
  if (f.newSuggestions?.length) body += ` I have ${f.newSuggestions.length === 1 ? "an idea" : `${f.newSuggestions.length} ideas`} based on your habits; see Haven's suggestions on the panel.`;
  return { title: `${b.label}${issues.length ? ": check the house" : ""}`, body: body.trim() };
}

function addMinutes(hhmm, n) {
  const [h, m] = hhmm.split(":").map(Number);
  const t = Math.min(h * 60 + m + n, 23 * 60 + 59);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
