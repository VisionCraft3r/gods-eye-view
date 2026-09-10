/**
 * Scheduled ONCF trains on the Morocco rail map.
 * Weekday vs weekend templates repeat indefinitely; pose is interpolated
 * between timetable stops. Sprites when zoomed out, tiny glTF up close.
 */

import * as Cesium from 'cesium';
import schedule from './oncfSchedule.json';
import { activeOncfTrains, ONCF_KIND_LABEL } from './oncfMotion.js';
import { governorRequestRender, holdContinuousRender, releaseContinuousRender } from '../renderGovernor.js';
import {
  registerSpriteCollection,
  restoreSpriteOrderOnEnable,
  unregisterSpriteCollection,
} from './spriteOrder.js';
import { removeEntityContextsForLayer } from './contextStore.js';

export const ONCF_TRAINS_LAYER_ID = 'oncf-trains';
const MODEL_URL = '/models/train.glb';
const MODEL_ALT_CEIL_M = 180000;
const MODEL_MAX = 48;
const MODEL_SCALE = 0.28;
const MODEL_HEADING_OFFSET = Math.PI;
const SPRITE_PX = 18;
const KIND_COLOR = {
  0: Cesium.Color.fromCssColorString('#7ecbff'),
  1: Cesium.Color.fromCssColorString('#f0c14a'),
  2: Cesium.Color.fromCssColorString('#39ffd5'),
};

const TRAIN_SPRITE = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <g fill="#fff" stroke="rgba(0,0,0,0.35)" stroke-width="2" stroke-linejoin="round">
    <rect x="24" y="6" width="16" height="44" rx="4"/>
    <rect x="20" y="14" width="24" height="10" rx="2"/>
    <circle cx="28" cy="54" r="5"/>
    <circle cx="36" cy="54" r="5"/>
  </g>
</svg>`)}`;

function cameraHeight(viewer) {
  return viewer?.camera?.positionCartographic?.height ?? Number.POSITIVE_INFINITY;
}

export function createOncfTrainsLayer() {
  const state = {
    viewer: null,
    enabled: false,
    billboards: null,
    models: new Map(),
    pending: new Set(),
    lastIds: new Set(),
    removePreRender: null,
    lastUpdate: null,
    count: 0,
    weekend: false,
    error: null,
  };

  const clearVisuals = () => {
    state.billboards?.removeAll();
    for (const model of state.models.values()) {
      try { state.viewer?.scene.primitives.remove(model); } catch { /* gone */ }
    }
    state.models.clear();
    state.pending.clear();
    removeEntityContextsForLayer(ONCF_TRAINS_LAYER_ID);
  };

  const syncModels = async (viewer, poses, use3d) => {
    const wanted = new Set();
    if (use3d) {
      const cam = viewer.camera.positionWC;
      const ranked = poses
        .map((pose) => ({
          pose,
          d: Cesium.Cartesian3.distance(cam, Cesium.Cartesian3.fromDegrees(pose.longitude, pose.latitude)),
        }))
        .sort((a, b) => a.d - b.d)
        .slice(0, MODEL_MAX);
      for (const { pose } of ranked) wanted.add(pose.id);
    }
    for (const id of [...state.models.keys()]) {
      if (!wanted.has(id)) {
        const model = state.models.get(id);
        try { viewer.scene.primitives.remove(model); } catch { /* gone */ }
        state.models.delete(id);
      }
    }
    for (const pose of poses) {
      if (!wanted.has(pose.id) || state.models.has(pose.id) || state.pending.has(pose.id)) continue;
      state.pending.add(pose.id);
      try {
        const model = await Cesium.Model.fromGltfAsync({
          url: MODEL_URL,
          scale: MODEL_SCALE,
          minimumPixelSize: 12,
          maximumScale: 0.55,
          color: KIND_COLOR[pose.kind] || KIND_COLOR[1],
          colorBlendMode: Cesium.ColorBlendMode.MIX,
          colorBlendAmount: 0.72,
        });
        if (!state.enabled || !wanted.has(pose.id)) {
          try { model.destroy(); } catch { /* unused */ }
          continue;
        }
        viewer.scene.primitives.add(model);
        state.models.set(pose.id, model);
      } catch (error) {
        state.error = 'ONCF train model failed';
        console.warn('[Data:ONCF]', error);
      } finally {
        state.pending.delete(pose.id);
      }
    }
  };

  const placeModel = (model, pose) => {
    const position = Cesium.Cartesian3.fromDegrees(pose.longitude, pose.latitude, 8);
    const hpr = new Cesium.HeadingPitchRoll(
      Cesium.Math.toRadians(pose.headingDeg) + MODEL_HEADING_OFFSET,
      0,
      0,
    );
    model.modelMatrix = Cesium.Transforms.headingPitchRollToFixedFrame(position, hpr);
    model.show = true;
  };

  const tick = (viewer) => {
    if (!state.enabled || !state.billboards) return;
    const { trains, weekend } = activeOncfTrains(schedule);
    state.weekend = weekend;
    state.count = trains.length;
    state.lastUpdate = Date.now();
    const use3d = cameraHeight(viewer) < MODEL_ALT_CEIL_M;
    const seen = new Set();
    let i = 0;
    for (const pose of trains) {
      seen.add(pose.id);
      const position = Cesium.Cartesian3.fromDegrees(pose.longitude, pose.latitude);
      let bb = state.billboards.get(i);
      if (!bb) {
        bb = state.billboards.add({
          image: TRAIN_SPRITE,
          width: SPRITE_PX,
          height: SPRITE_PX,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        });
      }
      bb.position = position;
      bb.show = !use3d || !state.models.has(pose.id);
      bb.color = KIND_COLOR[pose.kind] || KIND_COLOR[1];
      bb.alignedAxis = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(position);
      bb.rotation = Cesium.Math.toRadians(-pose.headingDeg);
      bb.id = `${ONCF_TRAINS_LAYER_ID}:${pose.id}`;
      const model = state.models.get(pose.id);
      if (model) placeModel(model, pose);
      i += 1;
    }
    while (state.billboards.length > trains.length) {
      state.billboards.remove(state.billboards.get(state.billboards.length - 1));
    }
    void syncModels(viewer, trains, use3d);
    governorRequestRender('oncf-trains');
  };

  const layer = {
    id: ONCF_TRAINS_LAYER_ID,
    name: 'ONCF trains',
    icon: '🚆',
    source: 'ONCF Voyages schedule snapshot',
    showInTogglePanel: true,
    updateInterval: 15_000,

    init(viewer) {
      state.viewer = viewer;
      state.billboards = viewer.scene.primitives.add(new Cesium.BillboardCollection({
        scene: viewer.scene,
      }));
      registerSpriteCollection(ONCF_TRAINS_LAYER_ID, state.billboards);
    },

    enable(viewer) {
      state.enabled = true;
      state.viewer = viewer || state.viewer;
      restoreSpriteOrderOnEnable(ONCF_TRAINS_LAYER_ID, state.viewer);
      holdContinuousRender('oncf-trains');
      if (state.viewer?.scene?.preRender && !state.removePreRender) {
        state.removePreRender = state.viewer.scene.preRender.addEventListener(() => {
          tick(state.viewer);
        });
      }
      tick(state.viewer);
    },

    disable() {
      state.enabled = false;
      if (state.removePreRender) {
        state.removePreRender();
        state.removePreRender = null;
      }
      releaseContinuousRender('oncf-trains');
      clearVisuals();
      state.count = 0;
    },

    update(viewer) {
      tick(viewer || state.viewer);
      return true;
    },

    destroy(viewer) {
      this.disable();
      if (state.billboards && viewer) {
        unregisterSpriteCollection(ONCF_TRAINS_LAYER_ID, state.billboards);
        viewer.scene.primitives.remove(state.billboards);
      }
      state.billboards = null;
      state.viewer = null;
    },

    getStats() {
      return {
        count: state.count,
        lastUpdate: state.lastUpdate,
        error: state.error,
        source: state.weekend ? 'ONCF weekend timetable' : 'ONCF weekday timetable',
      };
    },
  };

  return layer;
}

const oncfTrainsLayer = createOncfTrainsLayer();
export default oncfTrainsLayer;
export { ONCF_KIND_LABEL };
