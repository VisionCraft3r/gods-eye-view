import test from 'node:test';
import assert from 'node:assert/strict';
import {
  apronOccupancyFromFlights,
  apronStandPosition,
  liveAircraftOnMoroccoAirports,
  mergeMoroccoAirportAircraft,
  nearestMoroccoAirport,
  normalizeAdsbLolAircraft,
  normalizeOpenSkyStates,
} from './moroccoAirportAircraftData.js';

const GMMN = { icao: 'GMMN', name: 'Mohammed V', latitude: 33.3675, longitude: -7.58997, kind: 'airports' };
const GMMX = { icao: 'GMMX', name: 'Menara', latitude: 31.6048, longitude: -8.0358, kind: 'airports' };

test('Casablanca ARP snaps to GMMN and apron stands stay next to the field', () => {
  const near = nearestMoroccoAirport(33.3675, -7.58997, [GMMN, GMMX]);
  assert.equal(near.airport.icao, 'GMMN');
  const stand = apronStandPosition(GMMN, 0);
  assert.ok(Math.abs(stand.latitude - GMMN.latitude) < 0.01);
  assert.ok(Math.abs(stand.longitude - GMMN.longitude) < 0.01);
});

test('live contacts on the field are kept; Spain and airborne Morocco are dropped', () => {
  const live = liveAircraftOnMoroccoAirports([
    { icao24: '020111', callsign: 'RAM1', latitude: 33.3678, longitude: -7.5902, onGround: true, headingDeg: 170 },
    { icao24: 'abc123', callsign: 'TX03', latitude: 36.6135, longitude: -4.6594, onGround: true },
    { icao24: '020222', callsign: 'RAM2', latitude: 33.37, longitude: -7.59, onGround: false, altitudeM: 8000, speedMps: 200 },
  ], [GMMN, GMMX]);
  assert.equal(live.length, 1);
  assert.equal(live[0].airportIcao, 'GMMN');
  assert.equal(live[0].source, 'live');
});

test('OpenSky arrivals without a later departure occupy an apron stand', () => {
  const occupancy = apronOccupancyFromFlights(
    [{ icao24: '4d2243', callsign: 'RYR4YM', lastSeen: 100, estArrivalAirport: 'GMMX' }],
    [{ icao24: '4d2243', callsign: 'RYR4YM', lastSeen: 40, estDepartureAirport: 'EBCI' }],
    [GMMN, GMMX],
  );
  assert.equal(occupancy.length, 1);
  assert.equal(occupancy[0].airportIcao, 'GMMX');
  assert.equal(occupancy[0].source, 'apron');
});

test('a later departure clears the apron slot', () => {
  const occupancy = apronOccupancyFromFlights(
    [{ icao24: 'aa0001', lastSeen: 10, estArrivalAirport: 'GMMN' }],
    [{ icao24: 'aa0001', lastSeen: 50, estDepartureAirport: 'GMMN' }],
    [GMMN],
  );
  assert.equal(occupancy.length, 0);
});

test('live position wins over a synthetic stand for the same icao24', () => {
  const live = [{
    id: 'live:020111', icao24: '020111', callsign: 'RAM1',
    latitude: 33.3678, longitude: -7.5902, headingDeg: 10,
    airportIcao: 'GMMN', airportName: 'CMN', source: 'live', onGround: true,
  }];
  const occupancy = [{
    id: 'apron:020111', icao24: '020111', callsign: 'RAM1',
    latitude: 33.37, longitude: -7.58, headingDeg: 75,
    airportIcao: 'GMMN', airportName: 'CMN', source: 'apron', onGround: true,
  }];
  const merged = mergeMoroccoAirportAircraft(live, occupancy);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].source, 'live');
});

test('OpenSky and adsb.lol snapshots normalize into contacts', () => {
  const sky = normalizeOpenSkyStates({
    states: [['02010d', 'MAC102', 'Morocco', 1, 1, -5.96, 35.73, 200, true, 5, 80]],
  });
  assert.equal(sky[0].onGround, true);
  const adsb = normalizeAdsbLolAircraft({
    ac: [{ hex: 'abc', flight: 'TX03', lat: 35.7, lon: -5.9, alt_baro: 'ground', gs: 0, track: 12 }],
  });
  assert.equal(adsb[0].onGround, true);
});
