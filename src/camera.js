import * as Cesium from 'cesium';
import { flyToPresetLocation } from './locations.js';

/**
 * Camera presets for notable locations.
 * First-run default (no saved session / share link): Casablanca.
 */
export const CAMERA_PRESETS = {
  casablanca: {
    destination: Cesium.Cartesian3.fromDegrees(-7.5898, 33.5731, 1200),
    orientation: {
      heading: Cesium.Math.toRadians(15),
      pitch: Cesium.Math.toRadians(-30),
      roll: 0.0,
    },
  },
  austin: {
    destination: Cesium.Cartesian3.fromDegrees(-97.7431, 30.2672, 800),
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-35),
      roll: 0.0,
    },
  },
  sf: {
    destination: Cesium.Cartesian3.fromDegrees(-122.4194, 37.7749, 1000),
    orientation: {
      heading: Cesium.Math.toRadians(30),
      pitch: Cesium.Math.toRadians(-30),
      roll: 0.0,
    },
  },
  nyc: {
    destination: Cesium.Cartesian3.fromDegrees(-73.9857, 40.7484, 1200),
    orientation: {
      heading: Cesium.Math.toRadians(-20),
      pitch: Cesium.Math.toRadians(-30),
      roll: 0.0,
    },
  },
};

/**
 * Fly the camera to a preset location with a smooth animation.
 */
export function flyToPreset(viewer, presetName, duration = 3.0) {
  const preset = CAMERA_PRESETS[presetName];
  if (!preset) return;

  viewer.camera.flyTo({
    destination: preset.destination,
    orientation: preset.orientation,
    duration,
    easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
  });
}

/**
 * First-run default: cinematic approach into Casablanca.
 * Prefer locations.flyToPresetLocation when overview framing is desired.
 */
export function flyToCasablanca(viewer) {
  if (!viewer?.camera) return;
  // High overview first so the coast reads clearly, then settle on the city POI.
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(-7.5898, 33.5731, 45000),
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-90),
      roll: 0.0,
    },
  });
  setTimeout(() => {
    if (typeof flyToPresetLocation === 'function') {
      flyToPresetLocation(viewer, 'casablanca', { viewMode: 'overview', duration: 4.0 });
      return;
    }
    viewer.camera.flyTo({
      destination: CAMERA_PRESETS.casablanca.destination,
      orientation: CAMERA_PRESETS.casablanca.orientation,
      duration: 4.0,
      easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
    });
  }, 500);
}

/** @deprecated Use flyToCasablanca — kept for older call sites/tests. */
export function flyToAustin(viewer) {
  flyToCasablanca(viewer);
}
