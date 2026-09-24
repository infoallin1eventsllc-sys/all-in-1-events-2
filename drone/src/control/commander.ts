import { MAV_RESULT } from '../link/mavlink';
import { describe, stepsFor, RESULT_NAME, type Cmd, type Step } from './protocol';
import type { Autopilot } from '../link/mavlink';

/**
 * The dispatcher: sends one command to one aircraft or to 500, and knows what
 * happened on every one of them.
 *
 *   - Each aircraft works through the command's steps, waiting for its
 *     COMMAND_ACK before the next (GUIDED, then TAKEOFF).
 *   - A no-answer is retried (by default twice) before it counts as no
 *     response; "busy" (temporarily rejected) waits a moment and retries.
 *   - Sending is rate-limited so 500 commands do not swamp a radio link, and a
 *     batch can be staggered (e.g. row by row for a takeoff or a landing).
 *   - Aircraft can be held back before anything is sent (grounded by the health
 *     checks, a pack under the show minimum) and say why.
 *
 * Transport-agnostic: the simulation and the live link both implement Transport.
 */

export type TargetStatus = 'QUEUED' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'NO_RESPONSE' | 'HELD';

export interface TargetState {
  id: string;
  status: TargetStatus;
  step: number;
  attempts: number;
  /** When the next send is due (ms), and when the last send times out. */
  dueAt: number; timeoutAt: number;
  reason: string;
  doneAt: number;
}

export interface Batch {
  seq: number;
  cmd: Cmd;
  label: string;
  startedAt: number;
  targets: Map<string, TargetState>;
  steps: Map<string, Step[]>;
  done: boolean;
}

export interface Transport {
  send: (id: string, step: Step) => void;
  autopilot: (id: string) => Autopilot;
  /**
   * Does the aircraft's state already show this step done? Used when a retry is
   * refused: if the first send worked and only its ACK was lost, a real
   * ArduCopter refuses the repeat ("already flying"), and that is a success.
   */
  verify?: (id: string, step: Step) => boolean;
}

export interface DispatchOpts {
  /** Hold these back, with the reason, before anything is sent. */
  hold?: Map<string, string>;
  /** Delay (s) before each aircraft's first send, e.g. by launch row. */
  delayS?: (id: string) => number;
  retries?: number;
  timeoutMs?: number;
  /** A different command per aircraft in one batch (e.g. a formation move: each to its own spot). */
  perTarget?: Map<string, Cmd>;
}

export const counts = (b: Batch) => {
  const c: Record<TargetStatus, number> = { QUEUED: 0, SENT: 0, ACCEPTED: 0, REJECTED: 0, NO_RESPONSE: 0, HELD: 0 };
  for (const t of b.targets.values()) c[t.status]++;
  return c;
};

export class Commander {
  batches: Batch[] = [];
  private seq = 0;
  /** Sends allowed per second across all aircraft. */
  ratePerS = 200;
  private budget = 0;
  private lastTick = 0;
  onBatchDone: ((b: Batch) => void) | null = null;

  constructor(private transport: Transport) {}

  dispatch(cmd: Cmd, ids: string[], now: number, opts: DispatchOpts = {}): Batch {
    const b: Batch = { seq: ++this.seq, cmd, label: describe(cmd), startedAt: now, targets: new Map(), steps: new Map(), done: false };
    // The newest command wins: anything older still waiting or mid-sequence for these aircraft stops now
    // (a Land sent during a staggered takeoff must stop the rest of that takeoff being sent).
    const fresh = new Set(ids.filter(id => !opts.hold?.has(id)));
    for (const ob of this.batches) {
      if (ob.done) continue;
      for (const t of ob.targets.values()) if (fresh.has(t.id) && (t.status === 'QUEUED' || t.status === 'SENT')) { t.status = 'HELD'; t.reason = 'replaced by a newer command'; t.doneAt = now; }
      this.finishIfDone(ob);
    }
    const retries = opts.retries ?? 2, timeout = opts.timeoutMs ?? 1500;
    for (const id of ids) {
      const held = opts.hold?.get(id);
      b.targets.set(id, { id, status: held ? 'HELD' : 'QUEUED', step: 0, attempts: 0, dueAt: now + (opts.delayS?.(id) ?? 0) * 1000, timeoutAt: 0, reason: held ?? '', doneAt: held ? now : 0 });
      b.steps.set(id, stepsFor(opts.perTarget?.get(id) ?? cmd, this.transport.autopilot(id)));
    }
    (b as Batch & { retries: number; timeout: number }).retries = retries;
    (b as Batch & { retries: number; timeout: number }).timeout = timeout;
    this.batches.unshift(b);
    if (this.batches.length > 30) this.batches.length = 30;
    this.finishIfDone(b);
    return b;
  }

  tick(now: number) {
    const dt = this.lastTick ? Math.min(1, (now - this.lastTick) / 1000) : 0; this.lastTick = now;
    this.budget = Math.min(this.ratePerS, this.budget + dt * this.ratePerS);
    for (let bi = this.batches.length - 1; bi >= 0; bi--) {
      const b = this.batches[bi] as Batch & { retries: number; timeout: number };
      if (b.done) continue;
      for (const t of b.targets.values()) {
        if (t.status === 'SENT' && now >= t.timeoutAt) {
          if (t.attempts > b.retries) { t.status = 'NO_RESPONSE'; t.reason = `no answer after ${t.attempts} tries`; t.doneAt = now; }
          else { t.status = 'QUEUED'; t.dueAt = now; }
        }
        if (t.status === 'QUEUED' && now >= t.dueAt) {
          if (this.budget < 1) continue;
          this.budget -= 1;
          t.attempts++; t.status = 'SENT'; t.timeoutAt = now + b.timeout;
          this.transport.send(t.id, b.steps.get(t.id)![t.step]);
        }
      }
      this.finishIfDone(b);
    }
  }

  /** An aircraft's COMMAND_ACK for `cmd` (MAV_CMD number). */
  ack(id: string, cmd: number, result: number, now: number, text?: string) {
    for (const b of this.batches) {
      const t = b.targets.get(id); if (!t || t.status !== 'SENT') continue;
      const steps = b.steps.get(id)!;
      if (steps[t.step].cmd !== cmd) continue;
      if (result === MAV_RESULT.ACCEPTED || result === MAV_RESULT.IN_PROGRESS) {
        t.step++; t.attempts = 0;
        if (t.step >= steps.length) { t.status = 'ACCEPTED'; t.doneAt = now; }
        else { t.status = 'QUEUED'; t.dueAt = now; }
      } else if (result === MAV_RESULT.TEMPORARILY_REJECTED) {
        t.status = 'QUEUED'; t.dueAt = now + 500;
      } else if (t.attempts > 1 && this.transport.verify?.(id, steps[t.step])) {
        // A lost ACK, then a refused repeat of something already done: carry on.
        t.step++; t.attempts = 0;
        if (t.step >= steps.length) { t.status = 'ACCEPTED'; t.doneAt = now; } else { t.status = 'QUEUED'; t.dueAt = now; }
      } else {
        t.status = 'REJECTED'; t.reason = text || RESULT_NAME[result] || `result ${result}`; t.doneAt = now;
      }
      this.finishIfDone(b);
      return;
    }
  }

  private finishIfDone(b: Batch) {
    if (b.done) return;
    for (const t of b.targets.values()) if (t.status === 'QUEUED' || t.status === 'SENT') return;
    b.done = true;
    this.onBatchDone?.(b);
  }

  /** True while anything is still being sent or waited on. */
  get busy() { return this.batches.some(b => !b.done); }
}
