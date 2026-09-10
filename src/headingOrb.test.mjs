import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  HEADING_ORB_DRAG_PX_PER_TURN,
  OBLIQUE_VIEW_PITCH_DEG,
  NADIR_VIEW_PITCH_DEG,
  applyCameraHeading,
  applyCameraPitch,
  formatHeadingDegrees,
  headingFromPointerAngles,
  headingFromPointerDrag,
  isOblique3DView,
  nextObliqueViewPitch,
  pointerAngleFromCenter,
  wrapHeading,
} from './headingOrb.js';

test('heading wrap and labels cover a full 360°', () => {
  assert.equal(formatHeadingDegrees(0), '000°');
  assert.equal(formatHeadingDegrees(Math.PI / 2), '090°');
  assert.equal(formatHeadingDegrees(Math.PI), '180°');
  assert.ok(wrapHeading(-0.1) > 6);
  assert.equal(formatHeadingDegrees(wrapHeading(-0.0001)), '000°');
});

test('dragging around the orb changes heading by the pointer angle', () => {
  const rect = { left: 0, top: 0, width: 100, height: 100 };
  const east = pointerAngleFromCenter(100, 50, rect);
  const south = pointerAngleFromCenter(50, 100, rect);
  assert.ok(Math.abs(east) < 1e-9);
  assert.ok(Math.abs(south - Math.PI / 2) < 1e-9);
  const next = headingFromPointerAngles(0, east, south);
  assert.ok(Math.abs(next - Math.PI / 2) < 1e-9);
});

test('dragging the orb sideways covers a full 360° turn', () => {
  assert.equal(headingFromPointerDrag(0, 0, 0), 0);
  const half = headingFromPointerDrag(0, 0, HEADING_ORB_DRAG_PX_PER_TURN / 2);
  assert.ok(Math.abs(half - Math.PI) < 1e-9);
  const full = headingFromPointerDrag(0, 0, HEADING_ORB_DRAG_PX_PER_TURN);
  assert.ok(full < 1e-9 || Math.abs(full - Math.PI * 2) < 1e-9);
});

test('the heading orb ships on the zoom rail and StyleManager installs it', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  const ui = readFileSync(new URL('./ui.js', import.meta.url), 'utf8');
  const zoomBlock = html.slice(html.indexOf('id="zoom-slider"'), html.indexOf('id="top-center-actions"'));
  assert.match(zoomBlock, /id="camera-nav"/);
  assert.match(zoomBlock, /id="heading-orb-reset"/);
  assert.match(zoomBlock, /id="heading-orb-3d"/);
  assert.match(zoomBlock, /id="heading-orb"/);
  assert.match(zoomBlock, /id="heading-orb-well"/);
  assert.match(zoomBlock, /id="heading-orb-north"/);
  assert.match(zoomBlock, />N</);
  assert.match(css, /#camera-nav \{/);
  assert.match(css, /#heading-orb \{/);
  assert.match(css, /#heading-orb-reset/);
  assert.match(css, /#heading-orb-3d/);
  assert.match(css, /heading-orb-earth\.svg/);
  assert.match(ui, /installHeadingOrb\(this\.viewer/);
  assert.match(ui, /heading-orb-reset/);
});

test('applying heading orbits around the look-at instead of spinning in place', () => {
  const target = { x: 6378137, y: 0, z: 0 };
  const viewer = {
    trackedEntity: null,
    camera: {
      heading: 0.2,
      pitch: -0.6,
      roll: 0,
      position: { x: 6379137, y: 0, z: 0 },
      positionWC: { x: 6379137, y: 0, z: 0 },
      positionCartographic: { longitude: 0, latitude: 0, height: 1000 },
      cancelFlight() { this.cancelled = true; },
      pickEllipsoid() { return target; },
      lookAt(nextTarget, hpr) { this.look = { target: nextTarget, hpr }; },
      lookAtTransform() { this.unlocked = true; },
      setView() { this.view = true; },
    },
    scene: { canvas: { clientWidth: 800, clientHeight: 600 } },
  };
  assert.equal(applyCameraHeading(viewer, Math.PI / 2), true);
  assert.equal(viewer.camera.view, undefined);
  assert.equal(viewer.camera.unlocked, true);
  assert.ok(viewer.camera.look);
  assert.ok(Math.abs(viewer.camera.look.hpr.heading - Math.PI / 2) < 1e-9);
});

test('the 3D button tilts around the look-at and toggles back to nadir', () => {
  const nadir = Math.PI / -2;
  const oblique = (OBLIQUE_VIEW_PITCH_DEG * Math.PI) / 180;
  assert.equal(isOblique3DView(nadir), false);
  assert.equal(isOblique3DView(oblique), true);
  assert.ok(Math.abs(nextObliqueViewPitch(nadir) - oblique) < 1e-9);
  assert.ok(Math.abs(nextObliqueViewPitch(oblique) - nadir) < 1e-9);
  assert.equal(NADIR_VIEW_PITCH_DEG, -90);

  const target = { x: 6378137, y: 0, z: 0 };
  const viewer = {
    trackedEntity: null,
    camera: {
      heading: 0.2,
      pitch: nadir,
      roll: 0.1,
      position: { x: 6379137, y: 0, z: 0 },
      positionWC: { x: 6379137, y: 0, z: 0 },
      positionCartographic: { longitude: 0, latitude: 0, height: 1000 },
      cancelFlight() { this.cancelled = true; },
      pickEllipsoid() { return target; },
      lookAt(nextTarget, hpr) { this.look = { target: nextTarget, hpr }; },
      lookAtTransform() { this.unlocked = true; },
      setView() { this.view = true; },
    },
    scene: { canvas: { clientWidth: 800, clientHeight: 600 } },
  };
  assert.equal(applyCameraPitch(viewer, nextObliqueViewPitch(viewer.camera.pitch)), true);
  assert.equal(viewer.camera.cancelled, true);
  assert.equal(viewer.camera.unlocked, true);
  assert.ok(viewer.camera.look);
  assert.ok(Math.abs(viewer.camera.look.hpr.pitch - oblique) < 1e-9);
  assert.ok(Math.abs(viewer.camera.look.hpr.heading - 0.2) < 1e-9);
});
