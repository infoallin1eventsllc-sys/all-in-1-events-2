import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  MavParser, decodeInto, encodeHeartbeat, encodeCommandLong, encodeSetInterval, encodeArm, encodeGotoGlobal,
  encodeFlightMode, encodeTakeoffFor, encodeReposition, encodeGimbalPitchYaw, encodeMountControl, encodeCameraZoom, encodeCameraSource, encodeRelay, encodeTakePhoto,
  autopilotOf, modeName, EMPTY_TELEMETRY, MAV_CMD, MAV_RESULT, type Telemetry, type MavFrame, type MissionItem, type Autopilot, type FlightMode,
} from './mavlink';
import { HEALTH_STREAMS } from '../diagnostics/decode';
import { uploadItems, startMission as startMissionOn, awaitAck as awaitAckOn, MISSION_TYPE, type MissionIO, type StartResult } from './missionClient';

/**
 * Aircraft link: the one place the browser talks to real hardware.
 *
 * Transports
 *   BLUETOOTH  Web Bluetooth (BLE) to a MAVLink bridge exposing the Nordic UART
 *              Service — e.g. an ESP32 on the flight controller's TELEM port.
 *              Chrome / Edge on desktop and Android; needs HTTPS and a click.
 *   SERIAL     Web Serial to a USB telemetry radio (SiK 915 MHz, mLRS, ELRS
 *              backpack) or the flight controller's own USB port. 57600 baud.
 *   NETWORK    WebSocket to the companion computer's bridge
 *              (hardware/companion-pi/bridge), raw MAVLink in binary messages.
 *              Works in every browser, including iPhone and iPad, which have
 *              neither Web Bluetooth nor Web Serial.
 *   SIMULATION No hardware; the dashboards run their client-side sims.
 *
 * DJI consumer aircraft are not reachable this way — they only speak through
 * DJI's SDK / cloud. This works with ArduPilot and PX4 flight controllers; the
 * autopilot is detected from its heartbeat and commands are encoded for it.
 */

export type Transport = 'SIMULATION' | 'BLUETOOTH' | 'SERIAL' | 'NETWORK';
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
  support: { bluetooth: boolean; serial: boolean; secure: boolean; network: boolean };
}

interface LinkApi extends LinkState {
  connectBluetooth: () => Promise<void>;
  connectSerial: () => Promise<void>;
  /** WebSocket to the companion computer's MAVLink bridge, e.g. wss://pi.local:8770/?token=… */
  connectNetwork: (url: string) => Promise<void>;
  /** Detected from the heartbeat. Commands below are encoded for it. */
  autopilot: Autopilot;
  disconnect: () => Promise<void>;
  send: (bytes: Uint8Array) => Promise<void>;
  returnToLaunch: () => Promise<void>;
  land: () => Promise<void>;
  arm: (arm: boolean) => Promise<void>;
  takeoff: (altM: number) => Promise<void>;
  setFlightMode: (mode: FlightMode) => Promise<void>;
  /** Go-to: ArduPilot switches to GUIDED and sends a position target; PX4 uses DO_REPOSITION. */
  goTo: (lat: number, lon: number, altRelM: number) => Promise<void>;
  /**
   * Upload a waypoint mission (ArduPilot's home item is added automatically). With `start`,
   * an aircraft already flying switches to AUTO; one on the ground is armed and started
   * (see startMission), so the mission must begin with a takeoff item.
   */
  uploadMission: (items: MissionItem[], start?: boolean) => Promise<void>;
  missionUpload: { state: 'IDLE' | 'UPLOADING' | 'DONE' | 'FAILED'; sent: number; total: number; error: string };
  /** Where MISSION_CURRENT's sequence numbers start: 1 on ArduPilot (item 0 is home), 0 on PX4. */
  missionSeqOffset: number;
  /** Upload an inclusion geofence (polygon vertices, mission type 1) and switch the fence on. */
  uploadFence: (items: MissionItem[]) => Promise<{ enabled: boolean }>;
  /** Arm and start the uploaded mission from the ground, the right way for this autopilot. */
  startMission: () => Promise<StartResult>;
  preflight: { ok: boolean; checks: PreflightCheck[] };
  // Payload (sent to the autopilot, which drives its gimbal / camera / relays)
  /** Point the gimbal. Uses gimbal protocol v2 and falls back to DO_MOUNT_CONTROL if the autopilot refuses. */
  setGimbal: (pitchDeg: number, yawDeg?: number) => Promise<void>;
  setZoom: (percent: number) => Promise<void>;
  setCameraSource: (source: 'RGB' | 'IR') => Promise<void>;
  setRelay: (instance: number, on: boolean) => Promise<void>;
  takePhoto: () => Promise<void>;
  /** True when live telemetry should replace the simulation for the selected aircraft. */
  live: boolean;
  /** Every frame from the link, as it arrives (the health monitor reads its messages here). Returns unsubscribe. */
  onFrame: (listener: (f: MavFrame) => void) => () => void;
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
    network: typeof WebSocket !== 'undefined',
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
    // Position, attitude, speed, status, GPS, battery; mission progress, wind estimate, home, fence state.
    for (const [id, hz] of [[33, 5], [30, 5], [74, 4], [1, 2], [24, 2], [147, 1], [42, 1], [168, 1], [242, 0.2], [162, 1]] as const) {
      await send(encodeSetInterval(id, hz)).catch(() => {});
    }
    // Health: motor outputs, vibration, ESC telemetry, battery cells, navigation filter, power.
    for (const [id, hz] of HEALTH_STREAMS) await send(encodeSetInterval(id, hz)).catch(() => {});
    // Firmware version once: REQUEST_MESSAGE(AUTOPILOT_VERSION), and the older capabilities request for older firmware.
    await send(encodeCommandLong(MAV_CMD.REQUEST_MESSAGE, [148])).catch(() => {});
    await send(encodeCommandLong(MAV_CMD.REQUEST_MESSAGE, [242])).catch(() => {});
    await send(encodeCommandLong(520, [1])).catch(() => {});
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

  const connectNetwork = useCallback(async (url: string) => {
    const u = url.trim();
    if (!/^wss?:\/\//i.test(u)) { setState(s => ({ ...s, status: 'ERROR', error: 'Use a ws:// or wss:// address, e.g. wss://drone-pi.local:8770' })); return; }
    // A page served over HTTPS may only open secure sockets (except to this device itself).
    const host = (() => { try { return new URL(u).hostname; } catch { return ''; } })();
    if (typeof location !== 'undefined' && location.protocol === 'https:' && /^ws:/i.test(u) && !['localhost', '127.0.0.1', '[::1]'].includes(host)) {
      setState(s => ({ ...s, status: 'ERROR', error: 'This page is secure (https), so the browser only allows wss:// connections. Start the bridge with --cert/--key, or reach it through the relay.' }));
      return;
    }
    setState(s => ({ ...s, transport: 'NETWORK', status: 'CONNECTING', error: '' }));
    try {
      const ws = new WebSocket(u);
      ws.binaryType = 'arraybuffer';
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('No answer from the bridge within 8 s')), 8000);
        ws.onopen = () => { clearTimeout(timer); resolve(); };
        ws.onerror = () => { clearTimeout(timer); reject(new Error('Could not reach the bridge. Check the address, the token and that the companion computer is on the same network.')); };
      });
      let open = true;
      ws.onmessage = e => { if (e.data instanceof ArrayBuffer) ingest(new Uint8Array(e.data)); };
      ws.onclose = ev => {
        writer.current = null; closer.current = null;
        if (open) setState(s => ({ ...s, status: 'DISCONNECTED', error: ev.code === 4001 ? 'The bridge refused the token' : 'Network link dropped' }));
      };
      writer.current = async (bytes: Uint8Array) => { if (ws.readyState === WebSocket.OPEN) ws.send(bytes as Uint8Array<ArrayBuffer>); };
      closer.current = async () => { open = false; ws.close(); };
      setState(s => ({ ...s, status: 'CONNECTED', deviceName: host || 'Network bridge' }));
      await requestStreams();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState(s => ({ ...s, status: 'ERROR', error: msg, transport: 'SIMULATION' }));
    }
  }, [ingest, requestStreams]);

  const sysId = () => primarySys.current || 1;
  const ap = () => autopilotOf(telem.current);
  const returnToLaunch = useCallback(() => send(encodeCommandLong(MAV_CMD.RETURN_TO_LAUNCH, [], sysId())), [send]);
  const land = useCallback(() => send(encodeCommandLong(MAV_CMD.LAND, [], sysId())), [send]);
  const arm = useCallback((on: boolean) => send(encodeArm(on, false, sysId())), [send]);
  const setFlightMode = useCallback(async (mode: FlightMode) => { const b = encodeFlightMode(ap(), mode, sysId()); if (b) await send(b); }, [send]);
  /** Resolve once the autopilot's heartbeat reports `mode`, or after `ms` (found flying real ArduCopter SITL). */
  const awaitMode = useCallback((mode: FlightMode, ms = 2000) => new Promise<boolean>(resolve => {
    const t0 = Date.now();
    const tick = () => { if (modeName(telem.current) === mode) resolve(true); else if (Date.now() - t0 > ms) resolve(false); else setTimeout(tick, 50); };
    tick();
  }), []);
  /**
   * ArduCopter only takes off in GUIDED; PX4 switches to its takeoff mode by itself.
   * The mode change must land before the takeoff command, or ArduCopter refuses it.
   */
  const takeoff = useCallback(async (altM: number) => {
    if (ap() !== 'PX4') { await setFlightMode('GUIDED'); await awaitMode('GUIDED'); }
    await send(encodeTakeoffFor(ap(), altM, telem.current, sysId()));
  }, [send, setFlightMode, awaitMode]);
  const goTo = useCallback(async (lat: number, lon: number, altRelM: number) => {
    if (ap() === 'PX4') { await send(encodeReposition(lat, lon, altRelM, sysId())); return; }
    await setFlightMode('GUIDED'); await awaitMode('GUIDED');
    await send(encodeGotoGlobal(lat, lon, altRelM, sysId()));
  }, [send, setFlightMode, awaitMode]);

  /** Resolve with the COMMAND_ACK result for `command`, or null after `ms`. */
  const awaitAck = useCallback((command: number, ms = 900) => new Promise<number | null>(resolve => {
    const onFrame = (f: MavFrame) => { if (f.msgId === 77 && f.payload.getUint16(0, true) === command) { done(f.payload.getUint8(2)); } };
    const done = (r: number | null) => { clearTimeout(timer); frameListeners.current.delete(onFrame); resolve(r); };
    const timer = setTimeout(() => done(null), ms);
    frameListeners.current.add(onFrame);
  }), []);
  const setGimbal = useCallback(async (pitchDeg: number, yawDeg = NaN) => {
    const ack = awaitAck(MAV_CMD.DO_GIMBAL_MANAGER_PITCHYAW);
    await send(encodeGimbalPitchYaw(pitchDeg, yawDeg, sysId()));
    const r = await ack;
    if (r !== MAV_RESULT.ACCEPTED && r !== MAV_RESULT.IN_PROGRESS) await send(encodeMountControl(pitchDeg, Number.isNaN(yawDeg) ? 0 : yawDeg, sysId()));
  }, [send, awaitAck]);
  const setZoom = useCallback((percent: number) => send(encodeCameraZoom(percent, sysId())), [send]);
  const setCameraSource = useCallback((source: 'RGB' | 'IR') => send(encodeCameraSource(source, sysId())), [send]);
  const setRelay = useCallback((instance: number, on: boolean) => send(encodeRelay(instance, on, sysId())), [send]);
  const takePhoto = useCallback(() => send(encodeTakePhoto(sysId())), [send]);

  // The mission protocol runs in missionClient (unit-tested); this adapts the link to it.
  const io = useMemo<MissionIO>(() => ({
    send: b => send(b),
    subscribe: fn => { frameListeners.current.add(fn); return () => { frameListeners.current.delete(fn); }; },
    telemetry: () => telem.current,
    sysId,
  }), [send]); // eslint-disable-line react-hooks/exhaustive-deps

  const startMission = useCallback(() => startMissionOn(io, ap()), [io]); // eslint-disable-line react-hooks/exhaustive-deps

  const uploadMission = useCallback(async (items: MissionItem[], start = false) => {
    if (!writer.current) throw new Error('Not connected');
    const t = telem.current;
    // ArduPilot reserves item 0 for home; PX4 flies item 0 as the first real item.
    const home = t.home ?? { lat: t.lat, lon: t.lon };
    const all = ap() === 'PX4' ? [...items] : [{ lat: home.lat, lon: home.lon, altRelM: 0 } as MissionItem, ...items];
    setMissionUpload({ state: 'UPLOADING', sent: 0, total: all.length, error: '' });
    try {
      await uploadItems(io, all, { missionType: MISSION_TYPE.MISSION, firstCurrent: ap() === 'PX4' ? 0 : 1, onProgress: p => setMissionUpload(m => ({ ...m, sent: p.sent })) });
      setMissionUpload(m => ({ ...m, state: 'DONE', sent: all.length }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMissionUpload(m => ({ ...m, state: 'FAILED', error: msg }));
      throw e;
    }
    if (!start) return;
    if (telem.current.armed && telem.current.altRelM > 1) { await setFlightMode('AUTO'); return; }
    const r = await startMission();
    if (!r.ok) { const msg = [r.error, ...(r.detail ?? [])].join(' · '); setMissionUpload(m => ({ ...m, state: 'FAILED', error: msg })); throw new Error(msg); }
  }, [io, setFlightMode, startMission]); // eslint-disable-line react-hooks/exhaustive-deps

  const uploadFence = useCallback(async (items: MissionItem[]) => {
    if (!writer.current) throw new Error('Not connected');
    await uploadItems(io, items, { missionType: MISSION_TYPE.FENCE });
    // Switch the fence on. ArduPilot enforces the fence types in FENCE_TYPE (polygon is in the default); PX4 uses GF_ACTION.
    const ack = awaitAckOn(io, MAV_CMD.DO_FENCE_ENABLE, 1500);
    await send(encodeCommandLong(MAV_CMD.DO_FENCE_ENABLE, [1], sysId()));
    return { enabled: (await ack) === MAV_RESULT.ACCEPTED };
  }, [io, send]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const onFrame = useCallback((listener: (f: MavFrame) => void) => {
    frameListeners.current.add(listener);
    return () => { frameListeners.current.delete(listener); };
  }, []);

  const api: LinkApi = {
    ...state, support,
    connectBluetooth, connectSerial, connectNetwork, disconnect, send, returnToLaunch, land, arm, takeoff, setFlightMode, goTo, uploadMission, missionUpload, preflight,
    uploadFence, startMission, missionSeqOffset: autopilotOf(state.telemetry) === 'PX4' ? 0 : 1,
    setGimbal, setZoom, setCameraSource, setRelay, takePhoto,
    autopilot: autopilotOf(state.telemetry),
    live: state.status === 'CONNECTED' && state.telemetry.heartbeatMs > 0,
    onFrame,
  };
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
};

export function useAircraftLink(): LinkApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAircraftLink must be used inside <AircraftLinkProvider>');
  return v;
}
