import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAircraftLink } from '../link/useAircraftLink';
import { autopilotOf, modeName, type FlightMode } from '../link/mavlink';
import { useFleetHealth } from '../diagnostics/useFleetHealth';
import { readiness, SHOW_MIN_BATTERY, type Readiness } from '../diagnostics/fleet';
import { recorder } from '../record/recorder';
import { Commander, counts, type Batch, type Transport } from './commander';
import { encodeStep, stepDone, toLocal, type Cmd, type Step } from './protocol';
import { FleetSim } from '../diagnostics/fleetSim';

/**
 * Control for one aircraft or a whole fleet, over the same dispatcher.
 *
 * Simulation: the simulated show fleet (the same aircraft the fleet health view
 * diagnoses) answers every command after a realistic radio delay, with the odd
 * lost packet, and the aircraft that dropped off the link never answer.
 * Live: each MAVLink system id on the link is an aircraft; commands go to it by
 * id, its COMMAND_ACKs come back by id, and its STATUSTEXT gives the reason for
 * a refusal (e.g. a pre-arm failure).
 */

export interface VehicleView {
  id: string;
  pad: string;
  x: number; y: number; alt: number;
  vx: number; vy: number; vz: number;
  armed: boolean;
  airborne: boolean;
  mode: FlightMode | string;
  /** What it is doing, in words. */
  doing: string;
  battery: number | null;
  health: Readiness;
  home: { x: number; y: number };
  target: { x: number; y: number; z: number } | null;
  crashed: boolean;
}

export interface Interlocks { grounded: boolean; lowBattery: boolean; silent: boolean }
export interface SendOpts { staggerS?: number; interlocks?: Interlocks; perTarget?: Map<string, Cmd> }

interface ControlApi {
  source: 'LIVE' | 'SIMULATION';
  vehicles: VehicleView[];
  /** Positions refresh stamp (ms), for smooth drawing between updates. */
  updatedAt: number;
  batches: Batch[];
  texts: { id: string; text: string; at: number }[];
  send: (cmd: Cmd, ids: string[], opts?: SendOpts) => Batch | null;
  /** Retry the aircraft in a batch that were refused or did not answer. */
  retry: (b: Batch) => void;
  /** Keeps the simulation running (the control screen holds it while open). */
  useActive: () => void;
}

const Ctx = createContext<ControlApi | null>(null);

const DOING: Record<string, string> = {
  GROUND: 'On the ground', ARMED: 'Armed, waiting', CLIMB: 'Taking off', HOLD: 'Holding', MOVE: 'Flying to target', RTL: 'Returning home', LAND: 'Landing', FALLING: 'Falling', DOWN: 'Crashed',
};

export const ControlProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const fleet = useFleetHealth();
  const link = useAircraftLink();
  const source = fleet.source;
  const [vehicles, setVehicles] = useState<VehicleView[]>([]);
  const [updatedAt, setUpdatedAt] = useState(0);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [texts, setTexts] = useState<{ id: string; text: string; at: number }[]>([]);
  const [, bump] = useState(0);
  const listRef = useRef(fleet.list); listRef.current = fleet.list;
  const [active, setActive] = useState(0);
  const running = active > 0 || fleet.flying;

  // --- transports -------------------------------------------------------------
  const inflight = useRef<{ at: number; kind: 'CMD' | 'ACK'; id: string; step: Step; result?: number; text?: string }[]>([]);
  const lastText = useRef(new Map<string, { text: string; at: number }>());
  const vehiclesLive = useRef(link.vehicles); vehiclesLive.current = link.vehicles;
  const origin = useRef<{ lat: number; lon: number } | null>(null);

  const commander = useMemo(() => {
    const simT: Transport = {
      autopilot: () => 'ARDUPILOT',
      send: (id, step) => {
        const s = fleet.sim(); if (!s) return;
        const i = s.ids.indexOf(id);
        if (i < 0 || s.silent.has(i) || Math.random() < 0.01) return;                 // off the link, or a lost packet
        inflight.current.push({ at: performance.now() + 40 + Math.random() * 140, kind: 'CMD', id, step });
      },
      verify: (id, step) => { const s = fleet.sim(); const v = s?.vehicles[s.ids.indexOf(id)]; return !!v && stepDone(step, v); },
    };
    const liveT: Transport = {
      autopilot: id => autopilotOf(vehiclesLive.current[Number(id.replace(/\D/g, ''))] ?? { autopilot: 3 }),
      send: (id, step) => {
        const sys = Number(id.replace(/\D/g, '')), t = vehiclesLive.current[sys];
        if (!t) return;
        const o = origin.current ?? { lat: t.lat, lon: t.lon };
        const bytes = encodeStep(step, autopilotOf(t), sys, t, o);
        if (bytes) link.send(bytes).catch(() => {});
      },
      verify: (id, step) => { const t = vehiclesLive.current[Number(id.replace(/\D/g, ''))]; return !!t && stepDone(step, { armed: t.armed, airborne: t.armed && t.altRelM > 0.5, mode: modeName(t) }); },
    };
    const c = new Commander(source === 'LIVE' ? liveT : simT);
    c.onBatchDone = b => {
      const k = counts(b), n = b.targets.size;
      const bad = k.REJECTED + k.NO_RESPONSE;
      recorder.event('COMMAND', bad ? 'WARNING' : 'INFO', `${b.label} to ${n} aircraft: ${k.ACCEPTED} accepted${k.REJECTED ? `, ${k.REJECTED} refused` : ''}${k.NO_RESPONSE ? `, ${k.NO_RESPONSE} no response` : ''}${k.HELD ? `, ${k.HELD} held back` : ''}`);
    };
    return c;
  }, [source, fleet.simGen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live: acks and reasons come back by system id.
  useEffect(() => {
    if (source !== 'LIVE') return;
    return link.onFrame(f => {
      const id = `Aircraft ${f.sysId}`;
      if (f.msgId === 77) {
        const lt = lastText.current.get(id);
        commander.ack(id, f.payload.getUint16(0, true), f.payload.getUint8(2), performance.now(), lt && Date.now() - lt.at < 2000 ? lt.text : undefined);
      } else if (f.msgId === 253) {
        let s = ''; for (let i = 1; i < 51; i++) { const c = f.payload.getUint8(i); if (!c) break; s += String.fromCharCode(c); }
        lastText.current.set(id, { text: s, at: Date.now() });
        setTexts(ts => [{ id, text: s, at: Date.now() }, ...ts].slice(0, 80));
      }
    });
  }, [source, commander, link.onFrame]); // eslint-disable-line react-hooks/exhaustive-deps

  // The dispatcher and the simulated radio run at 20 Hz.
  useEffect(() => {
    const t = setInterval(() => {
      const now = performance.now();
      if (source === 'SIMULATION' && inflight.current.length) {
        const s = fleet.sim();
        const due = inflight.current.filter(m => m.at <= now);
        if (due.length) {
          inflight.current = inflight.current.filter(m => m.at > now);
          for (const m of due) {
            if (m.kind === 'CMD' && s) {
              const v = s.vehicles[s.ids.indexOf(m.id)]; if (!v) continue;
              const a = v.handle(m.step);
              if (a.text) setTexts(ts => [{ id: m.id, text: a.text!, at: Date.now() }, ...ts].slice(0, 80));
              if (Math.random() >= 0.01) inflight.current.push({ at: now + 30 + Math.random() * 100, kind: 'ACK', id: m.id, step: m.step, result: a.result, text: a.text });
            } else if (m.kind === 'ACK') commander.ack(m.id, m.step.cmd, m.result!, now, m.text);
          }
        }
      }
      if (commander.busy) { commander.tick(now); bump(x => x + 1); }
    }, 50);
    return () => clearInterval(t);
  }, [source, commander]); // eslint-disable-line react-hooks/exhaustive-deps

  // Aircraft positions and states, 5 times a second, while the screen is open or anything flies.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      const health = new Map(listRef.current.map(a => [a.id, a]));
      if (source === 'SIMULATION') {
        const s = fleet.sim(); if (!s) return;
        const seen = s.texts.length;
        if (seen) {
          const fresh = s.texts.splice(0, seen);
          setTexts(ts => [...fresh.map(x => ({ id: x.id, text: x.text, at: Date.now() })), ...ts].slice(0, 80));
        }
        setVehicles(s.vehicles.map((v, i) => {
          const h = health.get(v.id);
          return {
            id: v.id, pad: h?.pad ?? v.id, x: v.x, y: v.y, alt: v.z, vx: v.vx, vy: v.vy, vz: v.vz, armed: v.armed, airborne: v.airborne,
            mode: v.mode, doing: s.silent.has(i) ? 'Not reporting' : DOING[v.state] ?? v.state, battery: s.battery(i), health: h ? readiness(h) : 'SILENT',
            home: v.home, target: v.target, crashed: v.state === 'DOWN' || v.state === 'FALLING',
          };
        }));
      } else {
        const entries = Object.entries(vehiclesLive.current);
        const first = entries.find(([, t]) => t.lat || t.lon);
        if (!origin.current && first) origin.current = { lat: first[1].lat, lon: first[1].lon };
        const o = origin.current ?? { lat: 0, lon: 0 };
        setVehicles(entries.map(([sys, t]) => {
          // No GPS fix yet reports 0,0: keep the aircraft on its pad rather than thousands of km away.
          const fix = !!(t.lat || t.lon), id = `Aircraft ${sys}`, h = health.get(id), p = fix ? toLocal(o, t.lat, t.lon) : { x: 0, y: 0 };
          const airborne = t.armed && t.altRelM > 0.5, stale = !t.heartbeatMs || Date.now() - t.heartbeatMs > 3000;
          return {
            id, pad: h?.pad ?? `#${sys}`, x: p.x, y: p.y, alt: t.altRelM, vx: t.vyMps, vy: t.vxMps, vz: t.climbMps, armed: t.armed, airborne,
            mode: modeName(t), doing: stale ? 'Not reporting' : !fix ? 'Waiting for GPS' : airborne ? `Flying · ${modeName(t).toLowerCase()}` : t.armed ? 'Armed, waiting' : 'On the ground',
            battery: t.batteryPct >= 0 ? t.batteryPct : null, health: h ? readiness(h) : 'SILENT', home: { x: 0, y: 0 }, target: null, crashed: false,
          };
        }));
      }
      setUpdatedAt(performance.now());
      setBatches([...commander.batches]);
    }, 200);
    return () => clearInterval(t);
  }, [source, commander, running]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = useCallback((cmd: Cmd, ids: string[], opts: SendOpts = {}) => {
    if (!ids.length) return null;
    const health = new Map(listRef.current.map(a => [a.id, a]));
    const byId = new Map(vehicles.map(v => [v.id, v]));
    const hold = new Map<string, string>();
    // Interlocks apply to getting airborne; never to landing, holding or stopping.
    if (cmd.k === 'ARM' || cmd.k === 'TAKEOFF') {
      const il = opts.interlocks ?? { grounded: true, lowBattery: true, silent: true };
      for (const id of ids) {
        const h = health.get(id), v = byId.get(id);
        if (v?.airborne && cmd.k === 'TAKEOFF') { hold.set(id, 'already flying'); continue; }
        if (!h) continue;
        const r = readiness(h);
        if (il.silent && r === 'SILENT') hold.set(id, 'not reporting on the link');
        else if (il.grounded && r === 'GROUNDED') hold.set(id, `grounded: ${h.top?.title.toLowerCase() ?? 'fault found'}`);
        else if (il.lowBattery && h.batteryPct != null && h.batteryPct < SHOW_MIN_BATTERY) hold.set(id, `pack at ${Math.round(h.batteryPct)}%, under the ${SHOW_MIN_BATTERY}% show minimum`);
      }
    }
    // Staggered by launch row for takeoffs and landings, so the grid lifts and settles in waves.
    const rows = new Map<string, number>();
    const letters = [...new Set(ids.map(id => (health.get(id)?.pad ?? '').replace(/\d+$/, '')))].sort((a, b) => a.length - b.length || a.localeCompare(b));
    ids.forEach(id => rows.set(id, letters.indexOf((health.get(id)?.pad ?? '').replace(/\d+$/, ''))));
    const stagger = opts.staggerS && ['TAKEOFF', 'LAND', 'RTL'].includes(cmd.k) ? opts.staggerS : 0;
    const now = performance.now();
    commander.tick(now);
    const b = commander.dispatch(cmd, ids, now, { hold, delayS: stagger ? id => Math.max(0, rows.get(id) ?? 0) * stagger : undefined, retries: cmd.k === 'LAND' || cmd.k === 'KILL' ? 4 : 2, perTarget: opts.perTarget });
    recorder.event('COMMAND', cmd.k === 'KILL' ? 'CRITICAL' : cmd.k === 'ARM' || cmd.k === 'TAKEOFF' ? 'WARNING' : 'INFO', `${b.label}: sent to ${ids.length - hold.size} aircraft${hold.size ? `, ${hold.size} held back` : ''}`);
    setBatches([...commander.batches]);
    return b;
  }, [commander, vehicles]);

  const retry = useCallback((b: Batch) => {
    const ids = [...b.targets.values()].filter(t => t.status === 'REJECTED' || t.status === 'NO_RESPONSE').map(t => t.id);
    if (ids.length) send(b.cmd, ids, { interlocks: { grounded: false, lowBattery: false, silent: false } });
  }, [send]);

  // Flying by hand is in real time.
  useEffect(() => { if (active > 0 && source === 'SIMULATION') fleet.setSpeed(1); }, [active > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const useActive = () => { fleet.useActive(); useEffect(() => { setActive(a => a + 1); return () => setActive(a => a - 1); }, []); };

  const api: ControlApi = { source, vehicles, updatedAt, batches, texts, send, retry, useActive };
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
};

export function useControl(): ControlApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useControl needs <ControlProvider>');
  return v;
}

export { FleetSim };
