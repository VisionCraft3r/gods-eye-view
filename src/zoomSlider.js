/**
 * Top-right camera zoom slider — a long logarithmic altitude throw from
 * street level out to full-earth, matching map +/- rails (Komoot, Zillow)
 * with a track you can drag the whole way.
 *
 * Two modes share the same throw:
 *   camera — dolly along the look vector (slides over the ground when pitched)
 *   height — elevator: change ellipsoidal height, keep lat/lon/heading/pitch
 */

import * as Cesium from 'cesium';
import {
  governorRequestRender,
  holdContinuousRender,
  releaseContinuousRender,
} from './renderGovernor.js';

export const ZOOM_SLIDER_MIN_M = 30;
export const ZOOM_SLIDER_MAX_M = 20_000_000;
export const ZOOM_SLIDER_STEPS = 1000;
export const ZOOM_SLIDER_BUTTON_STEPS = 48;
export const ZOOM_SLIDER_MODES = Object.freeze(['camera', 'height']);
export const ZOOM_SLIDER_MODE_STORAGE_KEY = 'gev:zoom-slider-mode:v1';

const scratchUp = new Cesium.Cartesian3();
const scratchDir = new Cesium.Cartesian3();

const LOG_MIN = Math.log(ZOOM_SLIDER_MIN_M);
const LOG_SPAN = Math.log(ZOOM_SLIDER_MAX_M) - LOG_MIN;

/**
 * @param {number} heightM
 * @returns {number}
 */
export function clampZoomHeight(heightM) {
  if (!Number.isFinite(heightM)) return ZOOM_SLIDER_MIN_M;
  return Math.min(ZOOM_SLIDER_MAX_M, Math.max(ZOOM_SLIDER_MIN_M, heightM));
}

/**
 * High slider value = zoomed in (low altitude), so a vertical rail can put
 * + / close at the top.
 * @param {number} heightM
 * @returns {number}
 */
export function heightToZoomSlider(heightM) {
  const t = (Math.log(clampZoomHeight(heightM)) - LOG_MIN) / LOG_SPAN;
  return Math.round((1 - t) * ZOOM_SLIDER_STEPS);
}

/**
 * @param {number|string} value
 * @returns {number}
 */
export function zoomSliderToHeight(value) {
  const t = 1 - (Number(value) / ZOOM_SLIDER_STEPS);
  const clampedT = Math.min(1, Math.max(0, t));
  return Math.exp(LOG_MIN + clampedT * LOG_SPAN);
}

/**
 * @param {number} heightM
 * @returns {string}
 */
export function formatZoomAltitude(heightM) {
  if (!Number.isFinite(heightM)) return '—';
  if (heightM >= 1_000_000) return `${Math.round(heightM / 1000)} km`;
  if (heightM >= 1000) return `${heightM >= 10_000 ? Math.round(heightM / 1000) : (heightM / 1000).toFixed(1)} km`;
  return `${Math.round(heightM)} m`;
}

/**
 * @param {unknown} value
 * @returns {'camera' | 'height'}
 */
export function normalizeZoomSliderMode(value) {
  return value === 'height' ? 'height' : 'camera';
}

function readStoredZoomSliderMode() {
  try {
    return normalizeZoomSliderMode(globalThis.localStorage?.getItem(ZOOM_SLIDER_MODE_STORAGE_KEY));
  } catch {
    return 'camera';
  }
}

function storeZoomSliderMode(mode) {
  try {
    globalThis.localStorage?.setItem(ZOOM_SLIDER_MODE_STORAGE_KEY, mode);
  } catch {
    /* best effort */
  }
}

function cameraIsLookAt(camera) {
  const transform = camera?.transform;
  if (!transform) return false;
  return !Cesium.Matrix4.equalsEpsilon(transform, Cesium.Matrix4.IDENTITY, Cesium.Math.EPSILON10);
}

function dollyByHeightDelta(camera, currentHeight, nextHeight) {
  const delta = currentHeight - nextHeight;
  if (delta > 0) camera.zoomIn(delta);
  else camera.zoomOut(-delta);
}

/**
 * Dolly along the look vector toward a target ellipsoidal height.
 * When the camera is pitched, this also slides over the ground.
 * @param {import('cesium').Viewer} viewer
 * @param {number} heightM
 * @returns {boolean}
 */
export function applyCameraZoom(viewer, heightM) {
  const camera = viewer?.camera;
  const carto = camera?.positionCartographic;
  if (!camera || !carto) return false;
  const next = clampZoomHeight(heightM);
  const current = carto.height;
  if (!Number.isFinite(current)) return false;
  if (Math.abs(current - next) < 0.5) return true;
  camera.cancelFlight();
  if (viewer.trackedEntity || cameraIsLookAt(camera)) {
    dollyByHeightDelta(camera, current, next);
    governorRequestRender('zoom-slider');
    return true;
  }

  for (let i = 0; i < 5; i += 1) {
    const height = camera.positionCartographic?.height;
    if (!Number.isFinite(height) || Math.abs(height - next) < 0.5) break;
    const position = camera.positionWC || camera.position;
    const direction = camera.directionWC || camera.direction;
    if (!position || !direction) {
      dollyByHeightDelta(camera, height, next);
      break;
    }
    const up = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(position, scratchUp);
    const alongUp = Cesium.Cartesian3.dot(direction, up);
    if (!Number.isFinite(alongUp) || Math.abs(alongUp) < 0.08) {
      dollyByHeightDelta(camera, height, next);
      break;
    }
    camera.move(Cesium.Cartesian3.clone(direction, scratchDir), (next - height) / alongUp);
  }
  governorRequestRender('zoom-slider');
  return true;
}

/**
 * Elevator: change ellipsoidal height without changing lat/lon/heading/pitch.
 * @param {import('cesium').Viewer} viewer
 * @param {number} heightM
 * @returns {boolean}
 */
export function applyCameraHeight(viewer, heightM) {
  const camera = viewer?.camera;
  const carto = camera?.positionCartographic;
  if (!camera || !carto) return false;
  const next = clampZoomHeight(heightM);
  const current = carto.height;
  if (!Number.isFinite(current)) return false;
  if (Math.abs(current - next) < 0.5) return true;
  camera.cancelFlight();
  if (viewer.trackedEntity) {
    dollyByHeightDelta(camera, current, next);
  } else {
    camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(
        Cesium.Math.toDegrees(carto.longitude),
        Cesium.Math.toDegrees(carto.latitude),
        next,
      ),
      orientation: {
        heading: camera.heading,
        pitch: camera.pitch,
        roll: camera.roll,
      },
    });
  }
  governorRequestRender('zoom-slider');
  return true;
}

/**
 * @param {import('cesium').Viewer} viewer
 * @param {number} heightM
 * @param {'camera' | 'height' | string} [mode]
 * @returns {boolean}
 */
export function applyZoomSliderTarget(viewer, heightM, mode) {
  if (normalizeZoomSliderMode(mode) === 'height') return applyCameraHeight(viewer, heightM);
  return applyCameraZoom(viewer, heightM);
}

function readHeight(viewer) {
  return viewer?.camera?.positionCartographic?.height;
}

/**
 * @param {import('cesium').Viewer} viewer
 * @param {{stampNavigation?: Function, onUserZoom?: Function}} [hooks]
 * @returns {() => void}
 */
export function installZoomSlider(viewer, { stampNavigation = null, onUserZoom = null } = {}) {
  const root = document.getElementById('zoom-slider');
  const range = document.getElementById('zoom-slider-range');
  const readout = document.getElementById('zoom-slider-value');
  const zoomIn = document.getElementById('zoom-slider-in');
  const zoomOut = document.getElementById('zoom-slider-out');
  const modeGroup = root?.querySelector('.zoom-slider-modes');
  const modeButtons = [...(root?.querySelectorAll('[data-zoom-mode]') || [])];
  if (!viewer || !root || !range) return () => {};

  let dragging = false;
  let syncing = false;
  let mode = readStoredZoomSliderMode();

  const paintMode = () => {
    for (const btn of modeButtons) {
      const active = btn.getAttribute('data-zoom-mode') === mode;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-checked', active ? 'true' : 'false');
      btn.tabIndex = active ? 0 : -1;
    }
  };

  const setMode = (nextMode) => {
    mode = normalizeZoomSliderMode(nextMode);
    storeZoomSliderMode(mode);
    paintMode();
  };

  const paint = () => {
    const height = readHeight(viewer);
    if (!Number.isFinite(height)) return;
    syncing = true;
    range.value = String(heightToZoomSlider(height));
    range.setAttribute('aria-valuetext', formatZoomAltitude(height));
    if (readout) readout.textContent = formatZoomAltitude(height);
    syncing = false;
  };

  const commit = (value, { fromUser = true } = {}) => {
    if (fromUser) stampNavigation?.();
    applyZoomSliderTarget(viewer, zoomSliderToHeight(value), mode);
    paint();
    if (fromUser) onUserZoom?.();
  };

  const onInput = () => {
    if (syncing) return;
    commit(range.value);
  };

  const onButton = (direction) => {
    const next = Math.min(
      ZOOM_SLIDER_STEPS,
      Math.max(0, Number(range.value) + direction * ZOOM_SLIDER_BUTTON_STEPS),
    );
    range.value = String(next);
    commit(next);
  };

  const hold = () => {
    if (dragging) return;
    dragging = true;
    holdContinuousRender('zoom-slider');
  };
  const release = () => {
    if (!dragging) return;
    dragging = false;
    releaseContinuousRender('zoom-slider');
  };

  const onIn = () => onButton(1);
  const onOut = () => onButton(-1);
  const onModeClick = (event) => {
    setMode(event.currentTarget.getAttribute('data-zoom-mode'));
  };
  const onModeKey = (event) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown' && event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }
    event.preventDefault();
    const index = ZOOM_SLIDER_MODES.indexOf(mode);
    const step = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = Math.min(ZOOM_SLIDER_MODES.length - 1, Math.max(0, index + step));
    setMode(ZOOM_SLIDER_MODES[nextIndex]);
    modeButtons[nextIndex]?.focus();
  };

  range.addEventListener('input', onInput);
  range.addEventListener('pointerdown', hold);
  range.addEventListener('pointerup', release);
  range.addEventListener('pointercancel', release);
  window.addEventListener('pointerup', release);
  zoomIn?.addEventListener('click', onIn);
  zoomOut?.addEventListener('click', onOut);
  modeGroup?.addEventListener('keydown', onModeKey);
  for (const btn of modeButtons) btn.addEventListener('click', onModeClick);

  const removeCamera = viewer.camera?.changed?.addEventListener(() => {
    if (dragging || syncing) return;
    paint();
  });
  paintMode();
  paint();

  return () => {
    release();
    range.removeEventListener('input', onInput);
    range.removeEventListener('pointerdown', hold);
    range.removeEventListener('pointerup', release);
    range.removeEventListener('pointercancel', release);
    window.removeEventListener('pointerup', release);
    zoomIn?.removeEventListener('click', onIn);
    zoomOut?.removeEventListener('click', onOut);
    modeGroup?.removeEventListener('keydown', onModeKey);
    for (const btn of modeButtons) btn.removeEventListener('click', onModeClick);
    if (removeCamera) removeCamera();
  };
}
