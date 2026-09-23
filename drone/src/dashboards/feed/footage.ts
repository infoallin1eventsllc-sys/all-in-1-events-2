/**
 * Real drone footage for the patrol feed: recorded flights over real cities and
 * mountains, licensed for free commercial use from Pexels (no attribution required;
 * https://www.pexels.com/license/). The aircraft's HUD, sensor modes and telemetry
 * are drawn over it.
 *
 * Where a clip's file comes from, in order:
 *   1. /footage/<id>.mp4 on this site, once `npm run footage` has downloaded the
 *      clips (public/footage/manifest.json lists what is there). Same-origin, so the
 *      thermal and night-vision stages run in WebGL on the real frames.
 *   2. The Pexels API, when the site is built with VITE_PEXELS_KEY (a free key;
 *      exact file URLs for the size we want).
 *   3. Pexels' download endpoint, which redirects to the file. Cross-origin, so
 *      sensor modes fall back to CSS filters.
 * If none of them plays, the feed falls back to the 3D city simulation.
 */

export type Place = 'SAN_FRANCISCO' | 'LOS_ANGELES' | 'NEW_YORK' | 'MOUNTAINS' | 'STREETS';

export interface Clip {
  id: number;               // Pexels video id
  title: string;
  by: string;               // videographer, credited in the HUD
  place: Place;
  night?: boolean;
}

export const PLACE_LABEL: Record<Place, string> = {
  SAN_FRANCISCO: 'San Francisco', LOS_ANGELES: 'Los Angeles', NEW_YORK: 'New York', MOUNTAINS: 'Mountains', STREETS: 'City streets',
};

/** The clip library. Titles and credits as published on pexels.com/video/<id>. */
export const CLIPS: Clip[] = [
  { id: 13175361, title: 'Bay Bridge and downtown San Francisco', by: 'Offgrideli', place: 'SAN_FRANCISCO' },
  { id: 8320073, title: 'Golden Gate Bridge', by: 'Mikhail Nilov', place: 'SAN_FRANCISCO' },
  { id: 31421894, title: 'Golden Gate Bridge and the San Francisco skyline', by: 'Pexels contributor', place: 'SAN_FRANCISCO' },
  { id: 14623516, title: 'Golden Gate Bridge from above', by: 'Offgrideli', place: 'SAN_FRANCISCO' },
  { id: 8319685, title: 'Downtown Los Angeles', by: 'Mikhail Nilov', place: 'LOS_ANGELES' },
  { id: 19787809, title: 'Downtown LA from a drone', by: 'Pexels contributor', place: 'LOS_ANGELES' },
  { id: 33421810, title: 'Los Angeles at dawn, traffic below', by: 'Keysi Estrada', place: 'LOS_ANGELES' },
  { id: 11553331, title: 'Los Angeles skyline at sunset', by: 'Djordje Vanjek', place: 'LOS_ANGELES', night: true },
  { id: 5796436, title: 'New York City from the air', by: 'CityXcape', place: 'NEW_YORK' },
  { id: 12122308, title: 'New York City skyline', by: 'Advancer Drones', place: 'NEW_YORK' },
  { id: 35419125, title: 'Manhattan and Central Park', by: 'CAPTKHO kho', place: 'NEW_YORK' },
  { id: 37898716, title: 'NYC skyscrapers at night', by: 'Yura Forrat', place: 'NEW_YORK', night: true },
  { id: 5727833, title: 'New York City at night', by: 'CityXcape', place: 'NEW_YORK', night: true },
  { id: 4763824, title: 'Over the mountain peak', by: 'Yaroslav Shuraev', place: 'MOUNTAINS' },
  { id: 16003270, title: 'Snowy mountain range', by: 'Dean Diemert', place: 'MOUNTAINS' },
  { id: 33655179, title: 'Snow-capped peaks', by: 'EJ Merl', place: 'MOUNTAINS' },
  { id: 4185342, title: 'Snowy peak at twilight', by: 'Pexels contributor', place: 'MOUNTAINS', night: true },
  { id: 3066241, title: 'Buildings and streets by day', by: 'Tom Fisk', place: 'STREETS' },
  { id: 5624060, title: 'Cars and people on the street', by: 'Pexels contributor', place: 'STREETS' },
  { id: 32133205, title: 'Busy city street', by: 'Pexels contributor', place: 'STREETS' },
  { id: 3063475, title: 'Traffic at a night intersection', by: 'Tom Fisk', place: 'STREETS', night: true },
  { id: 2675508, title: 'Night road system', by: 'Mixkit', place: 'STREETS', night: true },
  { id: 7068548, title: 'City at night', by: 'Laura Tancredi', place: 'STREETS', night: true },
];

export const PLACES: Place[] = ['SAN_FRANCISCO', 'LOS_ANGELES', 'NEW_YORK', 'MOUNTAINS', 'STREETS'];

/** Clips for one place and time of day (a place with no night clips uses the streets at night). */
export function playlist(place: Place, night: boolean): Clip[] {
  const own = CLIPS.filter(c => c.place === place && !!c.night === night);
  if (own.length) return own;
  return CLIPS.filter(c => !!c.night === night && (c.place === 'STREETS' || c.place === place));
}

export interface Source { url: string; sameOrigin: boolean }

const BASE = import.meta.env.BASE_URL || '/';
let local: Promise<Set<number>> | null = null;
/** Ids of clips downloaded into public/footage (empty when the script hasn't run). */
function localClips(): Promise<Set<number>> {
  if (!local) {
    local = fetch(`${BASE}footage/manifest.json`, { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : { clips: [] }))
      .then((m: { clips?: { id: number }[] }) => new Set((m.clips ?? []).map(c => c.id)))
      .catch(() => new Set<number>());
  }
  return local;
}

const KEY = import.meta.env.VITE_PEXELS_KEY as string | undefined;
const apiCache = new Map<number, Promise<string | null>>();
function viaApi(id: number, maxWidth: number): Promise<string | null> {
  if (!KEY) return Promise.resolve(null);
  const k = id * 10 + (maxWidth > 900 ? 1 : 0);
  let p = apiCache.get(k);
  if (!p) {
    p = fetch(`https://api.pexels.com/videos/videos/${id}`, { headers: { Authorization: KEY } })
      .then(r => (r.ok ? r.json() : null))
      .then((v: { video_files?: { link: string; width: number; file_type: string }[] } | null) => {
        const files = (v?.video_files ?? []).filter(f => f.file_type === 'video/mp4' && f.width <= maxWidth).sort((a, b) => b.width - a.width);
        return files[0]?.link ?? null;
      })
      .catch(() => null);
    apiCache.set(k, p);
  }
  return p;
}

/** Candidate URLs for a clip, best first; the player tries them in turn. */
export async function sources(clip: Clip, thumb: boolean): Promise<Source[]> {
  const out: Source[] = [];
  if ((await localClips()).has(clip.id)) out.push({ url: `${BASE}footage/${clip.id}${thumb ? '-sd' : ''}.mp4`, sameOrigin: true });
  const api = await viaApi(clip.id, thumb ? 700 : 1300);
  if (api) out.push({ url: api, sameOrigin: false });
  const [w, h] = thumb ? [640, 360] : [1280, 720];
  out.push({ url: `https://www.pexels.com/download/video/${clip.id}/?w=${w}&h=${h}`, sameOrigin: false });
  // Direct file names on Pexels' video CDN differ only by frame rate; a wrong guess fails fast.
  for (const fps of [25, 30, 24]) out.push({ url: `https://videos.pexels.com/video-files/${clip.id}/${clip.id}-${thumb ? 'sd_640_360' : 'hd_1280_720'}_${fps}fps.mp4`, sameOrigin: false });
  return out;
}

export const pageUrl = (clip: Clip) => `https://www.pexels.com/video/${clip.id}/`;
