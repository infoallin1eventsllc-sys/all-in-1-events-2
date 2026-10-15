import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

/* All in 1 Events tokens — see .claude/skills/meridian-stack/references/design-tokens.md.
   Never invent a hex here; these are the shipped values. */
const LOWEST = '#0c0e12';
const SURFACE = '#111317';
const ORCHID = '#ecb2ff';
const CYAN = '#00eefc';
const ON_SURFACE = '#e2e2e8';
const OUTLINE = '#9d8ba0';

/* cinematic-web: grade, grain, depth, choreography. Grain is an inline SVG so the
   render stays self-contained — no asset fetch, no network at render time. */
const GRAIN =
  `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'>` +
  `<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3'/>` +
  `<feColorMatrix type='saturate' values='0'/></filter>` +
  `<rect width='200' height='200' filter='url(%23n)' opacity='.55'/></svg>")`;

type Props = { line1: string; line2: string; tagline: string };

export const BrandCard: React.FC<Props> = ({ line1, line2, tagline }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // One slow push across the whole shot — the move that reads expensive.
  const push = interpolate(frame, [0, durationInFrames], [1, 1.045]);

  const rise = (delay: number) =>
    spring({ frame: frame - delay, fps, config: { damping: 200, stiffness: 68 } });

  const a = rise(0);
  const b = rise(9);
  const rule = rise(22);
  const tag = rise(34);

  // Grain shifts on a slow cycle so it reads as film, not a static overlay.
  const g = Math.floor(frame / 3) % 8;

  return (
    <AbsoluteFill style={{ backgroundColor: LOWEST }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(120% 90% at 50% 42%, ${SURFACE} 0%, ${LOWEST} 72%)`,
          transform: `scale(${push})`,
        }}
      />

      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems: 'center',
          transform: `scale(${push})`,
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        }}
      >
        <div
          style={{
            fontSize: 300,
            fontWeight: 800,
            letterSpacing: '-0.035em',
            lineHeight: 1,
            color: ON_SURFACE,
            opacity: a,
            transform: `translateY(${interpolate(a, [0, 1], [70, 0])}px)`,
          }}
        >
          {line1}
        </div>

        <div
          style={{
            fontSize: 300,
            fontWeight: 800,
            letterSpacing: '-0.035em',
            lineHeight: 1,
            color: ORCHID,
            opacity: b,
            transform: `translateY(${interpolate(b, [0, 1], [70, 0])}px)`,
          }}
        >
          {line2}
        </div>

        {/* one accent doing the work — awesome-design */}
        <div
          style={{
            width: interpolate(rule, [0, 1], [0, 1240]),
            height: 9,
            marginTop: 56,
            background: `linear-gradient(90deg, ${ORCHID}, ${CYAN})`,
            boxShadow: `0 0 60px ${ORCHID}55`,
            opacity: rule,
          }}
        />

        <div
          style={{
            marginTop: 64,
            fontSize: 64,
            fontWeight: 600,
            letterSpacing: '0.30em',
            textTransform: 'uppercase',
            color: OUTLINE,
            opacity: tag * 0.92,
            transform: `translateY(${interpolate(tag, [0, 1], [26, 0])}px)`,
          }}
        >
          {tagline}
        </div>
      </AbsoluteFill>

      {/* depth */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(128% 94% at 50% 50%, transparent 55%, rgba(0,0,0,0.78) 100%)`,
        }}
      />
      {/* grain */}
      <AbsoluteFill
        style={{
          backgroundImage: GRAIN,
          backgroundSize: '200px 200px',
          backgroundPosition: `${(g * 37) % 200}px ${(g * 91) % 200}px`,
          opacity: 0.05,
          mixBlendMode: 'overlay',
        }}
      />
    </AbsoluteFill>
  );
};
