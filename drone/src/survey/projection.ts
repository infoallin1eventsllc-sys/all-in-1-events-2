/**
 * The map projections processed survey results come in, WGS84 only:
 *
 *   EPSG:4326          geographic lon/lat (Metashape, DroneDeploy exports)
 *   EPSG:326zz / 327zz UTM north / south (OpenDroneMap / WebODM always, Pix4D usually)
 *   EPSG:3857          Web Mercator (DroneDeploy's default GeoTIFF export)
 *
 * UTM is Krüger's series to n³ (the form in most references, e.g. Karney 2011),
 * good to about a millimetre within a zone and a few beyond: no proj4 needed.
 * Anything else is refused with a message that says how to reproject it.
 */

export interface Crs {
  epsg: number;
  name: string;
  /** CRS coordinates (x east, y north) from and to degrees. */
  forward: (lon: number, lat: number) => [number, number];
  inverse: (x: number, y: number) => [number, number];
  /** Metres per CRS unit near a latitude (degrees for 4326), to express pixel size in metres. */
  metresPerUnit: (lat: number) => number;
}

const A = 6378137, F = 1 / 298.257223563, K0 = 0.9996;
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const n = F / (2 - F), n2 = n * n, n3 = n2 * n;
const AA = (A / (1 + n)) * (1 + n2 / 4 + (n2 * n2) / 64);
const alpha = [n / 2 - (2 * n2) / 3 + (5 * n3) / 16, (13 * n2) / 48 - (3 * n3) / 5, (61 * n3) / 240];
const beta = [n / 2 - (2 * n2) / 3 + (37 * n3) / 96, n2 / 48 + n3 / 15, (17 * n3) / 480];
const delta = [2 * n - (2 * n2) / 3 - 2 * n3, (7 * n2) / 3 - (8 * n3) / 5, (56 * n3) / 15];
const c2n = (2 * Math.sqrt(n)) / (1 + n);

/** UTM easting/northing (metres) for a zone (1–60), north or south hemisphere. */
export function utmForward(zone: number, south: boolean, lon: number, lat: number): [number, number] {
  const phi = lat * D2R, dl = (lon - (zone * 6 - 183)) * D2R;
  const s = Math.sin(phi);
  const t = Math.sinh(Math.atanh(s) - c2n * Math.atanh(c2n * s));
  const xi = Math.atan2(t, Math.cos(dl)), eta = Math.atanh(Math.sin(dl) / Math.sqrt(1 + t * t));
  let E = eta, N = xi;
  for (let j = 1; j <= 3; j++) { E += alpha[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta); N += alpha[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta); }
  return [500000 + K0 * AA * E, (south ? 10000000 : 0) + K0 * AA * N];
}

export function utmInverse(zone: number, south: boolean, x: number, y: number): [number, number] {
  const xi = (y - (south ? 10000000 : 0)) / (K0 * AA), eta = (x - 500000) / (K0 * AA);
  let xp = xi, ep = eta;
  for (let j = 1; j <= 3; j++) { xp -= beta[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta); ep -= beta[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta); }
  const chi = Math.asin(Math.sin(xp) / Math.cosh(ep));
  let phi = chi;
  for (let j = 1; j <= 3; j++) phi += delta[j - 1] * Math.sin(2 * j * chi);
  return [zone * 6 - 183 + Math.atan2(Math.sinh(ep), Math.cos(xp)) * R2D, phi * R2D];
}

export const utmZoneOf = (lon: number) => Math.min(60, Math.max(1, Math.floor((lon + 180) / 6) + 1));

const mPerDegLat = (lat: number) => 111132.954 - 559.822 * Math.cos(2 * lat * D2R) + 1.175 * Math.cos(4 * lat * D2R);

/** A supported CRS by EPSG code, or an Error saying why not. */
export function crsFromEpsg(epsg: number): Crs | Error {
  if (epsg === 4326) return { epsg, name: 'WGS 84 (EPSG:4326)', forward: (lon, lat) => [lon, lat], inverse: (x, y) => [x, y], metresPerUnit: mPerDegLat };
  if ((epsg > 32600 && epsg <= 32660) || (epsg > 32700 && epsg <= 32760)) {
    const south = epsg > 32700, zone = epsg - (south ? 32700 : 32600);
    return { epsg, name: `WGS 84 / UTM zone ${zone}${south ? 'S' : 'N'} (EPSG:${epsg})`, forward: (lon, lat) => utmForward(zone, south, lon, lat), inverse: (x, y) => utmInverse(zone, south, x, y), metresPerUnit: () => 1 };
  }
  if (epsg === 3857 || epsg === 900913 || epsg === 3785) {
    // Spherical Mercator on the WGS84 major axis. Its "metres" stretch by 1/cos(lat) on the ground.
    return {
      epsg: 3857, name: 'WGS 84 / Pseudo-Mercator (EPSG:3857)',
      forward: (lon, lat) => [A * lon * D2R, A * Math.log(Math.tan(Math.PI / 4 + (lat * D2R) / 2))],
      inverse: (x, y) => [(x / A) * R2D, (2 * Math.atan(Math.exp(y / A)) - Math.PI / 2) * R2D],
      metresPerUnit: lat => Math.cos(lat * D2R),
    };
  }
  return new Error(`EPSG:${epsg} is not supported. Export or reproject the results to WGS 84 (EPSG:4326), UTM (EPSG:326xx / 327xx) or Web Mercator (EPSG:3857), e.g. gdalwarp -t_srs EPSG:${32600 + 11} in.tif out.tif (use your site's UTM zone).`);
}
