import * as THREE from 'three';

/**
 * AI-generated aerial plates for the patrol feed.
 *
 * Stills of San Francisco generated as photoreal drone frames (see
 * public/footage/ai/README.md) are cut together like a 4K drone film: each
 * shot holds for a few seconds while a virtual camera moves across it (a slow
 * push, a drift, a gentle bank, with a little stabiliser shake), on hard cuts,
 * fading to black only at the end of the reel. The feed's sensor stage runs on
 * the result, so the film grade, the lens flare, thermal and night vision all
 * apply as they do to real footage.
 *
 * public/footage/ai/manifest.json lists the shots. When it is missing or empty
 * the San Francisco feed falls back to the rendered 3D city (sf.ts).
 */

export type PlateMood = 'DAY' | 'GOLDEN' | 'BLUE';

/** A camera move across the still: centre (0..1 of the image) and zoom (1 = the whole frame) at the start and end. */
export interface PlateMove { from: [number, number, number]; to: [number, number, number]; roll?: [number, number] }

export interface PlateShot {
  file: string;            // under footage/ai/
  title: string;
  dur: number;             // seconds
  mood: PlateMood;
  move: PlateMove;
  /** Where the sun sits in the still (0..1, y up), for the lens flare. */
  sun?: [number, number];
}

export interface PlateFrame {
  tex: THREE.Texture;
  offset: THREE.Vector2;   // uv of the view's bottom-left corner
  scale: THREE.Vector2;    // uv size of the view
  rot: number;             // radians, about the view centre
  mood: PlateMood;
  fade: number;            // 1 = full picture, 0 = black
  sun: THREE.Vector2 | null;
  title: string;
}

const BASE = import.meta.env.BASE_URL || '/';
const ease = (u: number) => u * u * (3 - 2 * u);

class Plates {
  shots: PlateShot[] = [];
  private tex: THREE.Texture[] = [];
  private total = 0;
  ready = false;

  async load(): Promise<boolean> {
    try {
      const r = await fetch(`${BASE}footage/ai/manifest.json`, { cache: 'no-cache' });
      if (!r.ok) return false;
      const m = (await r.json()) as { shots?: PlateShot[] };
      const shots = (m.shots ?? []).filter(s => s.file && s.dur > 0);
      if (!shots.length) return false;
      const loader = new THREE.TextureLoader();
      const tex = await Promise.all(shots.map(s => loader.loadAsync(`${BASE}footage/ai/${s.file}`).catch(() => null)));
      const ok: { s: PlateShot; t: THREE.Texture }[] = [];
      shots.forEach((s, i) => { const t = tex[i]; if (t) ok.push({ s, t }); });
      if (!ok.length) return false;
      for (const { t } of ok) { t.colorSpace = THREE.NoColorSpace; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 8; }
      this.shots = ok.map(x => x.s); this.tex = ok.map(x => x.t);
      this.total = this.shots.reduce((a, s) => a + s.dur, 0);
      this.ready = true;
      return true;
    } catch {
      return false;
    }
  }

  /** The picture at this moment of the reel, for a view of this aspect ratio. */
  frame(time: number, aspect: number): PlateFrame | null {
    if (!this.ready) return null;
    let t = ((time % this.total) + this.total) % this.total, i = 0;
    while (i < this.shots.length - 1 && t >= this.shots[i].dur) { t -= this.shots[i].dur; i++; }
    const s = this.shots[i], tex = this.tex[i], u = Math.min(1, t / s.dur), e = ease(u);
    const img = tex.image as { width: number; height: number };
    const imgAspect = img.width / img.height;
    const [cx0, cy0, z0] = s.move.from, [cx1, cy1, z1] = s.move.to;
    const z = z0 + (z1 - z0) * e;
    // A view of the requested aspect, as large as the zoom allows inside the still.
    let sw = z, sh = z;
    if (aspect > imgAspect) sh = (z * imgAspect) / aspect; else sw = (z * aspect) / imgAspect;
    // Stabiliser residual: a slow, small wander, as a gimbal leaves in real footage.
    const wob = 0.0003 * z;
    let cx = cx0 + (cx1 - cx0) * e + Math.sin(time * 0.71 + i) * wob, cy = cy0 + (cy1 - cy0) * e + Math.sin(time * 0.53 + i * 2.1) * wob;
    // Keep the view (with room for its roll) inside the still.
    const roll = s.move.roll ? s.move.roll[0] + (s.move.roll[1] - s.move.roll[0]) * e : 0;
    const pad = Math.abs(Math.sin(roll)) * 0.5 * Math.max(sw, sh);
    cx = Math.min(1 - sw / 2 - pad, Math.max(sw / 2 + pad, cx));
    cy = Math.min(1 - sh / 2 - pad, Math.max(sh / 2 + pad, cy));
    // Fade in at the top of the reel and out at the end of it; everything else is a hard cut.
    let fade = 1;
    if (i === 0) fade = Math.min(1, t / 0.8);
    if (i === this.shots.length - 1) fade = Math.min(fade, (s.dur - t) / 1.6);
    let sun: THREE.Vector2 | null = null;
    if (s.sun) {
      const x = (s.sun[0] - (cx - sw / 2)) / sw, y = (s.sun[1] - (cy - sh / 2)) / sh;
      if (x > -0.1 && x < 1.1 && y > -0.1 && y < 1.1) sun = new THREE.Vector2(x, y);
    }
    return { tex, offset: new THREE.Vector2(cx - sw / 2, cy - sh / 2), scale: new THREE.Vector2(sw, sh), rot: roll, mood: s.mood, fade: Math.max(0, fade), sun, title: s.title };
  }
}

let plates: Plates | null = null;
let loading: Promise<boolean> | null = null;
/** The shared plate reel; resolves true once at least one plate has loaded. */
export function loadPlates(): Promise<boolean> {
  if (!plates) plates = new Plates();
  if (!loading) loading = plates.load();
  return loading;
}
export function platesNow(): Plates | null { return plates?.ready ? plates : null; }
