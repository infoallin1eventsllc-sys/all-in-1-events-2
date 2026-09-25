/**
 * Metres per degree at a latitude on the WGS84 ellipsoid: the meridional and prime-vertical
 * radii as their standard series. A flat 111 320 m per degree of latitude is 0.4 % short at
 * 34° and 0.3 % long at 60°; this is within millimetres per kilometre. One function for the whole
 * app, so a survey, a fleet move and a flight record all place a point in the same spot.
 */
export function metresPerDegree(lat: number): { lat: number; lon: number } {
  const f = (lat * Math.PI) / 180;
  return { lat: 111132.954 - 559.822 * Math.cos(2 * f) + 1.175 * Math.cos(4 * f), lon: 111412.84 * Math.cos(f) - 93.5 * Math.cos(3 * f) };
}
