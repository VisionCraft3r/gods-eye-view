import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ZOOM_SLIDER_MAX_M,
  ZOOM_SLIDER_MIN_M,
  ZOOM_SLIDER_MODES,
  ZOOM_SLIDER_STEPS,
  applyCameraHeight,
  applyCameraZoom,
  applyZoomSliderTarget,
  clampZoomHeight,
  formatZoomAltitude,
  heightToZoomSlider,
  normalizeZoomSliderMode,
  zoomSliderToHeight,
} from './zoomSlider.js';

test('the zoom slider maps street level to the top and globe view to the bottom', () => {
  assert.equal(heightToZoomSlider(ZOOM_SLIDER_MIN_M), ZOOM_SLIDER_STEPS);
  assert.equal(heightToZoomSlider(ZOOM_SLIDER_MAX_M), 0);
  assert.ok(heightToZoomSlider(600) > heightToZoomSlider(18_000_000));
  const mid = zoomSliderToHeight(ZOOM_SLIDER_STEPS / 2);
  assert.ok(mid > ZOOM_SLIDER_MIN_M && mid < ZOOM_SLIDER_MAX_M);
  assert.equal(clampZoomHeight(1), ZOOM_SLIDER_MIN_M);
  assert.equal(clampZoomHeight(99_000_000), ZOOM_SLIDER_MAX_M);
});

test('slider height round-trips on a log scale', () => {
  for (const height of [30, 600, 80_000, 18_000_000]) {
    const back = zoomSliderToHeight(heightToZoomSlider(height));
    const ratio = back / height;
    assert.ok(ratio > 0.94 && ratio < 1.06, `${height}m round-tripped to ${back}m`);
  }
});

test('altitude readout stays short', () => {
  assert.equal(formatZoomAltitude(600), '600 m');
  assert.equal(formatZoomAltitude(12_000), '12 km');
  assert.equal(formatZoomAltitude(18_000_000), '18000 km');
  assert.equal(formatZoomAltitude(Number.NaN), '—');
});

test('the top-right zoom rail is in the page, stylesheet, and StyleManager', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  const ui = readFileSync(new URL('./ui.js', import.meta.url), 'utf8');
  assert.match(html, /id="zoom-slider"/);
  assert.match(html, /id="zoom-slider-range"/);
  assert.match(html, /aria-orientation="vertical"/);
  assert.match(css, /#zoom-slider \{/);
  assert.match(css, /body\.ui-clean-view #zoom-slider/);
  assert.match(ui, /installZoomSlider\(this\.viewer/);
  assert.match(ui, /#zoom-slider/);
});

test('the zoom rail ships camera mode first, then height mode', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  const cameraIdx = html.indexOf('data-zoom-mode="camera"');
  const heightIdx = html.indexOf('data-zoom-mode="height"');
  assert.ok(cameraIdx > 0 && heightIdx > cameraIdx);
  assert.match(html, /role="radiogroup"/);
  assert.match(html, />CAM</);
  assert.match(html, />HGT</);
  assert.match(css, /\.zoom-slider-modes \{/);
  assert.match(css, /\.zoom-slider-mode\.active \{/);
  assert.deepEqual([...ZOOM_SLIDER_MODES], ['camera', 'height']);
  assert.equal(normalizeZoomSliderMode('height'), 'height');
  assert.equal(normalizeZoomSliderMode('camera'), 'camera');
  assert.equal(normalizeZoomSliderMode('nope'), 'camera');
});

function mockViewer(height = 1000) {
  return {
    trackedEntity: null,
    camera: {
      heading: 0.2,
      pitch: -0.8,
      roll: 0,
      positionCartographic: { height, longitude: 0, latitude: 0 },
      position: { x: 6378137, y: 0, z: 0 },
      positionWC: { x: 6378137, y: 0, z: 0 },
      direction: { x: -0.7, y: 0, z: -0.7 },
      directionWC: { x: -0.7, y: 0, z: -0.7 },
      transform: null,
      cancelFlight() { this.cancelled = true; },
      lookAtTransform() { this.lookAtReset = true; },
      setView(opts) { this.view = opts; },
      zoomIn(delta) { this.zoomedIn = (this.zoomedIn || 0) + delta; },
      zoomOut(delta) { this.zoomedOut = (this.zoomedOut || 0) + delta; },
      move(_dir, amount) { this.moved = (this.moved || 0) + amount; },
    },
  };
}

test('camera zoom dollies along the look vector instead of elevator setView', () => {
  const viewer = mockViewer(1000);
  assert.equal(applyCameraZoom(viewer, 400), true);
  assert.equal(viewer.camera.view, undefined);
  assert.equal(viewer.camera.lookAtReset, undefined);
  assert.ok((viewer.camera.moved || 0) !== 0 || (viewer.camera.zoomedIn || 0) > 0);
});

test('height zoom uses setView at the same lat/lon', () => {
  const viewer = mockViewer(1000);
  assert.equal(applyCameraHeight(viewer, 400), true);
  assert.ok(viewer.camera.view);
  assert.equal(viewer.camera.lookAtReset, true);
  assert.equal(viewer.camera.moved, undefined);
});

test('the slider target follows the selected mode', () => {
  const cameraViewer = mockViewer(1000);
  applyZoomSliderTarget(cameraViewer, 400, 'camera');
  assert.equal(cameraViewer.camera.view, undefined);

  const heightViewer = mockViewer(1000);
  applyZoomSliderTarget(heightViewer, 400, 'height');
  assert.ok(heightViewer.camera.view);
});
