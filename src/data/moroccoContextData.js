/**
 * Pure formatters for the Morocco pack live briefing.
 * Network stays in the Vite proxy; this module is unit-tested.
 */

import { isInMorocco } from './moroccoBounds.js';

const WMO_WEATHER = Object.freeze({
  0: 'Clear',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Icy fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  80: 'Rain showers',
  81: 'Showers',
  82: 'Heavy showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Severe thunderstorm',
});

export const MOROCCO_METAR_ICAOS = Object.freeze([
  'GMMN', 'GMMX', 'GMME', 'GMTT', 'GMAD', 'GMFF', 'GMFO', 'GMMW', 'GMMI', 'GMMZ',
]);

/**
 * @param {number} code
 * @returns {string}
 */
export function describeWeatherCode(code) {
  const key = Number(code);
  if (!Number.isFinite(key)) return '';
  return WMO_WEATHER[key] || 'Weather';
}

function distanceDeg2(lat1, lon1, lat2, lon2) {
  const dLat = lat1 - lat2;
  const dLon = lon1 - lon2;
  return (dLat * dLat) + (dLon * dLon);
}

/**
 * @param {object[]} rows AviationWeather.gov METAR JSON rows.
 * @param {number} latitude
 * @param {number} longitude
 */
export function pickNearestMetar(rows, latitude, longitude) {
  if (!Array.isArray(rows) || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  let best = null;
  let bestD = Infinity;
  for (const row of rows) {
    const lat = Number(row?.lat);
    const lon = Number(row?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const d = distanceDeg2(latitude, longitude, lat, lon);
    if (d < bestD) {
      bestD = d;
      best = row;
    }
  }
  if (!best) return null;
  return {
    icao: best.icaoId || '',
    name: best.name || '',
    raw: best.rawOb || '',
    fltCat: best.fltCat || '',
    tempC: Number.isFinite(Number(best.temp)) ? Number(best.temp) : null,
    windKt: Number.isFinite(Number(best.wspd)) ? Number(best.wspd) : null,
  };
}

/**
 * @param {object} payload Aladhan timings JSON.
 */
export function parseAladhanTimings(payload) {
  const timings = payload?.data?.timings;
  if (!timings || typeof timings !== 'object') return null;
  const fajr = String(timings.Fajr || '').trim();
  const dhuhr = String(timings.Dhuhr || '').trim();
  const asr = String(timings.Asr || '').trim();
  const maghrib = String(timings.Maghrib || '').trim();
  const isha = String(timings.Isha || '').trim();
  if (![fajr, dhuhr, asr, maghrib, isha].every(Boolean)) return null;
  return { fajr, dhuhr, asr, maghrib, isha };
}

/**
 * @param {object} geojson EMSC FDSN GeoJSON.
 */
export function filterMoroccoQuakes(geojson) {
  const features = Array.isArray(geojson?.features) ? geojson.features : [];
  const rows = [];
  for (const feature of features) {
    const props = feature?.properties || {};
    const lat = Number(props.lat ?? feature?.geometry?.coordinates?.[1]);
    const lon = Number(props.lon ?? feature?.geometry?.coordinates?.[0]);
    const mag = Number(props.mag);
    const region = String(props.flynn_region || '').toUpperCase();
    if (!isInMorocco(lat, lon) || region.includes('CANARY')) continue;
    if (!Number.isFinite(mag) || mag < 2.5) continue;
    rows.push({
      mag,
      region: props.flynn_region || 'Morocco',
      time: props.time || null,
      latitude: lat,
      longitude: lon,
    });
  }
  return rows.slice(0, 5);
}

/**
 * @param {object} payload MediaWiki geosearch JSON.
 */
export function wikiFromGeosearch(payload) {
  const rows = Array.isArray(payload?.query?.geosearch) ? payload.query.geosearch : [];
  return rows.slice(0, 6).map((row) => ({
    title: row.title,
    url: `https://en.wikipedia.org/?curid=${row.pageid}`,
    distanceM: Number(row.dist),
  }));
}

/**
 * @param {object|null} country
 */
export function formatMoroccoCountryLine(country) {
  if (!country) return 'Morocco';
  const parts = [country.name || 'Morocco'];
  if (country.capital) parts.push(`capital ${country.capital}`);
  if (Number.isFinite(country.population)) {
    const millions = country.population / 1_000_000;
    parts.push(`pop ${millions >= 10 ? millions.toFixed(0) : millions.toFixed(1)}M`);
  }
  if (country.currency) parts.push(country.currency);
  return parts.join(' · ');
}

/**
 * @param {object} current Open-Meteo current block.
 */
export function formatMoroccoWeather(current) {
  if (!current) return null;
  const temp = current.temperature_2m;
  const wind = current.wind_speed_10m;
  const code = describeWeatherCode(current.weather_code);
  const bits = [];
  if (temp != null && Number.isFinite(Number(temp))) bits.push(`${Math.round(Number(temp))}°C`);
  if (code) bits.push(code);
  if (wind != null && Number.isFinite(Number(wind))) bits.push(`wind ${Math.round(Number(wind))} km/h`);
  return bits.join(' · ') || null;
}

/**
 * @param {object} current Open-Meteo marine current block.
 */
export function formatMoroccoMarine(current) {
  if (!current) return null;
  const wave = current.wave_height;
  const sst = current.sea_surface_temperature;
  const bits = [];
  if (wave != null && Number.isFinite(Number(wave))) bits.push(`waves ${Number(wave).toFixed(1)} m`);
  if (sst != null && Number.isFinite(Number(sst))) bits.push(`SST ${Math.round(Number(sst))}°C`);
  return bits.join(' · ') || null;
}
