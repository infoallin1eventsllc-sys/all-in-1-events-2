import React, { useState } from 'react';
import { Sparkles, ScanLine, Eye, HeartPulse, BarChart3, Archive, Radio, Smartphone, ShieldCheck, Cpu, ArrowRight, Gamepad2 } from 'lucide-react';
import { MERIDIAN_BOOK_URL } from './MeridianCredit';
import { ScrollHero } from './hero/ScrollHero';
import { BRAND } from '../brand';

/**
 * Overview: the front door of the demo.
 *
 * A visitor lands here from the Meridian Interface portfolio. In one screen it
 * has to say what this is, show that it is alive (the hero is the real show
 * renderer flying 100 aircraft, not a picture), and hand them a guided tour.
 */

type Target = 'LIGHT_SHOW_OPS' | 'SURVEY_OPS' | 'SURVEILLANCE_OPS' | 'HEALTH' | 'CONTROL' | 'ANALYTICS' | 'RECORDS' | 'PLATFORM';

interface Props { onOpen: (t: Target) => void; onTour: () => void }

const BASE = import.meta.env.BASE_URL;

const PRODUCTS: { id: Target; icon: React.ReactNode; name: string; line: string; facts: string[]; img: string; accent: string }[] = [
  { id: 'LIGHT_SHOW_OPS', icon: <Sparkles />, name: 'Light shows', line: 'Conduct a show of up to 500 aircraft from the front of house, with the pre-flight checks that hold the launch.', facts: ['Eleven living formations: phoenix, lotus, fireworks, wedding rings, a countdown, any name in lights', 'Fleet health for 100, 250 or 500 aircraft on one screen', 'One-button abort: lights out, controlled descent'], img: 'show', accent: '#5b5bd6' },
  { id: 'SURVEY_OPS', icon: <ScanLine />, name: 'Site survey', line: 'Map a venue before the build: plan from the camera maths, watch the site develop, re-fly the weak spots.', facts: ['Orthomosaic, 3D model or inspection orbit', 'Coverage checked in flight, not back at the office', 'Mission upload and a processing package'], img: 'survey', accent: '#c2410c' },
  { id: 'SURVEILLANCE_OPS', icon: <Eye />, name: 'Security patrol', line: 'Overnight patrols with thermal video from four aircraft, detections queued for the security team.', facts: ['Night protocol switches every camera to thermal', 'Gimbal, zoom, spotlight on the real aircraft', 'Patrol route uploaded as a mission'], img: 'patrol', accent: '#0d9488' },
];

const INSIDE: { id: Target; icon: React.ReactNode; name: string; line: string; img: string }[] = [
  { id: 'HEALTH', icon: <HeartPulse />, name: 'Aircraft health', line: 'Which part is failing, for one aircraft or the whole fleet: a chipped prop, a worn motor, a twisted arm.', img: 'health' },
  { id: 'CONTROL', icon: <Gamepad2 />, name: 'Control', line: 'Fly one aircraft, or command up to 500 at once: take off, hold, go to, return home, each command acknowledged.', img: 'control' },
  { id: 'ANALYTICS', icon: <BarChart3 />, name: 'Analytics', line: 'Flight hours by product, which aircraft are due for service, and what went wrong.', img: 'analytics' },
  { id: 'RECORDS', icon: <Archive />, name: 'Flight records', line: 'Every flight with its path and every command given: the record for an insurer or a venue.', img: 'records' },
];

const PROOF: { icon: React.ReactNode; title: string; body: string }[] = [
  { icon: <Radio />, title: 'Flies real aircraft', body: 'Speaks MAVLink to ArduPilot and PX4 flight controllers over Bluetooth, a USB radio or the network. The protocol is checked byte for byte against the reference implementation.' },
  { icon: <Smartphone />, title: 'Phone, tablet or laptop', body: 'Installs to the home screen and reopens offline at a venue with no signal. iPhone and iPad connect through a small bridge on the aircraft.' },
  { icon: <ShieldCheck />, title: 'Safety is built in', body: 'Pre-flight gates hold the arm button, a fault in the air reaches whatever screen is open, and every command is on the record.' },
  { icon: <Cpu />, title: 'Tested like flight software', body: 'Twelve automated test suites and end-to-end runs against a stand-in autopilot through the real bridge, on every change.' },
];

/** The hero: the actual show renderer, cycling formations. */
const Shot: React.FC<{ name: string; alt: string }> = ({ name, alt }) => {
  const [ok, setOk] = useState(true);
  return ok
    ? <img src={`${BASE}demo/${name}.jpg`} alt={alt} loading="lazy" onError={() => setOk(false)} className="w-full h-full object-cover object-top" />
    : <div className="w-full h-full bg-gradient-to-br from-surface-2 to-line" aria-hidden />;
};

export const OverviewView: React.FC<Props> = ({ onOpen, onTour }) => (
  <div id="overview" className="flex flex-col gap-10 pb-4">
    {/* Hero: pinned while the visitor scrolls; the headline lifts away and the three jobs reveal in turn. */}
    <ScrollHero onTour={onTour} onExplore={() => onOpen('LIGHT_SHOW_OPS')} />

    <section aria-labelledby="ov-products">
      <div className="flex items-end justify-between gap-4 mb-4">
        <div>
          <h2 id="ov-products" className="text-[22px] font-semibold tracking-[-0.01em] text-ink">Three jobs, one aircraft platform</h2>
          <p className="mt-1 text-[14px] text-ink-2">The same console, aircraft and crew cover the show, the survey and the security.</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PRODUCTS.map(p => (
          <button key={p.id} onClick={() => onOpen(p.id)} className="group text-left bg-surface border border-line rounded-[var(--radius-card)] overflow-hidden hover:border-line-2 hover:shadow-[0_8px_30px_rgba(16,24,40,0.08)] transition-all">
            <div className="aspect-[16/10] overflow-hidden bg-imagery border-b border-line"><Shot name={p.img} alt={`${p.name} screen`} /></div>
            <div className="p-4">
              <div className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg [&>svg]:w-4 [&>svg]:h-4 text-white" style={{ background: p.accent }}>{p.icon}</span>
                {p.name}
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{p.line}</p>
              <ul className="mt-3 space-y-1">
                {p.facts.map(f => <li key={f} className="flex gap-2 text-[12px] text-ink-2"><span className="mt-[7px] w-1 h-1 rounded-full bg-ink-3 shrink-0" />{f}</li>)}
              </ul>
              <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-ink group-hover:gap-2 transition-all">Open {p.name.toLowerCase()}<ArrowRight className="w-3.5 h-3.5" /></span>
            </div>
          </button>
        ))}
      </div>
    </section>

    {/* Inside */}
    <section aria-labelledby="ov-inside">
      <h2 id="ov-inside" className="text-[22px] font-semibold tracking-[-0.01em] text-ink">Behind every flight</h2>
      <p className="mt-1 mb-4 text-[14px] text-ink-2">What keeps the fleet flying and the business honest.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {INSIDE.map(p => (
          <button key={p.id} onClick={() => onOpen(p.id)} className="group text-left bg-surface border border-line rounded-[var(--radius-card)] overflow-hidden hover:border-line-2 transition-colors">
            <div className="aspect-[16/9] overflow-hidden bg-surface-2 border-b border-line"><Shot name={p.img} alt={`${p.name} screen`} /></div>
            <div className="p-4">
              <div className="flex items-center gap-2 text-[15px] font-semibold text-ink"><span className="text-ink-3 [&>svg]:w-4 [&>svg]:h-4">{p.icon}</span>{p.name}</div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{p.line}</p>
            </div>
          </button>
        ))}
      </div>
    </section>

    {/* Proof */}
    <section aria-labelledby="ov-proof" className="bg-surface border border-line rounded-[var(--radius-card)] p-6 lg:p-8">
      <h2 id="ov-proof" className="text-[22px] font-semibold tracking-[-0.01em] text-ink">Built to fly real aircraft, not just to demo</h2>
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {PROOF.map(p => (
          <div key={p.title}>
            <div className="text-accent [&>svg]:w-5 [&>svg]:h-5">{p.icon}</div>
            <div className="mt-2 text-[14px] font-semibold text-ink">{p.title}</div>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{p.body}</p>
          </div>
        ))}
      </div>
      <button onClick={() => onOpen('PLATFORM')} className="mt-6 inline-flex items-center gap-1 text-[13px] font-medium text-ink hover:gap-2 transition-all">How it works, with the engineering detail<ArrowRight className="w-3.5 h-3.5" /></button>
    </section>

    {/* Credit */}
    <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-[var(--radius-card)] bg-ink text-surface px-6 py-5">
      <div>
        <div className="text-[12px] opacity-60">Case study</div>
        <div className="text-[16px] font-semibold">{BRAND.credit}</div>
        <div className="text-[13px] opacity-70">Product design, a design system, 3D graphics, and the flight software underneath.</div>
      </div>
      <a href={MERIDIAN_BOOK_URL} target="_blank" rel="noopener" className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-surface text-ink text-[13px] font-semibold hover:opacity-90 shrink-0">
        Book an appointment with Meridian<ArrowRight className="w-4 h-4" />
      </a>
    </section>
  </div>
);
