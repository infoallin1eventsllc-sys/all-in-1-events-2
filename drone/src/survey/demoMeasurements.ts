import { STOCKPILE, SWALE, heightAt } from './site';
import type { Annotation } from './measure';

/**
 * What a crew measures on the demo venue after a survey: the gravel pile for the
 * stage build, the accessible route from the gate (it crosses the swale), and
 * the pad for a second stage, levelled to its average height.
 */
export function demoMeasurements(): Annotation[] {
  const pile = Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * Math.PI * 2; const r = STOCKPILE.r + 4 + Math.sin(a * 3) * 1.2; return { x: STOCKPILE.x + r * Math.cos(a), y: STOCKPILE.y + r * Math.sin(a) }; });
  const S = SWALE, k = 7;
  const route = [{ x: -150, y: 120 }, { x: -100, y: 80 }, { x: S.x - S.dy * k, y: S.y + S.dx * k }, { x: S.x, y: S.y }, { x: S.x + S.dy * k, y: S.y - S.dx * k }, { x: -20, y: 30 }, { x: 60, y: -40 }];
  const pad = [{ x: -75, y: -135 }, { x: -30, y: -135 }, { x: -30, y: -102 }, { x: -75, y: -102 }];
  const padLevel = pad.reduce((s, p) => s + heightAt(p.x, p.y), 0) / pad.length;
  return [
    { id: 'm-pile', name: 'Gravel stockpile', kind: 'AREA', pts: pile, visible: true, base: { kind: 'PLANE' }, density: 1.6 },
    { id: 'm-route', name: 'Accessible route: gate to stage', kind: 'LINE', pts: route, visible: true, limitPct: 5 },
    { id: 'm-pad', name: 'Second stage pad', kind: 'AREA', pts: pad, visible: true, base: { kind: 'DESIGN', level: padLevel }, density: 1.3 },
  ];
}
