import React, { useMemo, useRef, useState } from 'react';
import {
  CheckCircle2, Clock, XCircle, CircleDashed, CalendarClock, Plus, Pencil, Download, Upload, Trash2, FlaskConical,
  Info, ExternalLink, Radio, UserRound, Plane, Scale, Map as MapIcon, ShieldCheck, Ticket, MapPin, X, Paperclip,
} from 'lucide-react';
import { Headline, Card, Section, Divider, Tabs, Chip, ToolButton, IconButton, Toggle, Segmented, type Tone } from './ui';
import { useDialog } from '../lib/useDialog';
import { compliance } from '../compliance/store';
import { files } from '../compliance/files';
import { receiver } from '../compliance/remoteId';
import { useComplianceData, useMinute, useReceiver } from '../compliance/useCompliance';
import { useOperator } from '../operator/operator';
import {
  todayYmd, fmtYmd, daysBetween, statusOf, pilotStatus, aircraftStatus, recurrentDue, registrationExpiry, review, needsAttention,
  pilotInCommand, ridBroadcast, showGates, renewalsDue, surveyChecks, showSite, isYmd, type Status, type Gate,
} from '../compliance/rules';
import type { Aircraft, ComplianceData, Ymd } from '../compliance/types';

/**
 * Compliance: the Part 107 paperwork, and whether today's flying is covered.
 *
 * Records for the crew (certificate, recurrent training), each aircraft
 * (registration, Remote ID), and each job (waivers, airspace authorizations,
 * insurance, venue permits, sites). Every record shows its standing with an icon
 * and words, never colour alone. The same rules hold the light show's Arm and
 * the survey's checklist (src/compliance/rules.ts).
 */

const DISCLAIMER = 'A record-keeping aid, not legal advice; check current FAA rules and your waiver’s own conditions.';

// ---------------------------------------------------------------------------
// Status badge: icon + words
// ---------------------------------------------------------------------------

const STATUS_TONE: Record<Status, Tone> = { VALID: 'ok', EXPIRING: 'warn', EXPIRED: 'bad', MISSING: 'bad', PENDING: 'neutral' };
const STATUS_ICON: Record<Status, React.ReactNode> = { VALID: <CheckCircle2 />, EXPIRING: <Clock />, EXPIRED: <XCircle />, MISSING: <CircleDashed />, PENDING: <CalendarClock /> };
const SOFT: Record<Tone, string> = { ok: 'bg-ok-soft text-ok', warn: 'bg-warn-soft text-warn', bad: 'bg-bad-soft text-bad', neutral: 'bg-surface-2 text-ink-2', accent: 'bg-accent-soft text-accent' };

function statusText(s: Status, to: Ymd | undefined, today: Ymd, from?: Ymd, verb = 'Valid', soon = 'Due in'): string {
  if (s === 'MISSING') return 'Missing';
  if (s === 'PENDING') return `Starts ${fmtYmd(from)}`;
  if (s === 'EXPIRED') return `Expired ${fmtYmd(to)}`;
  if (s === 'EXPIRING') { const n = daysBetween(today, to!); return n === 0 ? 'Last day today' : `${soon} ${n} day${n === 1 ? '' : 's'}`; }
  return `${verb} to ${fmtYmd(to)}`;
}

const Badge: React.FC<{ status: Status; text: string }> = ({ status, text }) => (
  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium whitespace-nowrap [&>svg]:w-3.5 [&>svg]:h-3.5 ${SOFT[STATUS_TONE[status]]}`}>
    {STATUS_ICON[status]}{text}
  </span>
);

const GateRow: React.FC<{ g: Gate }> = ({ g }) => {
  const s: Status = g.ok ? 'VALID' : g.advisory ? 'EXPIRING' : 'EXPIRED';
  return (
    <li className="flex items-start gap-2.5 py-2">
      <span className={`mt-0.5 shrink-0 [&>svg]:w-4 [&>svg]:h-4 ${g.ok ? 'text-ok' : g.advisory ? 'text-warn' : 'text-bad'}`} aria-hidden>{g.ok ? <CheckCircle2 /> : g.advisory ? <Info /> : <XCircle />}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] text-ink">{g.label}<span className="sr-only">: {s === 'VALID' ? 'pass' : g.advisory ? 'check' : 'fail'}</span></span>
        <span className="block text-[11px] text-ink-3"><span className="num">{g.cite}</span> · {g.detail}</span>
      </span>
    </li>
  );
};

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

type Kind = 'pilots' | 'aircraft' | 'waivers' | 'authorizations' | 'insurance' | 'permits' | 'sites';
type Values = Record<string, string | boolean>;
interface Field { k: string; label: string | ((v: Values) => string); type: 'text' | 'date' | 'number' | 'select' | 'textarea' | 'check'; required?: boolean; options?: [string, string][]; hint?: string; show?: (v: Values) => boolean; placeholder?: string; step?: string }

const USE_OPTS: [string, string][] = [['ANY', 'Any work'], ['LIGHT_SHOW', 'Light show'], ['SURVEY', 'Site survey'], ['SURVEILLANCE', 'Security patrol']];
const SECTION_LABEL: Record<string, string> = { '107.35': '107.35 · more than one aircraft per pilot', '107.31': '107.31 · beyond visual line of sight', '107.29': '107.29 · night operations', '107.39': '107.39 · over people', '107.51': '107.51 · operating limits', OTHER: 'Other section' };

const FORMS: Record<Kind, { noun: string; fields: Field[] }> = {
  pilots: { noun: 'remote pilot', fields: [
    { k: 'name', label: 'Name', type: 'text', required: true },
    { k: 'certNumber', label: 'Remote pilot certificate number', type: 'text', required: true, hint: '107.12: a certificate with a small UAS rating.' },
    { k: 'certIssued', label: 'Certificate issued', type: 'date' },
    { k: 'trainedOn', label: 'Last knowledge test or recurrent training', type: 'date', required: true, hint: '107.65: current to the end of the 24th calendar month after it.' },
  ] },
  aircraft: { noun: 'aircraft', fields: [
    { k: 'name', label: 'Name or tail number', type: 'text', required: true, placeholder: 'MAP-1' },
    { k: 'model', label: 'Make and model', type: 'text' },
    { k: 'serial', label: 'Airframe serial', type: 'text' },
    { k: 'regNumber', label: 'FAA registration number', type: 'text', required: true, placeholder: 'FA…', hint: 'Part 48: marked on the outside of the aircraft.' },
    { k: 'regIssued', label: 'Registered on', type: 'date' },
    { k: 'regExpires', label: 'Registration expires', type: 'date', hint: 'As printed on the certificate. Blank: three years from registration.' },
    { k: 'use', label: 'Flies', type: 'select', options: USE_OPTS },
    { k: 'ridMethod', label: 'Remote ID (Part 89)', type: 'select', options: [['', 'Not declared'], ['STANDARD', 'Standard Remote ID aircraft'], ['MODULE', 'Broadcast module'], ['FRIA', 'Flies only inside a FRIA']] },
    { k: 'ridSerial', label: v => (v.ridMethod === 'MODULE' ? 'Broadcast module serial' : 'Remote ID serial broadcast'), type: 'text', show: v => v.ridMethod === 'STANDARD' || v.ridMethod === 'MODULE', hint: 'ANSI/CTA-2063-A serial, as listed on the registration.' },
    { k: 'mavSysId', label: 'MAVLink system ID (links it to a connected autopilot)', type: 'number' },
    { k: 'overPeople', label: 'Operations over people (subpart D)', type: 'select', options: [['NONE', 'Not declared'], ['1', 'Category 1'], ['2', 'Category 2'], ['3', 'Category 3'], ['4', 'Category 4']] },
    { k: 'notes', label: 'Notes', type: 'textarea' },
  ] },
  waivers: { noun: 'waiver', fields: [
    { k: 'section', label: 'Section waived', type: 'select', options: Object.entries(SECTION_LABEL) },
    { k: 'number', label: 'Certificate of waiver number', type: 'text', required: true },
    { k: 'maxAircraft', label: 'Most aircraft per pilot', type: 'number', show: v => v.section === '107.35', required: true },
    { k: 'validFrom', label: 'Valid from', type: 'date', required: true },
    { k: 'validTo', label: 'Valid to', type: 'date', required: true },
    { k: 'conditions', label: 'Conditions (summary; the certificate governs)', type: 'textarea' },
  ] },
  authorizations: { noun: 'airspace authorization', fields: [
    { k: 'kind', label: 'Through', type: 'select', options: [['LAANC', 'LAANC'], ['DRONEZONE', 'FAADroneZone']] },
    { k: 'reference', label: 'Reference number', type: 'text', required: true },
    { k: 'location', label: 'Location', type: 'text' },
    { k: 'ceilingFt', label: 'Ceiling (ft AGL)', type: 'number', required: true },
    { k: 'validFrom', label: 'From', type: 'date', required: true },
    { k: 'validTo', label: 'To', type: 'date', required: true },
  ] },
  insurance: { noun: 'insurance policy', fields: [
    { k: 'carrier', label: 'Carrier', type: 'text', required: true },
    { k: 'policy', label: 'Policy number', type: 'text', required: true },
    { k: 'liabilityUsd', label: 'Liability limit (USD)', type: 'number' },
    { k: 'expires', label: 'Expires', type: 'date', required: true },
  ] },
  permits: { noun: 'venue permit', fields: [
    { k: 'venue', label: 'Venue or event', type: 'text', required: true },
    { k: 'issuer', label: 'Issued by', type: 'text' },
    { k: 'reference', label: 'Reference', type: 'text' },
    { k: 'validFrom', label: 'Valid from', type: 'date' },
    { k: 'expires', label: 'Expires', type: 'date', required: true },
  ] },
  sites: { noun: 'site', fields: [
    { k: 'name', label: 'Name (as the survey calls it)', type: 'text', required: true },
    { k: 'lat', label: 'Latitude', type: 'number', required: true, step: 'any' },
    { k: 'lon', label: 'Longitude', type: 'number', required: true, step: 'any' },
    { k: 'controlledAirspace', label: 'In controlled airspace (Class B, C, D or surface E)', type: 'check', hint: 'Check B4UFLY or a sectional. A survey here needs a 107.41 authorization.' },
  ] },
};
const DEFAULTS: Record<Kind, Values> = {
  pilots: {}, aircraft: { use: 'ANY', ridMethod: '', overPeople: 'NONE' }, waivers: { section: '107.35' }, authorizations: { kind: 'LAANC' }, insurance: {}, permits: {}, sites: { controlledAirspace: false },
};

type AnyRec = { id: string; sample?: boolean; fileId?: string; fileName?: string } & Record<string, unknown>;
const listOf = (d: ComplianceData, k: Kind) => d[k] as unknown as AnyRec[];

const inputCls = 'mt-1 w-full h-9 rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink placeholder:text-ink-3';

const RecordDialog: React.FC<{ kind: Kind; rec: AnyRec | null; onClose: () => void }> = ({ kind, rec, onClose }) => {
  const dialog = useDialog(onClose);
  const form = FORMS[kind];
  const [v, setV] = useState<Values>(() => {
    const init: Values = { ...DEFAULTS[kind] };
    if (rec) for (const f of form.fields) { const x = rec[f.k]; if (x != null) init[f.k] = typeof x === 'boolean' ? x : String(x); }
    return init;
  });
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const shown = form.fields.filter(f => !f.show || f.show(v));
  const set = (k: string, x: string | boolean) => setV(p => ({ ...p, [k]: x }));

  const save = async () => {
    const missing = shown.find(f => f.required && f.type !== 'check' && !String(v[f.k] ?? '').trim());
    if (missing) { setErr(`${typeof missing.label === 'function' ? missing.label(v) : missing.label} is needed`); return; }
    const from = (v.validFrom as string) || '', to = (v.validTo as string) || (v.expires as string) || '';
    if (isYmd(from) && isYmd(to) && from > to) { setErr('The end date is before the start date'); return; }
    const out: AnyRec = { ...(rec ?? {}), id: rec?.id ?? `${kind}-${Date.now().toString(36)}` };
    for (const f of form.fields) {
      const x = v[f.k], visible = !f.show || f.show(v);
      if (f.type === 'check') out[f.k] = !!x;
      else if (!visible || x == null || String(x).trim() === '') { if (['model', 'serial', 'regNumber', 'certNumber', 'name'].includes(f.k)) out[f.k] = ''; else delete out[f.k]; }
      else if (f.type === 'number') { const n = Number(x); if (!Number.isFinite(n)) { setErr(`${typeof f.label === 'function' ? f.label(v) : f.label} must be a number`); return; } out[f.k] = n; }
      else out[f.k] = String(x).trim();
    }
    setBusy(true);
    try {
      if (file) { const id = await files.put(file); if (rec?.fileId) void files.remove(rec.fileId); out.fileId = id; out.fileName = file.name; }
      compliance.set(d => { const l = listOf(d, kind); return { ...d, [kind]: rec ? l.map(x => (x.id === rec.id ? out : x)) : [...l, out] }; });
      onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const remove = () => {
    if (!rec) return;
    if (rec.fileId) void files.remove(rec.fileId);
    compliance.set(d => ({ ...d, [kind]: listOf(d, kind).filter(x => x.id !== rec.id), settings: { ...d.settings, ...(d.settings.picId === rec.id ? { picId: undefined } : {}), ...(d.settings.showSiteId === rec.id ? { showSiteId: undefined } : {}) } }));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4 print:hidden" onClick={onClose}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-label={`${rec ? 'Edit' : 'Add'} ${form.noun}`} onClick={e => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-[16px] sm:rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-ink">{rec ? 'Edit' : 'Add'} {form.noun}</h2>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-lg border border-line text-ink-2 hover:text-ink inline-flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        {rec?.sample && <p className="mt-2 text-[12px] text-ink-3">A sample record: edits stay sample content and go with “Remove sample records”.</p>}
        <form className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-3" onSubmit={e => { e.preventDefault(); void save(); }}>
          {shown.map(f => {
            const label = typeof f.label === 'function' ? f.label(v) : f.label;
            const wide = f.type === 'textarea' || f.type === 'check' || f.type === 'select' || label.length > 34;
            const id = `cf-${kind}-${f.k}`;
            if (f.type === 'check') return (
              <div key={f.k} className="sm:col-span-2 rounded-lg border border-line px-3 py-1">
                <Toggle on={!!v[f.k]} onChange={x => set(f.k, x)} label={label} description={f.hint} />
              </div>
            );
            return (
              <label key={f.k} htmlFor={id} className={`block text-[12px] text-ink-2 ${wide ? 'sm:col-span-2' : ''}`}>
                {label}{f.required && <span className="text-ink-3"> · required</span>}
                {f.type === 'select' ? (
                  <select id={id} value={String(v[f.k] ?? '')} onChange={e => set(f.k, e.target.value)} className={inputCls}>
                    {f.options!.map(([val, l]) => <option key={val} value={val}>{l}</option>)}
                  </select>
                ) : f.type === 'textarea' ? (
                  <textarea id={id} value={String(v[f.k] ?? '')} onChange={e => set(f.k, e.target.value)} rows={3} className={`${inputCls} h-auto py-2 leading-relaxed`} />
                ) : (
                  <input id={id} type={f.type} step={f.step} inputMode={f.type === 'number' ? 'decimal' : undefined} placeholder={f.placeholder} value={String(v[f.k] ?? '')} onChange={e => set(f.k, e.target.value)} className={`${inputCls} ${f.type === 'number' || f.type === 'date' ? 'num' : ''}`} />
                )}
                {f.hint && <span className="mt-1 block text-[11px] text-ink-3">{f.hint}</span>}
              </label>
            );
          })}
          {kind === 'waivers' && (
            <label className="block sm:col-span-2 text-[12px] text-ink-2">Certificate of waiver (PDF, kept on this device)
              <input type="file" accept="application/pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-[12px] text-ink-2 file:mr-3 file:h-8 file:rounded-lg file:border file:border-line file:bg-surface-2 file:px-3 file:text-[12px] file:font-medium file:text-ink" />
              {rec?.fileName && !file && <span className="mt-1 block text-[11px] text-ink-3">Attached: {rec.fileName}</span>}
            </label>
          )}
          {err && <p role="alert" className="sm:col-span-2 text-[12px] text-bad">{err}</p>}
          <div className="sm:col-span-2 flex flex-wrap items-center gap-2 pt-1">
            <ToolButton primary label={busy ? 'Saving…' : 'Save'} disabled={busy} onClick={() => void save()} />
            <ToolButton label="Cancel" onClick={onClose} />
            {rec && <ToolButton className="ml-auto" danger icon={<Trash2 />} label="Delete" onClick={remove} />}
          </div>
        </form>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Record lists
// ---------------------------------------------------------------------------

const RecordCard: React.FC<{ id: string; icon: React.ReactNode; title: string; cite: string; noun: string; onAdd: () => void; empty: string; children: React.ReactNode; count: number }> = ({ id, icon, title, cite, noun, onAdd, empty, children, count }) => (
  <Card id={id}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-[14px] font-semibold text-ink [&>svg]:w-4 [&>svg]:h-4 [&>svg]:text-ink-3">{icon}{title}<span className="num text-[11px] font-normal text-ink-3">{cite}</span></h2>
      <ToolButton size="sm" icon={<Plus />} label={`Add ${noun}`} onClick={onAdd} />
    </div>
    {count === 0 ? <p className="mt-3 text-[13px] text-ink-3">{empty}</p> : <ul className="mt-1 divide-y divide-line">{children}</ul>}
  </Card>
);

const Item: React.FC<{ title: string; sample?: boolean; lines: React.ReactNode[]; badge: React.ReactNode; onEdit: () => void; extra?: React.ReactNode }> = ({ title, sample, lines, badge, onEdit, extra }) => (
  <li className="flex flex-wrap sm:flex-nowrap items-start gap-x-4 gap-y-2 py-3">
    <div className="min-w-0 flex-1 basis-full sm:basis-auto">
      <div className="flex flex-wrap items-center gap-2"><span className="text-[14px] font-medium text-ink">{title}</span>{sample && <Chip tone="accent">Sample</Chip>}</div>
      {lines.filter(Boolean).map((l, i) => <div key={i} className="mt-0.5 text-[12px] text-ink-2 break-words">{l}</div>)}
      {extra}
    </div>
    <div className="flex items-center gap-2 shrink-0">{badge}<IconButton icon={<Pencil />} label={`Edit ${title}`} onClick={onEdit} /></div>
  </li>
);

const fmtMonth = (d: Ymd | undefined) => { if (!isYmd(d)) return '—'; const [y, m] = d.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString([], { month: 'long', year: 'numeric' }); };
const fmtMonthShort = (d: Ymd) => { const [y, m] = d.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString([], { month: 'short', year: 'numeric' }); };
const RID_LABEL = { STANDARD: 'Standard Remote ID', MODULE: 'Broadcast module', FRIA: 'FRIA only' } as const;
const USE_LABEL = Object.fromEntries(USE_OPTS) as Record<string, string>;
const money = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toLocaleString(undefined, { maximumFractionDigits: 1 })}M` : `$${n.toLocaleString()}`);
const ago = (t: number, now: number) => { const m = Math.max(0, Math.round((now - t) / 60_000)); return m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };

const RidLine: React.FC<{ a: Aircraft; d: ComplianceData; now: number }> = ({ a, d, now }) => {
  const b = ridBroadcast(a, d.sightings);
  if (b.state === 'NOT_APPLICABLE' || b.state === 'NO_SERIAL') return null;
  return b.state === 'CONFIRMED'
    ? <span className="mt-1 inline-flex items-center gap-1.5 text-[12px] text-ok"><Radio className="w-3.5 h-3.5" />Broadcast confirmed · heard {ago(b.seen!.at, now)}{b.seen!.sample ? ' (sample sighting)' : ''}</span>
    : <span className="mt-1 inline-flex items-center gap-1.5 text-[12px] text-ink-3"><Radio className="w-3.5 h-3.5" />Broadcast not seen yet</span>;
};

// ---------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------

type RailTab = 'GATES' | 'RULES' | 'RID';

export const ComplianceView: React.FC = () => {
  const d = useComplianceData();
  const now = useMinute();
  const op = useOperator();
  const today = todayYmd(now);
  const [edit, setEdit] = useState<{ kind: Kind; rec: AnyRec | null } | null>(null);
  const [rail, setRail] = useState<RailTab>('GATES');
  const [fleet, setFleet] = useState('100');
  const [surveySite, setSurveySite] = useState('');
  const [note, setNote] = useState<{ tone: Tone; text: string } | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const items = useMemo(() => review(d, today), [d, today]);
  const attention = needsAttention(items);
  const dueSoon = renewalsDue(items).length;
  const pic = pilotInCommand(d, op.name);
  const picDue = recurrentDue(pic?.trainedOn);
  const readyAircraft = d.aircraft.filter(a => aircraftStatus(a, today) === 'VALID' || aircraftStatus(a, today) === 'EXPIRING').length;
  const bestWaiver = d.waivers.filter(w => w.section === '107.35' && ['VALID', 'EXPIRING'].includes(statusOf(w.validTo, today, w.validFrom))).sort((a, b) => (b.maxAircraft ?? 0) - (a.maxAircraft ?? 0))[0];
  const hasSample = compliance.hasSample();
  const empty = !d.pilots.length && !d.aircraft.length && !d.waivers.length && !d.insurance.length && !d.authorizations.length && !d.permits.length;
  const add = (kind: Kind) => setEdit({ kind, rec: null });
  const open = (kind: Kind, rec: unknown) => setEdit({ kind, rec: rec as AnyRec });

  const show = useMemo(() => showGates(d, { fleet: Number(fleet), now, operatorName: op.name }), [d, fleet, now, op.name]);
  const sSite = d.sites.find(s => s.id === surveySite) ?? d.sites[0];
  const survey = useMemo(() => surveyChecks(d, { now, siteName: sSite?.name ?? '', altitudeM: 60, operatorName: op.name }), [d, now, sSite, op.name]);

  const doExport = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([compliance.exportJson()], { type: 'application/json' }));
    a.download = `drone-command-compliance-${today}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  const doImport = async (f: File | undefined) => {
    if (!f) return;
    try {
      const text = await f.text();
      if (!empty && !window.confirm('Replace the compliance records on this device with the ones in this file? Attached PDFs stay on this device.')) return;
      compliance.importJson(text);
      setNote({ tone: 'ok', text: `Imported ${f.name}` });
    } catch (e) { setNote({ tone: 'bad', text: `Could not import ${f.name}: ${e instanceof Error ? e.message : String(e)}` }); }
    finally { if (importRef.current) importRef.current.value = ''; }
  };

  const status = attention.length
    ? { label: `${attention.length} item${attention.length === 1 ? ' needs' : 's need'} attention`, tone: 'bad' as Tone }
    : { label: 'Ready to fly', tone: 'ok' as Tone };

  return (
    <div id="compliance-view" className="space-y-5">
      <div id="compliance-status">
        <Headline
          title="Compliance"
          status={status}
          context={`FAA Part 107 paperwork for the crew, the aircraft and each job, checked against ${fmtYmd(today)}.`}
          stats={[
            { label: 'Pilot current to', value: pic ? (picDue ? fmtMonthShort(picDue) : 'No date') : 'No pilot', tone: pic && usableStatus(pilotStatus(pic, today)) ? 'neutral' : 'bad' },
            { label: 'Aircraft ready', value: `${readyAircraft} / ${d.aircraft.length}`, tone: readyAircraft === d.aircraft.length && d.aircraft.length ? 'neutral' : 'warn' },
            { label: 'Show waiver', value: bestWaiver ? `${bestWaiver.maxAircraft ?? 0} aircraft` : 'None' },
            { label: 'Due in 30 days', value: dueSoon, tone: dueSoon ? 'warn' : 'neutral' },
          ]}
          actions={<>
            <ToolButton size="sm" icon={<Download />} label="Export" onClick={doExport} title="All records as JSON (attached PDFs stay on this device)" />
            <ToolButton size="sm" icon={<Upload />} label="Import" onClick={() => importRef.current?.click()} title="Replace these records with an exported file" />
            <input ref={importRef} type="file" accept="application/json,.json" className="hidden" onChange={e => void doImport(e.target.files?.[0])} />
          </>}
        />
        <p className="mt-3 flex items-start gap-2 text-[12px] text-ink-2"><Info className="w-4 h-4 mt-px shrink-0 text-ink-3" />{DISCLAIMER}</p>
      </div>

      {hasSample && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-warn/30 bg-warn-soft px-4 py-2.5">
          <p className="text-[13px] text-ink"><FlaskConical className="inline w-4 h-4 mr-1.5 -mt-0.5 text-warn" />Includes <strong className="font-semibold">sample records</strong>: an example pilot, three aircraft, a 100-aircraft show waiver and the festival's papers, all numbered DEMO. Your own records sit alongside them.</p>
          <ToolButton size="sm" icon={<Trash2 />} label="Remove sample records" onClick={() => compliance.clearSample()} />
        </div>
      )}
      {note && (
        <div role="status" className={`flex items-center justify-between gap-3 rounded-lg px-4 py-2.5 text-[13px] ${SOFT[note.tone]}`}>
          <span>{note.text}</span><button onClick={() => setNote(null)} aria-label="Dismiss" className="opacity-70 hover:opacity-100"><X className="w-4 h-4" /></button>
        </div>
      )}

      {empty && (
        <Card className="py-10 text-center">
          <ShieldCheck className="mx-auto w-6 h-6 text-ink-3" />
          <h2 className="mt-2 text-[15px] font-semibold text-ink">No compliance records yet</h2>
          <p className="mt-1 mx-auto max-w-[60ch] text-[13px] text-ink-2">Start with your remote pilot certificate, then each aircraft's registration and Remote ID. The light show and survey pre-flight checks read these records.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <ToolButton primary icon={<Plus />} label="Add your certificate" onClick={() => add('pilots')} />
            <ToolButton icon={<FlaskConical />} label="Load sample records" onClick={() => compliance.loadSample()} />
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_336px] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          <RecordCard id="compliance-pilots" icon={<UserRound />} title="Remote pilots" cite="107.12 · 107.65" noun="pilot" onAdd={() => add('pilots')} count={d.pilots.length} empty="No remote pilot on file. Commercial flying needs a remote pilot certificate.">
            {d.pilots.map(p => {
              const s = pilotStatus(p, today), due = recurrentDue(p.trainedOn);
              return <Item key={p.id} title={p.name} sample={p.sample} onEdit={() => open('pilots', p)}
                lines={[<span className="num">Certificate {p.certNumber || '—'}{p.certIssued ? ` · issued ${fmtYmd(p.certIssued)}` : ''}</span>,
                  <span>Recurrent training {p.trainedOn ? <span className="num">{fmtYmd(p.trainedOn)}, current through {fmtMonth(due)}</span> : 'not recorded'}{p.id === pic?.id ? ' · pilot in command' : ''}</span>]}
                badge={<Badge status={s} text={!p.certNumber.trim() ? 'No certificate' : !due ? 'No training date' : statusText(s, due, today, undefined, 'Current')} />} />;
            })}
          </RecordCard>

          <RecordCard id="compliance-aircraft" icon={<Plane />} title="Aircraft" cite="Part 48 · Part 89" noun="aircraft" onAdd={() => add('aircraft')} count={d.aircraft.length} empty="No aircraft on file. Each one needs an FAA registration and a Remote ID method.">
            {d.aircraft.map(a => {
              const exp = registrationExpiry(a), reg = a.regNumber.trim() ? statusOf(exp, today) : 'MISSING', s = aircraftStatus(a, today);
              const txt = !a.regNumber.trim() ? 'No registration' : !a.ridMethod ? 'No Remote ID' : a.ridMethod !== 'FRIA' && !a.ridSerial?.trim() ? 'No Remote ID serial' : reg === 'MISSING' ? 'No expiry date' : statusText(reg, exp, today);
              return <Item key={a.id} title={a.name} sample={a.sample} onEdit={() => open('aircraft', a)}
                lines={[<span>{[a.model, USE_LABEL[a.use]].filter(Boolean).join(' · ')}</span>,
                  <span className="num">Reg {a.regNumber || '—'}{a.serial ? ` · serial ${a.serial}` : ''}{a.overPeople && a.overPeople !== 'NONE' ? ` · over people: category ${a.overPeople}` : ''}</span>,
                  <span>Remote ID: {a.ridMethod ? RID_LABEL[a.ridMethod] : 'not declared'}{a.ridSerial && a.ridMethod !== 'FRIA' ? <span className="num"> · {a.ridSerial}</span> : ''}</span>]}
                extra={<RidLine a={a} d={d} now={now} />}
                badge={<Badge status={s} text={txt} />} />;
            })}
          </RecordCard>

          <RecordCard id="compliance-waivers" icon={<Scale />} title="Waivers" cite="107.205" noun="waiver" onAdd={() => add('waivers')} count={d.waivers.length} empty="No waivers. A light show (one pilot, many aircraft) needs a 107.35 waiver.">
            {d.waivers.map(w => {
              const s = statusOf(w.validTo, today, w.validFrom);
              return <Item key={w.id} title={w.number} sample={w.sample} onEdit={() => open('waivers', w)}
                lines={[<span>{SECTION_LABEL[w.section]}{w.section === '107.35' && w.maxAircraft ? <span className="num"> · up to {w.maxAircraft} aircraft</span> : ''}</span>,
                  <span className="num">{fmtYmd(w.validFrom)} to {fmtYmd(w.validTo)}</span>,
                  w.conditions ? <span className="text-ink-3 line-clamp-2">{w.conditions}</span> : null]}
                extra={w.fileId ? <button onClick={() => files.open(w.fileId!).catch(e => setNote({ tone: 'bad', text: e instanceof Error ? e.message : String(e) }))} className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] font-medium text-accent hover:underline"><Paperclip className="w-3.5 h-3.5" />{w.fileName ?? 'Certificate of waiver'}</button> : null}
                badge={<Badge status={s} text={statusText(s, w.validTo, today, w.validFrom)} />} />;
            })}
          </RecordCard>

          <RecordCard id="compliance-airspace" icon={<MapIcon />} title="Airspace authorizations" cite="107.41" noun="authorization" onAdd={() => add('authorizations')} count={d.authorizations.length} empty="None recorded. Controlled airspace needs one, through LAANC or FAADroneZone.">
            {d.authorizations.map(a => {
              const s = statusOf(a.validTo, today, a.validFrom);
              return <Item key={a.id} title={`${a.kind === 'LAANC' ? 'LAANC' : 'DroneZone'} ${a.reference}`} sample={a.sample} onEdit={() => open('authorizations', a)}
                lines={[<span>{a.location || 'Location not recorded'}</span>, <span className="num">Up to {a.ceilingFt} ft AGL · {fmtYmd(a.validFrom)} to {fmtYmd(a.validTo)}</span>]}
                badge={<Badge status={s} text={statusText(s, a.validTo, today, a.validFrom, 'Valid', 'Ends in')} />} />;
            })}
          </RecordCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <RecordCard id="compliance-insurance" icon={<ShieldCheck />} title="Insurance" cite="client · venue" noun="policy" onAdd={() => add('insurance')} count={d.insurance.length} empty="No policy on file. Not a Part 107 rule, but venues and clients require it.">
              {d.insurance.map(i => {
                const s = statusOf(i.expires, today);
                return <Item key={i.id} title={i.carrier} sample={i.sample} onEdit={() => open('insurance', i)}
                  lines={[<span className="num">Policy {i.policy}{i.liabilityUsd ? ` · ${money(i.liabilityUsd)} liability` : ''}</span>]}
                  badge={<Badge status={s} text={statusText(s, i.expires, today)} />} />;
              })}
            </RecordCard>
            <RecordCard id="compliance-permits" icon={<Ticket />} title="Venue permits" cite="local" noun="permit" onAdd={() => add('permits')} count={d.permits.length} empty="None recorded. Some cities and venues require their own permit.">
              {d.permits.map(p => {
                const s = statusOf(p.expires, today, p.validFrom);
                return <Item key={p.id} title={p.venue} sample={p.sample} onEdit={() => open('permits', p)}
                  lines={[<span className="num">{[p.issuer, p.reference].filter(Boolean).join(' · ') || '—'}</span>]}
                  badge={<Badge status={s} text={statusText(s, p.expires, today, p.validFrom)} />} />;
              })}
            </RecordCard>
          </div>

          <RecordCard id="compliance-sites" icon={<MapPin />} title="Sites" cite="sunset · airspace" noun="site" onAdd={() => add('sites')} count={d.sites.length} empty="No sites. A site gives the light show its sunset time and tells the survey whether it is in controlled airspace.">
            {d.sites.map(s => (
              <Item key={s.id} title={s.name} sample={s.sample} onEdit={() => open('sites', s)}
                lines={[<span className="num">{s.lat.toFixed(4)}, {s.lon.toFixed(4)}{showSite(d)?.id === s.id ? ' · light show site' : ''}</span>]}
                badge={<span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium whitespace-nowrap ${s.controlledAirspace ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-ink-2'}`}>{s.controlledAirspace ? 'Controlled airspace' : 'Not controlled'}</span>} />
            ))}
          </RecordCard>
        </div>

        {/* Rail: what today's flying needs, the rules, the Remote ID receiver */}
        <Card className="xl:sticky xl:top-[72px]">
          <Tabs value={rail} onChange={setRail} items={[{ id: 'GATES', label: 'Pre-flight' }, { id: 'RULES', label: 'Rules' }, { id: 'RID', label: 'Remote ID' }]} />
          <div className="mt-4 rail-scroll xl:max-h-[calc(100vh-180px)] xl:overflow-y-auto pr-1 space-y-5">
            {rail === 'GATES' && <>
              <Section title="Light show" right={<Segmented size="sm" value={fleet} onChange={setFleet} items={['100', '250', '500'].map(n => ({ id: n, label: n }))} />}>
                <ul id="compliance-show-gates" className="divide-y divide-line">{show.map(g => <GateRow key={g.id} g={g} />)}</ul>
                <div className="mt-2 rounded-lg border border-line px-3 py-1">
                  <Toggle on={d.settings.showLighting} onChange={x => compliance.set(p => ({ ...p, settings: { ...p.settings, showLighting: x } }))}
                    label="Anti-collision lighting confirmed" description="Every show aircraft, visible for 3 statute miles (107.29). Needed from sunset." />
                </div>
                {d.sites.length > 1 && (
                  <label className="mt-2 block text-[11px] text-ink-3">Show site
                    <select value={showSite(d)?.id ?? ''} onChange={e => compliance.set(p => ({ ...p, settings: { ...p.settings, showSiteId: e.target.value } }))} className={inputCls}>
                      {d.sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </label>
                )}
                {d.pilots.length > 1 && (
                  <label className="mt-2 block text-[11px] text-ink-3">Pilot in command (when the operator's name matches no pilot)
                    <select value={d.settings.picId ?? ''} onChange={e => compliance.set(p => ({ ...p, settings: { ...p.settings, picId: e.target.value } }))} className={inputCls}>
                      {d.pilots.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </label>
                )}
              </Section>
              <Divider />
              <Section title="Site survey" right="at 60 m (197 ft)">
                {d.sites.length > 1 && (
                  <select aria-label="Survey site" value={sSite?.id ?? ''} onChange={e => setSurveySite(e.target.value)} className={`${inputCls} mt-0 mb-1`}>
                    {d.sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                )}
                <ul className="divide-y divide-line">{survey.map(g => <GateRow key={g.id} g={g} />)}</ul>
              </Section>
              <p className="text-[11px] text-ink-3">These hold the light show's Arm and join the survey's aircraft checklist.</p>
            </>}

            {rail === 'RULES' && <>
              <ul className="space-y-3">
                {RULES.map(r => (
                  <li key={r.cite} className="text-[12px] leading-relaxed">
                    <span className="block text-[13px] font-medium text-ink">{r.title} <span className="num text-[11px] font-normal text-ink-3">{r.cite}</span></span>
                    <span className="text-ink-2">{r.body}</span>
                  </li>
                ))}
              </ul>
              <Divider />
              <div className="flex flex-col gap-1.5 text-[13px]">
                {LINKS.map(l => <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-medium text-accent hover:underline">{l.label}<ExternalLink className="w-3.5 h-3.5" /></a>)}
              </div>
              <p className="text-[11px] text-ink-3">Authorizations are requested in LAANC or FAADroneZone and recorded here by reference; this console does not file them.</p>
            </>}

            {rail === 'RID' && <RemoteIdPanel d={d} now={now} />}

            <p className="flex items-start gap-1.5 text-[11px] text-ink-3"><Info className="w-3.5 h-3.5 mt-px shrink-0" />{DISCLAIMER}</p>
          </div>
        </Card>
      </div>

      {edit && <RecordDialog kind={edit.kind} rec={edit.rec} onClose={() => setEdit(null)} />}
    </div>
  );
};

const usableStatus = (s: Status) => s === 'VALID' || s === 'EXPIRING';

const RemoteIdPanel: React.FC<{ d: ComplianceData; now: number }> = ({ d, now }) => {
  const rx = useReceiver();
  const [url, setUrl] = useState(d.settings.receiverUrl ?? 'ws://venue-pi.local:8765');
  const tone: Tone = rx.state === 'ON' ? 'ok' : rx.state === 'ERROR' ? 'bad' : rx.state === 'CONNECTING' ? 'warn' : 'neutral';
  const withSerial = d.aircraft.filter(a => a.ridMethod && a.ridMethod !== 'FRIA');
  return (
    <>
      <Section title="Venue receiver" right={<Chip tone={tone}>{{ OFF: 'Not connected', CONNECTING: 'Connecting', ON: 'Listening', ERROR: 'Error' }[rx.state]}</Chip>}>
        <p className="text-[12px] text-ink-2">The Remote ID receiver (hardware/companion-pi/remoteid) listens for broadcasts at the venue. Each aircraft whose declared serial it hears is marked confirmed.</p>
        <label className="mt-2 block text-[11px] text-ink-3">Receiver address
          <input value={url} onChange={e => setUrl(e.target.value)} className={`${inputCls} num`} spellCheck={false} />
        </label>
        <div className="mt-2 flex gap-2">
          {rx.state === 'ON' || rx.state === 'CONNECTING'
            ? <ToolButton size="sm" label="Disconnect" onClick={() => receiver.disconnect()} />
            : <ToolButton size="sm" icon={<Radio />} label="Connect" onClick={() => receiver.connect(url.trim())} />}
        </div>
        {rx.error && <p className="mt-1.5 text-[12px] text-bad">{rx.error}</p>}
      </Section>
      <Divider />
      <Section title="Broadcast check" right="advisory">
        {withSerial.length === 0 ? <p className="text-[13px] text-ink-3">No aircraft with a Remote ID serial.</p> : (
          <ul className="divide-y divide-line">
            {withSerial.map(a => {
              const b = ridBroadcast(a, d.sightings);
              return (
                <li key={a.id} className="flex items-start gap-2.5 py-2">
                  <span className={`mt-0.5 shrink-0 [&>svg]:w-4 [&>svg]:h-4 ${b.state === 'CONFIRMED' ? 'text-ok' : 'text-ink-3'}`} aria-hidden>{b.state === 'CONFIRMED' ? <CheckCircle2 /> : <CircleDashed />}</span>
                  <span className="min-w-0">
                    <span className="block text-[13px] text-ink">{a.name}: {b.state === 'CONFIRMED' ? 'broadcast confirmed' : b.state === 'NO_SERIAL' ? 'no serial declared' : 'not seen yet'}</span>
                    <span className="block text-[11px] text-ink-3 num break-all">{a.ridSerial || '—'}{b.seen ? ` · ${ago(b.seen.at, now)}${b.seen.sample ? ' · sample sighting' : ''}` : ''}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-ink-3">Hearing the serial shows the broadcast works. Not hearing it proves nothing on its own: the receiver may be out of range.</p>
      </Section>
    </>
  );
};

const RULES: { title: string; cite: string; body: string }[] = [
  { title: 'Remote pilot certificate', cite: '107.12', body: 'Flying for work needs a remote pilot certificate with a small UAS rating, or direct supervision by someone who holds one.' },
  { title: 'Recurrent training', cite: '107.65', body: 'Pass the knowledge test or the free online recurrent training within the previous 24 calendar months.' },
  { title: 'Registration', cite: 'Part 48', body: 'Register each aircraft (renewed every three years) and mark its registration number on the outside.' },
  { title: 'Remote ID', cite: 'Part 89', body: 'Fly a standard Remote ID aircraft, fit a broadcast module, or fly only inside an FAA-recognized identification area (FRIA).' },
  { title: 'More than one aircraft', cite: '107.35', body: 'One pilot flying more than one aircraft at a time needs a waiver. Every drone light show does.' },
  { title: 'Night', cite: '107.29', body: 'No waiver since April 2021: current training, and anti-collision lighting visible for 3 statute miles from sunset to sunrise.' },
  { title: 'Over people', cite: '107.39 · subpart D', body: 'Allowed only as the aircraft’s category (1 to 4) permits, with that category’s conditions.' },
  { title: 'Controlled airspace', cite: '107.41', body: 'Class B, C, D and surface E airspace need an authorization first, through LAANC or FAADroneZone.' },
  { title: 'Height', cite: '107.51', body: 'At or below 400 ft above ground, unless within 400 ft of a structure and no higher than 400 ft above its top.' },
  { title: 'Visual line of sight', cite: '107.31', body: 'The pilot or a visual observer keeps the aircraft in sight, unaided except by glasses or contact lenses.' },
  { title: 'Accidents', cite: '107.9', body: 'Report to the FAA within 10 days: serious injury, loss of consciousness, or over $500 of damage to property other than the aircraft.' },
  { title: 'Insurance', cite: 'not Part 107', body: 'No federal requirement for Part 107, but venues and clients ask for proof of liability cover.' },
];

const LINKS = [
  { label: 'FAADroneZone (registration, waivers, accident reports)', href: 'https://faadronezone-access.faa.gov/' },
  { label: 'B4UFLY (airspace at a site)', href: 'https://www.faa.gov/uas/getting_started/b4ufly' },
  { label: '14 CFR part 107 (eCFR)', href: 'https://www.ecfr.gov/current/title-14/chapter-I/subchapter-F/part-107' },
];

