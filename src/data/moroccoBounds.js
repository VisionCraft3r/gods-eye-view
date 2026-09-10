/**
 * Kingdom of Morocco framing, city catalog, and viewport helpers for the
 * Morocco data pack. Bounds cover the mapped kingdom as commonly drawn on
 * global globes (Atlantic to the Algerian frontier, Mediterranean to the
 * Sahara). They are a camera/query gate, not a political claim.
 */

export const MOROCCO_BOUNDS = Object.freeze({
  south: 20.8,
  north: 36.05,
  west: -17.25,
  east: -0.85,
});

export const MOROCCO_OVERVIEW = Object.freeze({
  lat: 31.8,
  lon: -7.1,
  heightM: 2_400_000,
  pitchDeg: -45,
  headingDeg: 0,
});

export const MOROCCO_PACK_STORAGE_KEY = 'gev:morocco-pack:v1';

export const MOROCCO_KIND_IDS = Object.freeze([
  'airports',
  'ports',
  'stations',
  'hospitals',
  'universities',
  'mosques',
  'civic',
  'tourism',
  'unesco',
  'hotels',
  'energy',
  'beaches',
  'markets',
]);

export const MOROCCO_KIND_META = Object.freeze({
  airports: Object.freeze({ label: 'Airports', color: '#7ecbff' }),
  ports: Object.freeze({ label: 'Ports', color: '#4ad4c8' }),
  stations: Object.freeze({ label: 'Rail & tram', color: '#f0c14a' }),
  hospitals: Object.freeze({ label: 'Hospitals', color: '#ff6b7a' }),
  universities: Object.freeze({ label: 'Universities', color: '#c58cff' }),
  mosques: Object.freeze({ label: 'Mosques', color: '#5dcaa5' }),
  civic: Object.freeze({ label: 'Civic', color: '#9ca6b0' }),
  tourism: Object.freeze({ label: 'Landmarks', color: '#ff9f43' }),
  unesco: Object.freeze({ label: 'UNESCO', color: '#ffd36b' }),
  hotels: Object.freeze({ label: 'Hotels', color: '#e8d5b5' }),
  energy: Object.freeze({ label: 'Dams & power', color: '#5aa9ff' }),
  beaches: Object.freeze({ label: 'Beaches', color: '#7ad7ff' }),
  markets: Object.freeze({ label: 'Souks', color: '#e8a87c' }),
});

export const MOROCCO_DEFAULT_KINDS = Object.freeze([
  'airports',
  'ports',
  'stations',
  'hospitals',
  'universities',
  'mosques',
  'tourism',
  'unesco',
]);

export const MOROCCO_COMPANION_LAYERS = Object.freeze([
  Object.freeze({ id: 'flights', label: 'Live flights' }),
  Object.freeze({ id: 'ais-live-vessels', label: 'Live vessels' }),
  Object.freeze({ id: 'earthquakes', label: 'Earthquakes' }),
  Object.freeze({ id: 'local-firms', label: 'Active fires' }),
  Object.freeze({ id: 'traffic', label: 'Street traffic' }),
  Object.freeze({ id: 'radio', label: 'Radio' }),
  Object.freeze({ id: 'oncf-trains', label: 'ONCF trains' }),
]);

export const MOROCCO_CITY_IDS = Object.freeze([
  'casablanca',
  'rabat',
  'marrakech',
  'tangier',
  'fez',
  'agadir',
  'ouarzazate',
  'meknes',
  'essaouira',
  'chefchaouen',
  'tetouan',
  'kenitra',
]);

/**
 * @param {number} latitude
 * @param {number} longitude
 * @returns {boolean}
 */
export function isInMorocco(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  return latitude >= MOROCCO_BOUNDS.south
    && latitude <= MOROCCO_BOUNDS.north
    && longitude >= MOROCCO_BOUNDS.west
    && longitude <= MOROCCO_BOUNDS.east;
}

/**
 * Intersect a camera rectangle with Morocco and clamp it to a queryable span.
 * @param {{south:number, west:number, north:number, east:number}} box
 * @param {number} [maxSpanDeg=8]
 * @returns {{south:number, west:number, north:number, east:number}|null}
 */
export function clampMoroccoQueryBox(box, maxSpanDeg = 8) {
  if (!box) return null;
  const south = Math.max(MOROCCO_BOUNDS.south, Number(box.south));
  const north = Math.min(MOROCCO_BOUNDS.north, Number(box.north));
  const west = Math.max(MOROCCO_BOUNDS.west, Number(box.west));
  const east = Math.min(MOROCCO_BOUNDS.east, Number(box.east));
  if (![south, west, north, east].every(Number.isFinite) || south >= north || west >= east) {
    return null;
  }
  const spanLat = north - south;
  const spanLon = east - west;
  if (spanLat <= maxSpanDeg && spanLon <= maxSpanDeg) {
    return { south, west, north, east };
  }
  const midLat = (south + north) / 2;
  const midLon = (west + east) / 2;
  const halfLat = Math.min(spanLat, maxSpanDeg) / 2;
  const halfLon = Math.min(spanLon, maxSpanDeg) / 2;
  return {
    south: Math.max(MOROCCO_BOUNDS.south, midLat - halfLat),
    north: Math.min(MOROCCO_BOUNDS.north, midLat + halfLat),
    west: Math.max(MOROCCO_BOUNDS.west, midLon - halfLon),
    east: Math.min(MOROCCO_BOUNDS.east, midLon + halfLon),
  };
}

/**
 * @param {string[]|null|undefined} kinds
 * @returns {string[]}
 */
export function normalizeMoroccoKinds(kinds) {
  const requested = Array.isArray(kinds) ? kinds : MOROCCO_DEFAULT_KINDS;
  const allowed = new Set(MOROCCO_KIND_IDS);
  const next = [...new Set(requested.map((value) => String(value || '').trim()).filter((value) => allowed.has(value)))];
  return next.length ? next : [...MOROCCO_DEFAULT_KINDS];
}
