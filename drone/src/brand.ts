/**
 * The product's name, per build. The All in 1 Events site ships "All in 1 Drone Command"; the copy
 * hosted in the Meridian Interface portfolio ships as the studio's own product, "Meridian Interface
 * Drone Command". vite.config.ts picks the brand (DEMO_BRAND, else from DEMO_BASE) and passes it in
 * as VITE_BRAND. Node tests have no import.meta.env, hence the `?.`.
 */
const meridian = import.meta.env?.VITE_BRAND === 'meridian';

export const BRAND = meridian ? {
  /** The full product name: page title, exports, reports. */
  name: 'Meridian Interface Drone Command',
  /** Who makes it: the small line over "Drone Command" in the app bar. */
  maker: 'Meridian Interface',
  /** The one-line lockup, where there is room for it. */
  lockup: 'Meridian Interface · Drone Command',
  /** The footer's opening line. */
  footer: 'Meridian Interface · Drone Command',
  /** The Overview's closing credit. */
  credit: 'Designed and engineered by Meridian Interface',
  /** The default words for the Name in Lights cue, and the city billboards. */
  showText: 'MERIDIAN',
  showFile: 'Meridian show',
} : {
  name: 'All in 1 Drone Command',
  maker: 'All in 1 Events',
  lockup: 'All in 1 · Drone Command',
  footer: 'All in 1 Events · Drone Command',
  credit: 'Designed and engineered by Meridian Interface for All in 1 Events',
  showText: 'ALL IN 1',
  showFile: 'All in 1 show',
};
