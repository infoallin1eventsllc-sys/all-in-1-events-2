import React from 'react';
import {
  Sparkles, ScanLine, Eye, Users, Radio, Route, Brain, LifeBuoy, Lock, Database, FlaskConical, Boxes,
  ChevronRight, FileText, Video, Layers, Radar, Scale, Usb, Cpu,
} from 'lucide-react';
import { Headline, Card, Section, Divider, Chip, Dot, ToolButton } from './ui';

/**
 * "How it works" — the client-facing explanation of the platform.
 *
 * The engineering views behind this page are written for engineers (nine
 * architecture layers, protocol specs, code). A venue client needs the same
 * facts in their own language, so each pillar is stated plainly first and the
 * real technical term is kept underneath rather than thrown away.
 */

interface Props {
  /** Opens one of the engineering views (the original deep tooling). */
  onOpenEngineering: (tab: 'RADAR' | 'DRONE_OPERATOR' | 'LIGHT_SHOW' | 'ARCHITECTURE' | 'TABLE') => void;
  /** Opens one of the engineering lab modals. */
  onOpenLab: (lab: 'SECURITY' | 'DATABASE' | 'SITL' | 'BENCHMARK' | 'RADIO' | 'WAIVER') => void;
  /** Jumps to a product dashboard. */
  onOpenVertical: (v: 'LIGHT_SHOW_OPS' | 'SURVEY_OPS' | 'SURVEILLANCE_OPS') => void;
}

const PRODUCTS = [
  { id: 'LIGHT_SHOW_OPS' as const, icon: <Sparkles />, name: 'Light show', line: 'Hundreds of aircraft flying one choreographed piece over your venue, to the second.', detail: 'Formations, a show timeline, and a launch-to-landing safety checklist.' },
  { id: 'SURVEY_OPS' as const, icon: <ScanLine />, name: 'Site survey', line: 'A measurable map and 3D model of your venue, flown in under half an hour.', detail: 'Plan the layout before load-in, measure for permits and insurers, inspect a stage without a lift.' },
  { id: 'SURVEILLANCE_OPS' as const, icon: <Eye className="w-5 h-5" />, name: 'Surveillance', line: 'A patrol that watches the perimeter all night and flags what moves.', detail: 'Live camera, thermal after dark, and an automatic route around the site.' },
];

/**
 * The nine architecture layers, translated. `technical` keeps the real term so an
 * engineer reading over the client's shoulder still recognises it.
 */
const PILLARS = [
  { icon: <Users />, title: 'One operator runs the whole fleet', plain: 'Work is handed out to aircraft automatically, so a single person can run hundreds instead of one each.', technical: 'Actor-model coordinator with H3 spatial partitioning · layer 01' },
  { icon: <Radio />, title: 'The radio link has no single point of failure', plain: 'If an aircraft loses the main link it relays through the others and keeps flying the plan.', technical: 'Cellular/RF primary with 802.11s peer mesh fallback · layer 02' },
  { icon: <Route />, title: 'Two aircraft cannot occupy the same space', plain: 'Each one reserves its own pocket of sky for a slice of time; overlapping paths are refused before anything takes off.', technical: '4D corridor deconfliction and ORCA avoidance at 50 Hz · layer 03' },
  { icon: <Brain />, title: 'Every aircraft can fly itself', plain: 'Lose contact and it keeps making safe decisions on its own rather than dropping out of the sky.', technical: 'Edge sense-plan-act loops with autonomous flight authority · layer 04' },
  { icon: <LifeBuoy />, title: 'Every failure has a rehearsed answer', plain: 'Low battery, lost link, failed motor — each one has a defined response, and the rest of the fleet covers the gap.', technical: 'Deterministic failsafe state machines with task handoff · layer 05' },
  { icon: <Lock />, title: 'Nobody else can command your aircraft', plain: 'Commands are encrypted and signed, so a stranger with a radio cannot take one over or replay an old order.', technical: 'DTLS 1.3, mutual certificates, anti-replay window · layer 07' },
  { icon: <Database />, title: 'Every second of every flight is recorded', plain: 'Where each aircraft was, what it saw and what it was told — the record for your insurer or an investigation.', technical: 'Flight recorder on the console, exportable as CSV or a printed report; time-series tier at 10,000+ writes/sec · layer 08' },
  { icon: <FlaskConical />, title: 'We fly it in simulation first', plain: 'The entire show or patrol is rehearsed in a physics simulator, wind included, before a real aircraft leaves the ground.', technical: 'Gazebo + PX4 software-in-the-loop digital twin · layer 09' },
  { icon: <Boxes />, title: 'Built on proven parts', plain: 'Flight controllers, protocols and ground software the industry already trusts — not a stack invented for this project.', technical: 'PX4/ArduPilot, ROS 2, Eclipse Zenoh · layer 06' },
];

const SAFETY = [
  { title: 'Certified pilots', body: 'Every flight is run by an FAA Part 107 certificated remote pilot.' },
  { title: 'Approved airspace', body: 'We file the authorisations for your venue before the date, including the waivers a show over people needs.' },
  { title: 'A boundary the aircraft enforce', body: 'A geofence is loaded into each aircraft. It is refused, not merely discouraged.' },
  { title: 'One button stops everything', body: 'The operator can abort the whole fleet at once: lights out and a controlled descent.' },
  { title: 'Weather limits are hard limits', body: 'Wind above the launch limit stops the show. The system will not arm through it.' },
  { title: 'Insured', body: 'Aviation liability cover for the event, with your venue named.' },
];

const ENGINEERING_VIEWS = [
  { id: 'RADAR' as const, icon: <Radar />, label: 'Airspace radar', body: 'Fleet-wide tactical picture, 100–500 aircraft' },
  { id: 'DRONE_OPERATOR' as const, icon: <Video />, label: 'Pilot cockpit', body: 'Single-aircraft view with video and push-to-talk' },
  { id: 'LIGHT_SHOW' as const, icon: <Sparkles />, label: '3D show studio', body: 'Choreography workspace and formation engine' },
  { id: 'ARCHITECTURE' as const, icon: <FileText />, label: 'Architecture spec', body: 'The nine layers in full, with code and trade-offs' },
  { id: 'TABLE' as const, icon: <Layers />, label: 'Telemetry grid', body: 'Every aircraft, every field, as a table' },
];

const LABS = [
  { id: 'SECURITY' as const, icon: <Lock />, label: 'Encryption lab' },
  { id: 'DATABASE' as const, icon: <Database />, label: 'Storage pipeline' },
  { id: 'SITL' as const, icon: <Cpu />, label: 'Simulation twin' },
  { id: 'BENCHMARK' as const, icon: <FlaskConical />, label: 'Protocol benchmarks' },
  { id: 'RADIO' as const, icon: <Usb />, label: 'Radio ingest' },
  { id: 'WAIVER' as const, icon: <Scale />, label: 'FAA waiver packet' },
];

export const PlatformView: React.FC<Props> = ({ onOpenEngineering, onOpenLab, onOpenVertical }) => (
  <div id="platform-view" className="space-y-6">
    <Headline
      title="How it works"
      context="One aircraft platform, three products. Written for the people buying it — the engineering detail is at the bottom."
      stats={[
        { label: 'Aircraft per show', value: '500+' },
        { label: 'Position accuracy', value: '±2 cm' },
        { label: 'Minimum separation', value: '2.5 m' },
        { label: 'Operators needed', value: '1' },
      ]}
    />

    {/* What you can book */}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {PRODUCTS.map(p => (
        <Card key={p.id} className="flex flex-col">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-lg bg-accent-soft text-accent flex items-center justify-center [&>svg]:w-5 [&>svg]:h-5">{p.icon}</span>
            <h3 className="text-[15px] font-semibold text-ink">{p.name}</h3>
          </div>
          <p className="mt-3 text-[14px] leading-relaxed text-ink">{p.line}</p>
          <p className="mt-1.5 text-[13px] text-ink-2">{p.detail}</p>
          <button onClick={() => onOpenVertical(p.id)} className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline self-start">
            Open the {p.name.toLowerCase()} dashboard <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </Card>
      ))}
    </div>

    {/* The platform, in plain language */}
    <Card>
      <Section title="What the system does for you" right="the nine engineering layers, in plain language">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-5">
          {PILLARS.map(p => (
            <div key={p.title} className="flex gap-3">
              <span className="mt-0.5 shrink-0 text-ink-3 [&>svg]:w-[18px] [&>svg]:h-[18px]">{p.icon}</span>
              <div className="min-w-0">
                <h4 className="text-[14px] font-semibold text-ink leading-snug">{p.title}</h4>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{p.plain}</p>
                <p className="mt-1 text-[11px] text-ink-3">{p.technical}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </Card>

    {/* Safety */}
    <Card>
      <Section title="Safety and compliance" right={<Chip tone="ok">what we hand your venue</Chip>}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-4">
          {SAFETY.map(s => (
            <div key={s.title} className="flex gap-2.5">
              <Dot tone="ok" className="mt-[7px]" />
              <div>
                <h4 className="text-[14px] font-medium text-ink">{s.title}</h4>
                <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </Card>

    {/* Engineering, one click further in */}
    <Card>
      <Section title="Engineering detail" right="for engineers and technical reviewers">
        <p className="text-[13px] text-ink-2 mb-3 max-w-[70ch]">
          The original tooling: the full architecture specification, the fleet-scale radar, the pilot cockpit, the
          choreography studio and the protocol labs. Dense on purpose — everything above is the summary of what is in here.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
          {ENGINEERING_VIEWS.map(v => (
            <button key={v.id} onClick={() => onOpenEngineering(v.id)}
              className="flex items-start gap-3 rounded-lg border border-line bg-surface hover:bg-surface-2 hover:border-line-2 px-3 py-2.5 text-left transition-colors">
              <span className="mt-0.5 text-ink-3 [&>svg]:w-4 [&>svg]:h-4">{v.icon}</span>
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-ink">{v.label}</span>
                <span className="block text-[11px] text-ink-3">{v.body}</span>
              </span>
            </button>
          ))}
        </div>
        <Divider className="my-4" />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-ink-3 mr-1">Labs</span>
          {LABS.map(l => <ToolButton key={l.id} size="sm" icon={l.icon} label={l.label} onClick={() => onOpenLab(l.id)} />)}
        </div>
      </Section>
    </Card>

    <p className="text-[11px] text-ink-3 text-center pb-2">
      Figures describe the platform as designed. The dashboards run on simulated data until an aircraft is linked.
    </p>
  </div>
);
