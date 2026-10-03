import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAircraftLink } from '../link/useAircraftLink';
import { decodeHealth } from './decode';
import { FleetHealth, fleetStats, type AircraftHealth, type FleetStats } from './fleet';
import { FleetSim } from './fleetSim';
import type { HealthReport } from './health';
import { recordDb } from '../record/db';

/**
 * Health for a whole fleet: a light show of 100, 250 or 500 aircraft, or every
 * aircraft on a multi-vehicle link. Live, each MAVLink system id gets its own
 * monitor, fed only that aircraft's messages. Otherwise a simulated show fleet
 * (seeded, with the faults and worn packs a real fleet has on the night).
 *
 * The simulation only runs while the fleet view is open or the fleet is
 * flying, so it costs nothing on the other screens.
 */

export type FleetSize = 100 | 250 | 500;

interface FleetApi {
  source: 'LIVE' | 'SIMULATION';
  size: FleetSize; setSize: (n: FleetSize) => void;
  speed: number; setSpeed: (k: number) => void;
  flying: boolean; flightT: number;
  takeoff: () => void; land: () => void;
  list: AircraftHealth[];
  stats: FleetStats;
  /** The full single-aircraft report, for the drill-down. */
  report: (id: string) => HealthReport | null;
  /** Mark the fleet view as open (it runs the simulation while any caller holds it). */
  useActive: () => void;
  /** The simulated fleet (null on a live link), and a counter that changes whenever it is replaced. */
  sim: () => FleetSim | null;
  simGen: number;
}

const Ctx = createContext<FleetApi | null>(null);
const SIZE_KEY = 'a1-fleet-size';

export const FleetHealthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const link = useAircraftLink();
  const liveIds = Object.keys(link.vehicles);
  // A dropped link keeps the real fleet (last known, not reporting) until the operator disconnects: swapping in
  // the simulation mid-flight would put simulated aircraft under "Land everything" and discard pending retries.
  const source: 'LIVE' | 'SIMULATION' = link.lost || (link.live && liveIds.length > 0) ? 'LIVE' : 'SIMULATION';
  const [size, setSizeState] = useState<FleetSize>(() => { try { const v = Number(localStorage.getItem(SIZE_KEY)); return (v === 250 || v === 500 ? v : 100) as FleetSize; } catch { return 100; } });
  const [speed, setSpeed] = useState(4);
  const [flying, setFlying] = useState(false);
  const [flightT, setFlightT] = useState(0);
  const [list, setList] = useState<AircraftHealth[]>([]);
  const [active, setActive] = useState(0);
  const fleet = useRef(new FleetHealth());
  const sim = useRef<FleetSim | null>(null);
  const [simGen, setSimGen] = useState(0);

  // Real aircraft keep their post-flight reports, like a single aircraft does. The simulated fleet's
  // hundreds of practice flights are not written, so they never crowd the real history.
  useEffect(() => {
    fleet.current.onFlightEnd = r => { if (r.source === 'LIVE' && recordDb.available()) recordDb.addHealth(r).catch(() => {}); };
  }, []);

  // A fresh fleet whenever the source or size changes.
  useEffect(() => {
    fleet.current.clear();
    fleet.current.source = source;
    if (source === 'SIMULATION') { sim.current = new FleetSim(size); sim.current.seed(fleet.current); }
    else sim.current = null;
    setFlying(false); setFlightT(0); setList(fleet.current.summary()); setSimGen(g => g + 1);
  }, [source, size]);

  const running = active > 0 || flying;

  // Simulation: every aircraft stepped at `speed`× real time.
  const speedRef = useRef(speed); speedRef.current = speed;
  useEffect(() => {
    if (source !== 'SIMULATION' || !running) return;
    const t = setInterval(() => {
      const s = sim.current; if (!s) return;
      const now = Date.now();
      for (let i = 0; i < speedRef.current; i++) s.step(0.25, fleet.current, now);
      setFlying(s.flying); setFlightT(s.t);
    }, 250);
    return () => clearInterval(t);
  }, [source, running]);

  // Live: each system id on the link is its own aircraft.
  const vehicles = useRef(link.vehicles); vehicles.current = link.vehicles;
  useEffect(() => {
    if (source !== 'LIVE') return;
    const off = link.onFrame(f => {
      if (f.compId !== 1 && f.msgId !== 253) return;
      const m = decodeHealth(f); if (m) fleet.current.apply(`Aircraft ${f.sysId}`, m, Date.now());
    });
    const t = setInterval(() => {
      const now = Date.now();
      for (const [sys, v] of Object.entries(vehicles.current)) {
        fleet.current.setState(`Aircraft ${sys}`, {
          armed: v.armed, altRelM: v.altRelM, throttlePct: v.throttlePct, groundspeedMps: v.groundspeedMps, rollDeg: v.rollDeg, pitchDeg: v.pitchDeg,
          vehicleType: v.vehicleType, autopilot: v.autopilot, fixType: v.fixType, satellites: v.satellites, hdop: v.hdop, radioRssi: v.radioRssi,
        }, now);
      }
      setFlying(Object.values(vehicles.current).some(v => v.armed));
    }, 250);
    return () => { off(); clearInterval(t); };
  }, [source, link.onFrame]); // eslint-disable-line react-hooks/exhaustive-deps

  // Summaries once a second while anyone is looking.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setList(fleet.current.summary()), 1000);
    setList(fleet.current.summary());
    return () => clearInterval(t);
  }, [running, source, size]);

  const stats = useMemo(() => fleetStats(list), [list]);
  const setSize = useCallback((n: FleetSize) => { setSizeState(n); try { localStorage.setItem(SIZE_KEY, String(n)); } catch { /* private mode */ } }, []);
  const takeoff = useCallback(() => { sim.current?.takeoff(); setFlying(true); }, []);
  const land = useCallback(() => { sim.current?.land(); }, []);
  const report = useCallback((id: string) => fleet.current.report(id), []);
  const useActive = () => {
    useEffect(() => { setActive(a => a + 1); return () => setActive(a => a - 1); }, []);
  };

  const getSim = useCallback(() => sim.current, []);
  const api: FleetApi = { source, size, setSize, speed, setSpeed, flying, flightT, takeoff, land, list, stats, report, useActive, sim: getSim, simGen };
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
};

export function useFleetHealth(): FleetApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFleetHealth needs <FleetHealthProvider>');
  return v;
}
