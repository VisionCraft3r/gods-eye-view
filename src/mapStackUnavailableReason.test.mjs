import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MapStackController, photorealUnavailableReason, photorealBingGlobeVisible, PHOTO_BING_GLOBE_HEIGHT_M } from './mapStackController.js';

test('missing photoreal credentials explain both supported setup routes', () => {
  assert.match(photorealUnavailableReason(false), /Needs GOOGLE_MAPS_API_KEY.*Provider Settings/);
  assert.match(photorealUnavailableReason(false), /Cesium ion token/);
});

test('a configured but failed photoreal route does not ask for another key', () => {
  const reason = photorealUnavailableReason(true);
  assert.match(reason, /unavailable.*restrictions, quota, or network/);
  assert.doesNotMatch(reason, /Needs|add it/);
});

test('controller credential detection accepts ion without a browser global', () => {
  const hasCredentials = MapStackController.prototype._hasPhotorealCredentials;
  assert.equal(hasCredentials.call({ cesiumToken: 'configured' }), true);
  assert.equal(hasCredentials.call({ cesiumToken: '   ' }), false);
});

test('Google 3D reveals Bing Labels only from orbit when ion is configured', () => {
  assert.equal(photorealBingGlobeVisible(600, true), false);
  assert.equal(photorealBingGlobeVisible(PHOTO_BING_GLOBE_HEIGHT_M, true), false);
  assert.equal(photorealBingGlobeVisible(PHOTO_BING_GLOBE_HEIGHT_M + 1, true), true);
  assert.equal(photorealBingGlobeVisible(2_000_000, true), true);
  assert.equal(photorealBingGlobeVisible(2_000_000, false), false);
  assert.equal(photorealBingGlobeVisible(Number.NaN, true), false);
});

test('photoreal ion stack loads Bing Labels under the Google 3D tileset', () => {
  const source = readFileSync(new URL('./mapStackController.js', import.meta.url), 'utf8');
  assert.match(source, /async _activatePhotoreal\(gen\) \{[\s\S]*?getStack\('bing-labels'\)/);
  assert.match(source, /_setPhotorealBingBlend\(true\)/);
  assert.match(
    source,
    /googleTileset\.show = !showGlobe/,
    'orbital Bing Labels replace Google 3D instead of clipping through it',
  );
});
