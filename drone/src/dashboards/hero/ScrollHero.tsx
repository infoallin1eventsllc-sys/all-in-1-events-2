import React, { useEffect, useRef } from 'react';
import { ArrowRight, PlayCircle } from 'lucide-react';
import { DroneHero } from './DroneHero';

/**
 * The Overview hero as a scroll-reveal: the stage pins under the app bar while
 * the visitor scrolls through it, and scroll drives the story.
 *
 *   load       the headline rises into place line by line
 *   0 – 0.3    the headline lifts away and the fleet starts to re-form
 *   0.3 – 0.85 three lines reveal in turn: the show, the survey, the patrol
 *   0.85 – 1   the close: one console, and the tour
 *
 * The drone scene takes its formation from the same progress, so the words
 * and the aircraft move together. The progress rail on the right says the
 * scroll is doing something. Reduced motion: no pin, the static headline over
 * a still frame of the fleet.
 */

const STAGES = [
  { eyebrow: 'Light show', accent: '#8b8bff', line: 'A sky full of light,', sub: 'conducted from front of house.' },
  { eyebrow: 'Site survey', accent: '#fb923c', line: 'The venue mapped', sub: 'before the first truck arrives.' },
  { eyebrow: 'Security patrol', accent: '#2dd4bf', line: 'Eyes on the grounds', sub: 'all night, in thermal.' },
];
const IN = [0.3, 0.49, 0.68], LEN = 0.19;         // where each stage starts, and how long it holds the screen
const CLOSE = 0.86;

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => { const u = clamp(x); return u * u * (3 - 2 * u); };

export const ScrollHero: React.FC<{ onTour: () => void; onExplore: () => void; look?: 'classic' | 'ember' }> = ({ onTour, onExplore, look = 'classic' }) => {
  const section = useRef<HTMLElement>(null);
  const stick = useRef<HTMLDivElement>(null);
  const intro = useRef<HTMLDivElement>(null);
  const stages = useRef<(HTMLDivElement | null)[]>([]);
  const close = useRef<HTMLDivElement>(null);
  const cue = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    const sec = section.current, st = stick.current;
    if (!sec || !st || reduced) return;
    const header = document.querySelector('header');
    let top = 0, raf = 0;

    const layout = () => {
      // Where the pinned app bar ends, not just its height: a host page can pin its own bar above it
      // (the Meridian portfolio's demo bar), which pushes the app bar's sticky top down.
      top = (header ? (parseFloat(getComputedStyle(header).top) || 0) + header.getBoundingClientRect().height : 0) + 12;
      st.style.top = `${top}px`;
      st.style.height = `${Math.max(480, window.innerHeight - top - 12)}px`;
      apply();
    };

    const show = (el: HTMLElement | null, a: number, y: number, blur: number, scale = 1) => {
      if (!el) return;
      el.style.opacity = String(a);
      el.style.transform = `translate3d(0, ${y}px, 0) scale(${scale})`;
      el.style.filter = blur > 0.05 ? `blur(${blur}px)` : 'none';
      el.style.visibility = a < 0.01 ? 'hidden' : 'visible';
      (el as HTMLElement & { inert: boolean }).inert = a < 0.5;
    };

    const apply = () => {
      raf = 0;
      const r = sec.getBoundingClientRect();
      const travel = Math.max(1, sec.offsetHeight - st.offsetHeight);
      const p = clamp((top - r.top) / travel);
      progress.current = p;

      // The headline lifts away.
      const out = ease((p - 0.06) / 0.22);
      show(intro.current, 1 - out, -70 * out, 10 * out, 1 - 0.05 * out);

      // Each stage rises in, holds, and lifts out.
      STAGES.forEach((_, i) => {
        const a = ease((p - IN[i]) / 0.07), b = ease((p - (IN[i] + LEN - 0.06)) / 0.06);
        const vis = a * (1 - b);
        show(stages.current[i], vis, 44 * (1 - a) - 44 * b, 8 * (1 - vis));
      });

      // The close, which stays with the stage as it scrolls away.
      const c = ease((p - CLOSE) / 0.08);
      show(close.current, c, 36 * (1 - c), 8 * (1 - c));

      if (cue.current) cue.current.style.opacity = String(1 - ease(p / 0.05));
      if (rail.current) rail.current.style.transform = `scaleY(${p})`;
    };

    const onScroll = () => { if (!raf) raf = requestAnimationFrame(apply); };
    layout();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', layout);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', layout); };
  }, [reduced]);

  const lines = ['Every drone job.', 'One console.'];

  return (
    <section ref={section} aria-label="All in 1 Drone Command" className={reduced ? 'relative' : 'relative h-[300vh] sm:h-[340vh]'}>
      <div ref={stick} className={`${reduced ? 'relative min-h-[620px] lg:min-h-[740px]' : 'sticky'} overflow-clip rounded-[18px] bg-[#05070c] flex items-center justify-center`}>
        <DroneHero progress={reduced ? undefined : progress} look={look} />
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(52%_46%_at_50%_44%,rgba(5,7,12,0.62)_0%,rgba(5,7,12,0)_100%)]" />

        {/* The headline, risen line by line on load. */}
        <div ref={intro} className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center gap-5 px-6 sm:px-10 will-change-transform">
          <h1 className="text-[40px] sm:text-[62px] lg:text-[78px] leading-[1.02] font-light tracking-[-0.028em] text-white text-balance">
            {lines.map((l, i) => (
              <span key={l} className="block overflow-clip pb-[0.1em] -mb-[0.1em]">
                <span className="hero-rise block" style={{ animationDelay: `${120 + i * 140}ms` }}>{l}</span>
              </span>
            ))}
          </h1>
          <p className="hero-fade text-[16px] sm:text-[18px] lg:text-[20px] leading-relaxed font-light text-white/70 max-w-[560px]" style={{ animationDelay: '520ms' }}>
            Light shows, site surveys, night patrols and aircraft health, flown from a browser on any device.
          </p>
          <div className="hero-fade mt-3 flex flex-col items-center gap-4" style={{ animationDelay: '680ms' }}>
            <button id="overview-tour" onClick={onTour} className="hero-cta inline-flex items-center gap-2 h-12 px-7 rounded-full text-white text-[15px] font-medium">
              <PlayCircle className="w-4.5 h-4.5" />Take the two-minute tour
            </button>
            <button onClick={onExplore} className="inline-flex items-center gap-1.5 text-[14px] text-white/60 hover:text-white transition-colors duration-500">
              Explore on your own<ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {!reduced && <>
          {/* The three jobs, one at a time. */}
          {STAGES.map((s, i) => (
            <div key={s.eyebrow} ref={el => { stages.current[i] = el; }} className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center px-6 will-change-transform" style={{ opacity: 0, visibility: 'hidden' }}>
              <span className="text-[12px] sm:text-[13px] font-medium uppercase tracking-[0.22em]" style={{ color: s.accent }}>{s.eyebrow}</span>
              <p className="mt-4 text-[36px] sm:text-[56px] lg:text-[68px] leading-[1.04] font-light tracking-[-0.025em] text-white text-balance">
                {s.line}<br /><span className="text-white/55">{s.sub}</span>
              </p>
            </div>
          ))}

          {/* The close. */}
          <div ref={close} className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center gap-6 px-6 will-change-transform" style={{ opacity: 0, visibility: 'hidden' }}>
            <p className="text-[36px] sm:text-[56px] lg:text-[68px] leading-[1.04] font-light tracking-[-0.025em] text-white text-balance">One console.<br /><span className="text-white/55">Every aircraft in the air.</span></p>
            <button onClick={onTour} className="hero-cta inline-flex items-center gap-2 h-12 px-7 rounded-full text-white text-[15px] font-medium">
              <PlayCircle className="w-4.5 h-4.5" />Take the two-minute tour
            </button>
          </div>

          {/* Scroll cue, and a rail that fills as the story plays. */}
          <div ref={cue} aria-hidden className="absolute bottom-12 inset-x-0 z-10 flex flex-col items-center gap-2 pointer-events-none">
            <span className="text-[11px] uppercase tracking-[0.24em] text-white/45">Scroll</span>
            <span className="hero-cue block w-px h-10 bg-gradient-to-b from-white/60 to-transparent" />
          </div>
          <div aria-hidden className="hidden sm:block absolute right-6 top-1/2 -translate-y-1/2 z-10 h-28 w-px bg-white/12 pointer-events-none">
            <div ref={rail} className="absolute inset-0 origin-top bg-white/70" style={{ transform: 'scaleY(0)' }} />
          </div>
        </>}

        <p className="absolute bottom-4 inset-x-0 z-10 text-center text-[12px] text-white/40 px-6 pointer-events-none">Working demo on simulated aircraft and sample data. Connect a real flight controller from the link menu and the same screens fly it.</p>
      </div>
    </section>
  );
};
