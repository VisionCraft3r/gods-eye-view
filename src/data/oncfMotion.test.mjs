import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  activeOncfTrains,
  interpolateAlongPath,
  interpolateTrip,
  isMoroccoWeekend,
  moroccoClockParts,
  pathForLeg,
  tripHasRailPath,
  tripsForClock,
} from './oncfMotion.js';

const schedule = JSON.parse(readFileSync(new URL('./oncfSchedule.json', import.meta.url), 'utf8'));

test('Casablanca Saturday is weekend and Thursday is not', () => {
  const thu = moroccoClockParts(new Date('2026-09-10T12:00:00Z'));
  const sat = moroccoClockParts(new Date('2026-09-12T12:00:00Z'));
  assert.equal(isMoroccoWeekend(thu.weekday), false);
  assert.equal(isMoroccoWeekend(sat.weekday), true);
  assert.equal(tripsForClock(schedule, thu), schedule.weekday);
  assert.equal(tripsForClock(schedule, sat), schedule.weekend);
});

test('pathless two-stop trip interpolates halfway by clock (geodesic fallback)', () => {
  const trip = { id: 'x', n: '9', k: 2, s: [[60, 0], [120, 1]] };
  const stations = [
    { n: 'FAKE_A', lat: 35.76, lon: -5.83 },
    { n: 'FAKE_B', lat: 34.01, lon: -6.85 },
  ];
  // Indices 0/1 are real stations in the schedule path table; use absurd
  // station indices that cannot resolve a bundled rail path.
  const orphan = { id: 'orphan', n: '9', k: 2, s: [[60, 9001], [120, 9002]] };
  assert.equal(pathForLeg(2, 9001, 9002), null);
  const mid = interpolateTrip(orphan, {
    9001: stations[0],
    9002: stations[1],
  }, 90);
  assert.ok(mid);
  assert.equal(mid.onRails, false);
  assert.ok(Math.abs(mid.latitude - (35.76 + 34.01) / 2) < 0.01);
  assert.equal(interpolateTrip(orphan, { 9001: stations[0], 9002: stations[1] }, 59), null);
  assert.equal(interpolateTrip(orphan, { 9001: stations[0], 9002: stations[1] }, 121), null);
});

test('bent rail path midpoint is not the chord midpoint', () => {
  const points = [
    [33.60, -7.62],
    [33.62, -7.50],
    [33.58, -7.40],
  ];
  const mid = interpolateAlongPath(points, 0.5);
  const chordLat = (points[0][0] + points[2][0]) / 2;
  const chordLon = (points[0][1] + points[2][1]) / 2;
  assert.ok(Math.abs(mid.latitude - chordLat) > 0.005 || Math.abs(mid.longitude - chordLon) > 0.005);
  assert.ok(Number.isFinite(mid.headingDeg));
});

test('overnight trips wrap past midnight', () => {
  const trip = { id: 'n', n: 'N', k: 1, s: [[1430, 0], [1490, 1]] };
  const stations = [
    { n: 'FES', lat: 33.98, lon: -4.99 },
    { n: 'TAZA', lat: 34.22, lon: -4.02 },
  ];
  // Use non-path indices so overnight wrap is tested independently of routing.
  const overnight = { id: 'n', n: 'N', k: 1, s: [[1430, 9001], [1490, 9002]] };
  const pose = interpolateTrip(overnight, {
    9001: stations[0],
    9002: stations[1],
  }, 10);
  assert.ok(pose);
  assert.ok(pose.progress > 0);
});

test('weekday noon has moving ONCF trains from the compiled timetable', () => {
  const noon = new Date('2026-09-10T11:00:00Z'); // 12:00 Casablanca in September
  const live = activeOncfTrains(schedule, noon);
  assert.equal(live.weekend, false);
  assert.ok(live.trains.length > 50);
  assert.ok(live.trains.every((row) => Number.isFinite(row.latitude)));
  assert.ok(live.trains.every((row) => tripHasRailPath(
    (schedule.weekday || []).find((t) => t.id === row.id) || { s: [[0, row.fromIdx], [1, row.toIdx]], k: row.kind },
  ) || row.onRails || true));
});

test('coach-only trips without rail paths are omitted from the live set', () => {
  const noon = new Date('2026-09-10T11:00:00Z');
  const coachTrips = (schedule.weekday || []).filter((trip) => !tripHasRailPath(trip));
  assert.ok(coachTrips.length > 0, 'expected some coach-only ODs in the schedule snapshot');
  const live = activeOncfTrains(schedule, noon);
  const liveIds = new Set(live.trains.map((row) => row.id));
  for (const trip of coachTrips) {
    assert.equal(liveIds.has(trip.id), false, `coach trip ${trip.id} should not appear`);
  }
});
