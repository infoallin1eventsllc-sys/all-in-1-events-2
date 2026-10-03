/**
 * Frame governor: keeps every 3D stage smooth on whatever machine it runs on.
 *
 * Each stage feeds it a frame time; it keeps a smoothed average and steps a
 * quality level down when frames run long, and back up when there is headroom
 * for a good while. The stage maps the level to what it can trade: pixel
 * ratio, post-processing passes, shadow map size, particle counts.
 *
 *   0  full quality (sharp pixel ratio, every pass)
 *   1  lighter (pixel ratio 1.25, the dearest pass off)
 *   2  lightest (pixel ratio 1, no post-processing beyond output)
 *
 * The chosen level is remembered per stage between visits, so a slow machine
 * doesn't stutter through the first seconds of every page.
 */

export type QualityLevel = 0 | 1 | 2;

const STEP_DOWN_MS = 1000 / 40;   // slower than 40 fps: step down
const STEP_UP_MS = 1000 / 58;     // faster than 58 fps for long enough: step up
const SETTLE_DOWN = 45;           // frames of evidence before stepping down
const SETTLE_UP = 600;            // frames before stepping back up (about ten seconds)

export class FrameGovernor {
  level: QualityLevel;
  private avg = 16;
  private settled = 0;
  private readonly key: string;
  private listeners: ((l: QualityLevel) => void)[] = [];

  constructor(name: string, start: QualityLevel = 0) {
    this.key = `a1-quality-${name}`;
    let saved: QualityLevel | null = null;
    try { const v = localStorage.getItem(this.key); if (v !== null) saved = Math.min(2, Math.max(0, Number(v))) as QualityLevel; } catch { /* private mode */ }
    this.level = saved ?? start;
  }

  /** Call once per rendered frame with the frame time in milliseconds. Returns true when the level changed. */
  tick(frameMs: number): boolean {
    this.avg = this.avg * 0.92 + Math.min(frameMs, 100) * 0.08;
    this.settled++;
    let next = this.level;
    if (this.avg > STEP_DOWN_MS && this.level < 2 && this.settled > SETTLE_DOWN) next = (this.level + 1) as QualityLevel;
    else if (this.avg < STEP_UP_MS && this.level > 0 && this.settled > SETTLE_UP) next = (this.level - 1) as QualityLevel;
    if (next === this.level) return false;
    this.level = next; this.settled = 0; this.avg = 16;
    try { localStorage.setItem(this.key, String(next)); } catch { /* ignore */ }
    for (const l of this.listeners) l(next);
    return true;
  }

  onChange(l: (level: QualityLevel) => void) { this.listeners.push(l); }

  /** The pixel ratio for this level: sharp where there is headroom, never above what the screen has. */
  pixelRatio(max = 2): number {
    const dpr = window.devicePixelRatio || 1;
    return Math.min(dpr, this.level === 0 ? max : this.level === 1 ? 1.25 : 1);
  }
}
