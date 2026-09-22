import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  MavParser, decodeInto, encodeHeartbeat, encodeCommandLong, encodeSetInterval, encodeSetMode, encodeArm, encodeTakeoff, encodeGotoGlobal,
  encodeMissionCount, encodeMissionClearAll, encodeMissionItemInt, encodeMissionAck, decodeMissionRequestSeq, decodeMissionAck,
  EMPTY_TELEMETRY, MAV_CMD, COPTER_MODE, type Telemetry, type MavFrame, type MissionItem,
} from './mavlink';

/**
 * Aircraft link: the one place the browser talks to real hardware.
 *
 * Transports
 *   BLUETOOTH  Web Bluetooth (BLE) to a MAVLink bridge exposing the Nordic UART
 *              Service — e.g. an ESP32 on the flight controller's TELEM port.
 *              Chrome / Edge on desktop and Android; needs HTTPS and a click.
 *   SERIAL     Web Serial to a USB telemetry radio (SiK 915 MHz, mLRS, ELRS
 *              backpack) or the flight controller's own USB port. 57600 baud.
 *   SIMULATION No hardware; the dashboards run their client-side sims.
 *
 * DJI consumer aircraft are not reachable this way — they only speak through
 * DJI's SDK / cloud. This works with PX4 and ArduPilot flight controllers.
 */

export type Transport = 'SIMULATION' | 'BLUETOOTH' | 'SERIAL';
export type LinkStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR';

export interface PreflightCheck { id: string; label: string; ok: boolean; detail: string }

interface LinkState {
  transport: Transport;
  status: LinkStatus;
  deviceName: string;
  error: string;
  telemetry: Telemetry;
  /** Every vehicle heard on the link, by MAVLink system id. `telemetry` is the primary one. */
  vehicles: Record<number, Telemetry>;
  primarySysId: number;
  bytesIn: number;
  badCrc: number;
  lastHeartbeatAgoS: number;
  support: { bluetooth: boolean; serial: boolean; secure: boolean };
}

interface LinkApi extends LinkState {
  connectBluetooth: () => Promise<void>;
  connectSerial: () => Promise<void>;
  disconnect: () => Promise<void>;
  send: (bytes: Uint8Array) => Promise<void>;
  returnToLaunch: () => Promise<void>;
  land: () => Promise<void>;
  arm: (arm: boolean) => Promise<void>;
  takeoff: (altM: number) => Promise<void>;
  setMode: (customMode: number) => Promise<void>;
  /** GUIDED go-to: switches to GUIDED then sends the position target. */
  goTo: (lat: number, lon: number, altRelM: number) => Promise<void>;
  /** Upload a waypoint mission (home item is added automatically) and optionally start it in AUTO. */
  uploadMission: (items: MissionItem[], start?: boolean) => Promise<void>;
  missionUpload: { state: 'IDLE' | 'UPLOADING' | 'DONE' | 'FAILED'; sent: number; total: number; error: string };
  preflight: { ok: boolean; checks: PreflightCheck[] };
  /** True when live telemetry should replace the simulation for the selected aircraft. */
  live: boolean;
}

const NUS_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const NUS_RX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // write to bridge
const NUS_TX = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // notify from bridge
const BLE_MTU = 20;

const Ctx = createContext<LinkApi | null>(null);

export const AircraftLinkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { bluetooth?: unknown; serial?: unknown }) : undefined;
  const support = useMemo(() => ({
    bluetooth: !!nav?.bluetooth,
    serial: !!nav?.serial,
    secure: typeof window !== 'undefined' && window.isSecureContext,
  }), [nav]);

  const [state, setState] = useState<LinkState>({
    transport: 'SIMULATION', status: 'DISCONNECTED', deviceName: '', error: '', telemetry: { ...EMPTY_TELEMETRY }, vehicles: {}, primarySysId: 0, bytesIn: 0, badCrc: 0, lastHeartbeatAgoS: 0, support,
  });
  const [missionUpload, setMissionUpload] = useState<LinkApi['missionUpload']>({ state: 'IDLE', sent: 0, total: 0, error: '' });

  const parser = useRef(new MavParser());
  const telem = useRef<Telemetry>({ ...EMPTY_TELEMETRY });
  const vehicles = useRef<Record<number, Telemetry>>({});
  const primarySys = useRef(0);
  const frameListeners = useRef<Set<(f: MavFrame) => void>>(new Set());
  const bytesIn = useRef(0);
  const msgCount = useRef(0);
  const writer = useRef<((b: Uint8Array) => Promise<void>) | null>(null);
  const closer = useRef<(() => Promise<void>) | null>(null);

  // Publish the telemetry snapshot at 10 Hz and count message rate.
  useEffect(() => {
    let last = 0;
    const t = setInterval(() => {
      const now = Date.now();
      telem.current.msgsPerSec = last ? Math.round(msgCount.current / ((now - last) / 1000)) : 0;
      msgCount.current = 0; last = now;
      setState(s => (s.status === 'CONNECTED'
        ? { ...s, telemetry: { ...telem.current }, vehicles: Object.fromEntries(Object.entries(vehicles.current).map(([k, v]) => [k, { ...v }])), primarySysId: primarySys.current, bytesIn: bytesIn.current, badCrc: parser.current.badCrc, lastHeartbeatAgoS: telem.current.heartbeatMs ? (now - telem.current.heartbeatMs) / 1000 : 0 }
        : s));
    }, 100);
    return () => clearInterval(t);
  }, []);

  // GCS heartbeat at 1 Hz keeps the autopilot streaming and its failsafe quiet.
  useEffect(() => {
    const t = setInterval(() => { if (writer.current) writer.current(encodeHeartbeat()).catch(() => {}); }, 1000);
    return () => clearInterval(t);
  }, []);

  const ingest = useCallback((chunk: Uint8Array) => {
    bytesIn.current += chunk.length;
    for (const f of parser.current.push(chunk)) {
      if (f.compId !== 1 && f.msgId === 0) continue; // ignore heartbeats from cameras/gimbals; the autopilot is component 1
      // Route by system id: the first autopilot heard is the primary; others are extra vehicles on a shared radio.
      if (!primarySys.current && f.msgId === 0) primarySys.current = f.sysId;
      const target = f.sysId === primarySys.current ? telem.current : (vehicles.current[f.sysId] ??= { ...EMPTY_TELEMETRY });
      decodeInto(target, f);
      if (f.sysId === primarySys.current) vehicles.current[f.sysId] = telem.current;
      msgCount.current++;
      frameListeners.current.forEach(l => l(f));
    }
  }, []);

  const send = useCallback(async (bytes: Uint8Array) => { if (writer.current) await writer.current(bytes); }, []);

  const requestStreams = useCallback(async () => {
    // Ask for the messages the dashboards read; autopilots that ignore this still send their defaults.
    for (const [id, hz] of [[33, 5], [30, 5], [74, 4], [1, 2], [24, 2], [147, 1]] as const) {
      await send(encodeSetInterval(id, hz)).catch(() => {});
    }
  }, [send]);

  const disconnect = useCallback(async () => {
    try { await closer.current?.(); } catch { /* already gone */ }
    closer.current = null; writer.current = null;
    telem.current = { ...EMPTY_TELEMETRY }; vehicles.current = {}; primarySys.current = 0; parser.current = new MavParser(); bytesIn.current = 0;
    setMissionUpload({ state: 'IDLE', sent: 0, total: 0, error: '' });
    setState(s => ({ ...s, transport: 'SIMULATION', status: 'DISCONNECTED', deviceName: '', error: '', telemetry: { ...EMPTY_TELEMETRY }, vehicles: {}, primarySysId: 0, bytesIn: 0, badCrc: 0 }));
  }, []);

  const connectBluetooth = useCallback(async () => {
    if (!support.bluetooth) { setState(s => ({ ...s, status: 'ERROR', error: 'Web Bluetooth is not available in this browser. Use Chrome or Edge on desktop or Android, over HTTPS.' })); return; }
    setState(s => ({ ...s, transport: 'BLUETOOTH', status: 'CONNECTING', error: '' }));
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bt = (navigator as any).bluetooth;
      const device = await bt.requestDevice({ filters: [{ services: [NUS_SERVICE] }], optionalServices: [NUS_SERVICE] });
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(NUS_SERVICE);
      const tx = await service.getCharacteristic(NUS_TX);
      const rx = await service.getCharacteristic(NUS_RX);
      await tx.startNotifications();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tx.addEventListener('characteristicvaluechanged', (e: any) => { const v: DataView = e.target.value; ingest(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)); });
      writer.current = async (bytes: Uint8Array) => {
        for (let i = 0; i < bytes.length; i += BLE_MTU) {
          const part = bytes.subarray(i, i + BLE_MTU);
          if (rx.writeValueWithoutResponse) await rx.writeValueWithoutResponse(part); else await rx.writeValue(part);
        }
      };
      closer.current = async () => { try { await tx.stopNotifications(); } catch { /* ignore */ } device.gatt.disconnect(); };
      device.addEventListener('gattserverdisconnected', () => { writer.current = null; closer.current = null; setState(s => ({ ...s, status: 'DISCONNECTED', error: 'Bluetooth link dropped' })); });
      setState(s => ({ ...s, status: 'CONNECTED', deviceName: device.name || 'BLE bridge' }));
      await requestStreams();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState(s => ({ ...s, status: /cancel/i.test(msg) ? 'DISCONNECTED' : 'ERROR', error: /cancel/i.test(msg) ? '' : msg, transport: 'SIMULATION' }));
    }
  }, [support.bluetooth, ingest, requestStreams]);

  const connectSerial = useCallback(async () => {
    if (!support.serial) { setState(s => ({ ...s, status: 'ERROR', error: 'Web Serial is not available in this browser. Use Chrome or Edge on desktop, over HTTPS.' })); return; }
    setState(s => ({ ...s, transport: 'SERIAL', status: 'CONNECTING', error: '' }));
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 57600 });
      const info = port.getInfo?.() ?? {};
      const name = info.usbVendorId ? `USB radio ${info.usbVendorId.toString(16)}:${(info.usbProductId ?? 0).toString(16)}` : 'Serial radio';
      const reader = port.readable.getReader();
      const w = port.writable.getWriter();
      let running = true;
      (async () => {
        try { while (running) { const { value, done } = await reader.read(); if (done) break; if (value) ingest(value); } }
        catch { /* port closed */ }
        finally { if (running) setState(s => ({ ...s, status: 'DISCONNECTED', error: 'Serial link dropped' })); }
      })();
      writer.current = async (bytes: Uint8Array) => { await w.write(bytes); };
      closer.current = async () => { running = false; try { await reader.cancel(); } catch { /* ignore */ } try { w.releaseLock(); } catch { /* ignore */ } try { await port.close(); } catch { /* ignore */ } };
      setState(s => ({ ...s, status: 'CONNECTED', deviceName: name }));
      await requestStreams();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState(s => ({ ...s, status: /No port selected/i.test(msg) ? 'DISCONNECTED' : 'ERROR', error: /No port selected/i.test(msg) ? '' : msg, transport: 'SIMULATION' }));
    }
  }, [support.serial, ingest, requestStreams]);

  const sysId = () => primarySys.current || 1;
  const returnToLaunch = useCallback(() => send(encodeCommandLong(MAV_CMD.RETURN_TO_LAUNCH, [], sysId())), [send]);
  const land = useCallback(() => send(encodeCommandLong(MAV_CMD.LAND, [], sysId())), [send]);
  const arm = useCallback((on: boolean) => send(encodeArm(on)), [send]);
  const takeoff = useCallback((altM: number) => send(encodeTakeoff(altM)), [send]);
  const setMode = useCallback((m: number) => send(encodeSetMode(m)), [send]);
  const goTo = useCallback(async (lat: number, lon: number, altRelM: number) => {
    await send(encodeSetMode(COPTER_MODE.GUIDED));
    await send(encodeGotoGlobal(lat, lon, altRelM, sysId()));
  }, [send]);

  /**
   * Mission upload handshake: MISSION_COUNT → autopilot asks for each item with
   * MISSION_REQUEST(_INT) → we answer → MISSION_ACK. ArduPilot treats item 0 as home,
   * so the caller's first waypoint becomes seq 1.
   */
  const uploadMission = useCallback(async (items: MissionItem[], start = false) => {
    if (!writer.current) throw new Error('Not connected');
    const t = telem.current;
    const home: MissionItem = { lat: t.lat, lon: t.lon, altRelM: 0 };
    const all = [home, ...items];
    setMissionUpload({ state: 'UPLOADING', sent: 0, total: all.length, error: '' });
    await new Promise<void>((resolve, reject) => {
      let done = false;
      const finish = (err?: string) => {
        if (done) return; done = true; frameListeners.current.delete(onFrame); clearTimeout(timer);
        if (err) { setMissionUpload(m => ({ ...m, state: 'FAILED', error: err })); reject(new Error(err)); }
        else { setMissionUpload(m => ({ ...m, state: 'DONE', sent: all.length })); resolve(); }
      };
      let timer = setTimeout(() => finish('Autopilot did not respond to MISSION_COUNT'), 5000);
      const onFrame = (f: MavFrame) => {
        const seq = decodeMissionRequestSeq(f);
        if (seq !== null) {
          clearTimeout(timer); timer = setTimeout(() => finish(`Timed out waiting for request after item ${seq}`), 5000);
          if (seq < all.length) { send(encodeMissionItemInt(seq, all[seq], seq === 1 ? 1 : 0, sysId())).catch(() => {}); setMissionUpload(m => ({ ...m, sent: seq + 1 })); }
          return;
        }
        const ack = decodeMissionAck(f);
        if (ack !== null) finish(ack === 0 ? undefined : `Mission rejected (MAV_MISSION_RESULT ${ack})`);
      };
      frameListeners.current.add(onFrame);
      send(encodeMissionClearAll(sysId())).then(() => send(encodeMissionCount(all.length, sysId()))).catch(e => finish(String(e)));
    });
    if (start) await send(encodeSetMode(COPTER_MODE.AUTO));
  }, [send]);

  // Pre-flight gate: what must be true before the dashboard will arm a real aircraft.
  const tNow = state.telemetry;
  const hbFresh = tNow.heartbeatMs > 0 && state.lastHeartbeatAgoS < 3;
  const checks: PreflightCheck[] = [
    { id: 'hb', label: 'Heartbeat from the autopilot', ok: hbFresh, detail: hbFresh ? `${tNow.msgsPerSec} msg/s` : 'none' },
    { id: 'gps', label: 'GPS 3D fix or better', ok: tNow.fixType >= 3, detail: ['No GPS', 'No fix', '2D', '3D', 'DGPS', 'RTK float', 'RTK fixed'][tNow.fixType] ?? '—' },
    { id: 'sats', label: 'At least 10 satellites', ok: tNow.satellites >= 10, detail: `${tNow.satellites} sats` },
    { id: 'hdop', label: 'HDOP under 2.0', ok: tNow.hdop < 2, detail: tNow.hdop.toFixed(1) },
    { id: 'batt', label: 'Battery at least 40%', ok: tNow.batteryPct < 0 ? tNow.voltageV > 0 : tNow.batteryPct >= 40, detail: tNow.batteryPct >= 0 ? `${tNow.batteryPct}%` : `${tNow.voltageV.toFixed(1)} V (no %)` },
    { id: 'link', label: 'Radio link quality', ok: tNow.radioRssi === 0 || tNow.radioRssi > 60, detail: tNow.radioRssi ? `RSSI ${tNow.radioRssi}` : 'n/a on this transport' },
  ];
  const preflight = { ok: checks.every(c => c.ok), checks };
  void encodeMissionAck;

  const api: LinkApi = {
    ...state, support,
    connectBluetooth, connectSerial, disconnect, send, returnToLaunch, land, arm, takeoff, setMode, goTo, uploadMission, missionUpload, preflight,
    live: state.status === 'CONNECTED' && state.telemetry.heartbeatMs > 0,
  };
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
};

export function useAircraftLink(): LinkApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAircraftLink must be used inside <AircraftLinkProvider>');
  return v;
}
