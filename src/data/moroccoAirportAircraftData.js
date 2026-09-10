/**
 * Assign live ADS-B / OpenSky contacts to Moroccan airports, and infer
 * remaining apron occupancy from OpenSky arrival/departure histories.
 * Surface ADS-B over Morocco is sparse; history fills parked aircraft.
 */

import { isInMorocco } from './moroccoBounds.js';
import { MOROCCO_OURAIRPORTS } from './moroccoStaticPlaces.js';

export const MOROCCO_AIRPORT_AIRCRAFT_MAX_PER_FIELD = 10;
export const MOROCCO_AIRPORT_AIRCRAFT_MAX_TOTAL = 64;
export const MOROCCO_AIRPORT_LIVE_RADIUS_KM = 4.2;
export const MOROCCO_AIRPORT_FLIGHT_ICAOS = Object.freeze([
  'GMMN', 'GMMX', 'GMME', 'GMTT', 'GMAD', 'GMFF', 'GMFO', 'GMMW',
]);

const EARTH_M = 6371000;

export function moroccoAirportCatalog() {
  return MOROCCO_OURAIRPORTS.filter((row) => row.kind === 'airports' && row.icao);
}

export function haversineKm(lat1, lon1, lat2, lon2) {
  const r1 = lat1 * Math.PI / 180;
  const r2 = lat2 * Math.PI / 180;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(r1) * Math.cos(r2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(a))) / 1000;
}

export function offsetMeters(lat, lon, eastM, northM) {
  const mPerDegLat = 111320;
  const mPerDegLon = 111320 * Math.cos(lat * Math.PI / 180);
  return {
    latitude: lat + northM / mPerDegLat,
    longitude: lon + eastM / Math.max(1e-6, mPerDegLon),
  };
}

/** Tiny apron grid just off the aerodrome reference point. */
export function apronStandPosition(airport, index) {
  const col = index % 4;
  const row = Math.floor(index / 4);
  const apron = offsetMeters(airport.latitude, airport.longitude, 210, 95);
  return offsetMeters(apron.latitude, apron.longitude, col * 46, row * 40);
}

export function nearestMoroccoAirport(lat, lon, airports = moroccoAirportCatalog()) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  let best = null;
  let bestKm = Infinity;
  for (const airport of airports) {
    const km = haversineKm(lat, lon, airport.latitude, airport.longitude);
    if (km < bestKm) {
      bestKm = km;
      best = airport;
    }
  }
  return best ? { airport: best, km: bestKm } : null;
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanCallsign(value) {
  const text = String(value || '').trim();
  return text || null;
}

function isGroundedOrTaxi(contact) {
  if (contact.onGround === true) return true;
  const speed = finiteNumber(contact.speedMps);
  const alt = finiteNumber(contact.altitudeM);
  if (speed !== null && speed < 18 && alt !== null && alt < 460) return true;
  if (speed !== null && speed < 8) return true;
  return false;
}

/**
 * @param {object[]} contacts lat/lon live tracks
 */
export function liveAircraftOnMoroccoAirports(contacts, airports = moroccoAirportCatalog()) {
  const out = [];
  for (const contact of contacts || []) {
    const lat = finiteNumber(contact.latitude);
    const lon = finiteNumber(contact.longitude);
    const icao24 = String(contact.icao24 || '').trim().toLowerCase();
    if (!icao24 || !isInMorocco(lat, lon) || !isGroundedOrTaxi(contact)) continue;
    const nearest = nearestMoroccoAirport(lat, lon, airports);
    if (!nearest || nearest.km > MOROCCO_AIRPORT_LIVE_RADIUS_KM) continue;
    out.push({
      id: `live:${icao24}`,
      icao24,
      callsign: cleanCallsign(contact.callsign),
      latitude: lat,
      longitude: lon,
      headingDeg: finiteNumber(contact.headingDeg) ?? 75,
      airportIcao: nearest.airport.icao,
      airportName: nearest.airport.name,
      source: 'live',
      onGround: true,
    });
  }
  return out;
}

function upsertEvent(map, row, kind) {
  const icao24 = String(row?.icao24 || '').trim().toLowerCase();
  const airport = String(row?.airport || row?.estArrivalAirport || row?.estDepartureAirport || '').trim().toUpperCase();
  const lastSeen = finiteNumber(row?.lastSeen);
  if (!icao24 || !airport || lastSeen === null) return;
  const prev = map.get(icao24);
  if (prev && prev.lastSeen >= lastSeen) return;
  map.set(icao24, {
    icao24,
    callsign: cleanCallsign(row.callsign),
    airport,
    kind,
    lastSeen,
  });
}

/**
 * Aircraft whose most recent airport event is an arrival are treated as still on the field.
 */
export function apronOccupancyFromFlights(arrivals, departures, airports = moroccoAirportCatalog()) {
  const last = new Map();
  for (const row of departures || []) {
    upsertEvent(last, { ...row, airport: row.estDepartureAirport || row.airport }, 'departure');
  }
  for (const row of arrivals || []) {
    upsertEvent(last, { ...row, airport: row.estArrivalAirport || row.airport }, 'arrival');
  }
  const byAirport = new Map(airports.map((airport) => [airport.icao, []]));
  for (const event of last.values()) {
    if (event.kind !== 'arrival') continue;
    const list = byAirport.get(event.airport);
    if (!list) continue;
    list.push(event);
  }
  const out = [];
  for (const airport of airports) {
    const events = (byAirport.get(airport.icao) || []).sort((a, b) => b.lastSeen - a.lastSeen);
    events.slice(0, MOROCCO_AIRPORT_AIRCRAFT_MAX_PER_FIELD).forEach((event, index) => {
      const stand = apronStandPosition(airport, index);
      out.push({
        id: `apron:${event.icao24}`,
        icao24: event.icao24,
        callsign: event.callsign,
        latitude: stand.latitude,
        longitude: stand.longitude,
        headingDeg: 75,
        airportIcao: airport.icao,
        airportName: airport.name,
        source: 'apron',
        onGround: true,
      });
    });
  }
  return out;
}

export function mergeMoroccoAirportAircraft(live, occupancy) {
  const seen = new Set();
  const perField = new Map();
  const out = [];
  for (const record of [...(live || []), ...(occupancy || [])]) {
    if (!record?.icao24 || seen.has(record.icao24)) continue;
    const field = record.airportIcao || 'UNK';
    const used = perField.get(field) || 0;
    if (used >= MOROCCO_AIRPORT_AIRCRAFT_MAX_PER_FIELD) continue;
    seen.add(record.icao24);
    perField.set(field, used + 1);
    out.push(record);
    if (out.length >= MOROCCO_AIRPORT_AIRCRAFT_MAX_TOTAL) break;
  }
  return out;
}

export function normalizeOpenSkyStates(payload) {
  const contacts = [];
  for (const state of payload?.states || []) {
    if (!Array.isArray(state) || state.length < 11) continue;
    contacts.push({
      icao24: state[0],
      callsign: state[1],
      longitude: state[5],
      latitude: state[6],
      altitudeM: state[7] ?? state[13],
      onGround: state[8] === true,
      speedMps: state[9],
      headingDeg: state[10],
    });
  }
  return contacts;
}

export function normalizeAdsbLolAircraft(payload) {
  const contacts = [];
  for (const aircraft of payload?.ac || []) {
    const onGround = aircraft?.alt_baro === 'ground';
    const altFt = onGround ? 0 : finiteNumber(aircraft?.alt_baro);
    contacts.push({
      icao24: aircraft?.hex,
      callsign: aircraft?.flight,
      latitude: aircraft?.lat,
      longitude: aircraft?.lon,
      altitudeM: altFt === null ? null : altFt * 0.3048,
      onGround,
      speedMps: finiteNumber(aircraft?.gs) === null ? null : aircraft.gs * 0.514444,
      headingDeg: finiteNumber(aircraft?.track),
    });
  }
  return contacts;
}
