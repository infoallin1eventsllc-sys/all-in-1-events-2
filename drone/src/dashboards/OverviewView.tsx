import React, { useState } from 'react';
import { Sparkles, ScanLine, Eye, HeartPulse, BarChart3, Archive, Radio, Smartphone, ShieldCheck, Cpu, ArrowRight, PlayCircle } from 'lucide-react';
import { DroneHero } from './hero/DroneHero';

/**
 * Overview: the front door of the demo.
 *
 * A visitor lands here from the Meridian Interface portfolio. In one screen it
 * has to say what this is, show that it is alive (the hero is the real show
 * renderer flying 100 aircraft, not a picture), and hand them a guided tour.
 */

type Target = 'LIGHT_SHOW_OPS' | 'SURVEY_OPS' | 'SURVEILLANCE_OPS' | 'HEALTH' | 'ANALYTICS' | 'RECORDS' | 'PLATFORM';

interface Props { onOpen: (t: Target) => void; onTour: () => void }

const BASE = import.meta.env.BASE_URL;

const PRODUCTS: { id: Target; icon: React.ReactNode; name: string; line: string; facts: string[]; img: string; accent: string }[] = [
  { id: 'LIGHT_SHOW_OPS', icon: <Sparkles />, name: 'Light shows', line: 'Conduct a 100-aircraft show from the front of house, with the pre-flight checks that hold the launch.', facts: ['Six choreographed formations', 'One-button abort: lights out, controlled descent', 'Export to the show-control stack'], img: 'show', accent: '#5b5bd6' },
  { id: 'SURVEY_OPS', icon: <ScanLine />, name: 'Site survey', line: 'Map a venue before the build: plan from the camera maths, watch the site develop, re-fly the weak spots.', facts: ['Orthomosaic, 3D model or inspection orbit', 'Coverage checked in flight, not back at the office', 'Mission upload and a processing package'], img: 'survey', accent: '#c2410c' },
  { id: 'SURVEILLANCE_OPS', icon: <Eye />, name: 'Security patrol', line: 'Overnight patrols with thermal video from four aircraft, detections queued for the security team.', facts: ['Night protocol switches every camera to thermal', 'Gimbal, zoom, spotlight on the real aircraft', 'Patrol route uploaded as a mission'], img: 'patrol', accent: '#0d9488' },
];

const INSIDE: { id: Target; icon: React.ReactNode; name: string; line: string; img: string }[] = [
  { id: 'HEALTH', icon: <HeartPulse />, name: 'Aircraft health', line: 'Which part is failing, in flight and after landing: a chipped prop, a worn motor, a twisted arm.', img: 'health' },
  { id: 'ANALYTICS', icon: <BarChart3 />, name: 'Analytics', line: 'Flight hours by product, which aircraft are due for service, and what went wrong.', img: 'analytics' },
  { id: 'RECORDS', icon: <Archive />, name: 'Flight records', line: 'Every flight with its path and every command given: the record for an insurer or a venue.', img: 'records' },
];

const PROOF: { icon: React.ReactNode; title: string; body: string }[] = [
  { icon: <Radio />, title: 'Flies real aircraft', body: 'Speaks MAVLink to ArduPilot and PX4 flight controllers over Bluetooth, a USB radio or the network. The protocol is checked byte for byte against the reference implementation.' },
  { icon: <Smartphone />, title: 'Phone, tablet or laptop', body: 'Installs to the home screen and reopens offline at a venue with no signal. iPhone and iPad connect through a small bridge on the aircraft.' },
  { icon: <ShieldCheck />, title: 'Safety is built in', body: 'Pre-flight gates hold the arm button, a fault in the air reaches whatever screen is open, and every command is on the record.' },
  { icon: <Cpu />, title: 'Tested like flight software', body: 'Seven automated test suites and end-to-end runs against a stand-in autopilot through the real bridge, on every change.' },
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
    {/* Hero: a fleet in a dark sky that re-forms as the page scrolls; the copy is short and stays out of its way. */}
    <section className="relative overflow-hidden rounded-[18px] bg-[#05070c] min-h-[620px] lg:min-h-[740px] flex items-center justify-center">
      <DroneHero />
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(52%_46%_at_50%_44%,rgba(5,7,12,0.62)_0%,rgba(5,7,12,0)_100%)]" />
      <div className="relative z-10 flex flex-col items-center text-center gap-5 px-6 sm:px-10 py-16 max-w-[820px] pointer-events-none">
        <h1 className="text-[40px] sm:text-[62px] lg:text-[78px] leading-[1.02] font-light tracking-[-0.028em] text-white text-balance">
          Every drone job.<br />One console.
        </h1>
        <p className="text-[16px] sm:text-[18px] lg:text-[20px] leading-relaxed font-light text-white/70 max-w-[560px]">
          Light shows, site surveys, night patrols and aircraft health, flown from a browser on any device.
        </p>
        <div className="mt-3 flex flex-col items-center gap-4 pointer-events-auto">
          <button id="overview-tour" onClick={onTour} className="hero-cta inline-flex items-center gap-2 h-12 px-7 rounded-full text-white text-[15px] font-medium">
            <PlayCircle className="w-4.5 h-4.5" />Take the two-minute tour
          </button>
          <button onClick={() => onOpen('LIGHT_SHOW_OPS')} className="inline-flex items-center gap-1.5 text-[14px] text-white/60 hover:text-white transition-colors duration-500">
            Explore on your own<ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      <p className="absolute bottom-4 inset-x-0 text-center text-[12px] text-white/40 px-6 pointer-events-none">Working demo on simulated aircraft and sample data. Connect a real flight controller from the link menu and the same screens fly it.</p>
    </section>

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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
        <div className="text-[16px] font-semibold">Designed and engineered by Meridian Interface for All in 1 Events</div>
        <div className="text-[13px] opacity-70">Product design, a design system, 3D graphics, and the flight software underneath.</div>
      </div>
      <a href="https://www.meridianinterface.com" target="_blank" rel="noopener" className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-surface text-ink text-[13px] font-semibold hover:opacity-90 shrink-0">
        Start a project with Meridian<ArrowRight className="w-4 h-4" />
      </a>
    </section>
  </div>
);
