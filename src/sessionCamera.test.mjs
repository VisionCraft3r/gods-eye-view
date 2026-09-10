import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSessionCamera,
  SESSION_CAMERA_STORAGE_KEY,
} from './sessionCamera.js';

test('parseSessionCamera accepts Casablanca-like poses and rejects garbage', () => {
  const ok = parseSessionCamera({
    lat: 33.5731,
    lon: -7.5898,
    height: 1200,
    heading: 0.2,
    pitch: -0.5,
    locationId: 'casablanca',
  });
  assert.equal(ok.locationId, 'casablanca');
  assert.ok(ok.height > 0);
  assert.equal(parseSessionCamera({ lat: 999, lon: 0, height: 100, heading: 0, pitch: 0 }), null);
  assert.equal(SESSION_CAMERA_STORAGE_KEY.startsWith('gev:'), true);
});
