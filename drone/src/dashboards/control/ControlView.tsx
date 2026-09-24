import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PlaneTakeoff, PlaneLanding, Home, Pause, Navigation, Power, ShieldAlert, OctagonAlert, CircleCheck, TriangleAlert, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, ChevronsUp, ChevronsDown, Crosshair, RotateCcw, MousePointerClick } from 'lucide-react';
import { useControl, type VehicleView } from '../../control/useControl';
import { counts, type Batch, type TargetStatus } from '../../control/commander';
import type { Cmd } from '../../control/protocol';
import { useFleetHealth } from '../../diagnostics/useFleetHealth';
import { Headline, Card, Section, Segmented, type Tone } from '../ui';
import { TacticalMap } from './TacticalMap';
import { DECK } from '../health/Instruments';

/**
 * Control: fly one aircraft, or up to 500 at once.
 *
 * Fleet: select aircraft on the field map (drag a box), by row, or by state, and
 * send a command to all of them. Every aircraft's answer is tracked: accepted,
 * refused (with the autopilot's reason), no response after retries, or held
 * back by an interlock before sending. Take-offs and landings go row by row.
 * One aircraft: pick it (or click it on the map), fly it with the same commands,
 * nudge it a few metres at a time, or click the field to send it there.
 *
 * Safety: taking off, arming and stopping motors are press-and-hold; "Land
 * everything now" is one press and goes to every aircraft in the air whatever
 * is selected; interlocks keep grounded aircraft, low packs and silent aircraft
 * on the ground unless turned off.
 */

type Mode = 'FLEET' | 'ONE';

const STATUS_TONE: Record<TargetStatus, string> = { ACCEPTED: 'var(--color-ok)', SENT: 'var(--color-accent)', QUEUED: 'var(--color-line-2)', REJECTED: 'var(--color-bad)', NO_RESPONSE: 'var(--color-warn)', HELD: 'var(--color-ink-3)' };
const STATUS_WORD: Record<TargetStatus, string> = { ACCEPTED: 'Accepted', SENT: 'Waiting', QUEUED: 'Queued', REJECTED: 'Refused', NO_RESPONSE: 'No response', HELD: 'Held back' };

export const ControlView: React.FC = () => {
  const c = useControl();
  c.useActive();
  const fleet = useFleetHealth();
  const [mode, setMode] = useState<Mode>('FLEET');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [one, setOne] = useState<string | null>(null);
  const vs = c.vehicles;
  const byId = useMemo(() => new Map(vs.map(v => [v.id, v])), [vs]);
  // Start with everything selected; keep the selection when the fleet is the same.
  const fleetKey = `${fleet.source}:${fleet.simGen}`;
  const seeded = useRef('');
  useEffect(() => { if (vs.length && seeded.current !== fleetKey) { seeded.current = fleetKey; setSel(new Set(vs.map(v => v.id))); setOne(vs[0]?.id ?? null); } }, [vs.length, fleetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const air = vs.filter(v => v.airborne).length, armedGround = vs.filter(v => v.armed && !v.airborne).length, silent = vs.filter(v => v.doing === 'Not reporting').length;
  const landAll = () => c.send({ k: 'LAND' }, vs.filter(v => v.airborne || v.armed).map(v => v.id));

  return (
    <div id="control-view" className="flex flex-col gap-5">
      <Headline
        title="Control"
        status={air ? { label: `${air} in the air`, tone: 'accent', pulse: true } : { label: 'All on the ground', tone: 'neutral' }}
        context={`${vs.length} aircraft · ${c.source === 'LIVE' ? 'live on the link' : 'simulated show fleet'}`}
        stats={[
          { label: 'In the air', value: air, tone: air ? 'accent' as Tone : 'neutral' },
          { label: 'Armed on the ground', value: armedGround, tone: armedGround ? 'warn' : 'neutral' },
          { label: 'On the ground', value: vs.length - air - armedGround - silent },
          { label: 'Not reporting', value: silent, tone: silent ? 'warn' : 'neutral' },
        ]}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={mode} onChange={v => setMode(v as Mode)} items={[{ id: 'FLEET', label: `Fleet · ${sel.size} selected` }, { id: 'ONE', label: 'One aircraft' }]} />
        {c.source === 'SIMULATION' && (
          <label className="flex items-center gap-2 text-[12px] text-ink-2">Fleet size
            <Segmented size="sm" value={String(fleet.size)} onChange={v => fleet.setSize(Number(v) as 100 | 250 | 500)} items={[{ id: '100', label: '100' }, { id: '250', label: '250' }, { id: '500', label: '500' }]} />
          </label>
        )}
        <button type="button" id="control-land-all" onClick={landAll} disabled={!vs.some(v => v.airborne || v.armed)}
          className="ml-auto inline-flex items-center gap-2 h-10 px-4 rounded-xl text-[14px] font-semibold text-white bg-[#c62828] hover:bg-[#b71c1c] disabled:opacity-40 disabled:cursor-not-allowed shadow-sm">
          <PlaneLanding className="w-4.5 h-4.5" />Land everything now
        </button>
      </div>

      {mode === 'FLEET' ? <FleetControl sel={sel} setSel={setSel} onOpen={id => { setOne(id); setMode('ONE'); }} /> : <OneControl id={one} setId={setOne} byId={byId} />}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <Card className="xl:col-span-7" id="control-commands">
          <Section title="Commands" right="every aircraft's answer">
            <BatchList batches={mode === 'ONE' && one ? c.batches.filter(b => b.targets.has(one)) : c.batches} onRetry={c.retry} onSelect={ids => { setSel(new Set(ids)); setMode('FLEET'); }} byId={byId} />
          </Section>
        </Card>
        <Card className="xl:col-span-5" id="control-messages">
          <Section title="What the aircraft say" right="autopilot messages">
            {c.texts.length === 0 ? <p className="text-[13px] text-ink-3 py-2">Nothing yet. Refusals and warnings from the autopilots appear here.</p> : (
              <ul className="divide-y divide-line max-h-[320px] overflow-y-auto rail-scroll">
                {(mode === 'ONE' && one ? c.texts.filter(t => t.id === one) : c.texts).slice(0, 60).map((t, i) => (
                  <li key={`${t.at}-${i}`} className="py-1.5 flex gap-3 text-[12px]">
                    <span className="num w-[62px] shrink-0 text-ink-3">{new Date(t.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</span>
                    <span className="num w-[52px] shrink-0 font-medium text-ink">{byId.get(t.id)?.pad ?? t.id}</span>
                    <span className={/PreArm|refus|Crash|Emergency|failsafe/i.test(t.text) ? 'text-warn' : 'text-ink-2'}>{t.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </Card>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------- fleet

const FleetControl: React.FC<{ sel: Set<string>; setSel: (s: Set<string>) => void; onOpen: (id: string) => void }> = ({ sel, setSel, onOpen }) => {
  const c = useControl();
  const vs = c.vehicles;
  const [alt, setAlt] = useState(20);
  const [stagger, setStagger] = useState(1);
  const [il, setIl] = useState({ grounded: true, lowBattery: true, silent: true });
  const [goOpen, setGoOpen] = useState(false);
  const [go, setGo] = useState({ e: 0, n: 10, alt: 25 });
  const [killOk, setKillOk] = useState(false);
  const rows = useMemo(() => [...new Set(vs.map(v => v.pad.replace(/\d+$/, '')))], [vs]);
  const [rowFrom, setRowFrom] = useState(''); const [rowTo, setRowTo] = useState('');
  useEffect(() => { if (rows.length && !rows.includes(rowFrom)) { setRowFrom(rows[0]); setRowTo(rows[rows.length - 1]); } }, [rows.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const ids = [...sel].filter(id => vs.some(v => v.id === id));
  const selV = vs.filter(v => sel.has(v.id));
  const send = (cmd: Cmd) => c.send(cmd, ids, { staggerS: stagger, interlocks: il });
  const pick = (f: (v: VehicleView) => boolean) => setSel(new Set(vs.filter(f).map(v => v.id)));
  const rowIdx = (v: VehicleView) => rows.indexOf(v.pad.replace(/\d+$/, ''));

  return (
    <section id="control-deck" aria-label="Fleet control" className="holo-deck p-3 sm:p-4 grid grid-cols-1 xl:grid-cols-12 gap-3 sm:gap-4">
      <div className="holo-panel relative rounded-[14px] p-2 sm:p-3 xl:col-span-8 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 mb-2">
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: DECK.holo }}>Field</div>
            <div className="text-[12px]" style={{ color: DECK.ink2 }}>Drag a box to select, Shift to add. Click an aircraft to toggle it; double-click to fly it on its own.</div>
          </div>
          <Legend />
        </div>
        <div onDoubleClick={() => { const last = [...sel].pop(); if (last) onOpen(last); }}>
          <TacticalMap vehicles={vs} updatedAt={c.updatedAt} selected={sel}
            onSelect={(list, add) => { if (list.length === 1 && add) { const n = new Set(sel); if (n.has(list[0])) n.delete(list[0]); else n.add(list[0]); setSel(n); } else setSel(add ? new Set([...sel, ...list]) : new Set(list)); }} />
        </div>
      </div>

      <div className="holo-panel relative rounded-[14px] p-3 sm:p-4 xl:col-span-4 flex flex-col gap-4" id="control-panel">
        <div>
          <div className="flex items-baseline justify-between">
            <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.16em]" style={{ color: DECK.ink2 }}>Selected</h3>
            <span style={{ font: '600 18px "JetBrains Mono", monospace', color: DECK.ink }}>{ids.length}<span style={{ color: DECK.ink3, fontSize: 12 }}> of {vs.length}</span></span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {([['All', () => pick(() => true)], ['Ready', () => pick(v => v.health === 'READY')], ['In the air', () => pick(v => v.airborne)], ['On the ground', () => pick(v => !v.airborne)], ['Invert', () => pick(v => !sel.has(v.id))], ['None', () => setSel(new Set())]] as [string, () => void][]).map(([l, f]) => (
              <DeckChip key={l} onClick={f}>{l}</DeckChip>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2 text-[12px]" style={{ color: DECK.ink2 }}>
            Rows
            <DeckSelect id="row-from" value={rowFrom} onChange={setRowFrom} options={rows} />to<DeckSelect id="row-to" value={rowTo} onChange={setRowTo} options={rows} />
            <DeckChip onClick={() => { const a = rows.indexOf(rowFrom), b = rows.indexOf(rowTo); pick(v => rowIdx(v) >= Math.min(a, b) && rowIdx(v) <= Math.max(a, b)); }}>Select rows</DeckChip>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <DeckNumber id="to-alt" label="Take-off height" unit="m" value={alt} min={2} max={120} onChange={setAlt} />
          <DeckNumber id="stagger" label="Rows apart" unit="s" value={stagger} min={0} max={10} step={0.5} onChange={setStagger} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <HoldButton id="fleet-takeoff" icon={<PlaneTakeoff />} label={`Take off · ${ids.length}`} hint="Hold" disabled={!ids.length} onFire={() => send({ k: 'TAKEOFF', altM: alt })} tone="go" />
          <DeckButton id="fleet-hold" icon={<Pause />} label="Hold position" disabled={!selV.some(v => v.airborne)} onClick={() => send({ k: 'HOLD' })} />
          <DeckButton id="fleet-goto" icon={<Navigation />} label="Move or climb…" disabled={!selV.some(v => v.airborne)} onClick={() => setGoOpen(o => !o)} active={goOpen} />
          <DeckButton id="fleet-rtl" icon={<Home />} label="Return home" disabled={!selV.some(v => v.airborne)} onClick={() => send({ k: 'RTL' })} />
          <DeckButton id="fleet-land" icon={<PlaneLanding />} label="Land" disabled={!selV.some(v => v.airborne)} onClick={() => send({ k: 'LAND' })} />
          <DeckButton id="fleet-disarm" icon={<Power />} label="Disarm" disabled={!selV.some(v => v.armed && !v.airborne)} onClick={() => send({ k: 'DISARM' })} />
        </div>
        {goOpen && (
          <div className="rounded-lg p-3 flex flex-col gap-2" style={{ border: `1px solid ${DECK.line}`, background: 'rgba(90,210,255,0.04)' }}>
            <div className="text-[12px]" style={{ color: DECK.ink2 }}>Move every selected aircraft in the air by the same amount, keeping the formation, and set its height.</div>
            <div className="grid grid-cols-3 gap-2">
              <DeckNumber id="go-e" label="East" unit="m" value={go.e} min={-200} max={200} onChange={e => setGo(g => ({ ...g, e }))} />
              <DeckNumber id="go-n" label="North" unit="m" value={go.n} min={-200} max={200} onChange={n => setGo(g => ({ ...g, n }))} />
              <DeckNumber id="go-alt" label="Height" unit="m" value={go.alt} min={2} max={120} onChange={a => setGo(g => ({ ...g, alt: a }))} />
            </div>
            <DeckButton id="go-send" icon={<Navigation />} label="Send the move" onClick={() => {
              const flying = selV.filter(x => x.airborne);
              const per = new Map(flying.map(v => [v.id, { k: 'GOTO' as const, x: v.x + go.e, y: v.y + go.n, altM: go.alt }]));
              c.send({ k: 'GOTO', x: go.e, y: go.n, altM: go.alt }, flying.map(v => v.id), { perTarget: per }); setGoOpen(false);
            }} />
          </div>
        )}

        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-[10.5px] font-semibold uppercase tracking-[0.16em] mb-1" style={{ color: DECK.ink2 }}>Keep on the ground</legend>
          {([['grounded', 'Aircraft with a fault'], ['lowBattery', 'Packs under the 40% show minimum'], ['silent', 'Aircraft not reporting']] as [keyof typeof il, string][]).map(([k, l]) => (
            <label key={k} className="flex items-center gap-2 text-[12.5px]" style={{ color: DECK.ink }}>
              <input id={`il-${k}`} type="checkbox" checked={il[k]} onChange={e => setIl(s => ({ ...s, [k]: e.target.checked }))} className="accent-[#5ad2ff]" />{l}
            </label>
          ))}
        </fieldset>

        <div className="rounded-lg p-3 flex flex-col gap-2" style={{ border: '1px solid rgba(248,113,113,0.4)', background: 'rgba(248,113,113,0.06)' }}>
          <div className="flex items-center gap-2 text-[12.5px] font-semibold" style={{ color: DECK.bad }}><ShieldAlert className="w-4 h-4" />Emergency stop</div>
          <p className="text-[11.5px]" style={{ color: DECK.ink2 }}>Cuts the motors on the selected aircraft. Anything in the air falls. Use only when an aircraft is out of control.</p>
          <label className="flex items-center gap-2 text-[12px]" style={{ color: DECK.ink }}><input id="kill-ok" type="checkbox" checked={killOk} onChange={e => setKillOk(e.target.checked)} className="accent-[#f87171]" />I understand they will fall</label>
          <HoldButton id="fleet-kill" icon={<OctagonAlert />} label={`Stop motors · ${ids.length}`} hint="Hold 2 s" ms={2000} disabled={!killOk || !ids.length} onFire={() => { send({ k: 'KILL' }); setKillOk(false); }} tone="stop" />
        </div>
      </div>
    </section>
  );
};

// ---------------------------------------------------------------------------- one aircraft

const OneControl: React.FC<{ id: string | null; setId: (id: string) => void; byId: Map<string, VehicleView> }> = ({ id, setId, byId }) => {
  const c = useControl();
  const fleet = useFleetHealth();
  const vs = c.vehicles;
  const v = id ? byId.get(id) : undefined;
  const [alt, setAlt] = useState(15);
  const [goMode, setGoMode] = useState(false);
  const [killOk, setKillOk] = useState(false);
  const i = vs.findIndex(x => x.id === id);
  const step = (d: number) => { const n = vs[(i + d + vs.length) % vs.length]; if (n) setId(n.id); };
  const health = fleet.list.find(a => a.id === id);
  const send = (cmd: Cmd) => v && c.send(cmd, [v.id], { interlocks: { grounded: true, lowBattery: true, silent: true } });
  const base = v?.target && v.airborne ? v.target : v ? { x: v.x, y: v.y, z: v.alt } : null;
  const nudge = (dx: number, dy: number, dz: number) => base && send({ k: 'GOTO', x: base.x + dx, y: base.y + dy, altM: Math.max(2, base.z + dz) });

  return (
    <section id="control-one" aria-label="Fly one aircraft" className="holo-deck p-3 sm:p-4 grid grid-cols-1 xl:grid-cols-12 gap-3 sm:gap-4">
      <div className="holo-panel relative rounded-[14px] p-2 sm:p-3 xl:col-span-8 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 mb-2">
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Previous aircraft" onClick={() => step(-1)} className="h-8 w-8 grid place-items-center rounded-lg" style={{ border: `1px solid ${DECK.line}`, color: DECK.ink2 }}><ChevronLeft className="w-4 h-4" /></button>
            <select id="one-pick" value={id ?? ''} onChange={e => setId(e.target.value)} aria-label="Aircraft"
              className="h-8 rounded-lg px-2 text-[13px]" style={{ background: '#0a1424', color: DECK.ink, border: `1px solid ${DECK.line}` }}>
              {vs.map(x => <option key={x.id} value={x.id}>{x.pad} · {x.id}{x.airborne ? ' · flying' : ''}</option>)}
            </select>
            <button type="button" aria-label="Next aircraft" onClick={() => step(1)} className="h-8 w-8 grid place-items-center rounded-lg" style={{ border: `1px solid ${DECK.line}`, color: DECK.ink2 }}><ChevronRight className="w-4 h-4" /></button>
          </div>
          <DeckButton id="one-gomode" icon={goMode ? <Crosshair /> : <MousePointerClick />} label={goMode ? 'Click the field…' : 'Click to fly there'} disabled={!v?.airborne} active={goMode} onClick={() => setGoMode(g => !g)} compact />
        </div>
        <TacticalMap vehicles={vs} updatedAt={c.updatedAt} selected={new Set(id ? [id] : [])} focus={id} goMode={goMode && !!v?.airborne}
          onPick={pid => setId(pid)} onTarget={(x, y) => { send({ k: 'GOTO', x, y, altM: Math.max(2, v?.alt ?? alt) }); setGoMode(false); }} />
      </div>

      <div className="holo-panel relative rounded-[14px] p-3 sm:p-4 xl:col-span-4 flex flex-col gap-4" id="one-panel">
        {!v ? <p className="text-[13px]" style={{ color: DECK.ink3 }}>No aircraft.</p> : <>
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <span style={{ font: '600 22px "JetBrains Mono", monospace', color: DECK.ink }}>{v.pad}</span>
              <span className="text-[11px] uppercase tracking-[0.14em] font-semibold" style={{ color: v.crashed ? DECK.bad : v.airborne ? DECK.holo : v.armed ? DECK.warn : DECK.ink3 }}>{v.doing}</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-3">
              <Readout label="Height" value={v.airborne || v.alt > 0.1 ? `${v.alt.toFixed(1)} m` : '0 m'} />
              <Readout label="Speed" value={`${Math.hypot(v.vx, v.vy).toFixed(1)} m/s`} />
              <Readout label="Battery" value={v.battery != null ? `${v.battery}%` : '—'} warn={v.battery != null && v.battery < 40} />
              <Readout label="Mode" value={String(v.mode).toLowerCase().replace('_', ' ')} />
              <Readout label="Armed" value={v.armed ? 'Yes' : 'No'} warn={v.armed && !v.airborne} />
              <Readout label="Health" value={health ? ({ READY: 'Ready', WATCH: 'Watch', GROUNDED: 'Grounded', SILENT: 'Silent' } as const)[v.health] : '—'} warn={v.health !== 'READY'} />
            </div>
            {health?.top && <p className="mt-2 text-[12px]" style={{ color: health.top.level === 'FAULT' ? DECK.bad : DECK.warn }}>{health.top.title}</p>}
          </div>

          <DeckNumber id="one-alt" label="Take-off height" unit="m" value={alt} min={2} max={120} onChange={setAlt} />
          <div className="grid grid-cols-2 gap-2">
            <HoldButton id="one-takeoff" icon={<PlaneTakeoff />} label="Take off" hint="Hold" disabled={v.airborne} onFire={() => send({ k: 'TAKEOFF', altM: alt })} tone="go" />
            <DeckButton id="one-hold" icon={<Pause />} label="Hold position" disabled={!v.airborne} onClick={() => send({ k: 'HOLD' })} />
            <DeckButton id="one-rtl" icon={<Home />} label="Return home" disabled={!v.airborne} onClick={() => send({ k: 'RTL' })} />
            <DeckButton id="one-land" icon={<PlaneLanding />} label="Land" disabled={!v.airborne} onClick={() => send({ k: 'LAND' })} />
            <HoldButton id="one-arm" icon={<Power />} label={v.armed ? 'Disarm' : 'Arm'} hint={v.armed ? 'Press' : 'Hold'} disabled={v.airborne} onFire={() => send({ k: v.armed ? 'DISARM' : 'ARM' })} tone="go" ms={v.armed ? 1 : 900} />
            <DeckButton id="one-reset" icon={<RotateCcw />} label="Stop and hover" disabled={!v.airborne} onClick={() => send({ k: 'GOTO', x: v.x, y: v.y, altM: Math.max(2, v.alt) })} />
          </div>

          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.16em] mb-2" style={{ color: DECK.ink2 }}>Nudge</div>
            <div className="grid grid-cols-[repeat(3,40px)_1fr_40px] gap-1.5 items-center" aria-label="Nudge the aircraft">
              <span /><NudgeBtn label="North 5 m" onClick={() => nudge(0, 5, 0)} disabled={!v.airborne}><ArrowUp className="w-4 h-4" /></NudgeBtn><span /><span /><NudgeBtn label="Up 2 m" onClick={() => nudge(0, 0, 2)} disabled={!v.airborne}><ChevronsUp className="w-4 h-4" /></NudgeBtn>
              <NudgeBtn label="West 5 m" onClick={() => nudge(-5, 0, 0)} disabled={!v.airborne}><ArrowLeft className="w-4 h-4" /></NudgeBtn><span className="text-center text-[10px]" style={{ color: DECK.ink3 }}>5 m</span><NudgeBtn label="East 5 m" onClick={() => nudge(5, 0, 0)} disabled={!v.airborne}><ArrowRight className="w-4 h-4" /></NudgeBtn><span className="text-right pr-2 text-[10px]" style={{ color: DECK.ink3 }}>2 m</span><span />
              <span /><NudgeBtn label="South 5 m" onClick={() => nudge(0, -5, 0)} disabled={!v.airborne}><ArrowDown className="w-4 h-4" /></NudgeBtn><span /><span /><NudgeBtn label="Down 2 m" onClick={() => nudge(0, 0, -2)} disabled={!v.airborne}><ChevronsDown className="w-4 h-4" /></NudgeBtn>
            </div>
          </div>

          <div className="rounded-lg p-3 flex flex-col gap-2" style={{ border: '1px solid rgba(248,113,113,0.4)', background: 'rgba(248,113,113,0.06)' }}>
            <label className="flex items-center gap-2 text-[12px]" style={{ color: DECK.ink }}><input id="one-kill-ok" type="checkbox" checked={killOk} onChange={e => setKillOk(e.target.checked)} className="accent-[#f87171]" />Emergency stop: I understand it will fall</label>
            <HoldButton id="one-kill" icon={<OctagonAlert />} label="Stop motors" hint="Hold 2 s" ms={2000} disabled={!killOk} onFire={() => { send({ k: 'KILL' }); setKillOk(false); }} tone="stop" />
          </div>
        </>}
      </div>
    </section>
  );
};

// ---------------------------------------------------------------------------- command results

const BatchList: React.FC<{ batches: Batch[]; onRetry: (b: Batch) => void; onSelect: (ids: string[]) => void; byId: Map<string, VehicleView> }> = ({ batches, onRetry, onSelect, byId }) => {
  const [open, setOpen] = useState<number | null>(null);
  if (!batches.length) return <p className="text-[13px] text-ink-3 py-2">No commands sent yet. Select aircraft and take off, or pick one aircraft to fly.</p>;
  return (
    <ul className="divide-y divide-line">
      {batches.slice(0, 12).map((b, idx) => {
        const k = counts(b), n = b.targets.size;
        const bad = [...b.targets.values()].filter(t => t.status === 'REJECTED' || t.status === 'NO_RESPONSE');
        const held = [...b.targets.values()].filter(t => t.status === 'HELD');
        const isOpen = open === b.seq || (open === null && idx === 0);
        const order: TargetStatus[] = ['ACCEPTED', 'SENT', 'QUEUED', 'REJECTED', 'NO_RESPONSE', 'HELD'];
        return (
          <li key={b.seq} className="py-3 first:pt-0">
            <button type="button" className="w-full text-left" onClick={() => setOpen(isOpen ? -1 : b.seq)} aria-expanded={isOpen}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {b.done ? (bad.length ? <TriangleAlert className="w-4 h-4 text-warn" aria-hidden /> : <CircleCheck className="w-4 h-4 text-ok" aria-hidden />) : <span className="w-2 h-2 rounded-full bg-accent animate-pulse" aria-hidden />}
                <span className="text-[14px] font-semibold text-ink">{b.label}</span>
                <span className="text-[12px] text-ink-3">{n === 1 ? byId.get([...b.targets.keys()][0])?.pad : `${n} aircraft`}</span>
                <span className="ml-auto num text-[12px] text-ink-2">{k.ACCEPTED} of {n - k.HELD} accepted{b.done ? '' : '…'}</span>
              </div>
              <div className="mt-2 flex h-2.5 rounded-full overflow-hidden bg-surface-2" aria-hidden>
                {order.map(s => k[s] > 0 && <div key={s} style={{ width: `${(k[s] / n) * 100}%`, background: STATUS_TONE[s] }} />)}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-ink-2">
                {order.filter(s => k[s] > 0).map(s => <span key={s} className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: STATUS_TONE[s] }} />{STATUS_WORD[s]} <span className="num text-ink">{k[s]}</span></span>)}
              </div>
            </button>
            {isOpen && (bad.length > 0 || held.length > 0) && (
              <div className="mt-2 rounded-lg border border-line p-2.5">
                <ul className="max-h-[180px] overflow-y-auto rail-scroll text-[12px] divide-y divide-line">
                  {[...bad, ...held].slice(0, 80).map(t => (
                    <li key={t.id} className="py-1 flex gap-3"><span className="num w-[48px] shrink-0 font-medium text-ink">{byId.get(t.id)?.pad ?? t.id}</span><span className={t.status === 'REJECTED' ? 'text-bad' : t.status === 'NO_RESPONSE' ? 'text-warn' : 'text-ink-3'}>{STATUS_WORD[t.status]}: {t.reason}</span></li>
                  ))}
                </ul>
                <div className="mt-2 flex flex-wrap gap-2">
                  {bad.length > 0 && b.done && <button type="button" onClick={() => onRetry(b)} className="h-7 px-2.5 rounded-lg border border-line text-[12px] text-ink hover:border-line-2">Retry the {bad.length} that failed</button>}
                  <button type="button" onClick={() => onSelect([...bad, ...held].map(t => t.id))} className="h-7 px-2.5 rounded-lg border border-line text-[12px] text-ink-2 hover:text-ink">Select these</button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
};

// ---------------------------------------------------------------------------- deck controls

const Legend: React.FC = () => (
  <div className="flex flex-wrap gap-x-3 gap-y-1" style={{ font: '500 10.5px "JetBrains Mono", monospace', color: DECK.ink2 }} aria-hidden>
    <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full border" style={{ borderColor: DECK.ink2 }} />ground</span>
    <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full border-2" style={{ borderColor: DECK.warn }} />armed</span>
    <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: DECK.holo, boxShadow: `0 0 6px ${DECK.holo}` }} />flying</span>
    <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full border border-dashed" style={{ borderColor: DECK.ink3 }} />silent</span>
    <span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{ background: DECK.bad }} />fault</span>
  </div>
);

const DeckChip: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button type="button" onClick={onClick} className="h-7 px-2.5 rounded-full text-[11.5px] border hover:bg-[rgba(90,210,255,0.08)]" style={{ color: DECK.ink, borderColor: DECK.line }}>{children}</button>
);

const DeckSelect: React.FC<{ id: string; value: string; onChange: (v: string) => void; options: string[] }> = ({ id, value, onChange, options }) => (
  <select id={id} value={value} onChange={e => onChange(e.target.value)} className="h-7 rounded-md px-1.5 text-[12px]" style={{ background: '#0a1424', color: DECK.ink, border: `1px solid ${DECK.line}` }}>
    {options.map(o => <option key={o} value={o}>{o}</option>)}
  </select>
);

const DeckNumber: React.FC<{ id: string; label: string; unit: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }> = ({ id, label, unit, value, min, max, step = 1, onChange }) => (
  <label htmlFor={id} className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.12em]" style={{ color: DECK.ink3 }}>
    {label}
    <span className="flex items-center gap-1.5">
      <input id={id} type="number" value={value} min={min} max={max} step={step} onChange={e => { const n = Number(e.target.value); if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n))); }}
        className="h-8 w-full rounded-lg px-2 text-[14px] normal-case tracking-normal" style={{ background: '#0a1424', color: DECK.ink, border: `1px solid ${DECK.line}`, font: '500 14px "JetBrains Mono", monospace' }} />
      <span className="normal-case tracking-normal text-[12px]" style={{ color: DECK.ink2 }}>{unit}</span>
    </span>
  </label>
);

const DeckButton: React.FC<{ id: string; icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; active?: boolean; compact?: boolean }> = ({ id, icon, label, onClick, disabled, active, compact }) => (
  <button id={id} type="button" onClick={onClick} disabled={disabled}
    className={`inline-flex items-center gap-2 rounded-lg ${compact ? 'h-8 px-2.5 text-[12px]' : 'h-11 px-3 text-[13px]'} font-medium border transition-colors disabled:opacity-35 disabled:cursor-not-allowed hover:bg-[rgba(90,210,255,0.08)] [&_svg]:w-4 [&_svg]:h-4`}
    style={{ color: DECK.ink, borderColor: active ? DECK.holo : DECK.line, background: active ? 'rgba(90,210,255,0.1)' : 'transparent' }}>
    {icon}<span className="truncate">{label}</span>
  </button>
);

const NudgeBtn: React.FC<{ label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }> = ({ label, onClick, disabled, children }) => (
  <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="h-10 w-10 grid place-items-center rounded-lg border disabled:opacity-35 hover:bg-[rgba(90,210,255,0.08)]" style={{ color: DECK.ink, borderColor: DECK.line }}>{children}</button>
);

const Readout: React.FC<{ label: string; value: string; warn?: boolean }> = ({ label, value, warn }) => (
  <div className="min-w-0">
    <div className="text-[10px] uppercase tracking-[0.12em]" style={{ color: DECK.ink3 }}>{label}</div>
    <div className="truncate" style={{ font: '600 14px "JetBrains Mono", monospace', color: warn ? DECK.warn : DECK.ink }}>{value}</div>
  </div>
);

/** Press and hold to fire: the fill shows how long is left; letting go early cancels. Space or Enter held works too. */
const HoldButton: React.FC<{ id: string; icon: React.ReactNode; label: string; hint: string; onFire: () => void; disabled?: boolean; ms?: number; tone: 'go' | 'stop' }> = ({ id, icon, label, hint, onFire, disabled, ms = 900, tone }) => {
  const [p, setP] = useState(0);
  const t0 = useRef(0), raf = useRef(0), timer = useRef(0), fired = useRef(false), holding = useRef(false);
  const col = tone === 'stop' ? DECK.bad : DECK.ok;
  // The timer decides; animation frames only draw the fill (a busy page may draw slowly, the hold still counts).
  const fire = () => { if (!fired.current && holding.current) { fired.current = true; onFire(); } };
  const stop = () => {
    if (holding.current && performance.now() - t0.current >= ms) fire();
    holding.current = false; clearTimeout(timer.current); cancelAnimationFrame(raf.current); raf.current = 0; setP(0);
  };
  const start = () => {
    if (disabled || holding.current) return;
    holding.current = true; fired.current = false; t0.current = performance.now();
    timer.current = window.setTimeout(() => { fire(); stop(); }, ms);
    const tick = () => { if (!holding.current) return; setP(Math.min(1, (performance.now() - t0.current) / ms)); raf.current = requestAnimationFrame(tick); };
    raf.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => { cancelAnimationFrame(raf.current); clearTimeout(timer.current); }, []);
  return (
    <button id={id} type="button" disabled={disabled}
      onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
      onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); start(); } }}
      onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') stop(); }}
      aria-label={`${label}: ${hint}`}
      className="relative overflow-hidden inline-flex items-center gap-2 h-11 px-3 rounded-lg text-[13px] font-semibold border disabled:opacity-35 disabled:cursor-not-allowed [&_svg]:w-4 [&_svg]:h-4 touch-none"
      style={{ color: DECK.ink, borderColor: col, background: `${col}14` }}>
      <span className="absolute inset-y-0 left-0" style={{ width: `${p * 100}%`, background: `${col}55` }} aria-hidden />
      <span className="relative inline-flex items-center gap-2 min-w-0">{icon}<span className="truncate">{label}</span></span>
      <span className="relative ml-auto text-[10px] font-medium uppercase tracking-[0.1em] hidden sm:inline" style={{ color: DECK.ink2 }}>{p > 0 ? `${Math.round(p * 100)}%` : hint}</span>
    </button>
  );
};
