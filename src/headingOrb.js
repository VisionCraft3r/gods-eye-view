/**
 * Mini earth on the zoom rail — drag it like a turntable to yaw the camera
 * a full 360° around the point you are looking at.
 */

import * as Cesium from 'cesium';
import { isPickedWorldPosition } from './data/scenePick.js';
import {
  governorRequestRender,
  holdContinuousRender,
  releaseContinuousRender,
} from './renderGovernor.js';

export const HEADING_ORB_WHEEL_STEP_RAD = Cesium.Math.toRadians(8);
export const HEADING_ORB_KEY_STEP_RAD = Cesium.Math.toRadians(5);
/** 180 px of drag = one full 360° turn. */
export const HEADING_ORB_DRAG_PX_PER_TURN = 180;
/** Look-down angle for the 3D perspective toggle (0 = horizon, −90 = nadir). */
export const OBLIQUE_VIEW_PITCH_DEG = -45;
export const NADIR_VIEW_PITCH_DEG = -90;
/** Pitch above this (closer to the horizon) counts as the 3D angled view. */
export const OBLIQUE_VIEW_PITCH_THRESHOLD_DEG = -70;
export const OBLIQUE_VIEW_DURATION_S = 0.85;

const scratchCenter = new Cesium.Cartesian2();
const scratchHpr = new Cesium.HeadingPitchRange();

/**
 * @param {number} radians
 * @returns {number}
 */
export function wrapHeading(radians) {
  if (!Number.isFinite(radians)) return 0;
  return Cesium.Math.zeroToTwoPi(radians);
}

/**
 * @param {number} radians
 * @returns {string}
 */
export function formatHeadingDegrees(radians) {
  const deg = Math.round(Cesium.Math.toDegrees(wrapHeading(radians))) % 360;
  return `${String(deg).padStart(3, '0')}°`;
}

/**
 * Screen-space angle from a control's center, radians, atan2 style.
 * @param {number} clientX
 * @param {number} clientY
 * @param {DOMRect} rect
 * @returns {number}
 */
export function pointerAngleFromCenter(clientX, clientY, rect) {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  return Math.atan2(clientY - cy, clientX - cx);
}

/**
 * Dragging the orb right increases heading (clockwise compass).
 * @param {number} startHeading
 * @param {number} startX
 * @param {number} clientX
 * @returns {number}
 */
export function headingFromPointerDrag(startHeading, startX, clientX) {
  const turns = (clientX - startX) / HEADING_ORB_DRAG_PX_PER_TURN;
  return wrapHeading(startHeading + turns * Cesium.Math.TWO_PI);
}

/**
 * Spinning the orb clockwise increases heading (compass convention).
 * @param {number} startHeading
 * @param {number} startAngle
 * @param {number} currentAngle
 * @returns {number}
 */
export function headingFromPointerAngles(startHeading, startAngle, currentAngle) {
  return wrapHeading(startHeading + (currentAngle - startAngle));
}

/**
 * @param {import('cesium').Viewer} viewer
 * @returns {import('cesium').Cartesian3 | null}
 */
export function resolveHeadingOrbitTarget(viewer) {
  const camera = viewer?.camera;
  const scene = viewer?.scene;
  const canvas = scene?.canvas;
  const width = canvas?.clientWidth || canvas?.width || 0;
  const height = canvas?.clientHeight || canvas?.height || 0;
  if (camera && width && height && typeof camera.pickEllipsoid === 'function') {
    scratchCenter.x = width / 2;
    scratchCenter.y = height / 2;
    try {
      const hit = camera.pickEllipsoid(scratchCenter, Cesium.Ellipsoid.WGS84);
      if (isPickedWorldPosition(hit)) return hit;
    } catch {
      /* miss */
    }
  }
  const carto = camera?.positionCartographic;
  if (!carto) return null;
  return Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, 0);
}

/**
 * Orbit around the current look-at so heading can wrap a full 360°.
 * @param {import('cesium').Viewer} viewer
 * @param {number} headingRad
 * @returns {boolean}
 */
export function applyCameraHeading(viewer, headingRad) {
  const camera = viewer?.camera;
  if (!camera) return false;
  const heading = wrapHeading(headingRad);
  const pitch = camera.pitch;
  const roll = camera.roll;
  camera.cancelFlight?.();

  if (viewer.trackedEntity) {
    camera.setView({
      orientation: { heading, pitch, roll },
    });
    governorRequestRender('heading-orb');
    return true;
  }

  const target = resolveHeadingOrbitTarget(viewer);
  const position = camera.positionWC || camera.position;
  const range = target && position ? Cesium.Cartesian3.distance(position, target) : 0;
  if (target && Number.isFinite(range) && range > 1) {
    scratchHpr.heading = heading;
    scratchHpr.pitch = pitch;
    scratchHpr.range = range;
    camera.lookAt(target, scratchHpr);
    camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  } else {
    camera.setView({
      orientation: { heading, pitch, roll },
    });
  }
  governorRequestRender('heading-orb');
  return true;
}

/**
 * @param {number} pitchRad
 * @returns {boolean}
 */
export function isOblique3DView(pitchRad) {
  if (!Number.isFinite(pitchRad)) return false;
  return Cesium.Math.toDegrees(pitchRad) > OBLIQUE_VIEW_PITCH_THRESHOLD_DEG;
}

/**
 * @param {number} pitchRad
 * @returns {number}
 */
export function nextObliqueViewPitch(pitchRad) {
  return Cesium.Math.toRadians(
    isOblique3DView(pitchRad) ? NADIR_VIEW_PITCH_DEG : OBLIQUE_VIEW_PITCH_DEG,
  );
}

function prefersReducedMotion() {
  return typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Tilt around the current look-at so the same ground point stays centered.
 * @param {import('cesium').Viewer} viewer
 * @param {number} pitchRad
 * @param {{duration?: number}} [options]
 * @returns {boolean}
 */
export function applyCameraPitch(viewer, pitchRad, { duration = 0 } = {}) {
  const camera = viewer?.camera;
  if (!camera) return false;
  const heading = wrapHeading(camera.heading);
  const pitch = Cesium.Math.clamp(pitchRad, -Cesium.Math.PI_OVER_TWO, 0);
  const roll = 0;
  camera.cancelFlight?.();

  const finishLookAt = () => {
    camera.lookAtTransform?.(Cesium.Matrix4.IDENTITY);
    releaseContinuousRender('heading-orb-tilt');
    governorRequestRender('heading-orb');
  };

  if (viewer.trackedEntity) {
    const orientation = { heading, pitch, roll };
    if (duration > 0 && typeof camera.flyTo === 'function' && camera.position) {
      holdContinuousRender('heading-orb-tilt');
      camera.flyTo({
        destination: Cesium.Cartesian3.clone(camera.positionWC || camera.position),
        orientation,
        duration,
        complete: finishLookAt,
        cancel: finishLookAt,
      });
    } else {
      camera.setView({ orientation });
    }
    governorRequestRender('heading-orb');
    return true;
  }

  const target = resolveHeadingOrbitTarget(viewer);
  const position = camera.positionWC || camera.position;
  const range = target && position ? Cesium.Cartesian3.distance(position, target) : 0;
  if (target && Number.isFinite(range) && range > 1) {
    const offset = new Cesium.HeadingPitchRange(heading, pitch, range);
    if (duration > 0 && typeof camera.flyToBoundingSphere === 'function') {
      holdContinuousRender('heading-orb-tilt');
      camera.flyToBoundingSphere(new Cesium.BoundingSphere(Cesium.Cartesian3.clone(target), 1), {
        offset,
        duration,
        complete: finishLookAt,
        cancel: finishLookAt,
      });
    } else {
      camera.lookAt(target, offset);
      camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    }
  } else {
    camera.setView({
      orientation: { heading, pitch, roll },
    });
  }
  governorRequestRender('heading-orb');
  return true;
}

/**
 * @param {import('cesium').Viewer} viewer
 * @param {{stampNavigation?: Function, onUserRotate?: Function}} [hooks]
 * @returns {() => void}
 */
export function installHeadingOrb(viewer, { stampNavigation = null, onUserRotate = null } = {}) {
  const root = document.getElementById('heading-orb');
  const well = document.getElementById('heading-orb-well');
  const north = document.getElementById('heading-orb-north');
  const readout = document.getElementById('heading-orb-value');
  const tilt = document.getElementById('heading-orb-3d');
  if (!viewer || !root || !well) return () => {};

  let dragging = false;
  let startHeading = 0;
  let startX = 0;

  const paint = (pitchOverride) => {
    const camera = viewer.camera;
    const carto = camera?.positionCartographic;
    if (!camera) return;
    const heading = wrapHeading(camera.heading);
    const headingDeg = Cesium.Math.toDegrees(heading);
    const lonDeg = carto ? Cesium.Math.toDegrees(carto.longitude) : 0;
    const latDeg = carto ? Cesium.Math.toDegrees(carto.latitude) : 0;
    const mapTurn = (((-lonDeg - headingDeg) % 360) + 360) % 360;
    root.style.setProperty('--orb-heading', `${headingDeg}deg`);
    root.style.setProperty('--orb-map-x', `${(mapTurn / 360) * 100}%`);
    root.style.setProperty('--orb-map-y', `${50 + (latDeg / 180) * 40}%`);
    const label = formatHeadingDegrees(heading);
    well.setAttribute('aria-valuenow', String(Math.round(headingDeg) % 360));
    well.setAttribute('aria-valuetext', label);
    if (readout) readout.textContent = label;
    if (tilt) {
      const pitch = Number.isFinite(pitchOverride) ? pitchOverride : camera.pitch;
      const oblique = isOblique3DView(pitch);
      const caption = tilt.querySelector('[data-i18n-skip]') || tilt;
      caption.textContent = oblique ? '2D' : '3D';
      tilt.setAttribute('aria-pressed', String(oblique));
    }
  };

  const commit = (heading, { fromUser = true } = {}) => {
    if (fromUser) stampNavigation?.();
    applyCameraHeading(viewer, heading);
    paint();
    if (fromUser) onUserRotate?.();
  };

  const hold = () => {
    if (dragging) return;
    dragging = true;
    holdContinuousRender('heading-orb');
  };

  const release = () => {
    if (!dragging) return;
    dragging = false;
    releaseContinuousRender('heading-orb');
  };

  const onPointerDown = (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target?.closest?.('#heading-orb-north')) return;
    event.preventDefault();
    well.setPointerCapture?.(event.pointerId);
    startHeading = wrapHeading(viewer.camera.heading);
    startX = event.clientX;
    hold();
    well.focus();
  };

  const onPointerMove = (event) => {
    if (!dragging) return;
    commit(headingFromPointerDrag(startHeading, startX, event.clientX));
  };

  const onPointerUp = (event) => {
    if (event.pointerId !== undefined) well.releasePointerCapture?.(event.pointerId);
    release();
  };

  const onWheel = (event) => {
    event.preventDefault();
    const direction = event.deltaY > 0 || event.deltaX > 0 ? 1 : -1;
    commit(wrapHeading(viewer.camera.heading + direction * HEADING_ORB_WHEEL_STEP_RAD));
  };

  const onKey = (event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      commit(wrapHeading(viewer.camera.heading - HEADING_ORB_KEY_STEP_RAD));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      commit(wrapHeading(viewer.camera.heading + HEADING_ORB_KEY_STEP_RAD));
    } else if (event.key === 'Home' || event.key === '0') {
      event.preventDefault();
      commit(0);
    }
  };

  const onNorth = (event) => {
    event.preventDefault();
    event.stopPropagation();
    commit(0);
  };

  const onTilt = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const nextPitch = nextObliqueViewPitch(viewer.camera.pitch);
    stampNavigation?.();
    onUserRotate?.();
    applyCameraPitch(viewer, nextPitch, {
      duration: prefersReducedMotion() ? 0 : OBLIQUE_VIEW_DURATION_S,
    });
    paint(nextPitch);
  };

  well.addEventListener('pointerdown', onPointerDown);
  well.addEventListener('pointermove', onPointerMove);
  well.addEventListener('pointerup', onPointerUp);
  well.addEventListener('pointercancel', onPointerUp);
  well.addEventListener('wheel', onWheel, { passive: false });
  well.addEventListener('keydown', onKey);
  north?.addEventListener('click', onNorth);
  tilt?.addEventListener('click', onTilt);

  const removeCamera = viewer.camera?.changed?.addEventListener(() => {
    if (dragging) return;
    paint();
  });
  paint();

  return () => {
    release();
    well.removeEventListener('pointerdown', onPointerDown);
    well.removeEventListener('pointermove', onPointerMove);
    well.removeEventListener('pointerup', onPointerUp);
    well.removeEventListener('pointercancel', onPointerUp);
    well.removeEventListener('wheel', onWheel);
    well.removeEventListener('keydown', onKey);
    north?.removeEventListener('click', onNorth);
    tilt?.removeEventListener('click', onTilt);
    releaseContinuousRender('heading-orb-tilt');
    if (removeCamera) removeCamera();
  };
}
