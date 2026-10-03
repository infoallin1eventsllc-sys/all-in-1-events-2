/**
 * Which Health screen is showing: the whole fleet or one aircraft. Kept outside
 * React so the light show ("Open fleet health") and the tour can set it before
 * the Health screen mounts.
 */
export type HealthMode = 'FLEET' | 'ONE';
const KEY = 'a1-health-mode';

export function readHealthMode(): HealthMode {
  try { return localStorage.getItem(KEY) === 'ONE' ? 'ONE' : 'FLEET'; } catch { return 'FLEET'; }
}
export function setHealthMode(m: HealthMode) {
  try { localStorage.setItem(KEY, m); } catch { /* private mode */ }
  window.dispatchEvent(new CustomEvent('a1-health-mode', { detail: m }));
}
/** Open a screen from anywhere (App listens). */
export function openTab(tab: string) { window.dispatchEvent(new CustomEvent('a1-navigate', { detail: tab })); }
