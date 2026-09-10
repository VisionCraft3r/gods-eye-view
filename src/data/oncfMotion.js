/**
 * Weekday/weekend ONCF timetable interpolation in Africa/Casablanca.
 * Positions are guessed from scheduled station times, not live GPS.
 */

export const ONCF_KIND_LABEL = Object.freeze(['TNR', 'Al Atlas', 'Al Boraq']);

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
 * @param {number[][]} stops [minutes, stationIndex]
 * @param {number} nowMin minutes from Casablanca midnight
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
  const latitude = a.lat + (b.lat - a.lat) * u;
  const longitude = a.lon + (b.lon - a.lon) * u;
  const km = haversineKm(a.lat, a.lon, b.lat, b.lon);
  const kmh = km / (span / 60);
  return {
    id: trip.id,
    number: trip.n,
    kind: trip.k,
    latitude,
    longitude,
    headingDeg: bearingDeg(a.lat, a.lon, b.lat, b.lon),
    kmh: Number.isFinite(trip.kmh) ? trip.kmh : kmh,
    from: a.n,
    to: b.n,
    progress: u,
  };
}

export function activeOncfTrains(schedule, date = new Date()) {
  const clock = moroccoClockParts(date);
  const trips = tripsForClock(schedule, clock) || [];
  const out = [];
  for (const trip of trips) {
    const pose = interpolateTrip(trip, schedule.stations, clock.minutes);
    if (pose) out.push(pose);
  }
  return { clock, weekend: isMoroccoWeekend(clock.weekday), trains: out };
}
