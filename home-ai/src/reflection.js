// Runs the reflection agent once a day (settings.reflectionTime, 3 AM by
// default) and on demand ("Review my day"). Findings go to the learner,
// which stores them and turns routine ideas into suggestions.
import { localParts } from "./core/time.js";

export class Reflection {
  constructor({ home }) {
    this.home = home;
    this.lastDate = null;
  }

  start() {
    this.timer = setInterval(() => this.check().catch((err) => this.home.bus.publish("agent_error", { error: String(err.message || err) })), 30_000);
  }

  stop() {
    clearInterval(this.timer);
  }

  async check() {
    const { date, hhmm } = localParts(this.home.config.home.timezone);
    const at = this.home.config.settings.reflectionTime || "03:00";
    if (hhmm >= at && this.lastDate !== date) {
      this.lastDate = date;
      await this.run();
    }
  }

  async run() {
    const { learner, agent, bus } = this.home;
    const log = learner.dayLog();
    const found = await agent.reflect(log);
    const added = found ? learner.applyReflection(found) : 0;
    const message = added
      ? `I reviewed the day and learned ${added} new thing${added === 1 ? "" : "s"}.`
      : "I reviewed the day. Nothing new to add.";
    bus.publish("reflection", { added, message });
    return { status: "done", added, message, profile: learner.view() };
  }
}
