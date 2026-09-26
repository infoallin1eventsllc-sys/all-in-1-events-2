// Persists device state and an append-only event log to ./data so the house
// remembers where everything was after a power cut or restart.
import fs from "node:fs";
import path from "node:path";

export class Store {
  constructor(dir) {
    this.dir = dir;
    this.memoryOnly = !dir;
    this.recent = [];
    this.maxRecent = 500;
    if (!this.memoryOnly) {
      fs.mkdirSync(dir, { recursive: true });
      this.statePath = path.join(dir, "state.json");
      this.logPath = path.join(dir, "events.jsonl");
      this.loadRecent();
    }
  }

  loadState() {
    if (this.memoryOnly || !fs.existsSync(this.statePath)) return {};
    try {
      return JSON.parse(fs.readFileSync(this.statePath, "utf8"));
    } catch {
      return {};
    }
  }

  saveState(state) {
    if (this.memoryOnly) return;
    clearTimeout(this.saveTimer);
    this.pendingState = state;
    // Debounce: sensors can fire many times a second.
    this.saveTimer = setTimeout(() => this.flush(), 250);
  }

  // Write any pending state now (on shutdown, so a restart loses nothing).
  flush() {
    clearTimeout(this.saveTimer);
    if (this.memoryOnly || !this.pendingState) return;
    const tmp = this.statePath + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(this.pendingState, null, 2));
    fs.renameSync(tmp, this.statePath);
    this.pendingState = null;
  }

  append(event) {
    this.recent.push(event);
    if (this.recent.length > this.maxRecent) this.recent.shift();
    if (!this.memoryOnly) fs.appendFile(this.logPath, JSON.stringify(event) + "\n", () => {});
  }

  loadRecent() {
    if (!fs.existsSync(this.logPath)) return;
    const lines = fs.readFileSync(this.logPath, "utf8").trim().split("\n").slice(-this.maxRecent);
    for (const line of lines) {
      try { this.recent.push(JSON.parse(line)); } catch { /* skip torn line */ }
    }
  }

  since(isoTime) {
    return this.recent.filter((e) => e.ts >= isoTime);
  }

  // Secrets that Haven generates for itself (e.g. the owner token).
  loadSecret(name) {
    if (this.memoryOnly) return null;
    const p = path.join(this.dir, "secrets.json");
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"))[name] ?? null;
  }

  saveSecret(name, value) {
    if (this.memoryOnly) return;
    const p = path.join(this.dir, "secrets.json");
    const all = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : {};
    all[name] = value;
    fs.writeFileSync(p, JSON.stringify(all, null, 2), { mode: 0o600 });
  }
}
