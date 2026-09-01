import React from 'react';

/**
 * The Meridian Interface logo.
 *
 * The artwork is Otis's own file, served from /brand/. An earlier version of
 * this component drew the mark with hand-written SVG paths — a rounded,
 * symmetric M that shipped in this repo's first commit and was mistaken for the
 * real logo for months. It was not his. It has been removed rather than kept
 * as a fallback, because a wrong logo that renders looks exactly like a right
 * one and nobody goes looking.
 *
 * The mark is a cropped window onto his transparent master, so it is his
 * artwork to the pixel. The wordmark beside it is live text, which is what lets
 * it be dark on a light header and light on a dark footer — his lockup file has
 * the wordmark in near-black and would disappear on the navy footer. Where the
 * background is guaranteed light, prefer the whole lockup file instead: see
 * BuiltBy.tsx.
 */

interface MeridianLogoProps {
  size?: number;
  className?: string;
  iconOnly?: boolean;
  lightText?: boolean;
  subtext?: string;
  singleLine?: boolean;
}

export const MeridianLogoMark: React.FC<{
  size?: number;
  className?: string;
  /** Accepted and ignored: there is one mark, and it reads on both grounds.
      Kept so existing call sites do not have to change. */
  lightMode?: boolean;
}> = ({ size = 36, className = '' }) => (
  <img
    src="/brand/meridian-mark.png"
    width={size}
    height={size}
    alt=""
    aria-hidden="true"
    decoding="async"
    className={`shrink-0 object-contain ${className}`}
    style={{ width: size, height: size }}
  />
);

export const MeridianLogo: React.FC<MeridianLogoProps> = ({
  size = 36,
  className = '',
  iconOnly = false,
  lightText = false,
  subtext = 'INTERFACE',
  singleLine = false,
}) => {
  const textColor = lightText ? 'text-white' : 'text-[#0f172a]';
  const subtextColor = lightText ? 'text-slate-300' : 'text-slate-600';

  return (
    <div className={`inline-flex items-center gap-3.5 ${className}`}>
      <span className="flex-shrink-0 flex items-center justify-center">
        <MeridianLogoMark size={size} />
      </span>

      {!iconOnly &&
        (singleLine ? (
          <span className="flex items-center gap-2">
            <span className={`font-display font-extrabold tracking-[0.2em] uppercase text-base md:text-lg ${textColor}`}>
              MERIDIAN
            </span>
            <span className={`font-body font-bold tracking-[0.24em] uppercase text-xs md:text-sm ${subtextColor}`}>
              {subtext}
            </span>
          </span>
        ) : (
          <span className="flex flex-col text-left justify-center">
            <span className={`font-display font-extrabold tracking-[0.2em] leading-none uppercase text-base md:text-lg ${textColor}`}>
              MERIDIAN
            </span>
            <span className={`font-body font-bold text-[10px] md:text-[11px] tracking-[0.28em] uppercase mt-1 leading-none ${subtextColor}`}>
              {subtext}
            </span>
          </span>
        ))}
    </div>
  );
};
