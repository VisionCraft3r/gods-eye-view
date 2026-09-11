/**
 * Weekday/weekend ONCF timetable interpolation in Africa/Casablanca.
 * Positions follow bundled OSM rail paths when available; otherwise a
 * geodesic chord between timetable stops. Not live GPS.
 */

import pathsBundle from './oncfPaths.json' with { type: 'json' };

export const ONCF_KIND_LABEL = Object.freeze(['TNR', 'Al Atlas', 'Al Boraq']);

/** @type {Record<string, number[][]>} */
const PATHS = pathsBundle?.paths || {};

function part(parts, type) {
  return parts.find((entry) => entry.type === type)?.value || '';
}

export function moroccoClockParts(date = new Date(), timeZone = 'Africa/Casablanca') {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = Number(part(parts, 'hour'));
  const minute = Number(part(parts, 'minute'));
  const second = Number(part(parts, 'second'));
  return {
    weekday: part(parts, 'weekday'),
    hour,
    minute,
    second,
    minutes: hour * 60 + minute + second / 60,
  };
}

export function isMoroccoWeekend(weekday) {
  return weekday === 'Sat' || weekday === 'Sun';
}

export function haversineKm(lat1, lon1, lat2, lon2) {
  const r1 = lat1 * Math.PI / 180;
  const r2 = lat2 * Math.PI / 180;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(r1) * Math.cos(r2) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function bearingDeg(lat1, lon1, lat2, lon2) {
  const r1 = lat1 * Math.PI / 180;
  const r2 = lat2 * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(r2);
  const x = Math.cos(r1) * Math.sin(r2) - Math.sin(r1) * Math.cos(r2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

export function tripsForClock(schedule, clock) {
  const weekend = isMoroccoWeekend(clock.weekday);
  return weekend ? schedule.weekend : schedule.weekday;
}

/**
 * Resolve a directed polyline for a timetable OD, preferring the trip kind
 * then falling back across kinds / reverse geometry.
 * @param {number} kind
 * @param {number} fromIdx
 * @param {number} toIdx
 * @returns {{ points: number[][], reversed: boolean }|null}
 */
export function pathForLeg(kind, fromIdx, toIdx) {
  const k = Number(kind);
  const a = Number(fromIdx);
  const b = Number(toIdx);
  const directKeys = [`${k}:${a}:${b}`, `1:${a}:${b}`, `0:${a}:${b}`, `2:${a}:${b}`];
  for (const key of directKeys) {
    const pts = PATHS[key];
    if (Array.isArray(pts) && pts.length >= 2) return { points: pts, reversed: false };
  }
  const reverseKeys = [`${k}:${b}:${a}`, `1:${b}:${a}`, `0:${b}:${a}`, `2:${b}:${a}`];
  for (const key of reverseKeys) {
    const pts = PATHS[key];
    if (Array.isArray(pts) && pts.length >= 2) {
      return { points: pts.slice().reverse(), reversed: true };
    }
  }
  return null;
}

/**
 * Walk fraction u∈[0,1] along a polyline by cumulative geodesic length.
 * @param {number[][]} points [[lat,lon],…]
 * @param {number} u
 * @returns {{ latitude: number, longitude: number, headingDeg: number, pathKm: number }}
 */
export function interpolateAlongPath(points, u) {
  if (!Array.isArray(points) || points.length < 2) {
    return { latitude: NaN, longitude: NaN, headingDeg: 0, pathKm: 0 };
  }
  const segKm = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [lat0, lon0] = points[i];
    const [lat1, lon1] = points[i + 1];
    const d = haversineKm(lat0, lon0, lat1, lon1);
    segKm.push(d);
    total += d;
  }
  if (!(total > 0)) {
    const [lat, lon] = points[points.length - 1];
    const prev = points[Math.max(0, points.length - 2)];
    return {
      latitude: lat,
      longitude: lon,
      headingDeg: bearingDeg(prev[0], prev[1], lat, lon),
      pathKm: 0,
    };
  }
  const target = Math.min(1, Math.max(0, u)) * total;
  let walked = 0;
  for (let i = 0; i < segKm.length; i += 1) {
    const d = segKm[i];
    if (walked + d >= target || i === segKm.length - 1) {
      const local = d > 0 ? Math.min(1, Math.max(0, (target - walked) / d)) : 0;
      const [lat0, lon0] = points[i];
      const [lat1, lon1] = points[i + 1];
      return {
        latitude: lat0 + (lat1 - lat0) * local,
        longitude: lon0 + (lon1 - lon0) * local,
        headingDeg: bearingDeg(lat0, lon0, lat1, lon1),
        pathKm: total,
      };
    }
    walked += d;
  }
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  return {
    latitude: last[0],
    longitude: last[1],
    headingDeg: bearingDeg(prev[0], prev[1], last[0], last[1]),
    pathKm: total,
  };
}

/**
 * True when a trip has at least one OD leg with a bundled rail path.
 * Coach-only itineraries (Essaouira, Tétouan, …) return false.
 */
export function tripHasRailPath(trip) {
  const stops = trip?.s || [];
  if (stops.length < 2) return false;
  const kind = trip.k;
  for (let i = 0; i < stops.length - 1; i += 1) {
    if (pathForLeg(kind, stops[i][1], stops[i + 1][1])) return true;
  }
  return false;
}

/**
 * @param {object} trip
 * @param {object[]} stations
 * @param {number} nowMin minutes from Casablanca midnight
 * @returns {object|null}
 */
export function interpolateTrip(trip, stations, nowMin) {
  const stops = trip?.s || [];
  if (stops.length < 2) return null;
  const start = stops[0][0];
  const end = stops[stops.length - 1][0];
  let t = nowMin;
  if (end >= 1440 && t < start) t += 1440;
  if (t < start || t > end) return null;
  let i = 0;
  while (i < stops.length - 2 && t > stops[i + 1][0]) i += 1;
  const [t0, s0] = stops[i];
  const [t1, s1] = stops[i + 1];
  const a = stations[s0];
  const b = stations[s1];
  if (!a || !b) return null;
  const span = Math.max(1, t1 - t0);
  const u = Math.min(1, Math.max(0, (t - t0) / span));

  const routed = pathForLeg(trip.k, s0, s1);
  let latitude;
  let longitude;
  let heading;
  let pathKm;
  let onRails = false;
  if (routed) {
    const pose = interpolateAlongPath(routed.points, u);
    latitude = pose.latitude;
    longitude = pose.longitude;
    heading = pose.headingDeg;
    pathKm = pose.pathKm;
    onRails = true;
  } else {
    latitude = a.lat + (b.lat - a.lat) * u;
    longitude = a.lon + (b.lon - a.lon) * u;
    heading = bearingDeg(a.lat, a.lon, b.lat, b.lon);
    pathKm = haversineKm(a.lat, a.lon, b.lat, b.lon);
  }

  const kmh = pathKm / (span / 60);
  return {
    id: trip.id,
    number: trip.n,
    kind: trip.k,
    kindLabel: ONCF_KIND_LABEL[trip.k] || ONCF_KIND_LABEL[1],
    latitude,
    longitude,
    headingDeg: heading,
    kmh: Number.isFinite(trip.kmh) ? trip.kmh : kmh,
    from: a.n,
    to: b.n,
    fromIdx: s0,
    toIdx: s1,
    progress: u,
    onRails,
  };
}

export function activeOncfTrains(schedule, date = new Date()) {
  const clock = moroccoClockParts(date);
  const trips = tripsForClock(schedule, clock) || [];
  const out = [];
  for (const trip of trips) {
    // Drop coach-only itineraries that never touch a routed rail leg.
    if (!tripHasRailPath(trip)) continue;
    const pose = interpolateTrip(trip, schedule.stations, clock.minutes);
    if (pose) out.push(pose);
  }
  return { clock, weekend: isMoroccoWeekend(clock.weekday), trains: out };
}

export function casablancaClockLabel(date = new Date()) {
  const clock = moroccoClockParts(date);
  const hh = String(clock.hour).padStart(2, '0');
  const mm = String(clock.minute).padStart(2, '0');
  const ss = String(clock.second).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}
