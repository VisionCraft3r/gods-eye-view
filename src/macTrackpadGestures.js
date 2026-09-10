/**
 * Mac trackpad gestures for the Cesium globe.
 *
 * Chrome, Safari, and Electron turn a pinch into `wheel` events with
 * `ctrlKey` set. Cesium's default zoom bindings only listen for unmodified
 * wheel, so the pinch either did nothing or (in the Mac app) zoomed the
 * whole window. Two-finger scroll was already globe zoom.
 */

import * as Cesium from 'cesium';
import { governorRequestRender } from './renderGovernor.js';

const GESTURE_EVENTS = Object.freeze(['gesturestart', 'gesturechange', 'gestureend']);
const CTRL_WHEEL_GUARD_MS = 80;
/** Cesium default is 5. Double it so pinch and two-finger scroll feel twice as fast. */
export const TRACKPAD_ZOOM_FACTOR = 10;
/** Safari gesture path uses the same 2× gain as `zoomFactor`. */
export const TRACKPAD_GESTURE_ZOOM_GAIN = 2;

/**
 * Zoom bindings that keep two-finger scroll, right-drag, and touch pinch,
 * and add Mac/Chrome pinch (Ctrl+wheel).
 * @param {typeof Cesium.CameraEventType} CameraEventType
 * @param {typeof Cesium.KeyboardEventModifier} KeyboardEventModifier
 * @returns {Array<number|{eventType: number, modifier: number}>}
 */
export function macTrackpadZoomEventTypes(CameraEventType, KeyboardEventModifier) {
  return [
    CameraEventType.RIGHT_DRAG,
    CameraEventType.WHEEL,
    { eventType: CameraEventType.WHEEL, modifier: KeyboardEventModifier.CTRL },
    CameraEventType.PINCH,
  ];
}

/**
 * Browser-default page zoom must not win over globe zoom.
 * @param {{type?: string, ctrlKey?: boolean, metaKey?: boolean}|null} event
 * @returns {boolean}
 */
export function shouldPreventBrowserZoom(event) {
  if (!event) return false;
  const type = String(event.type || '');
  if (GESTURE_EVENTS.includes(type)) return true;
  return type === 'wheel' && Boolean(event.ctrlKey || event.metaKey);
}

/**
 * Meters to zoom for one Safari `gesturechange` step. Positive = zoom in.
 * @param {number} heightM
 * @param {number} scaleRatio `event.scale / previousScale`
 * @returns {number}
 */
export function gestureScaleZoomMeters(heightM, scaleRatio) {
  if (!Number.isFinite(heightM) || heightM <= 0) return 0;
  if (!Number.isFinite(scaleRatio) || scaleRatio <= 0) return 0;
  return (scaleRatio - 1) * heightM * TRACKPAD_GESTURE_ZOOM_GAIN;
}

function applyCameraZoomMeters(viewer, movementM) {
  if (!Number.isFinite(movementM) || movementM === 0) return;
  const controller = viewer.scene?.screenSpaceCameraController;
  if (!controller?.enableInputs || !controller.enableZoom) return;
  if (movementM > 0) viewer.camera.zoomIn(movementM);
  else viewer.camera.zoomOut(-movementM);
  governorRequestRender('mac-trackpad-zoom');
}

/**
 * Bind Mac pinch-to-zoom to the globe and block browser/Electron page zoom.
 * @param {import('cesium').Viewer} viewer
 * @returns {() => void}
 */
export function installMacTrackpadGestures(viewer) {
  const canvas = viewer?.canvas || viewer?.scene?.canvas;
  const controller = viewer?.scene?.screenSpaceCameraController;
  if (!canvas || !controller) return () => {};

  controller.enableZoom = true;
  controller.zoomFactor = TRACKPAD_ZOOM_FACTOR;
  controller.zoomEventTypes = macTrackpadZoomEventTypes(
    Cesium.CameraEventType,
    Cesium.KeyboardEventModifier,
  );

  let lastCtrlWheelAt = 0;
  let lastGestureScale = 1;

  const onWheel = (event) => {
    if (!shouldPreventBrowserZoom(event)) return;
    event.preventDefault();
    lastCtrlWheelAt = performance.now();
  };

  const onGestureStart = (event) => {
    event.preventDefault();
    lastGestureScale = 1;
  };

  const onGestureChange = (event) => {
    event.preventDefault();
    const scale = Number(event.scale);
    if (!Number.isFinite(scale) || scale <= 0) return;
    if (performance.now() - lastCtrlWheelAt < CTRL_WHEEL_GUARD_MS) {
      lastGestureScale = scale;
      return;
    }
    const ratio = scale / lastGestureScale;
    lastGestureScale = scale;
    const height = viewer.camera?.positionCartographic?.height;
    applyCameraZoomMeters(viewer, gestureScaleZoomMeters(height, ratio));
  };

  const onGestureEnd = (event) => {
    event.preventDefault();
    lastGestureScale = 1;
  };

  const wheelOpts = { capture: true, passive: false };
  const gestureOpts = { capture: true, passive: false };
  window.addEventListener('wheel', onWheel, wheelOpts);
  window.addEventListener('gesturestart', onGestureStart, gestureOpts);
  window.addEventListener('gesturechange', onGestureChange, gestureOpts);
  window.addEventListener('gestureend', onGestureEnd, gestureOpts);

  return () => {
    window.removeEventListener('wheel', onWheel, wheelOpts);
    window.removeEventListener('gesturestart', onGestureStart, gestureOpts);
    window.removeEventListener('gesturechange', onGestureChange, gestureOpts);
    window.removeEventListener('gestureend', onGestureEnd, gestureOpts);
  };
}
