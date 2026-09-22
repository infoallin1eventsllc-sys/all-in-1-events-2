import React, { useEffect, useRef, useState } from 'react';
import { Bluetooth, Usb, Cpu, Link2, Link2Off, Satellite, Radio } from 'lucide-react';
import { useAircraftLink, type Transport } from './useAircraftLink';
import { FIX_NAMES, FLIGHT_MODE_NAMES } from './mavlink';
import { Chip, Dot, ToolButton, type Tone } from '../dashboards/ui';

/** App-bar control: shows link state, opens the transport picker. */
export const LinkButton: React.FC = () => {
  const link = useAircraftLink();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const tone: Tone = link.status === 'CONNECTED' ? (link.live ? 'ok' : 'warn') : link.status === 'CONNECTING' ? 'warn' : link.status === 'ERROR' ? 'bad' : 'neutral';
  const label = link.status === 'CONNECTED' ? (link.live ? link.deviceName : `${link.deviceName} · no heartbeat`) : link.status === 'CONNECTING' ? 'Connecting…' : 'Simulation';
  const t = link.telemetry;

  const TransportRow: React.FC<{ id: Transport; icon: React.ReactNode; title: string; body: string; available: boolean; onPick: () => void }> = ({ id, icon, title, body, available, onPick }) => (
    <button
      onClick={onPick}
      disabled={!available && id !== 'SIMULATION'}
      className={`w-full flex items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors disabled:opacity-50 ${link.transport === id && link.status !== 'DISCONNECTED' ? 'bg-accent-soft' : 'hover:bg-surface-2'}`}
    >
      <span className="mt-0.5 text-ink-2 [&>svg]:w-4 [&>svg]:h-4">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-ink">{title}</span>
        <span className="block text-[11px] text-ink-3">{available || id === 'SIMULATION' ? body : 'Not available in this browser — use Chrome or Edge over HTTPS.'}</span>
      </span>
    </button>
  );

  return (
    <div ref={ref} className="relative">
      <button
        id="link-button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-2 h-8 pl-2.5 pr-3 rounded-lg border border-line text-[12px] font-medium text-ink-2 hover:text-ink"
        title="Aircraft link"
      >
        <Dot tone={tone} pulse={link.status === 'CONNECTING' || link.live} />
        {link.status === 'CONNECTED' ? <Link2 className="w-3.5 h-3.5" /> : <Link2Off className="w-3.5 h-3.5" />}
        <span className="hidden sm:inline max-w-[160px] truncate">{label}</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[340px] rounded-[var(--radius-card)] border border-line bg-surface shadow-[0_12px_40px_rgba(16,24,40,0.14)] p-2 z-50">
          <div className="px-3 pt-2 pb-1 flex items-center justify-between">
            <span className="text-[13px] font-semibold text-ink">Aircraft link</span>
            <Chip tone={tone}>{link.status === 'CONNECTED' ? (link.live ? 'Live' : 'Linked') : link.status === 'CONNECTING' ? 'Connecting' : link.status === 'ERROR' ? 'Error' : 'Simulation'}</Chip>
          </div>

          {link.status === 'CONNECTED' ? (
            <div className="px-3 py-2 space-y-2">
              <div className="text-[12px] text-ink-2">{link.deviceName} · {link.transport === 'BLUETOOTH' ? 'Bluetooth LE' : 'USB serial · 57600'}</div>
              <div className="grid grid-cols-3 gap-2 text-[12px]">
                <div><div className="text-[11px] text-ink-3">Mode</div><div className="font-medium text-ink">{t.heartbeatMs ? `${FLIGHT_MODE_NAMES[t.customMode] ?? `#${t.customMode}`}${t.armed ? ' · armed' : ''}` : '—'}</div></div>
                <div><div className="text-[11px] text-ink-3">GPS</div><div className="font-medium text-ink num">{FIX_NAMES[t.fixType] ?? '—'} · {t.satellites}</div></div>
                <div><div className="text-[11px] text-ink-3">Battery</div><div className="font-medium text-ink num">{t.batteryPct >= 0 ? `${t.batteryPct}%` : '—'} · {t.voltageV.toFixed(1)} V</div></div>
                <div><div className="text-[11px] text-ink-3">Altitude</div><div className="font-medium text-ink num">{t.altRelM.toFixed(1)} m</div></div>
                <div><div className="text-[11px] text-ink-3">Ground speed</div><div className="font-medium text-ink num">{(t.groundspeedMps * 3.6).toFixed(0)} km/h</div></div>
                <div><div className="text-[11px] text-ink-3">Stream</div><div className="font-medium text-ink num">{t.msgsPerSec} msg/s{link.badCrc ? ` · ${link.badCrc} bad` : ''}</div></div>
              </div>
              {t.statusText && <div className="text-[11px] text-ink-2 rounded bg-surface-2 px-2 py-1 num">{t.statusText}</div>}
              {link.lastHeartbeatAgoS > 3 && <div className="text-[11px] text-warn">No heartbeat for {link.lastHeartbeatAgoS.toFixed(0)} s</div>}
              <div className="flex gap-2 pt-1">
                <ToolButton size="sm" icon={<Satellite />} label="Return to launch" onClick={() => link.returnToLaunch()} disabled={!link.live} />
                <ToolButton size="sm" label="Disconnect" onClick={() => { link.disconnect(); }} />
              </div>
            </div>
          ) : (
            <div className="space-y-0.5">
              <TransportRow id="BLUETOOTH" icon={<Bluetooth />} title="Bluetooth" body="BLE bridge on the flight controller (Nordic UART). Pairs with a click; ~30 m on the pad." available={link.support.bluetooth && link.support.secure} onPick={() => link.connectBluetooth()} />
              <TransportRow id="SERIAL" icon={<Usb />} title="USB telemetry radio" body="SiK 915 MHz, mLRS or ELRS radio, or the controller's USB port. Kilometres of range." available={link.support.serial && link.support.secure} onPick={() => link.connectSerial()} />
              <TransportRow id="SIMULATION" icon={<Cpu />} title="Simulation" body="No hardware. The dashboards run on their built-in simulators." available onPick={() => { link.disconnect(); setOpen(false); }} />
              {link.error && <div className="mx-2 mt-1 rounded bg-bad-soft px-2.5 py-1.5 text-[11px] text-bad">{link.error}</div>}
              <div className="mx-2 mt-1 rounded bg-surface-2 px-2.5 py-2 text-[11px] text-ink-3 flex gap-2">
                <Radio className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>Speaks MAVLink to PX4 and ArduPilot aircraft. DJI consumer drones only connect through DJI's own SDK, not Bluetooth.</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
