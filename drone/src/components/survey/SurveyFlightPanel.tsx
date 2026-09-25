import React from 'react';
import { CircleCheck, CircleX, TriangleAlert, ShieldCheck } from 'lucide-react';
import { Section, Row, Toggle, Chip } from '../../dashboards/ui';
import { MODE_LABEL, modeName } from '../../link/mavlink';
import type { useSurveyFlight } from './useSurveyFlight';
import type { useAircraftLink } from '../../link/useAircraftLink';

/** The Aircraft tab: what must be true before a real survey flies, and what the aircraft is doing. */
export const SurveyFlightPanel: React.FC<{ flight: ReturnType<typeof useSurveyFlight>; link: ReturnType<typeof useAircraftLink> }> = ({ flight, link }) => {
  const t = link.telemetry;
  const photoSource = { NONE: 'none reported yet', FEEDBACK: 'autopilot (CAMERA_FEEDBACK)', TRIGGER: 'trigger pulses (CAMERA_TRIGGER)', CAMERA: 'camera (IMAGE_CAPTURED)' }[t.photoSource];
  const { upload } = flight;
  return (
    <div className="space-y-5">
      <Section title="Before take-off" right={flight.gateOk ? <Chip tone="ok">Ready</Chip> : <Chip tone="warn">Not yet</Chip>}>
        <ul className="space-y-1.5">
          {flight.checks.map(c => (
            <li key={c.id} className="flex items-start gap-2 text-[12.5px]">
              {c.ok ? <CircleCheck className="w-4 h-4 text-ok shrink-0 mt-px" /> : c.advisory ? <TriangleAlert className="w-4 h-4 text-warn shrink-0 mt-px" /> : <CircleX className="w-4 h-4 text-bad shrink-0 mt-px" />}
              <span className="flex-1 text-ink-2">{c.label}</span>
              <span className="num text-[11px] text-ink-3 text-right">{c.detail}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-ink-3">Amber items are advisories: the crew decides. Red items hold the upload.</p>
      </Section>

      <Section title="Geofence">
        <Toggle on={flight.useFence} onChange={flight.setUseFence} label="Keep the aircraft inside the site"
          description="Uploads the site plus a 30 m margin as an inclusion fence and switches it on. If the aircraft leaves it, the autopilot's fence action (normally return home) takes over." />
        {upload.state === 'READY' && flight.useFence && (
          <div className={`mt-2 flex items-center gap-1.5 text-[12px] ${upload.fence === 'ON' ? 'text-ok' : 'text-warn'}`}>
            <ShieldCheck className="w-3.5 h-3.5" />
            {upload.fence === 'ON' ? 'Fence on the aircraft and enabled' : upload.fence === 'UNCONFIRMED' ? 'Fence uploaded; the autopilot did not confirm enabling it (check FENCE_ENABLE / GF_ACTION)' : 'Fence upload failed: this autopilot may not take polygon fences'}
          </div>
        )}
      </Section>

      <Section title="Mission">
        <div className="space-y-1.5">
          <Row label="Items" value={flight.count} />
          <Row label="Autopilot" value={link.autopilot === 'UNKNOWN' ? 'Waiting for heartbeat' : link.autopilot === 'PX4' ? 'PX4' : 'ArduPilot'} />
          <Row label="Upload" value={upload.state === 'UPLOADING' ? `${link.missionUpload.sent} of ${link.missionUpload.total}` : upload.state === 'READY' ? (flight.uploaded ? 'On the aircraft' : 'Plan changed; upload again') : upload.state === 'FAILED' ? 'Failed' : 'Not yet'}
            tone={upload.state === 'FAILED' ? 'bad' : flight.uploaded ? 'ok' : 'neutral'} />
          <Row label="Mode" value={t.heartbeatMs ? MODE_LABEL[modeName(t)] : '—'} />
          <Row label="Item flying" value={t.heartbeatMs ? String(t.missionCurrent) : '—'} />
          <Row label="Photos from" value={photoSource} />
        </div>
        {upload.state === 'FAILED' && <p className="mt-2 text-[12px] text-bad">{upload.msg}</p>}
        {flight.start.state === 'FAILED' && (
          <div role="alert" className="mt-2 rounded-lg border border-bad/30 bg-bad/5 p-2.5 text-[12px] text-bad space-y-0.5">
            {flight.start.msg.map(m => <div key={m}>{m}</div>)}
          </div>
        )}
        {t.photoSource === 'NONE' && (
          <p className="mt-2 text-[11px] leading-relaxed text-ink-3">If the camera never reports photos (a plain trigger cable without feedback), photo positions are estimated from distance flown and marked as such in the export.</p>
        )}
      </Section>
    </div>
  );
};
