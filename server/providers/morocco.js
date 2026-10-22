import { MOROCCO_BOUNDS, normalizeMoroccoKinds } from '../../src/data/moroccoBounds.js';
import { buildMoroccoPlacesQuery, normalizeMoroccoPlaces } from '../../src/data/moroccoPlacesData.js';
import { mergeMoroccoPlaceRecords, moroccoStaticRecordsInBox } from '../../src/data/moroccoStaticPlaces.js';
import {
  MOROCCO_AIRPORT_FLIGHT_ICAOS,
  apronOccupancyFromFlights,
  liveAircraftOnMoroccoAirports,
  mergeMoroccoAirportAircraft,
  moroccoAirportCatalog,
  normalizeAdsbLolAircraft,
  normalizeOpenSkyStates,
} from '../../src/data/moroccoAirportAircraftData.js';
import {
  MOROCCO_METAR_ICAOS,
  filterMoroccoQuakes,
  parseAladhanTimings,
  pickNearestMetar,
  wikiFromGeosearch,
} from '../../src/data/moroccoContextData.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getOpenSkyToken } from './aircraft/opensky.js';
import { requiredFiniteQueryNumber } from './common/query.js';

function gevDiskPath(subdir, key) {
  const safe = String(key).replace(/[^a-z0-9._-]+/gi, '_').slice(0, 180);
  return path.join(process.cwd(), '.gev-cache', subdir, `${safe}.json`);
}

async function readGevDiskJson(subdir, key, maxAgeMs) {
  try {
    const payload = JSON.parse(await readFile(gevDiskPath(subdir, key), 'utf8'));
    if (!payload || payload.data === undefined || !Number.isFinite(payload.cachedAt)) return null;
    if (Date.now() - payload.cachedAt > maxAgeMs) return null;
    return payload;
  } catch {
    return null;
  }
}

function writeGevDiskJson(subdir, key, data) {
  const file = gevDiskPath(subdir, key);
  mkdir(path.dirname(file), { recursive: true })
    .then(() => writeFile(file, JSON.stringify({ cachedAt: Date.now(), data })))
    .catch((err) => console.warn(`[GEV cache] disk write failed (${subdir}):`, err?.message || err));
}


// ---------------------------------------------------------------------------
// Morocco pack: Overpass + snapshots + Open-Meteo / METAR / catalogs
// ---------------------------------------------------------------------------
const MOROCCO_PLACES_CACHE_MS = 15 * 60_000;
const MOROCCO_PLACES_MAX_CACHE = 48;
const MOROCCO_CONTEXT_CACHE_MS = 10 * 60_000;
const MOROCCO_AIRPORT_AIRCRAFT_CACHE_MS = 5 * 60_000;
const MOROCCO_FETCH_UA = 'gods-eye-view-morocco-pack/1.0';
const _moroccoPlacesCache = new Map();
const _moroccoPlacesInFlight = new Map();
const _moroccoContextCache = new Map();
let _moroccoAirportAircraftCache = null;
let _moroccoAirportAircraftInFlight = null;
let _moroccoCatalogCache = null;
let _moroccoCountryCache = null;

async function moroccoOpenSkyJson(url, timeoutMs = 8000) {
  const headers = { Accept: 'application/json', 'User-Agent': MOROCCO_FETCH_UA };
  const token = await getOpenSkyToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status === 404) return [];
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function loadMoroccoAirportAircraft() {
  const airports = moroccoAirportCatalog();
  const bbox = `lamin=${MOROCCO_BOUNDS.south}&lamax=${MOROCCO_BOUNDS.north}&lomin=${MOROCCO_BOUNDS.west}&lomax=${MOROCCO_BOUNDS.east}`;
  const hubs = [
    { lat: 33.37, lon: -7.59, dist: 220 },
    { lat: 31.60, lon: -8.04, dist: 180 },
    { lat: 35.73, lon: -5.92, dist: 160 },
    { lat: 30.32, lon: -9.41, dist: 160 },
  ];
  const [states, ...adsbHubs] = await Promise.all([
    moroccoOpenSkyJson(`https://opensky-network.org/api/states/all?${bbox}&extended=1`, 10000),
    ...hubs.map((hub) => moroccoJson(
      `https://api.adsb.lol/v2/lat/${hub.lat}/lon/${hub.lon}/dist/${hub.dist}`,
      8000,
    )),
  ]);
  const liveContacts = [
    ...normalizeOpenSkyStates(states && !Array.isArray(states) ? states : { states: [] }),
    ...adsbHubs.flatMap((payload) => normalizeAdsbLolAircraft(payload || { ac: [] })),
  ];
  const live = liveAircraftOnMoroccoAirports(liveContacts, airports);

  const end = Math.floor(Date.now() / 1000);
  const begin = end - 8 * 3600;
  const arrivals = [];
  const departures = [];
  for (const icao of MOROCCO_AIRPORT_FLIGHT_ICAOS) {
    const [arr, dep] = await Promise.all([
      moroccoOpenSkyJson(`https://opensky-network.org/api/flights/arrival?airport=${icao}&begin=${begin}&end=${end}`, 8000),
      moroccoOpenSkyJson(`https://opensky-network.org/api/flights/departure?airport=${icao}&begin=${begin}&end=${end}`, 8000),
    ]);
    if (Array.isArray(arr)) arrivals.push(...arr);
    if (Array.isArray(dep)) departures.push(...dep);
  }
  const occupancy = apronOccupancyFromFlights(arrivals, departures, airports);
  const records = mergeMoroccoAirportAircraft(live, occupancy);
  return {
    records,
    liveCount: live.length,
    apronCount: occupancy.length,
    source: 'OpenSky Network + adsb.lol',
    refreshSeconds: 300,
  };
}

export function validMoroccoPlaceBox(params) {
  const south = requiredFiniteQueryNumber(params, 'south');
  const west = requiredFiniteQueryNumber(params, 'west');
  const north = requiredFiniteQueryNumber(params, 'north');
  const east = requiredFiniteQueryNumber(params, 'east');
  if (![south, west, north, east].every(Number.isFinite)) return null;
  if (south < -90 || north > 90 || west < -180 || east > 180 || south >= north || west >= east) return null;
  if (north - south > 8 || east - west > 8) return null;
  if (north < MOROCCO_BOUNDS.south || south > MOROCCO_BOUNDS.north || east < MOROCCO_BOUNDS.west || west > MOROCCO_BOUNDS.east) {
    return null;
  }
  return { south, west, north, east };
}

function moroccoKindsFromQuery(params) {
  const raw = String(params.get('kinds') || '').split(',').map((value) => value.trim()).filter(Boolean);
  return normalizeMoroccoKinds(raw);
}

function moroccoJsonHeaders() {
  return { Accept: 'application/json', 'User-Agent': MOROCCO_FETCH_UA };
}

async function moroccoJson(url, timeoutMs = 7000) {
  try {
    const response = await fetch(url, {
      headers: moroccoJsonHeaders(),
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function moroccoDateDdMmYyyy() {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Casablanca',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date()).replace(/\//g, '-');
}

function snapshotPlacesPayload(box, kinds, error = null) {
  const records = moroccoStaticRecordsInBox(box, kinds);
  return {
    records,
    source: 'ONCF GTFS + OurAirports + UNESCO',
    error,
  };
}

async function loadMoroccoCatalog() {
  if (_moroccoCatalogCache && (Date.now() - _moroccoCatalogCache.at) < 60 * 60_000) {
    return _moroccoCatalogCache.items;
  }
  const items = [];
  const gov = await moroccoJson('https://data.gov.ma/data/api/3/action/package_search?rows=12&sort=metadata_modified+desc', 8000);
  for (const pack of gov?.result?.results || []) {
    items.push({
      title: pack.title || pack.name,
      url: pack.name ? `https://data.gov.ma/data/dataset/${pack.name}` : 'https://data.gov.ma/',
      source: 'data.gov.ma',
    });
  }
  const hdx = await moroccoJson('https://data.humdata.org/api/3/action/package_search?q=morocco&rows=6', 8000);
  for (const pack of hdx?.result?.results || []) {
    items.push({
      title: pack.title || pack.name,
      url: pack.name ? `https://data.humdata.org/dataset/${pack.name}` : 'https://data.humdata.org/',
      source: 'HDX',
    });
  }
  _moroccoCatalogCache = { at: Date.now(), items };
  return items;
}

async function loadMoroccoCountry() {
  if (_moroccoCountryCache && (Date.now() - _moroccoCountryCache.at) < 24 * 60 * 60_000) {
    return _moroccoCountryCache.value;
  }
  const json = await moroccoJson('https://restcountries.com/v3.1/alpha/ma?fields=name,capital,population,area,currencies,languages', 6000);
  const row = Array.isArray(json) ? json[0] : json;
  let population = Number(row?.population);
  if (!Number.isFinite(population)) {
    const bank = await moroccoJson('https://api.worldbank.org/v2/country/MAR/indicator/SP.POP.TOTL?format=json&mrnev=1', 6000);
    population = Number(Array.isArray(bank) ? bank[1]?.[0]?.value : NaN);
  }
  const currencyCode = row?.currencies ? Object.keys(row.currencies)[0] : 'MAD';
  const value = {
    name: row?.name?.common || 'Morocco',
    capital: Array.isArray(row?.capital) ? row.capital[0] : 'Rabat',
    population: Number.isFinite(population) ? population : null,
    areaKm2: Number(row?.area) || null,
    currency: currencyCode || 'MAD',
  };
  if (row?.name?.common) _moroccoCountryCache = { at: Date.now(), value };
  return value;
}

export function moroccoProxy() {
  function install(middlewares) {
    middlewares.use('/api/morocco/places', async (req, res) => {
      try {
        if (req.method !== 'GET') {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method Not Allowed' }));
          return;
        }
        const url = new URL(req.url, 'http://127.0.0.1');
        const box = validMoroccoPlaceBox(url.searchParams);
        if (!box) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'A Morocco bbox no larger than 8 degrees is required' }));
          return;
        }
        const kinds = moroccoKindsFromQuery(url.searchParams);
        const key = `${box.south.toFixed(3)},${box.west.toFixed(3)},${box.north.toFixed(3)},${box.east.toFixed(3)}|${kinds.join(',')}`;
        const hit = _moroccoPlacesCache.get(key);
        if (hit && Date.now() - hit.at < MOROCCO_PLACES_CACHE_MS) {
          res.writeHead(200, { 'Content-Type': 'application/json', 'X-GEV-Cache': 'MEM', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify(hit.payload));
          return;
        }
        const diskHit = await readGevDiskJson('morocco/places', key, 12 * 60 * 60_000);
        if (diskHit) {
          _moroccoPlacesCache.set(key, { at: diskHit.cachedAt, payload: diskHit.data });
          res.writeHead(200, { 'Content-Type': 'application/json', 'X-GEV-Cache': 'DISK', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify(diskHit.data));
          return;
        }
        if (_moroccoPlacesInFlight.has(key)) {
          const payload = await _moroccoPlacesInFlight.get(key);
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify(payload));
          return;
        }
        const ql = buildMoroccoPlacesQuery(box, kinds);
        const pending = (async () => {
          const extra = moroccoStaticRecordsInBox(box, kinds);
          if (!ql) {
            return { records: extra, source: 'ONCF GTFS + OurAirports + UNESCO' };
          }
          try {
            let timer = null;
            const upstream = await Promise.race([
              fetchOverpassPayload(`data=${encodeURIComponent(ql)}`),
              new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error('overpass-timeout')), 9000);
              }),
            ]).finally(() => { if (timer) clearTimeout(timer); });
            if (upstream.status >= 400 || upstream.rateLimited || upstream.runtimeError) {
              return snapshotPlacesPayload(box, kinds, 'Overpass unavailable');
            }
            const parsed = JSON.parse(upstream.body);
            const live = normalizeMoroccoPlaces(parsed, kinds);
            return {
              records: mergeMoroccoPlaceRecords(extra, live),
              source: 'OpenStreetMap Overpass + ONCF + OurAirports + UNESCO',
            };
          } catch {
            return snapshotPlacesPayload(box, kinds, 'Overpass unavailable');
          }
        })();
        _moroccoPlacesInFlight.set(key, pending);
        try {
          const payload = await pending;
          _moroccoPlacesCache.set(key, { at: Date.now(), payload });
          writeGevDiskJson('morocco/places', key, payload);
          while (_moroccoPlacesCache.size > MOROCCO_PLACES_MAX_CACHE) {
            const oldest = _moroccoPlacesCache.keys().next().value;
            _moroccoPlacesCache.delete(oldest);
          }
          res.writeHead(200, { 'Content-Type': 'application/json', 'X-GEV-Cache': 'MISS', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify(payload));
        } finally {
          _moroccoPlacesInFlight.delete(key);
        }
      } catch (error) {
        const url = new URL(req.url, 'http://127.0.0.1');
        const box = validMoroccoPlaceBox(url.searchParams);
        const kinds = moroccoKindsFromQuery(url.searchParams);
        if (box) {
          const payload = snapshotPlacesPayload(box, kinds, 'Morocco places are temporarily unavailable');
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify(payload));
          return;
        }
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Morocco places are temporarily unavailable', records: [] }));
      }
    });

    middlewares.use('/api/morocco/context', async (req, res) => {
      try {
        if (req.method !== 'GET') {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method Not Allowed' }));
          return;
        }
        const url = new URL(req.url, 'http://127.0.0.1');
        const lat = Number(url.searchParams.get('lat'));
        const lon = Number(url.searchParams.get('lon'));
        const safeLat = Number.isFinite(lat) ? lat : 31.8;
        const safeLon = Number.isFinite(lon) ? lon : -7.1;
        const cell = `${safeLat.toFixed(1)},${safeLon.toFixed(1)}`;
        const hit = _moroccoContextCache.get(cell);
        if (hit && Date.now() - hit.at < MOROCCO_CONTEXT_CACHE_MS) {
          res.writeHead(200, { 'Content-Type': 'application/json', 'X-GEV-Cache': 'MEM', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify(hit.payload));
          return;
        }
        const diskHit = await readGevDiskJson('morocco/context', cell, 45 * 60_000);
        if (diskHit) {
          _moroccoContextCache.set(cell, { at: diskHit.cachedAt, payload: diskHit.data });
          res.writeHead(200, { 'Content-Type': 'application/json', 'X-GEV-Cache': 'DISK', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify(diskHit.data));
          return;
        }
        const [airRes, weatherRes, marineRes, metarRes, prayerRes, wikiRes, quakeRes, country, catalog] = await Promise.all([
          moroccoJson(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${safeLat}&longitude=${safeLon}&current=pm10,pm2_5,european_aqi,us_aqi`, 6000),
          moroccoJson(`https://api.open-meteo.com/v1/forecast?latitude=${safeLat}&longitude=${safeLon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,precipitation&daily=sunrise,sunset&timezone=Africa%2FCasablanca`, 6000),
          moroccoJson(`https://marine-api.open-meteo.com/v1/marine?latitude=${safeLat}&longitude=${safeLon}&current=wave_height,wave_direction,wave_period,sea_surface_temperature`, 6000),
          moroccoJson(`https://aviationweather.gov/api/data/metar?ids=${MOROCCO_METAR_ICAOS.join(',')}&format=json`, 7000),
          moroccoJson(`https://api.aladhan.com/v1/timings/${moroccoDateDdMmYyyy()}?latitude=${safeLat}&longitude=${safeLon}&method=21`, 6000),
          moroccoJson(`https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${encodeURIComponent(`${safeLat}|${safeLon}`)}&gsradius=10000&gslimit=6&format=json`, 7000),
          moroccoJson(`https://www.seismicportal.eu/fdsnws/event/1/query?format=json&minlat=${MOROCCO_BOUNDS.south}&maxlat=${MOROCCO_BOUNDS.north}&minlon=${MOROCCO_BOUNDS.west}&maxlon=${MOROCCO_BOUNDS.east}&limit=20&orderby=time&minmag=2.5`, 7000),
          loadMoroccoCountry(),
          loadMoroccoCatalog(),
        ]);
        const current = airRes?.current || {};
        const wx = weatherRes?.current || {};
        const marine = marineRes?.current || {};
        const payload = {
          country,
          catalog,
          airQuality: {
            usAqi: Number(current.us_aqi),
            europeanAqi: Number(current.european_aqi),
            pm25: Number(current.pm2_5),
            pm10: Number(current.pm10),
            time: current.time || null,
          },
          weather: {
            temperatureC: Number(wx.temperature_2m),
            humidity: Number(wx.relative_humidity_2m),
            weatherCode: Number(wx.weather_code),
            windKmh: Number(wx.wind_speed_10m),
            precipitationMm: Number(wx.precipitation),
            sunrise: weatherRes?.daily?.sunrise?.[0] || null,
            sunset: weatherRes?.daily?.sunset?.[0] || null,
          },
          marine: {
            waveHeightM: Number(marine.wave_height),
            wavePeriodS: Number(marine.wave_period),
            sstC: Number(marine.sea_surface_temperature),
          },
          metar: pickNearestMetar(Array.isArray(metarRes) ? metarRes : [], safeLat, safeLon),
          prayer: parseAladhanTimings(prayerRes),
          quakes: filterMoroccoQuakes(quakeRes),
          wikipedia: wikiFromGeosearch(wikiRes),
        };
        _moroccoContextCache.set(cell, { at: Date.now(), payload });
        writeGevDiskJson('morocco/context', cell, payload);
        res.writeHead(200, { 'Content-Type': 'application/json', 'X-GEV-Cache': 'MISS', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(payload));
      } catch (error) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Morocco context unavailable' }));
      }
    });

    middlewares.use('/api/morocco/airport-aircraft', async (req, res) => {
      try {
        if (req.method !== 'GET') {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method Not Allowed' }));
          return;
        }
        const now = Date.now();
        if (_moroccoAirportAircraftCache && now - _moroccoAirportAircraftCache.at < MOROCCO_AIRPORT_AIRCRAFT_CACHE_MS) {
          res.writeHead(200, { 'Content-Type': 'application/json', 'X-GEV-Cache': 'MEM', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify(_moroccoAirportAircraftCache.payload));
          return;
        }
        const diskHit = await readGevDiskJson('morocco/airport-aircraft', 'latest', 30 * 60_000);
        if (diskHit) {
          _moroccoAirportAircraftCache = { at: diskHit.cachedAt, payload: diskHit.data };
          res.writeHead(200, { 'Content-Type': 'application/json', 'X-GEV-Cache': 'DISK', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify(diskHit.data));
          return;
        }
        if (_moroccoAirportAircraftInFlight) {
          const payload = await _moroccoAirportAircraftInFlight;
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify(payload));
          return;
        }
        _moroccoAirportAircraftInFlight = loadMoroccoAirportAircraft();
        try {
          const payload = await _moroccoAirportAircraftInFlight;
          _moroccoAirportAircraftCache = { at: Date.now(), payload };
          writeGevDiskJson('morocco/airport-aircraft', 'latest', payload);
          res.writeHead(200, { 'Content-Type': 'application/json', 'X-GEV-Cache': 'MISS', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify(payload));
        } finally {
          _moroccoAirportAircraftInFlight = null;
        }
      } catch {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          records: [],
          source: 'OpenSky + adsb.lol',
          error: 'Morocco airport aircraft unavailable',
          refreshSeconds: 300,
        }));
      }
    });
  }

  return {
    name: 'morocco-pack-proxy',
    configureServer(server) {
      install(server.middlewares);
    },
    configurePreviewServer(server) {
      install(server.middlewares);
    },
  };
}
