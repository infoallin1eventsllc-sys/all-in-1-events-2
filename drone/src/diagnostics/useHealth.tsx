import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAircraftLink } from '../link/useAircraftLink';
import { recordDb } from '../record/db';
import type { ServiceRecord } from '../analytics/aggregate';
import { decodeHealth } from './decode';
import { encodeCommandLong, MAV_CMD } from '../link/mavlink';
import { HealthMonitor, type FlightHealth, type HealthReport } from './health';
import { HealthSim, type SimFault } from './sim';
import { queue as syncQueue } from '../sync/sync';

/**
 * Runs the health monitor for the whole app, whichever screen is open, so a
 * fault found during a survey or a show is waiting on the Health screen (and
 * flagged in the app bar) without anyone having had it open.
 *
 * Source: the connected aircraft when the link is live; otherwise the simulated
 * quadcopter, whose faults can be switched on to see what each looks like.
 */

type Source = 'LIVE' | 'SIMULATION';

interface HealthApi {
  source: Source;
  report: HealthReport;
  aircraft: string;
  setAircraft: (name: string) => void;
  flights: FlightHealth[];
  parts: ServiceRecord[];
  /** Log a part as replaced (e.g. "prop-3", "props", "motors") for this aircraft. */
  markReplaced: (part: string, note: string) => Promise<void>;
  deleteFlight: (id: number) => Promise<void>;
  sim: {
    fault: SimFault; setFault: (f: SimFault) => void;
    speed: number; setSpeed: (k: number) => void;
    flying: boolean; takeoff: () => void; land: () => void;
    t: number;
  };
}

const Ctx = createContext<HealthApi | null>(null);
const NAME_KEY = 'drone-command-health-aircraft';

export const HealthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const link = useAircraftLink();
  const source: Source = link.live ? 'LIVE' : 'SIMULATION';
  const monitor = useRef(new HealthMonitor());
  const sim = useRef(new HealthSim(Date.now() % 1000));
  const [report, setReport] = useState<HealthReport>(() => monitor.current.report());
  const [flights, setFlights] = useState<FlightHealth[]>([]);
  const [parts, setParts] = useState<ServiceRecord[]>([]);
  const [fault, setFaultState] = useState<SimFault>('NONE');
  const [speed, setSpeed] = useState(4);
  const [simFlying, setSimFlying] = useState(false);
  const [simT, setSimT] = useState(0);
  const [liveName, setLiveName] = useState(() => { try { return localStorage.getItem(NAME_KEY) || 'Aircraft 1'; } catch { return 'Aircraft 1'; } });
  const aircraft = source === 'LIVE' ? liveName : 'SIM-1';

  const reload = useCallback(async () => {
    if (!recordDb.available()) return;
    try {
      const [h, s] = await Promise.all([recordDb.listHealth(), recordDb.listService()]);
      setFlights(h.sort((a, b) => b.startedAt - a.startedAt));
      setParts(s.filter(r => r.part).sort((a, b) => b.t - a.t));
    } catch { /* storage unavailable: live view still works */ }
  }, []);
  useEffect(() => { reload(); window.addEventListener('demo-seeded', reload); return () => window.removeEventListener('demo-seeded', reload); }, [reload]);

  // Fresh monitor whenever the source changes: never mix a real aircraft's data with the simulation's.
  useEffect(() => {
    const m = monitor.current;
    m.reset();
    m.source = source; m.aircraft = aircraft;
    m.onFlightEnd = r => {
      if (r.source === 'LIVE') syncQueue.add({ kind: 'health', report: r });
      if (!recordDb.available()) { setFlights(fs => [r, ...fs]); return; }
      recordDb.addHealth(r).then(id => { setFlights(fs => [{ ...r, id: id as number }, ...fs]); }).catch(() => setFlights(fs => [r, ...fs]));
    };
    setReport(m.report());
  }, [source]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { monitor.current.aircraft = aircraft; }, [aircraft]);

  // Live: every frame from the autopilot, and its state 4× a second.
  const telem = useRef(link.telemetry); telem.current = link.telemetry;
  const primary = useRef(link.primarySysId); primary.current = link.primarySysId;
  useEffect(() => {
    if (source !== 'LIVE') return;
    const off = link.onFrame(f => {
      if (primary.current && f.sysId !== primary.current) return;
      if (f.compId !== 1 && f.msgId !== 253) return; // the autopilot; STATUSTEXT from any component
      const m = decodeHealth(f); if (m) monitor.current.apply(m, Date.now());
    });
    const tick = setInterval(() => {
      const t = telem.current;
      monitor.current.setState({
        armed: t.armed, altRelM: t.altRelM, throttlePct: t.throttlePct, groundspeedMps: t.groundspeedMps, rollDeg: t.rollDeg, pitchDeg: t.pitchDeg,
        vehicleType: t.vehicleType, autopilot: t.autopilot, fixType: t.fixType, satellites: t.satellites, hdop: t.hdop, radioRssi: t.radioRssi,
      }, Date.now());
    }, 250);
    // The link asked for the firmware version on connect, possibly before this listener existed: ask again.
    const sys = primary.current || 1;
    link.send(encodeCommandLong(MAV_CMD.REQUEST_MESSAGE, [148], sys)).catch(() => {});
    const retry = setTimeout(() => link.send(encodeCommandLong(MAV_CMD.REQUEST_MESSAGE, [148], sys)).catch(() => {}), 3000);
    return () => { off(); clearInterval(tick); clearTimeout(retry); };
  }, [source, link.onFrame]); // eslint-disable-line react-hooks/exhaustive-deps

  // Simulation: steps at `speed`× real time.
  const speedRef = useRef(speed); speedRef.current = speed;
  useEffect(() => {
    if (source !== 'SIMULATION') return;
    const tick = setInterval(() => {
      const now = Date.now(), k = speedRef.current;
      for (let i = 0; i < k; i++) {
        const { state, msgs } = sim.current.step(0.25);
        monitor.current.setState(state, now, 0.25);
        msgs.forEach(m => monitor.current.apply(m, now));
      }
      setSimFlying(sim.current.armed); setSimT(sim.current.t);
    }, 250);
    return () => clearInterval(tick);
  }, [source]);

  // Publish the report twice a second.
  useEffect(() => {
    const t = setInterval(() => setReport(monitor.current.report()), 500);
    return () => clearInterval(t);
  }, []);

  const setFault = useCallback((f: SimFault) => {
    sim.current.fault = f; setFaultState(f);
    if (!sim.current.armed) { sim.current.swapBattery(); monitor.current.reset(); monitor.current.source = 'SIMULATION'; monitor.current.aircraft = 'SIM-1'; }
  }, []);

  const markReplaced = useCallback(async (part: string, note: string) => {
    const r: ServiceRecord = { aircraft, t: Date.now(), note, part };
    try { if (recordDb.available()) r.id = (await recordDb.addService(r)) as number; } catch { /* keep in memory */ }
    if (source === 'LIVE') syncQueue.add({ kind: 'service', record: r });
    setParts(ps => [r, ...ps]);
  }, [aircraft, source]);

  const deleteFlight = useCallback(async (id: number) => {
    try { await recordDb.deleteHealth(id); } catch { /* ignore */ }
    setFlights(fs => fs.filter(f => f.id !== id));
  }, []);

  const setAircraft = useCallback((name: string) => {
    const n = name.trim() || 'Aircraft 1';
    setLiveName(n); try { localStorage.setItem(NAME_KEY, n); } catch { /* private mode */ }
  }, []);

  const api = useMemo<HealthApi>(() => ({
    source, report, aircraft, setAircraft,
    flights: flights.filter(f => f.aircraft === aircraft),
    parts: parts.filter(p => p.aircraft === aircraft),
    markReplaced, deleteFlight,
    sim: {
      fault, setFault, speed, setSpeed, flying: simFlying, t: simT,
      takeoff: () => { sim.current.takeoff(); setSimFlying(true); },
      land: () => sim.current.land(),
    },
  }), [source, report, aircraft, setAircraft, flights, parts, markReplaced, deleteFlight, fault, setFault, speed, simFlying, simT]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
};

export function useHealth(): HealthApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useHealth must be used inside <HealthProvider>');
  return v;
}
