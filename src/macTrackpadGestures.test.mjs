import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TRACKPAD_GESTURE_ZOOM_GAIN,
  TRACKPAD_ZOOM_FACTOR,
  gestureScaleZoomMeters,
  macTrackpadZoomEventTypes,
  shouldPreventBrowserZoom,
} from './macTrackpadGestures.js';

const CameraEventType = { RIGHT_DRAG: 1, WHEEL: 2, PINCH: 3 };
const KeyboardEventModifier = { SHIFT: 0, CTRL: 1, ALT: 2 };

test('Mac pinch (Ctrl+wheel) is a globe zoom binding, not only two-finger scroll', () => {
  const types = macTrackpadZoomEventTypes(CameraEventType, KeyboardEventModifier);
  assert.equal(types.includes(CameraEventType.WHEEL), true);
  assert.equal(types.includes(CameraEventType.PINCH), true);
  assert.equal(types.includes(CameraEventType.RIGHT_DRAG), true);
  assert.deepEqual(
    types.find((item) => item?.eventType === CameraEventType.WHEEL),
    { eventType: CameraEventType.WHEEL, modifier: KeyboardEventModifier.CTRL },
  );
});

test('pinch and Safari gesture events block browser page zoom', () => {
  assert.equal(shouldPreventBrowserZoom({ type: 'wheel', ctrlKey: true }), true);
  assert.equal(shouldPreventBrowserZoom({ type: 'wheel', metaKey: true }), true);
  assert.equal(shouldPreventBrowserZoom({ type: 'wheel', ctrlKey: false }), false);
  assert.equal(shouldPreventBrowserZoom({ type: 'gesturestart' }), true);
  assert.equal(shouldPreventBrowserZoom({ type: 'gesturechange' }), true);
  assert.equal(shouldPreventBrowserZoom({ type: 'gestureend' }), true);
  assert.equal(shouldPreventBrowserZoom(null), false);
});

test('Safari pinch-out zooms in and pinch-in zooms out', () => {
  assert.ok(gestureScaleZoomMeters(1000, 1.1) > 0);
  assert.ok(gestureScaleZoomMeters(1000, 0.9) < 0);
  assert.equal(gestureScaleZoomMeters(1000, 1), 0);
  assert.equal(gestureScaleZoomMeters(Number.NaN, 1.1), 0);
  assert.equal(gestureScaleZoomMeters(1000, 0), 0);
  assert.equal(Math.round(gestureScaleZoomMeters(1000, 1.1)), 200);
  assert.equal(TRACKPAD_ZOOM_FACTOR, 10);
  assert.equal(TRACKPAD_GESTURE_ZOOM_GAIN, 2);
});

test('the viewer installs Mac trackpad zoom and the Mac app disables page pinch-zoom', () => {
  const main = readFileSync(new URL('./main.js', import.meta.url), 'utf8');
  const desktop = readFileSync(new URL('../desktop/main.mjs', import.meta.url), 'utf8');
  assert.match(main, /installMacTrackpadGestures\(viewer\)/);
  assert.match(desktop, /setVisualZoomLevelLimits\(1, 1\)/);
  assert.doesNotMatch(desktop, /role: 'zoomIn'/);
  assert.doesNotMatch(desktop, /role: 'zoomOut'/);
});
