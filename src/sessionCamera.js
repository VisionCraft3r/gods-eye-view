/**
 * Persist the last settled camera so relaunch restores the operator's view
 * instead of burning a fresh default fly-to (and its tile/API warm-up).
 */

import * as Cesium from 'cesium';

export const SESSION_CAMERA_STORAGE_KEY = 'gev:session-camera:v1';

const SAVE_DEBOUNCE_MS = 750;

function storage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

/**
 * @param {unknown} raw
 * @returns {{ lat: number, lon: number, height: number, heading: number, pitch: number, locationId?: string|null }|null}
 */
export function parseSessionCamera(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const lat = Number(raw.lat);
  const lon = Number(raw.lon);
  const height = Number(raw.height);
  const heading = Number(raw.heading);
  const pitch = Number(raw.pitch);
  if (![lat, lon, height, heading, pitch].every(Number.isFinite)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  if (height < 50 || height > 5e7) return null;
  const locationId = typeof raw.locationId === 'string' && raw.locationId.trim()
    ? raw.locationId.trim()
    : null;
  return { lat, lon, height, heading, pitch, locationId };
}

export function readSessionCamera() {
  const store = storage();
  if (!store) return null;
  try {
    return parseSessionCamera(JSON.parse(store.getItem(SESSION_CAMERA_STORAGE_KEY) || 'null'));
  } catch {
    return null;
  }
}

export function writeSessionCamera(snapshot) {
  const parsed = parseSessionCamera(snapshot);
  const store = storage();
  if (!parsed || !store) return false;
  try {
    store.setItem(SESSION_CAMERA_STORAGE_KEY, JSON.stringify(parsed));
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {import('cesium').Viewer} viewer
 * @param {{ locationId?: string|null }} [extra]
 */
export function captureSessionCamera(viewer, extra = {}) {
  const carto = viewer?.camera?.positionCartographic;
  if (!carto) return null;
  return parseSessionCamera({
    lat: Cesium.Math.toDegrees(carto.latitude),
    lon: Cesium.Math.toDegrees(carto.longitude),
    height: carto.height,
    heading: viewer.camera.heading,
    pitch: viewer.camera.pitch,
    locationId: extra.locationId ?? null,
  });
}

/**
 * @param {import('cesium').Viewer} viewer
 * @param {{ lat: number, lon: number, height: number, heading: number, pitch: number }} snapshot
 */
export function applySessionCamera(viewer, snapshot) {
  const parsed = parseSessionCamera(snapshot);
  if (!viewer?.camera || !parsed) return false;
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(parsed.lon, parsed.lat, parsed.height),
    orientation: {
      heading: parsed.heading,
      pitch: parsed.pitch,
      roll: 0,
    },
  });
  return true;
}

/**
 * @param {import('cesium').Viewer} viewer
 * @param {{ getLocationId?: () => string|null }} [options]
 * @returns {() => void}
 */
export function installSessionCameraPersistence(viewer, options = {}) {
  if (!viewer?.camera?.moveEnd) return () => {};
  let timer = null;
  const persist = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const locationId = options.getLocationId?.() ?? options.getLocationId?.() ?? null;
      const snapshot = captureSessionCamera(viewer, { locationId });
      if (snapshot) writeSessionCamera(snapshot);
    }, SAVE_DEBOUNCE_MS);
  };
  const remove = viewer.camera.moveEnd.addEventListener(persist);
  const bootTimer = setTimeout(persist, 2000);
  return () => {
    clearTimeout(timer);
    clearTimeout(bootTimer);
    if (typeof remove === 'function') remove();
  };
}
