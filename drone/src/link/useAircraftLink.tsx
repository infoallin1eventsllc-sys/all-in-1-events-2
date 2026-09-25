import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  MavParser, decodeInto, encodeHeartbeat, encodeCommandLong, encodeSetInterval, encodeArm, encodeGotoGlobal,
  encodeFlightMode, encodeTakeoffFor, encodeRepositionFor, encodeGimbalPitchYaw, encodeMountControl, encodeCameraZoom, encodeCameraSource, encodeRelay, encodeTakePhoto,
  autopilotOf, modeName, isVehicleHeartbeat, MODE_LABEL, EMPTY_TELEMETRY, MAV_CMD, MAV_RESULT, type Telemetry, type MavFrame, type MissionItem, type Autopilot, type FlightMode,
  encodeParamRequestRead, encodeParamSet, decodeParamValue, decodeParamError, paramEncodingOf, paramStored, encodeFenceEnable, FENCE_TYPE, MAV_PARAM_TYPE, PARAM_ERROR_TEXT, type ParamValue,
} from './mavlink';
import { PREFLIGHT_PARAMS, READ_UNLESS, paramPreflight, type Params } from './paramChecks';
import { useOperator, ROLE_LABEL } from '../operator/operator';
import { recorder } from '../record/recorder';
import { chunkedWriter } from './writeQueue';
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

/** `advisory`: shown amber when not ok, but does not hold the gate (the crew decides). */
export interface PreflightCheck { id: string; label: string; ok: boolean; detail: string; advisory?: boolean }

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
  /**
   * The link dropped while aircraft were live (not a Disconnect). `vehicles` then holds their
   * last known state, so views keep showing the real fleet as lost rather than a simulation.
   * Cleared by Disconnect or once a heartbeat is heard again.
   */
  lost: boolean;
  /**
   * The primary aircraft's parameters the dashboards have read (see paramChecks: a missing name has not been
   * asked for yet, null means the aircraft did not answer). Updated by every PARAM_VALUE it sends.
   */
  params: Params;
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
  /** Read one parameter from a system (the primary by default), retrying; null when it does not answer. */
  readParam: (name: string, sys?: number) => Promise<ParamValue | null>;
  /** Read several, one after another (an autopilot queues only a few requests at a time). */
  readParams: (names: string[], sys?: number) => Promise<Params>;
  /**
   * Set a parameter and wait for the aircraft's PARAM_VALUE echo to show the new value; throws otherwise.
   * Pilot in command only. `type` defaults to the type the aircraft last reported for it (read first if unknown).
   */
  setParam: (name: string, value: number, type?: number, sys?: number) => Promise<ParamValue>;
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
    transport: 'SIMULATION', status: 'DISCONNECTED', deviceName: '', error: '', telemetry: { ...EMPTY_TELEMETRY }, vehicles: {}, primarySysId: 0, bytesIn: 0, badCrc: 0, lastHeartbeatAgoS: 0, support, lost: false, params: {},
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
  /** Parameters per system id; `paramsRev` bumps on every change so the 10 Hz publish copies only then. */
  const paramStore = useRef<Record<number, Params>>({});
  const paramsRev = useRef(0), paramsPub = useRef(-1);
  const operator = useOperator();
  const opRef = useRef(operator); opRef.current = operator;
  const closer = useRef<(() => Promise<void>) | null>(null);

  // Publish the telemetry snapshot at 10 Hz and count message rate.
  useEffect(() => {
    let last = 0;
    const t = setInterval(() => {
      const now = Date.now();
      telem.current.msgsPerSec = last ? Math.round(msgCount.current / ((now - last) / 1000)) : 0;
      msgCount.current = 0; last = now;
      // Copied here, not in the updater: React may run an updater twice.
      const params = paramsPub.current === paramsRev.current ? null : { ...paramStore.current[primarySys.current] };
      paramsPub.current = paramsRev.current;
      setState(s => (s.status === 'CONNECTED'
        // Reconnecting after a drop: the lost fleet stays on screen until an aircraft is heard again.
        ? { ...s, lost: s.lost && !telem.current.heartbeatMs, telemetry: { ...telem.current }, params: params ?? s.params, vehicles: s.lost && !telem.current.heartbeatMs ? s.vehicles : Object.fromEntries(Object.entries(vehicles.current).map(([k, v]) => [k, { ...v }])), primarySysId: primarySys.current, bytesIn: bytesIn.current, badCrc: parser.current.badCrc, lastHeartbeatAgoS: telem.current.heartbeatMs ? (now - telem.current.heartbeatMs) / 1000 : 0 }
        : params ? { ...s, params } : s));
    }, 100);
    return () => clearInterval(t);
  }, []);

  // GCS heartbeat at 1 Hz keeps the autopilot streaming and its failsafe quiet.
  useEffect(() => {
    const t = setInterval(() => { if (writer.current) writer.current(encodeHeartbeat()).catch(() => {}); }, 1000);
    return () => clearInterval(t);
  }, []);

  const send = useCallback(async (bytes: Uint8Array) => { if (writer.current) await writer.current(bytes); }, []);

  /** Ask one system for the messages the dashboards read; autopilots that ignore this still send their defaults. */
  const requestStreams = useCallback(async (sys: number) => {
    // Position, attitude, speed, status, GPS, battery; mission progress, wind estimate, home, fence state.
    for (const [id, hz] of [[33, 5], [30, 5], [74, 4], [1, 2], [24, 2], [147, 1], [42, 1], [168, 1], [242, 0.2], [162, 1]] as const) {
      await send(encodeSetInterval(id, hz, sys)).catch(() => {});
    }
    // Health: motor outputs, vibration, ESC telemetry, battery cells, navigation filter, power.
    for (const [id, hz] of HEALTH_STREAMS) await send(encodeSetInterval(id, hz, sys)).catch(() => {});
    // Firmware version once: REQUEST_MESSAGE(AUTOPILOT_VERSION), and the older capabilities request for older firmware.
    await send(encodeCommandLong(MAV_CMD.REQUEST_MESSAGE, [148], sys)).catch(() => {});
    await send(encodeCommandLong(MAV_CMD.REQUEST_MESSAGE, [242], sys)).catch(() => {});
    await send(encodeCommandLong(520, [1], sys)).catch(() => {});
  }, [send]);

  const readPreflight = useRef<(sys: number) => Promise<void>>(async () => {});
  const ingest = useCallback((chunk: Uint8Array) => {
    bytesIn.current += chunk.length;
    for (const f of parser.current.push(chunk)) {
      if (f.compId !== 1 && f.msgId === 0) continue; // ignore heartbeats from cameras/gimbals; the autopilot is component 1
      // A vehicle exists only once its autopilot heartbeats: a SiK radio (sys 51, comp 68), another GCS or a
      // companion computer talking on the link is not an aircraft, and must not appear as one.
      if (isVehicleHeartbeat(f) && !vehicles.current[f.sysId]) {
        // The first autopilot heard is the primary; others are extra vehicles on a shared radio.
        if (!primarySys.current) primarySys.current = f.sysId;
        vehicles.current[f.sysId] = f.sysId === primarySys.current ? telem.current : { ...EMPTY_TELEMETRY };
        // Stream requests go now, addressed to this system: before its heartbeat its id is unknown. Then the
        // pre-flight parameters (the heartbeat below has been decoded by then, so the autopilot is known).
        void requestStreams(f.sysId).then(() => readPreflight.current(f.sysId));
      }
      // RADIO_STATUS describes the link, whoever injects it (a SiK radio does, as sys 51): it is the primary's link quality.
      const target = f.msgId === 109 ? (primarySys.current ? telem.current : undefined) : vehicles.current[f.sysId];
      if (target) decodeInto(target, f);
      // Every PARAM_VALUE an autopilot sends is kept, asked for or not: ArduPilot announces a change made by another GCS.
      if (f.msgId === 22 && f.compId === 1 && target) {
        const pv = decodeParamValue(f, paramEncodingOf(autopilotOf(target)));
        if (pv?.name) { (paramStore.current[f.sysId] ??= {})[pv.name] = pv; paramsRev.current++; }
      }
      msgCount.current++;
      frameListeners.current.forEach(l => l(f));
    }
  }, [requestStreams]);

  /** Forget everything about the last connection: the next one may be a different aircraft on a different id. */
  const resetLink = useCallback(() => {
    closer.current = null; writer.current = null;
    telem.current = { ...EMPTY_TELEMETRY }; vehicles.current = {}; primarySys.current = 0; parser.current = new MavParser(); bytesIn.current = 0; msgCount.current = 0;
    paramStore.current = {}; paramsRev.current++;
  }, []);
  /**
   * The transport went away on its own. Everything from that connection is reset, but the last known state
   * stays published with `lost` set, so a fleet in the air shows as lost instead of being swapped for the simulation.
   */
  const dropped = useCallback((error: string) => {
    resetLink();
    setMissionUpload(m => (m.state === 'UPLOADING' ? { ...m, state: 'FAILED', error } : m));
    setState(s => ({ ...s, transport: 'SIMULATION', status: 'DISCONNECTED', error, params: {}, lost: s.lost || (s.status === 'CONNECTED' && s.telemetry.heartbeatMs > 0) }));
  }, [resetLink]);

  const disconnect = useCallback(async () => {
    try { await closer.current?.(); } catch { /* already gone */ }
    resetLink();
    setMissionUpload({ state: 'IDLE', sent: 0, total: 0, error: '' });
    setState(s => ({ ...s, transport: 'SIMULATION', status: 'DISCONNECTED', deviceName: '', error: '', telemetry: { ...EMPTY_TELEMETRY }, vehicles: {}, primarySysId: 0, bytesIn: 0, badCrc: 0, lost: false, params: {} }));
  }, [resetLink]);

  const connectBluetooth = useCallback(async () => {
    if (!support.bluetooth) { setState(s => ({ ...s, status: 'ERROR', error: 'Web Bluetooth is not available in this browser. Use Chrome or Edge on desktop or Android, over HTTPS.' })); return; }
    resetLink();
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
      // 20-byte pieces, one frame at a time: concurrent sends would interleave their pieces (see chunkedWriter).
      writer.current = chunkedWriter(part => (rx.writeValueWithoutResponse ? rx.writeValueWithoutResponse(part) : rx.writeValue(part)), BLE_MTU);
      let open = true;
      closer.current = async () => { open = false; try { await tx.stopNotifications(); } catch { /* ignore */ } device.gatt.disconnect(); };
      device.addEventListener('gattserverdisconnected', () => { if (open) { open = false; dropped('Bluetooth link dropped'); } });
      setState(s => ({ ...s, status: 'CONNECTED', deviceName: device.name || 'BLE bridge' }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState(s => ({ ...s, status: /cancel/i.test(msg) ? 'DISCONNECTED' : 'ERROR', error: /cancel/i.test(msg) ? '' : msg, transport: 'SIMULATION' }));
    }
  }, [support.bluetooth, ingest, resetLink, dropped]);

  const connectSerial = useCallback(async () => {
    if (!support.serial) { setState(s => ({ ...s, status: 'ERROR', error: 'Web Serial is not available in this browser. Use Chrome or Edge on desktop, over HTTPS.' })); return; }
    resetLink();
    setState(s => ({ ...s, transport: 'SERIAL', status: 'CONNECTING', error: '' }));
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 57600 });
      const info = port.getInfo?.() ?? {};
      const name = info.usbVendorId ? `USB radio ${info.usbVendorId.toString(16)}:${(info.usbProductId ?? 0).toString(16)}` : 'Serial radio';
      const reader = port.readable.getReader();
      const w = port.writable.getWriter();
      // port.close() rejects while either stream is still locked, leaving the port open ("already open" on
      // the next connect): the read loop releases its lock as it ends, and the port is closed only after that.
      const shut = async () => { try { w.releaseLock(); } catch { /* ignore */ } try { await port.close(); } catch { /* ignore */ } };
      let running = true;
      const loop = (async () => {
        try { while (running) { const { value, done } = await reader.read(); if (done) break; if (value) ingest(value); } }
        catch { /* unplugged, or a port error */ }
        finally {
          try { reader.releaseLock(); } catch { /* ignore */ }
          if (running) { running = false; await shut(); dropped('Serial link dropped'); }
        }
      })();
      writer.current = async (bytes: Uint8Array) => { await w.write(bytes); };
      closer.current = async () => { running = false; try { await reader.cancel(); } catch { /* ignore */ } await loop; await shut(); };
      setState(s => ({ ...s, status: 'CONNECTED', deviceName: name }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState(s => ({ ...s, status: /No port selected/i.test(msg) ? 'DISCONNECTED' : 'ERROR', error: /No port selected/i.test(msg) ? '' : msg, transport: 'SIMULATION' }));
    }
  }, [support.serial, ingest, resetLink, dropped]);

  const connectNetwork = useCallback(async (url: string) => {
    const u = url.trim();
    if (!/^wss?:\/\//i.test(u)) { setState(s => ({ ...s, status: 'ERROR', error: 'Use a ws:// or wss:// address, e.g. wss://drone-pi.local:8770' })); return; }
    // A page served over HTTPS may only open secure sockets (except to this device itself).
    const host = (() => { try { return new URL(u).hostname; } catch { return ''; } })();
    if (typeof location !== 'undefined' && location.protocol === 'https:' && /^ws:/i.test(u) && !['localhost', '127.0.0.1', '[::1]'].includes(host)) {
      setState(s => ({ ...s, status: 'ERROR', error: 'This page is secure (https), so the browser only allows wss:// connections. Start the bridge with --cert/--key, or reach it through the relay.' }));
      return;
    }
    resetLink();
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
      ws.onclose = ev => { if (open) { open = false; dropped(ev.code === 4001 ? 'The bridge refused the token' : 'Network link dropped'); } };
      writer.current = async (bytes: Uint8Array) => { if (ws.readyState === WebSocket.OPEN) ws.send(bytes as Uint8Array<ArrayBuffer>); };
      closer.current = async () => { open = false; ws.close(); };
      setState(s => ({ ...s, status: 'CONNECTED', deviceName: host || 'Network bridge' }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState(s => ({ ...s, status: 'ERROR', error: msg, transport: 'SIMULATION' }));
    }
  }, [ingest, resetLink, dropped]);

  const sysId = () => primarySys.current || 1;
  const ap = () => autopilotOf(telem.current);
  const returnToLaunch = useCallback(() => send(encodeCommandLong(MAV_CMD.RETURN_TO_LAUNCH, [], sysId())), [send]);
  const land = useCallback(() => send(encodeCommandLong(MAV_CMD.LAND, [], sysId())), [send]);
  const arm = useCallback((on: boolean) => send(encodeArm(on, false, sysId())), [send]);
  const setFlightMode = useCallback(async (mode: FlightMode) => { const b = encodeFlightMode(ap(), mode, sysId(), telem.current.vehicleType); if (b) await send(b); }, [send]);
  /** Resolve once the autopilot's heartbeat reports `mode`, or after `ms` (found flying real ArduCopter SITL). */
  const awaitMode = useCallback((mode: FlightMode, ms = 2000) => new Promise<boolean>(resolve => {
    const t0 = Date.now();
    const tick = () => { if (modeName(telem.current) === mode) resolve(true); else if (Date.now() - t0 > ms) resolve(false); else setTimeout(tick, 50); };
    tick();
  }), []);
  /**
   * Switch mode and wait for the heartbeat to show it; throws if it does not. What follows (a takeoff,
   * a position target, a mission) is refused or ignored in the wrong mode, so it must not be sent.
   */
  const changeMode = useCallback(async (mode: FlightMode) => {
    if (modeName(telem.current) === mode) return;
    const b = encodeFlightMode(ap(), mode, sysId(), telem.current.vehicleType);
    if (!b) throw new Error(`This aircraft has no ${MODE_LABEL[mode]} mode`);
    await send(b);
    if (!(await awaitMode(mode))) throw new Error(`The aircraft did not switch to ${MODE_LABEL[mode]} (still ${MODE_LABEL[modeName(telem.current)]})`);
  }, [send, awaitMode]);
  /**
   * ArduCopter only takes off in GUIDED; PX4 switches to its takeoff mode by itself.
   * The mode change must land before the takeoff command, or ArduCopter refuses it.
   */
  const takeoff = useCallback(async (altM: number) => {
    if (!writer.current) throw new Error('Not connected');
    if (ap() !== 'PX4') await changeMode('GUIDED');
    await send(encodeTakeoffFor(ap(), altM, telem.current, sysId()));
  }, [send, changeMode]);
  const goTo = useCallback(async (lat: number, lon: number, altRelM: number) => {
    if (!writer.current) throw new Error('Not connected');
    if (ap() === 'PX4') { await send(encodeRepositionFor('PX4', lat, lon, altRelM, telem.current, sysId())); return; }
    await changeMode('GUIDED');
    await send(encodeGotoGlobal(lat, lon, altRelM, sysId()));
  }, [send, changeMode]);

  /** Resolve with the primary aircraft's COMMAND_ACK result for `command`, or null after `ms`. */
  const awaitAck = useCallback((command: number, ms = 900) => new Promise<number | null>(resolve => {
    // Only the primary's answer counts: on a shared radio another aircraft may be acking the same command.
    const onFrame = (f: MavFrame) => { if (f.msgId === 77 && f.sysId === sysId() && f.payload.getUint16(0, true) === command) { done(f.payload.getUint8(2)); } };
    const done = (r: number | null) => { clearTimeout(timer); frameListeners.current.delete(onFrame); resolve(r); };
    const timer = setTimeout(() => done(null), ms);
    frameListeners.current.add(onFrame);
  }), []);
  // ---- parameters ----
  /**
   * Send `bytes` and wait for `sys`'s PARAM_VALUE (or PARAM_ERROR) for `name` that `accept` takes, retrying up to
   * `tries` times. Resolves with the last PARAM_VALUE seen for the name (accepted or not), the error, or neither.
   */
  const paramExchange = useCallback(async (bytes: Uint8Array, sys: number, name: string, accept: (p: ParamValue) => boolean, tries: number, ms: number) => {
    const seen: { last: ParamValue | null; error: number } = { last: null, error: 0 };
    for (let k = 0; k < tries && !seen.error; k++) {
      const got = await new Promise<ParamValue | null>(resolve => {
        const onFrame = (f: MavFrame) => {
          if (f.sysId !== sys || f.compId !== 1) return;
          const e = decodeParamError(f);
          if (e && e.name === name) { seen.error = e.error; done(null); return; }
          const pv = f.msgId === 22 ? decodeParamValue(f, paramEncodingOf(autopilotOf(vehicles.current[sys] ?? telem.current))) : null;
          if (pv && pv.name === name) { seen.last = pv; if (accept(pv)) done(pv); }
        };
        const done = (r: ParamValue | null) => { clearTimeout(timer); frameListeners.current.delete(onFrame); resolve(r); };
        const timer = setTimeout(() => done(null), ms);
        frameListeners.current.add(onFrame);
        send(bytes).catch(() => done(null));
      });
      if (got) return { value: got, ...seen };
    }
    return { value: null, ...seen };
  }, [send]);

  const readParam = useCallback(async (name: string, sys = sysId()) => {
    if (!writer.current) return null;
    const r = await paramExchange(encodeParamRequestRead(name, sys), sys, name, () => true, 3, 1000);
    const store = (paramStore.current[sys] ??= {});
    // No answer: recorded as not read, unless an earlier read had it (that is still the last the aircraft said).
    if (!r.value && !store[name]) { store[name] = null; paramsRev.current++; }
    return r.value;
  }, [paramExchange]);

  const readParams = useCallback(async (names: string[], sys = sysId()) => {
    const out: Params = {};
    for (const n of names) out[n] = await readParam(n, sys);
    return out;
  }, [readParam]);

  const setParam = useCallback(async (name: string, value: number, type?: number, sys = sysId()) => {
    // The role gate lives here, not only on the button: a parameter change is a command to the aircraft.
    const op = opRef.current;
    if (!op.canCommand) {
      recorder.event('COMMAND', 'WARNING', `Set ${name} ${value} not sent: ${ROLE_LABEL[op.role].toLowerCase()} may not command the aircraft`);
      throw new Error(`${ROLE_LABEL[op.role]}: only the pilot in command can change the aircraft's settings`);
    }
    if (!writer.current) throw new Error('Not connected');
    // PX4 refuses a PARAM_SET whose type is not the parameter's own, so the type comes from the aircraft.
    const known = paramStore.current[sys]?.[name] ?? (type === undefined ? await readParam(name, sys) : null);
    const t = type ?? known?.type ?? (autopilotOf(vehicles.current[sys] ?? telem.current) === 'PX4' ? undefined : MAV_PARAM_TYPE.REAL32);
    if (t === undefined) throw new Error(`${name}: the aircraft did not say what type it is`);
    const want = paramStored(value, t);
    const enc = paramEncodingOf(autopilotOf(vehicles.current[sys] ?? telem.current));
    const r = await paramExchange(encodeParamSet(name, value, t, enc, sys), sys, name, pv => Math.abs(pv.value - want) <= 1e-6 * Math.max(1, Math.abs(want)), 3, 1500);
    if (r.value) { recorder.event('COMMAND', 'INFO', `Set ${name} to ${r.value.value}`); return r.value; }
    const why = r.error ? `the aircraft refused it (${PARAM_ERROR_TEXT[r.error] ?? `error ${r.error}`})` : r.last ? `the aircraft kept ${r.last.value}` : 'no answer from the aircraft';
    recorder.event('COMMAND', 'WARNING', `Set ${name} to ${value} failed: ${why}`);
    throw new Error(`${name} not set to ${value}: ${why}`);
  }, [paramExchange, readParam]);

  readPreflight.current = async (sys: number) => {
    const ap = autopilotOf(vehicles.current[sys] ?? telem.current);
    const w = writer.current;
    if (ap === 'UNKNOWN') return;
    for (const n of PREFLIGHT_PARAMS[ap]) {
      const key = READ_UNLESS[n];
      if (key && paramStore.current[sys]?.[key]) continue;
      if (writer.current !== w) return; // disconnected meanwhile
      await readParam(n, sys);
    }
  };

  const gimbalYaw = useRef(NaN);
  const setGimbal = useCallback(async (pitchDeg: number, yawDeg = NaN) => {
    if (!Number.isNaN(yawDeg)) gimbalYaw.current = yawDeg;
    const ack = awaitAck(MAV_CMD.DO_GIMBAL_MANAGER_PITCHYAW);
    await send(encodeGimbalPitchYaw(pitchDeg, yawDeg, sysId()));
    const r = await ack;
    if (r === MAV_RESULT.ACCEPTED || r === MAV_RESULT.IN_PROGRESS) return;
    // DO_MOUNT_CONTROL has no "leave yaw alone": a pitch-only move keeps the last yaw commanded (else the one
    // the gimbal reports), where 0 would swing the camera back to the nose.
    const keep = Number.isNaN(yawDeg) ? (Number.isNaN(gimbalYaw.current) ? telem.current.gimbalYawDeg : gimbalYaw.current) : yawDeg;
    await send(encodeMountControl(pitchDeg, Number.isFinite(keep) ? keep : 0, sysId()));
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
    if (telem.current.armed && telem.current.altRelM > 1) {
      // Already flying: the upload only counts as started once the aircraft is in AUTO.
      try { await changeMode('AUTO'); } catch (e) { const msg = e instanceof Error ? e.message : String(e); setMissionUpload(m => ({ ...m, state: 'FAILED', error: msg })); throw e; }
      return;
    }
    const r = await startMission();
    if (!r.ok) { const msg = [r.error, ...(r.detail ?? [])].join(' · '); setMissionUpload(m => ({ ...m, state: 'FAILED', error: msg })); throw new Error(msg); }
  }, [io, changeMode, startMission]); // eslint-disable-line react-hooks/exhaustive-deps

  const uploadFence = useCallback(async (items: MissionItem[]) => {
    if (!writer.current) throw new Error('Not connected');
    await uploadItems(io, items, { missionType: MISSION_TYPE.FENCE });
    // PX4 has no fence enable (DO_FENCE_ENABLE is unsupported): an uploaded fence is enforced whenever GF_ACTION is not 0.
    if (ap() === 'PX4') { const a = await readParam('GF_ACTION'); return { enabled: !!a && a.value > 0 }; }
    // ArduPilot: enable the polygon only (param2). 4.6+ leaves the circle and altitude fences as they were; 4.5 and
    // earlier enable every type in FENCE_TYPE, which the survey's fence check allows for (see encodeFenceEnable).
    const ack = awaitAckOn(io, MAV_CMD.DO_FENCE_ENABLE, 1500);
    await send(encodeFenceEnable(true, FENCE_TYPE.POLYGON, sysId()));
    return { enabled: (await ack) === MAV_RESULT.ACCEPTED };
  }, [io, send, readParam]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-flight gate: what must be true before the dashboard will arm a real aircraft.
  const tNow = state.telemetry;
  const hbFresh = tNow.heartbeatMs > 0 && state.lastHeartbeatAgoS < 3;
  const checks: PreflightCheck[] = [
    { id: 'hb', label: 'Heartbeat from the autopilot', ok: hbFresh, detail: hbFresh ? `${tNow.msgsPerSec} msg/s` : 'none' },
    { id: 'gps', label: 'GPS 3D fix or better', ok: tNow.fixType >= 3, detail: ['No GPS', 'No fix', '2D', '3D', 'DGPS', 'RTK float', 'RTK fixed'][tNow.fixType] ?? '—' },
    { id: 'sats', label: 'At least 10 satellites', ok: tNow.satellites >= 10, detail: `${tNow.satellites} sats` },
    { id: 'hdop', label: 'HDOP under 2.0', ok: tNow.hdop < 2, detail: tNow.hdop.toFixed(1) },
    { id: 'batt', label: 'Battery at least 40%', ok: tNow.batteryPct < 0 ? tNow.voltageV > 0 : tNow.batteryPct >= 40, detail: tNow.batteryPct >= 0 ? `${tNow.batteryPct}%` : `${tNow.voltageV.toFixed(1)} V (no %)` },
    // RSSI comes from RADIO_STATUS, which the telemetry radio injects (see ingest); Bluetooth and network links have none.
    { id: 'link', label: 'Radio link quality', ok: tNow.radioRssi === 0 || tNow.radioRssi > 60, detail: tNow.radioRssi ? `RSSI ${tNow.radioRssi}${tNow.radioRemRssi ? ` · remote ${tNow.radioRemRssi}` : ''}` : 'n/a on this transport' },
    // Read from the aircraft's parameters: what it does on a low battery and a fence breach, and how high it returns.
    ...(hbFresh && autopilotOf(tNow) !== 'UNKNOWN' ? paramPreflight(autopilotOf(tNow) as 'ARDUPILOT' | 'PX4', state.params) : []),
  ];
  const preflight = { ok: checks.every(c => c.ok || c.advisory), checks };

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
    onFrame, readParam, readParams, setParam,
  };
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
};

export function useAircraftLink(): LinkApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAircraftLink must be used inside <AircraftLinkProvider>');
  return v;
}
