import { zipStore } from '../lightshow/exportShow';
import { qgcPlan, wplText, toLatLon, GOOD_VIEWS, type SurveyPlan, type CoverageGrid, type Camera, type MissionAutopilot } from './plan';
import type { Photo } from '../hooks/useSurveyMission';
import { boundaryKml, type SurveySite } from './boundary';

/**
 * Survey package: everything the processing software and the next crew need.
 *
 *   mission.plan       QGroundControl plan with the site geofence (open in QGC to re-fly or edit)
 *   mission.waypoints  Mission Planner / QGC WPL 110 text
 *   site.kml           boundary and flight lines for Google Earth, DJI Pilot 2 (import as a
 *                      mapping area) or a client's GIS
 *   geotags.csv        one row per photo: position, attitude, time, accepted/rejected
 *   geo.txt            the same positions in the OpenDroneMap / WebODM format
 *   coverage.csv       views per 5 m cell — the quality report, computed in flight
 *   manifest.json      plan parameters and results
 *   README.txt         how to process it
 *
 * Photos themselves stay on the aircraft's SD card; image names follow DJI's
 * DJI_0001.JPG numbering so geotags line up with the files.
 */

const imageName = (n: number) => `DJI_${String(n).padStart(4, '0')}.JPG`;

/**
 * File number of each photo on the card (0 for a failed capture: no file). Counts one per
 * photo, or follows the index the aircraft reported so a lost report does not shift every
 * later name; an index that goes backwards (a reboot on a battery swap) carries on counting.
 */
export function imageNumbers(photos: Photo[]): number[] {
  let n = 0, prev: number | undefined;
  return photos.map(p => {
    if (p.reason === 'Capture failed') return 0;
    n += p.idx !== undefined && prev !== undefined && p.idx > prev ? p.idx - prev : 1;
    prev = p.idx;
    return n;
  });
}

export function buildSurveyFiles(plan: SurveyPlan, photos: Photo[], grid: CoverageGrid, site: SurveySite, camera: Camera, autopilot: MissionAutopilot = 'ARDUPILOT') {
  const origin = site.origin;
  const enc = new TextEncoder();
  const geotags = ['image,latitude,longitude,altitude_m,yaw_deg,pitch_deg,roll_deg,timestamp_utc,accepted,reject_reason,position_source'];
  const geo = ['EPSG:4326'];
  const nums = imageNumbers(photos);
  photos.forEach((p, i) => {
    if (!nums[i]) return; // a failed capture left no image
    const name = imageName(nums[i]), ll = toLatLon(origin, p);
    const yaw = ((p.headingDeg + 90) % 360 + 360) % 360; // map heading (east = 0) → compass (north = 0)
    geotags.push([name, ll.lat.toFixed(7), ll.lon.toFixed(7), p.altM.toFixed(1), yaw.toFixed(1), p.pitchDeg, 0, new Date(p.t).toISOString(), p.ok ? 1 : 0, p.reason ?? '', p.est ? 'estimated' : 'reported'].join(','));
    if (p.ok && !p.est) geo.push(`${name} ${ll.lon.toFixed(7)} ${ll.lat.toFixed(7)} ${p.altM.toFixed(1)} ${yaw.toFixed(1)} ${p.pitchDeg} 0`);
  });
  const cov = ['latitude,longitude,views,quality'];
  for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.cols; c++) {
    const i = r * grid.cols + c; if (!grid.inside[i]) continue;
    const v = grid.views[i]; const ll = toLatLon(origin, grid.cellCentre(c, r));
    cov.push(`${ll.lat.toFixed(7)},${ll.lon.toFixed(7)},${v},${v >= GOOD_VIEWS ? 'good' : v > 0 ? 'weak' : 'none'}`);
  }
  const st = grid.stats();
  const manifest = {
    site: site.name, siteKind: site.kind, generator: 'All in 1 Drone Command', exportedAt: new Date().toISOString(),
    origin, pattern: plan.params.pattern, camera: camera.name, altitudeM: plan.params.altitudeM,
    groundSampleDistanceCm: +plan.gsdCm.toFixed(2), frontOverlap: plan.params.frontOverlap, sideOverlap: plan.params.sideOverlap,
    lineSpacingM: +plan.spacingM.toFixed(1), photoSpacingM: +plan.triggerM.toFixed(1), speedMps: +plan.speedMps.toFixed(1), gimbalPitchDeg: plan.gimbalPitchDeg,
    areaHa: +(plan.areaM2 / 10000).toFixed(2), lines: plan.lines.length,
    photos: { taken: photos.length, accepted: photos.filter(p => p.ok).length, rejected: photos.filter(p => !p.ok).length, captureFailed: nums.filter(n => !n).length, positionsEstimated: photos.filter(p => p.est).length },
    coverage: { coveredPct: +st.coveredPct.toFixed(1), goodPct: +st.goodPct.toFixed(1), goodMeans: `at least ${GOOD_VIEWS} photos see the point` },
  };
  const readme = [
    `${site.name} — site survey package`,
    '',
    `Pattern ${plan.params.pattern.replace('_', ' ').toLowerCase()} at ${plan.params.altitudeM} m, ${plan.gsdCm.toFixed(1)} cm/px, ${manifest.photos.accepted} usable photos.`,
    '',
    'Processing (any one of these):',
    '  WebODM (free, self-hosted): New task → select the JPGs from the SD card and geo.txt from this folder.',
    '  Pix4Dmapper / Pix4Dmatic: New project → images → Import geolocation from geotags.csv (lat, lon, alt).',
    '  DroneDeploy / Agisoft Metashape: images carry EXIF GPS already; use geotags.csv to drop rejected frames.',
    '',
    'Skip every image marked accepted=0 in geotags.csv (blurred or badly exposed in flight).',
    ...(manifest.photos.positionsEstimated ? ['Rows marked position_source=estimated were not reported by the aircraft: use the positions in the images\' own EXIF (geo.txt leaves them out).'] : []),
    'site.kml opens in Google Earth; DJI Pilot 2 imports it as the mapping area for a DJI aircraft.',
    'Re-fly: open mission.plan in QGroundControl, or mission.waypoints in Mission Planner.',
    '',
  ].join('\n');
  return [
    { name: 'mission.plan', data: enc.encode(JSON.stringify(qgcPlan(plan, origin, site.home, { boundary: site.boundary, autopilot }), null, 2)) },
    { name: 'mission.waypoints', data: enc.encode(wplText(plan, origin, site.home)) },
    { name: 'site.kml', data: enc.encode(boundaryKml(site, { name: 'Flight lines', lines: plan.lines.map(l => [l.a, l.b]) })) },
    { name: 'geotags.csv', data: enc.encode(geotags.join('\n') + '\n') },
    { name: 'geo.txt', data: enc.encode(geo.join('\n') + '\n') },
    { name: 'coverage.csv', data: enc.encode(cov.join('\n') + '\n') },
    { name: 'manifest.json', data: enc.encode(JSON.stringify(manifest, null, 2)) },
    { name: 'README.txt', data: enc.encode(readme) },
  ];
}

export function downloadSurveyPackage(plan: SurveyPlan, photos: Photo[], grid: CoverageGrid, site: SurveySite, camera: Camera, autopilot?: MissionAutopilot) {
  const files = buildSurveyFiles(plan, photos, grid, site, camera, autopilot);
  const blob = zipStore(files);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${site.name.replace(/[^\w-]+/g, '_')}_${plan.params.pattern.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return files.length;
}
