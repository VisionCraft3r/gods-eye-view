import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  activeOncfTrains,
  interpolateTrip,
  isMoroccoWeekend,
  moroccoClockParts,
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

test('a two-stop trip interpolates halfway by clock', () => {
  const trip = { id: 'x', n: '9', k: 2, s: [[60, 0], [120, 1]] };
  const stations = [
    { n: 'TANGER VILLE', lat: 35.76, lon: -5.83 },
    { n: 'RABAT AGDAL', lat: 34.01, lon: -6.85 },
  ];
  const mid = interpolateTrip(trip, stations, 90);
  assert.ok(mid);
  assert.ok(Math.abs(mid.latitude - (35.76 + 34.01) / 2) < 0.01);
  assert.equal(interpolateTrip(trip, stations, 59), null);
  assert.equal(interpolateTrip(trip, stations, 121), null);
});

test('overnight trips wrap past midnight', () => {
  const trip = { id: 'n', n: 'N', k: 1, s: [[1430, 0], [1490, 1]] };
  const stations = [
    { n: 'FES', lat: 33.98, lon: -4.99 },
    { n: 'TAZA', lat: 34.22, lon: -4.02 },
  ];
  const pose = interpolateTrip(trip, stations, 10);
  assert.ok(pose);
  assert.ok(pose.progress > 0);
});

test('weekday noon has moving ONCF trains from the compiled timetable', () => {
  const noon = new Date('2026-09-10T11:00:00Z'); // 12:00 Casablanca in September
  const live = activeOncfTrains(schedule, noon);
  assert.equal(live.weekend, false);
  assert.ok(live.trains.length > 50);
  assert.ok(live.trains.every((row) => Number.isFinite(row.latitude)));
});
