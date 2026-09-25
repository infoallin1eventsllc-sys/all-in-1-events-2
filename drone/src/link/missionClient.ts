/**
 * The MAVLink mission protocol, and starting a mission on a real autopilot.
 *
 * Transport-agnostic (a `send` function and a frame subscription), so the same
 * code runs over Bluetooth, USB radio or the network bridge, and is unit-tested
 * in Node against a scripted autopilot (scripts/mission.test.mjs).
 *
 * Upload handshake (https://mavlink.io/en/services/mission.html):
 *   GCS  MISSION_COUNT(n, type)            → autopilot
 *   AP   MISSION_REQUEST_INT(seq, type)    ← for each item, possibly repeated if a reply was lost
 *   GCS  MISSION_ITEM_INT(seq)             → autopilot
 *   AP   MISSION_ACK(result, type)         ← after the last item (or an error at any point)
 * MISSION_COUNT replaces the stored mission, so no MISSION_CLEAR_ALL is sent:
 * ArduPilot answers a clear with its own MISSION_ACK, which a GCS that is also
 * waiting for the upload's ACK can mistake for the end of the upload.
 */
import {
  encodeMissionCount, encodeMissionItemInt, encodeCommandLong, encodeArm, encodeFlightMode, modeName,
  MAV_CMD, MAV_RESULT, type MavFrame, type MissionItem, type Telemetry, type Autopilot, type FlightMode,
} from './mavlink';

export interface MissionIO {
  send: (bytes: Uint8Array) => Promise<void>;
  /** Subscribe to every frame from the link; returns unsubscribe. */
  subscribe: (fn: (f: MavFrame) => void) => () => void;
  telemetry: () => Telemetry;
  sysId: () => number;
  /** Timers are injectable so tests run instantly. */
  now?: () => number;
}

export const MISSION_TYPE = { MISSION: 0, FENCE: 1, RALLY: 2 } as const;

/** MAV_MISSION_RESULT, in words an operator can act on. */
export const MISSION_RESULT_TEXT: Record<number, string> = {
  1: 'the autopilot reported a generic error', 2: 'a coordinate frame is not supported', 3: 'a command is not supported by this autopilot',
  4: 'the mission is too long for this autopilot', 5: 'a mission item is invalid', 6: 'an item has an invalid param1', 7: 'an item has an invalid param2',
  8: 'an item has an invalid param3', 9: 'an item has an invalid param4', 10: 'an item has an invalid latitude or param5', 11: 'an item has an invalid longitude or param6',
  12: 'an item has an invalid altitude or param7', 13: 'items arrived out of order', 14: 'the autopilot refused the upload', 15: 'the upload was cancelled',
};

export interface UploadProgress { sent: number; total: number }

/**
 * Upload `items` (already including ArduPilot's home item if the caller wants one).
 * `firstCurrent` marks the item the autopilot should start from.
 * Resolves on MISSION_ACK accepted; rejects with a readable reason otherwise.
 */
export function uploadItems(io: MissionIO, items: MissionItem[], opts: { missionType?: number; firstCurrent?: number; onProgress?: (p: UploadProgress) => void; timeoutMs?: number; retries?: number } = {}): Promise<void> {
  const type = opts.missionType ?? MISSION_TYPE.MISSION;
  const timeoutMs = opts.timeoutMs ?? 3000;
  let retriesLeft = opts.retries ?? 3;
  const sys = io.sysId();
  return new Promise<void>((resolve, reject) => {
    let done = false, highest = -1, timer: ReturnType<typeof setTimeout> | null = null;
    const finish = (err?: string) => {
      if (done) return; done = true; off(); if (timer) clearTimeout(timer);
      if (err) reject(new Error(err)); else resolve();
    };
    const arm = (fn: () => void) => { if (timer) clearTimeout(timer); timer = setTimeout(fn, timeoutMs); };
    const sendCount = () => {
      io.send(encodeMissionCount(items.length, sys, 1, type)).catch(e => finish(String(e)));
      arm(() => {
        // Nothing asked for yet: the COUNT (or the first request) was lost on the radio. Try again.
        if (highest < 0 && retriesLeft-- > 0) sendCount();
        else finish(highest < 0 ? 'The autopilot did not answer the mission upload' : `The autopilot stopped asking for items after ${highest + 1} of ${items.length}`);
      });
    };
    const off = io.subscribe(f => {
      if (done) return;
      if ((f.msgId === 51 || f.msgId === 40) && f.sysId === sys) {
        const seq = f.payload.getUint16(0, true), mt = f.payload.getUint8(4);
        if (mt !== type || seq >= items.length) return;
        highest = Math.max(highest, seq);
        io.send(encodeMissionItemInt(seq, items[seq], seq === (opts.firstCurrent ?? 0) ? 1 : 0, sys, 1, type)).catch(e => finish(String(e)));
        opts.onProgress?.({ sent: seq + 1, total: items.length });
        arm(() => finish(`Timed out waiting for the autopilot after item ${seq + 1} of ${items.length}`));
        return;
      }
      if (f.msgId === 47 && f.sysId === sys) {
        const result = f.payload.getUint8(2), mt = f.payload.getUint8(3);
        if (mt !== type) return;
        // Accept only once every item has been requested; an early "accepted" belongs to something else.
        if (result === 0) { if (highest === items.length - 1 || items.length === 0) finish(); return; }
        finish(`Mission rejected: ${MISSION_RESULT_TEXT[result] ?? `result ${result}`}`);
      }
    });
    sendCount();
  });
}

/** Resolve with the COMMAND_ACK result for `command` (null on timeout). */
export function awaitAck(io: MissionIO, command: number, ms = 1500): Promise<number | null> {
  return new Promise(resolve => {
    const off = io.subscribe(f => {
      if (f.msgId === 77 && f.sysId === io.sysId() && f.payload.getUint16(0, true) === command) { const r = f.payload.getUint8(2); if (r === MAV_RESULT.IN_PROGRESS) return; clearTimeout(t); off(); resolve(r); }
    });
    const t = setTimeout(() => { off(); resolve(null); }, ms);
  });
}

/** Resolve true once `test(telemetry)` holds, false after `ms`. Polls the live snapshot. */
export function awaitState(io: MissionIO, test: (t: Telemetry) => boolean, ms: number): Promise<boolean> {
  return new Promise(resolve => {
    const t0 = Date.now();
    const tick = () => { if (test(io.telemetry())) resolve(true); else if (Date.now() - t0 > ms) resolve(false); else setTimeout(tick, 40); };
    tick();
  });
}

/** Collect STATUSTEXT while `fn` runs: the autopilot explains refusals there ("PreArm: GPS not healthy"). */
async function withStatusText<T>(io: MissionIO, fn: () => Promise<T>): Promise<{ value: T; texts: string[] }> {
  const texts: string[] = [];
  const off = io.subscribe(f => {
    if (f.msgId !== 253 || f.sysId !== io.sysId()) return;
    let s = ''; for (let i = 1; i < 51; i++) { const c = f.payload.getUint8(i); if (!c) break; s += String.fromCharCode(c); }
    if (s) texts.push(s);
  });
  try { return { value: await fn(), texts }; } finally { off(); }
}

export interface StartResult { ok: boolean; error?: string; detail?: string[] }

/**
 * Arm and start the uploaded mission. The sequence differs by autopilot, and
 * getting it wrong leaves the aircraft sitting on the ground:
 *
 *   ArduPilot  Copter will not arm in AUTO (and in AUTO on the ground it waits for
 *              the pilot's throttle). So: GUIDED → arm → MISSION_START, which
 *              switches to AUTO and marks the start as the pilot's, so the takeoff
 *              item runs straight away.
 *   PX4        Mission mode → arm; an armed, landed PX4 in mission mode flies the
 *              takeoff item itself.
 */
export async function startMission(io: MissionIO, ap: Autopilot): Promise<StartResult> {
  const sys = io.sysId();
  const setMode = async (mode: FlightMode) => {
    const b = encodeFlightMode(ap, mode, sys, io.telemetry().vehicleType); if (!b) return false;
    await io.send(b);
    return awaitState(io, t => modeName(t) === mode, 2500);
  };
  const { value, texts } = await withStatusText(io, async (): Promise<StartResult> => {
    const armed = () => awaitState(io, t => t.armed, 4000);
    if (ap === 'PX4') {
      if (!(await setMode('AUTO'))) return { ok: false, error: 'PX4 did not switch to Mission mode' };
      if (!io.telemetry().armed) { await io.send(encodeArm(true, false, sys)); if (!(await armed())) return { ok: false, error: 'The aircraft did not arm' }; }
      return { ok: true };
    }
    if (!io.telemetry().armed) {
      if (!(await setMode('GUIDED'))) return { ok: false, error: 'The autopilot did not switch to Guided to arm' };
      await io.send(encodeArm(true, false, sys));
      if (!(await armed())) return { ok: false, error: 'The aircraft did not arm' };
    }
    const ack = awaitAck(io, MAV_CMD.MISSION_START, 2500);
    await io.send(encodeCommandLong(MAV_CMD.MISSION_START, [0, 0], sys));
    const r = await ack;
    if (r !== MAV_RESULT.ACCEPTED) return { ok: false, error: r === null ? 'No answer to the mission start' : `Mission start refused (result ${r})` };
    if (!(await awaitState(io, t => modeName(t) === 'AUTO', 2500))) return { ok: false, error: 'The autopilot accepted the start but did not enter Auto' };
    return { ok: true };
  });
  // Surface the autopilot's own words when something was refused.
  return value.ok ? value : { ...value, detail: texts.filter(s => /arm|pre|fence|gps|ekf|mission|mode|batt|compass|throttle/i.test(s)).slice(-4) };
}
