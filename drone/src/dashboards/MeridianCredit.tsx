import React from 'react';
import { ArrowRight } from 'lucide-react';

/** Meridian's booking form, opened directly (the site reads ?book). */
export const MERIDIAN_BOOK_URL = 'https://meridianinterface.com/?book=drone-command';

/**
 * The studio signature plate, as it closes every site Meridian Interface ships (its `BuiltBy`
 * block): the lockup on a light plate, so the artwork always has the ground it was drawn for,
 * then the studio's line and contacts. The demo adds the one thing a visitor weighing a project
 * needs next: the way to book.
 */
export const MeridianCredit: React.FC = () => (
  <div className="flex flex-col items-center text-center">
    <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.28em] text-ink-3">A Meridian Interface build</p>
    <a href="https://meridianinterface.com" target="_blank" rel="noopener"
      className="mt-3 inline-flex items-center justify-center rounded-xl bg-slate-100 px-6 py-5 transition-colors hover:bg-white ring-1 ring-black/5"
      aria-label="Meridian Interface: visit meridianinterface.com">
      <img src={`${import.meta.env.BASE_URL}brand/meridian-lockup.png`} alt="Meridian Interface" width={300} height={186} decoding="async" loading="lazy" className="w-[124px] h-auto" />
    </a>
    <p className="mt-4 text-[12px] text-ink-3 max-w-sm">Websites, applications, and marketing systems for growing businesses.</p>
    {/* Bullets are decorative: hidden from screen readers, and on phones, where the contacts stack. */}
    <div className="mt-1.5 flex flex-col sm:flex-row sm:flex-wrap items-center justify-center gap-x-2.5 text-[12px] font-semibold text-ink-2">
      <a href="https://meridianinterface.com" target="_blank" rel="noopener" className="py-1 hover:text-ink">meridianinterface.com</a>
      <span aria-hidden="true" className="hidden sm:inline text-ink-3">&bull;</span>
      <a href="mailto:otis@meridianinterface.com" className="py-1 hover:text-ink">otis@meridianinterface.com</a>
      <span aria-hidden="true" className="hidden sm:inline text-ink-3">&bull;</span>
      <a href="tel:+12818829198" className="py-1 hover:text-ink">(281) 882-9198</a>
    </div>
    <a href={MERIDIAN_BOOK_URL} target="_blank" rel="noopener"
      className="mt-4 inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-ink text-surface text-[13px] font-semibold hover:opacity-90">
      Book an appointment<ArrowRight className="w-4 h-4" aria-hidden />
    </a>
  </div>
);
