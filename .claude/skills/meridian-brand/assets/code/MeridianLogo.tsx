import React, { useId } from 'react';

interface MeridianLogoProps {
  size?: number;
  className?: string;
  iconOnly?: boolean;
  lightText?: boolean;
  subtext?: string;
  singleLine?: boolean;
}

export const MeridianLogoMark: React.FC<{ size?: number; className?: string; color?: string; lightMode?: boolean }> = ({
  size = 36,
  className = "",
  color,
  lightMode = false
}) => {
  const rawId = useId ? useId().replace(/[^a-zA-Z0-9]/g, '') : 'm_logo';
  const gradLeftFold = `m_grad_l_fold_${rawId}`;
  const gradLeftStem = `m_grad_l_stem_${rawId}`;
  const gradRightFold = `m_grad_r_fold_${rawId}`;
  const gradRightStem = `m_grad_r_stem_${rawId}`;
  const gradNeedle = `m_grad_needle_${rawId}`;
  const dropShadowId = `m_shadow_${rawId}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 transition-all duration-300 ${className}`}
      aria-label="Meridian Interface Logo"
    >
      <defs>
        {/* Drop shadow filter for overlapping ribbon depth */}
        <filter id={dropShadowId} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#0f172a" floodOpacity={lightMode ? "0.2" : "0.4"} />
        </filter>

        {/* Left Outer Leg Gradient */}
        <linearGradient id={gradLeftStem} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={lightMode ? "#f8fafc" : "#64748b"} />
          <stop offset="50%" stopColor={lightMode ? "#cbd5e1" : "#475569"} />
          <stop offset="100%" stopColor={lightMode ? "#94a3b8" : "#334155"} />
        </linearGradient>

        {/* Left Inner Folded Arch Ribbon Gradient */}
        <linearGradient id={gradLeftFold} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={lightMode ? "#ffffff" : "#718096"} />
          <stop offset="40%" stopColor={lightMode ? "#e2e8f0" : "#4a5568"} />
          <stop offset="100%" stopColor={lightMode ? "#94a3b8" : "#2d3748"} />
        </linearGradient>

        {/* Right Outer Leg Gradient */}
        <linearGradient id={gradRightStem} x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={lightMode ? "#e2e8f0" : "#475569"} />
          <stop offset="50%" stopColor={lightMode ? "#94a3b8" : "#334155"} />
          <stop offset="100%" stopColor={lightMode ? "#64748b" : "#1e293b"} />
        </linearGradient>

        {/* Right Inner Folded Arch Ribbon Gradient */}
        <linearGradient id={gradRightFold} x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={lightMode ? "#cbd5e1" : "#4a5568"} />
          <stop offset="60%" stopColor={lightMode ? "#94a3b8" : "#2d3748"} />
          <stop offset="100%" stopColor={lightMode ? "#64748b" : "#1a202c"} />
        </linearGradient>

        {/* Central Meridian Line Axis Gradient */}
        <linearGradient id={gradNeedle} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={lightMode ? "#ffffff" : "#64748b"} />
          <stop offset="50%" stopColor={lightMode ? "#94a3b8" : "#475569"} />
          <stop offset="100%" stopColor={lightMode ? "#475569" : "#1e293b"} />
        </linearGradient>
      </defs>

      {/* Central Vertical Meridian Axis Needle */}
      <line
        x1="50"
        y1="16"
        x2="50"
        y2="84"
        stroke={color || `url(#${gradNeedle})`}
        strokeWidth="3.2"
        strokeLinecap="round"
      />

      {/* Left Outer Vertical Leg */}
      <path
        d="M 22 78 L 22 36 C 22 22, 34 22, 38 28 L 38 78 Z"
        fill={color || `url(#${gradLeftStem})`}
      />

      {/* Left Inner Fold Ribbon (Overlapping top curve curving down to center) */}
      <path
        d="M 22 36 C 22 20, 36 20, 50 44 L 50 58 C 36 34, 28 32, 22 40 Z"
        fill={color || `url(#${gradLeftFold})`}
        filter={`url(#${dropShadowId})`}
      />

      {/* Right Outer Vertical Leg */}
      <path
        d="M 78 78 L 78 36 C 78 22, 66 22, 62 28 L 62 78 Z"
        fill={color || `url(#${gradRightStem})`}
      />

      {/* Right Inner Fold Ribbon (Overlapping top curve curving down to center) */}
      <path
        d="M 78 36 C 78 20, 64 20, 50 44 L 50 58 C 64 34, 72 32, 78 40 Z"
        fill={color || `url(#${gradRightFold})`}
        filter={`url(#${dropShadowId})`}
      />
    </svg>
  );
};

export const MeridianLogo: React.FC<MeridianLogoProps> = ({
  size = 36,
  className = "",
  iconOnly = false,
  lightText = false,
  subtext = "INTERFACE",
  singleLine = false
}) => {
  const textColor = lightText ? "text-white" : "text-[#0f172a]";
  const subtextColor = lightText ? "text-slate-300" : "text-slate-600";

  return (
    <div className={`inline-flex items-center gap-3.5 ${className}`}>
      {/* 3D Folded Ribbon Vector Logo Mark */}
      <div className="flex-shrink-0 flex items-center justify-center">
        <MeridianLogoMark size={size} lightMode={lightText} />
      </div>

      {!iconOnly && (
        singleLine ? (
          <div className="flex items-center gap-2">
            <span className={`font-display font-extrabold tracking-[0.2em] uppercase text-base md:text-lg ${textColor}`}>
              MERIDIAN
            </span>
            <span className={`font-body font-bold tracking-[0.24em] uppercase text-xs md:text-sm ${subtextColor}`}>
              {subtext}
            </span>
          </div>
        ) : (
          <div className="flex flex-col text-left justify-center">
            <span className={`font-display font-extrabold tracking-[0.2em] leading-none uppercase text-base md:text-lg ${textColor}`}>
              MERIDIAN
            </span>
            <span className={`font-body font-bold text-[10px] md:text-[11px] tracking-[0.28em] uppercase mt-1 leading-none ${subtextColor}`}>
              {subtext}
            </span>
          </div>
        )
      )}
    </div>
  );
};
