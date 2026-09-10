import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MOROCCO_BOUNDS,
  clampMoroccoQueryBox,
  isInMorocco,
  normalizeMoroccoKinds,
} from './moroccoBounds.js';
import {
  buildMoroccoPlacesQuery,
  classifyMoroccoTags,
  normalizeMoroccoPlaces,
} from './moroccoPlacesData.js';
import {
  MOROCCO_ONCF_STOPS,
  MOROCCO_OURAIRPORTS,
  MOROCCO_UNESCO_SITES,
  mergeMoroccoPlaceRecords,
  moroccoStaticRecordsInBox,
} from './moroccoStaticPlaces.js';
import {
  describeWeatherCode,
  filterMoroccoQuakes,
  formatMoroccoCountryLine,
  parseAladhanTimings,
  pickNearestMetar,
} from './moroccoContextData.js';

test('Casablanca is inside Morocco and Austin is not', () => {
  assert.equal(isInMorocco(33.5731, -7.5898), true);
  assert.equal(isInMorocco(30.2672, -97.7431), false);
  assert.ok(MOROCCO_BOUNDS.north > MOROCCO_BOUNDS.south);
});

test('query boxes are clamped to Morocco and 8°', () => {
  const box = clampMoroccoQueryBox({
    south: 20, west: -20, north: 40, east: 5,
  });
  assert.ok(box);
  assert.ok(box.north - box.south <= 8.01);
  assert.ok(box.east - box.west <= 8.01);
  assert.equal(clampMoroccoQueryBox({ south: 10, west: 10, north: 12, east: 12 }), null);
});

test('Overpass QL for Morocco places stays bbox-bounded', () => {
  const ql = buildMoroccoPlacesQuery({
    south: 33.5, west: -7.8, north: 33.7, east: -7.5,
  }, ['airports', 'hospitals']);
  assert.match(ql, /aeroway"="aerodrome/);
  assert.match(ql, /amenity"="hospital/);
  assert.match(ql, /33\.5,-7\.8,33\.7,-7\.5/);
  assert.equal(normalizeMoroccoKinds(['airports', 'nope'])[0], 'airports');
  assert.equal(normalizeMoroccoKinds(['airports', 'nope']).length, 1);
});

test('OSM tags classify into Morocco place kinds', () => {
  assert.equal(classifyMoroccoTags({ aeroway: 'aerodrome' }), 'airports');
  assert.equal(classifyMoroccoTags({ amenity: 'place_of_worship', religion: 'muslim' }), 'mosques');
  assert.equal(classifyMoroccoTags({ natural: 'beach' }), 'beaches');
  const records = normalizeMoroccoPlaces({
    elements: [
      { type: 'node', id: 1, lat: 33.6, lon: -7.6, tags: { aeroway: 'aerodrome', name: 'CMN' } },
      { type: 'node', id: 2, lat: 33.6, lon: -7.6, tags: { amenity: 'cafe' } },
    ],
  }, ['airports']);
  assert.equal(records.length, 1);
  assert.equal(records[0].name, 'CMN');
});

test('ONCF, OurAirports, and UNESCO snapshots clip to a Casablanca box', () => {
  assert.ok(MOROCCO_ONCF_STOPS.length >= 20);
  assert.ok(MOROCCO_OURAIRPORTS.some((row) => row.icao === 'GMMN'));
  assert.ok(MOROCCO_UNESCO_SITES.some((row) => /Marrakesh|Marrakech/i.test(row.name)));
  const box = { south: 33.3, west: -7.8, north: 33.7, east: -7.4 };
  const stations = moroccoStaticRecordsInBox(box, ['stations']);
  assert.ok(stations.some((row) => /Casa/i.test(row.name)));
  const merged = mergeMoroccoPlaceRecords(stations, [{ id: stations[0].id, kind: 'stations', name: 'duplicate' }]);
  assert.equal(merged.filter((row) => row.id === stations[0].id).length, 1);
});

test('Morocco briefing helpers keep Canary quakes out and format country facts', () => {
  assert.equal(describeWeatherCode(0), 'Clear');
  assert.equal(formatMoroccoCountryLine({ name: 'Morocco', capital: 'Rabat', population: 38_000_000, currency: 'MAD' }).includes('Rabat'), true);
  const metar = pickNearestMetar([
    { icaoId: 'GMMN', lat: 33.367, lon: -7.59, rawOb: 'METAR GMMN', fltCat: 'VFR', temp: 22, wspd: 6, name: 'CMN' },
    { icaoId: 'GMAD', lat: 30.325, lon: -9.413, rawOb: 'METAR GMAD', fltCat: 'MVFR', temp: 21, wspd: 5, name: 'AGA' },
  ], 33.57, -7.59);
  assert.equal(metar.icao, 'GMMN');
  const prayer = parseAladhanTimings({ data: { timings: { Fajr: '05:01', Dhuhr: '13:27', Asr: '17:05', Maghrib: '19:45', Isha: '21:15' } } });
  assert.equal(prayer.fajr, '05:01');
  const quakes = filterMoroccoQuakes({
    features: [
      { properties: { mag: 1.9, lat: 31.1, lon: -7.2, flynn_region: 'MOROCCO' } },
      { properties: { mag: 3.1, lat: 28.15, lon: -16.22, flynn_region: 'CANARY ISLANDS, SPAIN REGION' } },
      { properties: { mag: 4.2, lat: 31.1, lon: -7.2, flynn_region: 'MOROCCO', time: '2026-09-10T00:00:00Z' } },
    ],
  });
  assert.equal(quakes.length, 1);
  assert.equal(quakes[0].mag, 4.2);
});

test('the Morocco flag sheet ships next to credits and StyleManager installs it', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../style.css', import.meta.url), 'utf8');
  const ui = readFileSync(new URL('../ui.js', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
  const locations = readFileSync(new URL('../locations.js', import.meta.url), 'utf8');
  assert.match(html, /id="morocco-pack"/);
  assert.match(html, /id="morocco-pack-flag"/);
  assert.match(html, /id="morocco-pack-sheet"/);
  assert.match(html, /id="morocco-pack-wiki"/);
  assert.match(css, /#morocco-pack \{/);
  assert.match(ui, /installMoroccoPack\(/);
  assert.match(main, /moroccoPlacesLayer/);
  assert.match(main, /oncfTrainsLayer/);
  assert.match(readFileSync(new URL('./moroccoAirportAircraft.js', import.meta.url), 'utf8'), /airplane\.glb/);
  assert.match(readFileSync(new URL('../../vite.config.js', import.meta.url), 'utf8'), /\/api\/morocco\/airport-aircraft/);
  assert.match(locations, /ouarzazate:/);
  assert.match(locations, /chefchaouen:/);
  assert.match(readFileSync(new URL('./layerState.js', import.meta.url), 'utf8'), /id: 'morocco'/);
});
