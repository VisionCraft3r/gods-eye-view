import { catalogControlServices } from './catalog.js';
import { StyleManager } from '../ui/composition.js';
import { flyToCasablanca } from '../camera.js';
import { installZoomSlider } from '../zoomSlider.js';
import { installHeadingOrb } from '../headingOrb.js';
import { installMacTrackpadGestures } from '../macTrackpadGestures.js';
import {
  applySessionCamera,
  installSessionCameraPersistence,
  readSessionCamera,
} from '../sessionCamera.js';
import { initCockpitCloudEffects } from '../cockpitCloudEffects.js';
import { t } from '../i18n/index.js';

/** Construct the existing controls and camera presentation. */
export function createApplicationControls({
  scene: { viewer, mapStackController, operations },
  loaderStatus,
  Controls = StyleManager,
  services,
  catalog,
  placeSearch,
  defer,
}) {
  // Initialize the style manager (post-processing, HUD, locations, share links)
  const styleManager = new Controls(viewer, {
    services: {
      ...services,
      ...operations.surface.controlServices,
      searchAndFlyTo: operations.searchAndFlyTo,
      fetchRegionalBrief: (...args) =>
        operations.requests.regional.getBrief(...args),
      ...catalogControlServices(catalog),
    },
    requestServices: operations.requests,
    mapStackController,
    placeSearch,
  });
  defer(() => styleManager.orbitController.stop());
  defer(() => styleManager.hud.destroy());
  defer(() => styleManager.dispose());
  // The previous multi-canvas weather compositor remains disabled. Cockpit
  // clouds use a separate, capped low-resolution GPU pass that never attaches
  // Cesium fog or post-process stages and is fully stopped in map mode.
  const weatherEffects = null;
  const cockpitCloudEffects = initCockpitCloudEffects(viewer, {
    weatherService: operations.requests.weather,
  });
  defer(() => cockpitCloudEffects?.destroy());

  // Share links win. Else restore the last session camera. Else Casablanca.
  const savedCamera = readSessionCamera();
  if (styleManager.hasShareState) {
    loaderStatus.textContent = t('Restoring shared view...');
  } else if (savedCamera && applySessionCamera(viewer, savedCamera)) {
    loaderStatus.textContent = t('Restoring your last view...');
  } else {
    loaderStatus.textContent = t('Flying to Casablanca...');
    defer(flyToCasablanca(viewer));
  }
  defer(installSessionCameraPersistence(viewer));
  if (typeof document !== 'undefined') {
    const stampNavigation = () => styleManager._stampNavigation?.();
    defer(installZoomSlider(viewer, { stampNavigation }));
    defer(installHeadingOrb(viewer, { stampNavigation }));
  }
  defer(installMacTrackpadGestures(viewer));

  return { styleManager, weatherEffects, cockpitCloudEffects };
}
