/**
 * Overpass query builder and OSM element normalizer for the Morocco pack.
 * Pure: no Cesium, no DOM, no network.
 */

import {
  MOROCCO_KIND_IDS,
  MOROCCO_KIND_META,
  clampMoroccoQueryBox,
  normalizeMoroccoKinds,
} from './moroccoBounds.js';

export const MOROCCO_PLACE_ELEMENT_CAP = 350;

const KIND_SELECTORS = Object.freeze({
  airports: ['nwr["aeroway"="aerodrome"]', 'nwr["aeroway"="airport"]'],
  ports: ['nwr["landuse"="harbour"]', 'nwr["harbour"]', 'nwr["industrial"="port"]'],
  stations: ['nwr["railway"="station"]', 'nwr["railway"="halt"]', 'nwr["railway"="tram_stop"]', 'nwr["amenity"="bus_station"]'],
  hospitals: ['nwr["amenity"="hospital"]', 'nwr["amenity"="clinic"]'],
  universities: ['nwr["amenity"="university"]', 'nwr["amenity"="college"]'],
  mosques: ['nwr["amenity"="place_of_worship"]["religion"="muslim"]', 'nwr["building"="mosque"]'],
  civic: ['nwr["amenity"="police"]', 'nwr["amenity"="fire_station"]', 'nwr["amenity"="townhall"]', 'nwr["office"="government"]'],
  tourism: ['nwr["tourism"="attraction"]', 'nwr["tourism"="museum"]', 'nwr["historic"="monument"]', 'nwr["leisure"="stadium"]'],
  unesco: [],
  hotels: ['nwr["tourism"="hotel"]'],
  energy: ['nwr["waterway"="dam"]', 'nwr["power"="plant"]'],
  beaches: ['nwr["natural"="beach"]', 'nwr["leisure"="beach_resort"]'],
  markets: ['nwr["amenity"="marketplace"]', 'nwr["shop"="mall"]'],
});

/**
 * @param {{south:number, west:number, north:number, east:number}} box
 * @param {string[]} [kinds]
 * @returns {string|null}
 */
export function buildMoroccoPlacesQuery(box, kinds = undefined) {
  const clamped = clampMoroccoQueryBox(box);
  if (!clamped) return null;
  const selected = normalizeMoroccoKinds(kinds);
  const bbox = `${clamped.south},${clamped.west},${clamped.north},${clamped.east}`;
  const selectors = selected.flatMap((kind) => KIND_SELECTORS[kind] || [])
    .map((selector) => `${selector}(${bbox});`)
    .join('');
  if (!selectors) return null;
  return `[out:json][timeout:20];(${selectors});out center tags ${MOROCCO_PLACE_ELEMENT_CAP};`;
}

function firstTag(tags, keys) {
  for (const key of keys) {
    const value = String(tags?.[key] || '').trim();
    if (value) return value;
  }
  return '';
}

/**
 * @param {object} tags
 * @returns {string|null}
 */
export function classifyMoroccoTags(tags) {
  const aeroway = tags?.aeroway;
  if (aeroway === 'aerodrome' || aeroway === 'airport') return 'airports';
  if (tags?.landuse === 'harbour' || tags?.harbour || tags?.industrial === 'port') return 'ports';
  if (tags?.railway === 'station' || tags?.railway === 'halt' || tags?.railway === 'tram_stop' || tags?.amenity === 'bus_station') {
    return 'stations';
  }
  if (tags?.amenity === 'hospital' || tags?.amenity === 'clinic') return 'hospitals';
  if (tags?.amenity === 'university' || tags?.amenity === 'college') return 'universities';
  if (tags?.building === 'mosque' || (tags?.amenity === 'place_of_worship' && tags?.religion === 'muslim')) {
    return 'mosques';
  }
  if (tags?.amenity === 'police' || tags?.amenity === 'fire_station' || tags?.amenity === 'townhall' || tags?.office === 'government') {
    return 'civic';
  }
  if (tags?.tourism === 'hotel') return 'hotels';
  if (tags?.waterway === 'dam' || tags?.power === 'plant') return 'energy';
  if (tags?.natural === 'beach' || tags?.leisure === 'beach_resort') return 'beaches';
  if (tags?.amenity === 'marketplace' || tags?.shop === 'mall') return 'markets';
  if (tags?.['heritage:operator'] === 'whc' || tags?.['ref:whc']) return 'unesco';
  if (tags?.tourism === 'attraction' || tags?.tourism === 'museum' || tags?.historic === 'monument' || tags?.leisure === 'stadium') {
    return 'tourism';
  }
  return null;
}

function elementCenter(element) {
  if (Number.isFinite(element?.lat) && Number.isFinite(element?.lon)) {
    return { lat: element.lat, lon: element.lon };
  }
  const center = element?.center;
  if (Number.isFinite(center?.lat) && Number.isFinite(center?.lon)) {
    return { lat: center.lat, lon: center.lon };
  }
  return null;
}

/**
 * @param {object} payload Overpass JSON.
 * @param {string[]} [kinds]
 * @returns {object[]}
 */
export function normalizeMoroccoPlaces(payload, kinds = undefined) {
  const allowed = new Set(normalizeMoroccoKinds(kinds));
  const elements = Array.isArray(payload?.elements) ? payload.elements : [];
  const records = [];
  const seen = new Set();
  for (const element of elements) {
    const tags = element?.tags && typeof element.tags === 'object' ? element.tags : {};
    const kind = classifyMoroccoTags(tags);
    if (!kind || !allowed.has(kind)) continue;
    const center = elementCenter(element);
    if (!center) continue;
    const id = `${element.type || 'nwr'}:${element.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const name = firstTag(tags, ['name:en', 'name:fr', 'name', 'name:ar', 'ref', 'iata', 'icao']);
    records.push({
      id,
      kind,
      name: name || MOROCCO_KIND_META[kind]?.label || kind,
      latitude: center.lat,
      longitude: center.lon,
      operator: firstTag(tags, ['operator', 'operator:en', 'network']),
      iata: firstTag(tags, ['iata']),
      icao: firstTag(tags, ['icao']),
      website: firstTag(tags, ['website', 'contact:website']),
      color: MOROCCO_KIND_META[kind]?.color || '#9ca6b0',
    });
    if (records.length >= MOROCCO_PLACE_ELEMENT_CAP) break;
  }
  return records;
}

export { MOROCCO_KIND_IDS };
