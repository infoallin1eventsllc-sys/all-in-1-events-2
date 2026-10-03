import React, { useEffect, useRef, useState } from 'react';
import { Segmented } from '../ui';
import type { AircraftStage, StageAir, StageCam } from '../../components/hero/stage';

/**
 * "The aircraft": the console's quadcopter on a photographer's set, rendered live.
 * The visitor turns it, lifts it into a hover and sends the gimbal camera through
 * its moves, and sees the camera hold the horizon while the airframe sways.
 * The 3D only starts once the section is near the screen.
 */
const FACTS: { term: string; detail: string }[] = [
  { term: 'Three-axis gimbal', detail: 'Pan, roll and tilt motors keep the picture level while the aircraft banks, look straight down for mapping, or turn the camera upright for portrait video.' },
  { term: 'Sensing all round', detail: 'Two large forward sensor eyes, a rearward pair and a downward pair with a distance sensor, for obstacle avoidance and precise landings.' },
  { term: 'Folding airframe', detail: 'Arms fold flat for the case; low-noise props with swept tips, outrunner motors and a tall landing leg under each front arm.' },
];

export const AircraftStudio: React.FC = () => {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<AircraftStage | null>(null);
  const [air, setAir] = useState<StageAir>('landed');
  const [cam, setCam] = useState<StageCam>('look');
  const [state, setState] = useState<'idle' | 'ready' | 'failed'>('idle');

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let st: AircraftStage | null = null, cancelled = false, visible = false;
    let ro: ResizeObserver | null = null;
    const near = new IntersectionObserver(async ([e]) => {
      if (!e.isIntersecting || st) return;
      near.disconnect();
      try {
        const { AircraftStage } = await import('../../components/hero/stage');
        if (cancelled) return;
        st = new AircraftStage(el, { reduced });
        stage.current = st;
        ro = new ResizeObserver(() => st?.resize()); ro.observe(el);
        st.resize(); setState('ready');
        if (visible) st.start(); else st.draw();
      } catch (err) { console.warn('Aircraft studio: WebGL unavailable', err); setState('failed'); }
    }, { rootMargin: '300px' });
    near.observe(el);
    // Run the render loop only while the set is on screen.
    const seen = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (!st) return; if (visible) st.start(); else st.stop(); });
    seen.observe(el);
    return () => { cancelled = true; near.disconnect(); seen.disconnect(); ro?.disconnect(); st?.dispose(); stage.current = null; };
  }, []);

  useEffect(() => { stage.current?.set(air, cam); }, [air, cam, state]);

  // Drag to turn the set (horizontal drags only on touch, so the page still scrolls).
  const drag = useRef<{ x: number; y: number; id: number } | null>(null);
  const onDown = (e: React.PointerEvent) => { drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId }; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d || d.id !== e.pointerId) return;
    stage.current?.orbit(e.clientX - d.x, e.pointerType === 'touch' ? 0 : e.clientY - d.y);
    d.x = e.clientX; d.y = e.clientY;
  };
  const onUp = () => { drag.current = null; };
  const onKey = (e: React.KeyboardEvent) => {
    const k: Record<string, [number, number]> = { ArrowLeft: [-24, 0], ArrowRight: [24, 0], ArrowUp: [0, -24], ArrowDown: [0, 24] };
    if (k[e.key]) { e.preventDefault(); stage.current?.orbit(...k[e.key]); }
  };

  return (
    <section aria-labelledby="ov-aircraft" className="bg-surface border border-line rounded-[var(--radius-card)] overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div ref={host} role="img" tabIndex={0} aria-label="The quadcopter in 3D. Drag, or use the arrow keys, to turn it."
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onKeyDown={onKey}
          className="studio-backdrop relative aspect-[4/3] sm:aspect-[16/10] lg:aspect-auto lg:min-h-[460px] cursor-grab active:cursor-grabbing outline-none focus-visible:ring-2 focus-visible:ring-accent">
          {state !== 'ready' && (
            <div className="absolute inset-0 grid place-items-center text-[13px] text-ink-3">{state === 'failed' ? 'The 3D view needs WebGL, which this browser has turned off.' : 'Preparing the aircraft…'}</div>
          )}
          <div className="pointer-events-none absolute left-4 bottom-3 text-[11px] text-ink-3">Rendered live · drag to turn</div>
        </div>
        <div className="p-6 lg:p-7 flex flex-col gap-5 border-t lg:border-t-0 lg:border-l border-line">
          <div>
            <h2 id="ov-aircraft" className="text-[22px] font-semibold tracking-[-0.01em] text-ink">The aircraft, up close</h2>
            <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">A folding camera quadcopter, modelled part by part. Lift it into a hover and watch the gimbal hold the camera level while the airframe sways.</p>
          </div>
          <div className="flex flex-col gap-3">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3 mb-1.5">Aircraft</div>
              <Segmented items={[{ id: 'landed', label: 'Landed' }, { id: 'hover', label: 'Hovering' }]} value={air} onChange={setAir} />
            </div>
            <div>
              <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3 mb-1.5">Camera</div>
              <Segmented items={[{ id: 'look', label: 'Look around' }, { id: 'down', label: 'Straight down' }, { id: 'portrait', label: 'Portrait' }]} value={cam} onChange={setCam} />
            </div>
          </div>
          <dl className="flex flex-col gap-3 mt-auto">
            {FACTS.map(f => (
              <div key={f.term}>
                <dt className="text-[13px] font-semibold text-ink">{f.term}</dt>
                <dd className="mt-0.5 text-[12.5px] leading-relaxed text-ink-2">{f.detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
};
