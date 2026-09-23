import React, { useEffect, useState } from 'react';
import { X, ArrowLeft, ArrowRight, Wand2, ExternalLink } from 'lucide-react';
import { useHealth } from '../diagnostics/useHealth';

/**
 * The guided tour: a small card that walks a visitor (a prospective client on
 * the Meridian Interface portfolio) through each screen, with "Show me" doing the
 * one action that makes that screen come alive. It never blocks the page: the
 * visitor can click around between steps.
 */

export type TourView = 'OVERVIEW' | 'LIGHT_SHOW_OPS' | 'SURVEY_OPS' | 'SURVEILLANCE_OPS' | 'HEALTH' | 'ANALYTICS' | 'RECORDS';

interface Step { view: TourView; title: string; body: string; action?: string; target?: string }

const STEPS: Step[] = [
  { view: 'OVERVIEW', title: 'A working console, not a mock-up', body: 'Everything here runs: a 100-aircraft show renderer, survey planning from real camera maths, a MAVLink link to real flight controllers. The aircraft are simulated so you can try it anywhere.' },
  { view: 'LIGHT_SHOW_OPS', title: 'Conduct a light show', body: 'Pre-flight gates (sync, wind, clock) must all pass before the fleet will arm. Arm it and start the show: eleven formations that breathe, turn, burst and spell out a name, with one-button abort.', action: 'Arm and start the show', target: 'ls-play' },
  { view: 'SURVEY_OPS', title: 'Survey the venue', body: 'Pick a map, a 3D model or an inspection; height, spacing and flight time follow from the camera. Watch the grounds develop from blueprint to photo as the aircraft flies its lines.', action: 'Fly the survey at 16×', target: 'sv-primary' },
  { view: 'SURVEILLANCE_OPS', title: 'Patrol overnight', body: 'Four aircraft on a patrol loop with live thermal video. Detections queue for the security team; night protocol switches every camera to thermal.', target: 'surveillance-dashboard' },
  { view: 'HEALTH', title: 'Know which part is failing', body: 'The motors that work hardest give away a chipped prop, a worn bearing or a twisted arm. Fly a test flight with a damaged propeller and watch it get caught.', action: 'Fly with a chipped prop', target: 'health-verdict' },
  { view: 'ANALYTICS', title: 'Run the business on it', body: 'Three months of sample history: flight hours by product, aircraft coming due for service, a battery that is wearing out, and every alert.' },
  { view: 'RECORDS', title: 'Keep the record', body: 'Every flight is recorded with its path, telemetry and each command given. Print it for an insurer or export it for an investigator.', target: 'flight-report' },
];

interface Props { open: boolean; onClose: () => void; view: string; go: (v: TourView) => void }

const clickId = (id: string, delay = 0) => setTimeout(() => (document.getElementById(id) as HTMLButtonElement | null)?.click(), delay);

export const DemoTour: React.FC<Props> = ({ open, onClose, view, go }) => {
  const health = useHealth();
  const [i, setI] = useState(0);
  const [done, setDone] = useState<Set<number>>(new Set());
  const step = STEPS[i];
  const last = i === STEPS.length;

  useEffect(() => { if (open) { setI(0); setDone(new Set()); } }, [open]);
  // Follow the step to its screen.
  useEffect(() => { if (open && step && view !== step.view) go(step.view); }, [open, i]); // eslint-disable-line react-hooks/exhaustive-deps
  // Highlight what the step talks about.
  useEffect(() => {
    if (!open || !step?.target) return;
    const t = setTimeout(() => {
      const el = document.getElementById(step.target!);
      el?.classList.add('tour-highlight');
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 500);
    return () => { clearTimeout(t); document.querySelectorAll('.tour-highlight').forEach(e => e.classList.remove('tour-highlight')); };
  }, [open, i, step?.target]);
  // Records: open the most recent flight so there is something to read.
  useEffect(() => {
    if (!open || step?.view !== 'RECORDS') return;
    const t = setTimeout(() => (document.querySelector('#records-list button[data-sample="true"]') as HTMLButtonElement | null)?.click(), 700);
    return () => clearTimeout(t);
  }, [open, step?.view]);

  if (!open) return null;

  const act = () => {
    if (!step) return;
    if (step.view === 'LIGHT_SHOW_OPS') { clickId('ls-arm'); clickId('ls-play', 400); }
    if (step.view === 'SURVEY_OPS') { clickId('sv-primary'); setTimeout(() => (Array.from(document.querySelectorAll('#survey-dashboard button')).find(b => b.textContent?.trim() === '16×') as HTMLButtonElement | undefined)?.click(), 300); }
    if (step.view === 'HEALTH') { health.sim.setFault('PROP'); health.sim.setSpeed(10); setTimeout(() => health.sim.takeoff(), 100); }
    setDone(s => new Set(s).add(i));
  };

  return (
    <div role="dialog" aria-label="Guided tour" id="demo-tour"
      className="fixed z-50 left-3 right-3 bottom-3 sm:left-auto sm:right-5 sm:bottom-5 sm:w-[380px] rounded-[16px] bg-ink text-surface shadow-[0_20px_60px_rgba(0,0,0,0.35)] p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium opacity-60">{last ? 'Tour complete' : `Step ${i + 1} of ${STEPS.length}`}</span>
        <button onClick={onClose} aria-label="Close tour" className="opacity-60 hover:opacity-100"><X className="w-4 h-4" /></button>
      </div>
      {!last ? (
        <>
          <div className="mt-1 text-[16px] font-semibold leading-snug">{step.title}</div>
          <p className="mt-1.5 text-[13px] leading-relaxed opacity-80">{step.body}</p>
          <div className="mt-2 flex gap-1" aria-hidden>{STEPS.map((_, k) => <span key={k} className={`h-1 flex-1 rounded-full ${k <= i ? 'bg-surface' : 'bg-surface/20'}`} />)}</div>
          <div className="mt-3 flex items-center gap-2">
            {i > 0 && <button onClick={() => setI(i - 1)} className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-surface/20 hover:bg-surface/10" aria-label="Previous step"><ArrowLeft className="w-4 h-4" /></button>}
            {step.action && (
              <button id="tour-action" onClick={act} disabled={done.has(i)} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-surface/25 text-[13px] font-medium hover:bg-surface/10 disabled:opacity-50">
                <Wand2 className="w-4 h-4" />{done.has(i) ? 'Running…' : step.action}
              </button>
            )}
            <button id="tour-next" onClick={() => setI(i + 1)} className="ml-auto inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-surface text-ink text-[13px] font-semibold hover:opacity-90">
              {i === STEPS.length - 1 ? 'Finish' : 'Next'}<ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="mt-1 text-[16px] font-semibold leading-snug">That's the tour</div>
          <p className="mt-1.5 text-[13px] leading-relaxed opacity-80">Keep exploring: every screen works. This product was designed and engineered by Meridian Interface: the design system, the 3D graphics and the flight software underneath.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a href="https://www.meridianinterface.com" target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-surface text-ink text-[13px] font-semibold hover:opacity-90">Start a project<ExternalLink className="w-3.5 h-3.5" /></a>
            <button onClick={() => { setI(0); go('OVERVIEW'); }} className="h-9 px-3 rounded-lg border border-surface/25 text-[13px] font-medium hover:bg-surface/10">Start over</button>
            <button onClick={onClose} className="h-9 px-3 text-[13px] opacity-70 hover:opacity-100">Close</button>
          </div>
        </>
      )}
    </div>
  );
};
