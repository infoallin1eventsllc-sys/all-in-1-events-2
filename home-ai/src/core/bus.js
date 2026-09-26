// A tiny in-process event bus. Every state change, automation, agent action
// and notification flows through here so the log, the app and the briefings
// all see the same history.
import { EventEmitter } from "node:events";

export class Bus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
  }

  // Publish a home event: { type, ...details }. Adds an id and timestamp.
  publish(type, details = {}) {
    const event = { id: cryptoId(), ts: new Date().toISOString(), type, ...details };
    this.emit("event", event);
    this.emit(type, event);
    return event;
  }
}

let counter = 0;
function cryptoId() {
  counter = (counter + 1) % 1e6;
  return `${Date.now().toString(36)}-${counter.toString(36)}`;
}
