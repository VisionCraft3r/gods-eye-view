/**
 * Scheduled ONCF trains on the Morocco rail map.
 * Weekday vs weekend templates repeat indefinitely; pose follows OSM rail
 * paths when available. Sprites when zoomed out, tiny glTF up close.
 */

import * as Cesium from 'cesium';
import schedule from './oncfSchedule.json';
import {
  activeOncfTrains,
  casablancaClockLabel,
  ONCF_KIND_LABEL,
} from './oncfMotion.js';
import {
  governorRequestRender,
  holdContinuousRender,
  releaseContinuousRender,
} from '../renderGovernor.js';
import {
  registerSpriteCollection,
  restoreSpriteOrderOnEnable,
  unregisterSpriteCollection,
} from './spriteOrder.js';
import {
  registerEntityContext,
  removeEntityContextsForLayer,
} from './contextStore.js';
import { flyToLandmark } from '../locations.js';

export const ONCF_TRAINS_LAYER_ID = 'oncf-trains';
const MODEL_URL = '/models/train.glb';
const MODEL_ALT_CEIL_M = 180000;
const MODEL_MAX = 48;
const MODEL_SCALE = 0.28;
const MODEL_HEADING_OFFSET = Math.PI;
const SPRITE_PX = 18;
const TICK_MIN_MS = 100;
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

function spokenLabel(pose) {
  const kind = pose.kindLabel || ONCF_KIND_LABEL[pose.kind] || 'ONCF';
  const num = pose.number ? ` ${pose.number}` : '';
  return `${kind}${num} · ${pose.from} → ${pose.to}`;
}

export function createOncfTrainsLayer() {
  const state = {
    viewer: null,
    enabled: false,
    billboards: null,
    models: new Map(),
    pending: new Set(),
    posesById: new Map(),
    selectedId: null,
    removePreRender: null,
    lastTickMs: 0,
    lastUpdate: null,
    count: 0,
    weekend: false,
    error: null,
    modelsUnavailable: false,
  };

  const clearVisuals = () => {
    state.billboards?.removeAll();
    for (const model of state.models.values()) {
      try { state.viewer?.scene.primitives.remove(model); } catch { /* gone */ }
    }
    state.models.clear();
    state.pending.clear();
    state.posesById.clear();
    state.selectedId = null;
    removeEntityContextsForLayer(ONCF_TRAINS_LAYER_ID);
  };

  const syncModels = async (viewer, poses, use3d) => {
    const wanted = new Set();
    if (use3d && !state.modelsUnavailable) {
      const cam = viewer.camera.positionWC;
      const ranked = poses
        .map((pose) => ({
          pose,
          d: Cesium.Cartesian3.distance(
            cam,
            Cesium.Cartesian3.fromDegrees(pose.longitude, pose.latitude),
          ),
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
        state.modelsUnavailable = true;
        console.warn('[Data:ONCF] train.glb unavailable; using sprites only', error?.message || error);
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

  const publishContexts = (poses) => {
    removeEntityContextsForLayer(ONCF_TRAINS_LAYER_ID);
    for (const pose of poses) {
      const carrier = {
        id: pose.id,
        position: Cesium.Cartesian3.fromDegrees(pose.longitude, pose.latitude, 8),
      };
      registerEntityContext(carrier, {
        id: `${ONCF_TRAINS_LAYER_ID}:${pose.id}`,
        layerId: ONCF_TRAINS_LAYER_ID,
        layerName: 'ONCF trains',
        source: 'ONCF Voyages timetable + OSM rail paths',
        label: spokenLabel(pose),
        latitude: pose.latitude,
        longitude: pose.longitude,
        properties: {
          number: pose.number,
          kind: pose.kind,
          kindLabel: pose.kindLabel,
          from: pose.from,
          to: pose.to,
          kmh: pose.kmh,
          headingDeg: pose.headingDeg,
          onRails: pose.onRails,
        },
      });
    }
  };

  const tick = (viewer) => {
    if (!state.enabled || !state.billboards) return;
    const { trains, weekend } = activeOncfTrains(schedule);
    state.weekend = weekend;
    state.count = trains.length;
    state.lastUpdate = Date.now();
    state.error = null;
    state.posesById = new Map(trains.map((pose) => [String(pose.id), pose]));
    const use3d = !state.modelsUnavailable && cameraHeight(viewer) < MODEL_ALT_CEIL_M;
    let i = 0;
    for (const pose of trains) {
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
    publishContexts(trains);
    void syncModels(viewer, trains, use3d);
    governorRequestRender('oncf-trains');
  };

  const layer = {
    id: ONCF_TRAINS_LAYER_ID,
    name: 'ONCF trains',
    icon: '🚆',
    source: 'ONCF Voyages schedule + OSM rail paths',
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
          const now = Date.now();
          if (now - state.lastTickMs < TICK_MIN_MS) return;
          state.lastTickMs = now;
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
      const clock = casablancaClockLabel();
      const base = state.weekend ? 'ONCF weekend timetable' : 'ONCF weekday timetable';
      const sprites = state.modelsUnavailable ? ' (sprites)' : '';
      return {
        count: state.count,
        lastUpdate: state.lastUpdate,
        error: state.error,
        source: `${base} · OSM paths${sprites} · ${clock} Africa/Casablanca`,
      };
    },

    getNearby(centerCartesian, rangeM, maxCount = 25) {
      if (!state.enabled || !centerCartesian) return [];
      const range = Number.isFinite(rangeM) && rangeM > 0 ? rangeM : Infinity;
      const cap = Number.isFinite(maxCount) && maxCount > 0 ? Math.floor(maxCount) : 25;
      const entries = [];
      for (const pose of state.posesById.values()) {
        const position = Cesium.Cartesian3.fromDegrees(pose.longitude, pose.latitude, 8);
        const distanceM = Cesium.Cartesian3.distance(centerCartesian, position);
        if (!Number.isFinite(distanceM) || distanceM > range) continue;
        entries.push({
          id: pose.id,
          name: spokenLabel(pose),
          position,
          distanceM,
          latitude: pose.latitude,
          longitude: pose.longitude,
        });
      }
      entries.sort((a, b) => a.distanceM - b.distanceM);
      return entries.slice(0, cap);
    },

    getAllPositions(maxCount = 800) {
      if (!state.enabled) return [];
      const cap = Number.isFinite(maxCount) && maxCount > 0 ? Math.floor(maxCount) : 800;
      const out = [];
      for (const pose of state.posesById.values()) {
        if (out.length >= cap) break;
        out.push({
          id: pose.id,
          label: spokenLabel(pose),
          position: Cesium.Cartesian3.fromDegrees(pose.longitude, pose.latitude, 8),
          latitude: pose.latitude,
          longitude: pose.longitude,
        });
      }
      return out;
    },

    findByQuery(query) {
      if (!state.enabled) return null;
      const q = String(query ?? '').trim();
      if (!q) return null;
      const lower = q.toLowerCase();
      const poses = [...state.posesById.values()];
      const exactNum = poses.find((pose) => String(pose.number || '').toLowerCase() === lower);
      const match = exactNum || poses.find((pose) => {
        const hay = `${pose.number || ''} ${pose.kindLabel || ''} ${pose.from || ''} ${pose.to || ''}`.toLowerCase();
        return hay.includes(lower);
      });
      if (!match) return null;
      return {
        id: match.id,
        number: match.number,
        name: spokenLabel(match),
        latitude: match.latitude,
        longitude: match.longitude,
        kindLabel: match.kindLabel,
        from: match.from,
        to: match.to,
      };
    },

    getAnalystRecords(maxCount = 2000) {
      if (!state.enabled) return [];
      const limit = Number.isFinite(maxCount) ? Math.max(1, Math.floor(maxCount)) : 2000;
      const out = [];
      for (const pose of state.posesById.values()) {
        if (out.length >= limit) break;
        out.push({
          id: pose.id,
          number: pose.number || null,
          kind: pose.kind,
          kindLabel: pose.kindLabel || ONCF_KIND_LABEL[pose.kind] || null,
          from: pose.from || null,
          to: pose.to || null,
          lat: pose.latitude,
          lon: pose.longitude,
          kmh: Number.isFinite(pose.kmh) ? pose.kmh : null,
          headingDeg: Number.isFinite(pose.headingDeg) ? pose.headingDeg : null,
          onRails: Boolean(pose.onRails),
        });
      }
      return out;
    },

    selectById(id) {
      const key = String(id ?? '').trim();
      if (!key) return false;
      const pose = state.posesById.get(key)
        || [...state.posesById.values()].find((row) => String(row.number) === key);
      if (!pose) return false;
      state.selectedId = pose.id;
      return true;
    },

    clearSelection() {
      state.selectedId = null;
      return true;
    },

    getSelectedInfo() {
      if (!state.selectedId) return null;
      const pose = state.posesById.get(String(state.selectedId));
      if (!pose) return null;
      return {
        id: pose.id,
        number: pose.number,
        name: spokenLabel(pose),
        latitude: pose.latitude,
        longitude: pose.longitude,
        kindLabel: pose.kindLabel,
        from: pose.from,
        to: pose.to,
        kmh: pose.kmh,
      };
    },

    /** Voice/map inspect: fly to a selected train (not Cesium trackedEntity). */
    flyToSelected(viewer = state.viewer) {
      const info = this.getSelectedInfo();
      if (!info || !viewer) return false;
      flyToLandmark(viewer, info.latitude, info.longitude, {
        range: 3500,
        pitch: -50,
        heading: 0,
        buildingHeight: 0,
        duration: 1.8,
      });
      return true;
    },
  };

  return layer;
}

const oncfTrainsLayer = createOncfTrainsLayer();
export default oncfTrainsLayer;
export { ONCF_KIND_LABEL };
