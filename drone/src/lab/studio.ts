import * as THREE from 'three';
import { AircraftStage, type StageAir, type StageCam } from '../components/hero/stage';

/**
 * Airframe studio: the Overview's aircraft set, full window, for judging detail and
 * for product stills. Query: az / el (camera azimuth and elevation, radians),
 * air (landed | hover), cam (look | down | portrait), t (time of the still, s),
 * dark (the dark backdrop), live (animate instead of a still), zoom with fx / fy / fz
 * (move in on a point of the aircraft).
 * window.__ready is set once the frame is drawn; window.__stats then holds the
 * mesh count and triangles of the aircraft.
 */
const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
document.body.style.background = q.has('dark')
  ? 'radial-gradient(120% 90% at 50% 38%, #3a3f47 0%, #262a31 52%, #16191e 100%)'
  : 'radial-gradient(120% 90% at 50% 38%, #ffffff 0%, #f1f3f5 48%, #dfe3e8 100%)';
const host = document.createElement('div');
host.style.cssText = 'position:fixed;inset:0';
document.body.appendChild(host);

const stage = new AircraftStage(host, { pixelRatio: num('dpr', 1) });
stage.az = num('az', -0.62); stage.el = num('el', 0.24);
stage.zoom = num('zoom', 1); stage.focus.set(num('fx', 0), num('fy', 0), num('fz', 0));
stage.air = (q.get('air') as StageAir) || 'landed';
stage.cam = (q.get('cam') as StageCam) || 'look';
stage.resize();
if (q.has('live')) stage.start();
else stage.still(num('t', 2));
let meshes = 0, tris = 0;
(stage as unknown as { scene: THREE.Scene }).scene.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { meshes++; tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; } });
requestAnimationFrame(() => requestAnimationFrame(() => Object.assign(window, { __ready: true, __stats: { meshes, tris: Math.round(tris) } })));
