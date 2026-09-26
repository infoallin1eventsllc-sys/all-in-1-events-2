// Browser stand-ins for the few Node built-ins Haven's core imports.
// The demo runs in memory only, so the file-system paths are never reached.

export class EventEmitter {
  constructor() { this._handlers = new Map(); }
  setMaxListeners() { return this; }
  on(type, fn) {
    if (!this._handlers.has(type)) this._handlers.set(type, []);
    this._handlers.get(type).push(fn);
    return this;
  }
  off(type, fn) {
    const list = this._handlers.get(type) || [];
    this._handlers.set(type, list.filter((f) => f !== fn));
    return this;
  }
  emit(type, ...args) {
    for (const fn of [...(this._handlers.get(type) || [])]) fn(...args);
    return true;
  }
}

const unavailable = () => { throw new Error("Not available in the browser demo."); };
export const existsSync = () => false;
export const readFileSync = unavailable;
export const writeFileSync = unavailable;
export const renameSync = unavailable;
export const mkdirSync = () => {};
export const appendFile = () => {};
export const join = (...parts) => parts.join("/");
export default { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, appendFile, join };
