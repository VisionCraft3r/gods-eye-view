/**
 * Viewport-bounded Morocco civic/transport/tourism overlay.
 * Live OSM via `/api/morocco/places`, rendered as ground points + overlay cards.
 */

import * as Cesium from 'cesium';
import { governorRequestRender } from '../renderGovernor.js';
import {
  clearSelectedEntityContextForLayer,
  registerEntityContext,
  removeEntityContextsForLayer,
} from './contextStore.js';
import {
  clearOverlaySource,
  setOverlayEntries,
  setOverlaySourceVisible,
} from '../overlays/worldOverlay.js';
import {
  MOROCCO_KIND_META,
  clampMoroccoQueryBox,
  isInMorocco,
  normalizeMoroccoKinds,
} from './moroccoBounds.js';

let moroccoAirportAircraft = null;
async function ensureMoroccoAirportAircraft() {
  if (!moroccoAirportAircraft) {
    moroccoAirportAircraft = (await import('./moroccoAirportAircraft.js')).default;
  }
  return moroccoAirportAircraft;
}

export const MOROCCO_LAYER_ID = 'morocco';
export const MOROCCO_OVERLAY_SOURCE_ID = 'morocco';
export const MOROCCO_OVERLAY_COHORT_LIMIT = 96;

const DEFAULT_OVERLAY_HOST = Object.freeze({
  setEntries: setOverlayEntries,
  setVisible: setOverlaySourceVisible,
  clearSource: clearOverlaySource,
});

function viewBoxFromCamera(viewer) {
  const rectangle = viewer?.camera?.computeViewRectangle?.(Cesium.Ellipsoid.WGS84);
  if (!rectangle) {
    const carto = viewer?.camera?.positionCartographic;
    if (!carto) return null;
    const lat = Cesium.Math.toDegrees(carto.latitude);
    const lon = Cesium.Math.toDegrees(carto.longitude);
    return { south: lat - 0.35, north: lat + 0.35, west: lon - 0.45, east: lon + 0.45 };
  }
  return {
    south: Cesium.Math.toDegrees(rectangle.south),
    west: Cesium.Math.toDegrees(rectangle.west),
    north: Cesium.Math.toDegrees(rectangle.north),
    east: Cesium.Math.toDegrees(rectangle.east),
  };
}

function lookAtInMorocco(viewer) {
  const carto = viewer?.camera?.positionCartographic;
  if (!carto) return false;
  return isInMorocco(
    Cesium.Math.toDegrees(carto.latitude),
    Cesium.Math.toDegrees(carto.longitude),
  );
}

export function createMoroccoPlacesLayer({ overlayHost = DEFAULT_OVERLAY_HOST } = {}) {
  const state = {
    viewer: null,
    dataSource: null,
    enabled: false,
    loading: false,
    records: [],
    kinds: normalizeMoroccoKinds(),
    lastUpdate: null,
    error: null,
    abort: null,
    timer: null,
    moveEndRemove: null,
  };

  const paintOverlay = () => {
    if (!state.enabled) {
      overlayHost.clearSource(MOROCCO_OVERLAY_SOURCE_ID);
      overlayHost.setVisible(MOROCCO_OVERLAY_SOURCE_ID, false);
      return;
    }
    const entries = state.records.slice(0, MOROCCO_OVERLAY_COHORT_LIMIT).map((record, index) => ({
      id: record.id,
      position: Cesium.Cartesian3.fromDegrees(record.longitude, record.latitude),
      variant: 'card',
      title: record.name,
      details: [MOROCCO_KIND_META[record.kind]?.label, record.operator, record.iata || record.icao]
        .filter(Boolean),
      accent: record.color,
      priority: 800 - index,
      collisionGroup: 'ambient-label',
      paintLane: 'ambient-label',
      interactive: true,
      edgeFade: 'keyhole',
      horizonCull: true,
    }));
    overlayHost.setEntries(MOROCCO_OVERLAY_SOURCE_ID, entries, {
      cohortLimit: MOROCCO_OVERLAY_COHORT_LIMIT,
      collisionCapacity: 64,
      moving: false,
    });
    overlayHost.setVisible(MOROCCO_OVERLAY_SOURCE_ID, true);
  };

  const clearEntities = () => {
    state.records = [];
    state.dataSource?.entities.removeAll();
    removeEntityContextsForLayer(MOROCCO_LAYER_ID);
    paintOverlay();
    governorRequestRender('morocco');
  };

  const renderRecords = (records) => {
    if (!state.dataSource) return;
    state.dataSource.entities.removeAll();
    removeEntityContextsForLayer(MOROCCO_LAYER_ID);
    state.records = records;
    for (const record of records) {
      const position = Cesium.Cartesian3.fromDegrees(record.longitude, record.latitude);
      const color = Cesium.Color.fromCssColorString(record.color || '#9ca6b0');
      const entity = state.dataSource.entities.add({
        id: `${MOROCCO_LAYER_ID}:${record.id}`,
        name: record.name,
        position,
        point: {
          pixelSize: 9,
          color,
          outlineColor: Cesium.Color.BLACK.withAlpha(0.45),
          outlineWidth: 1,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        properties: record,
      });
      registerEntityContext({
        layerId: MOROCCO_LAYER_ID,
        id: record.id,
        label: record.name,
        entity,
        record,
      });
    }
    paintOverlay();
    governorRequestRender('morocco');
  };

  const fetchPlaces = async (viewer) => {
    if (!state.enabled || !viewer) return false;
    if (!lookAtInMorocco(viewer)) {
      clearEntities();
      state.error = null;
      return true;
    }
    const box = clampMoroccoQueryBox(viewBoxFromCamera(viewer));
    if (!box) {
      clearEntities();
      return true;
    }
    state.abort?.abort();
    const abort = new AbortController();
    state.abort = abort;
    state.loading = true;
    try {
      const params = new URLSearchParams({
        south: String(box.south),
        west: String(box.west),
        north: String(box.north),
        east: String(box.east),
        kinds: state.kinds.join(','),
      });
      const response = await fetch(`/api/morocco/places?${params}`, { signal: abort.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (abort.signal.aborted) return false;
      renderRecords(Array.isArray(payload?.records) ? payload.records : []);
      state.lastUpdate = Date.now();
      state.error = payload?.error || null;
      return true;
    } catch (error) {
      if (error?.name === 'AbortError') return false;
      state.error = 'Morocco places unavailable';
      console.warn('[Data:Morocco] places fetch failed', error);
      return false;
    } finally {
      if (state.abort === abort) {
        state.loading = false;
        state.abort = null;
      }
    }
  };

  const scheduleFetch = (viewer) => {
    clearTimeout(state.timer);
    state.timer = window.setTimeout(() => {
      void fetchPlaces(viewer);
    }, 480);
  };

  const layer = {
    id: MOROCCO_LAYER_ID,
    name: 'Morocco pack',
    icon: '🇲🇦',
    source: 'OpenStreetMap',
    showInTogglePanel: true,
    updateInterval: 90_000,

    setParams(params = {}) {
      if (Object.hasOwn(params, 'kinds')) {
        state.kinds = normalizeMoroccoKinds(params.kinds);
        if (state.enabled && state.viewer) scheduleFetch(state.viewer);
      }
    },

    getParams() {
      return { kinds: [...state.kinds] };
    },

    init(viewer) {
      state.viewer = viewer;
      state.dataSource = new Cesium.CustomDataSource(MOROCCO_LAYER_ID);
      state.dataSource.show = false;
      viewer.dataSources.add(state.dataSource);
      void ensureMoroccoAirportAircraft().then((layer) => layer.init(viewer));
      overlayHost.setVisible(MOROCCO_OVERLAY_SOURCE_ID, false);
    },

    enable(viewer) {
      state.enabled = true;
      state.viewer = viewer || state.viewer;
      if (state.dataSource) state.dataSource.show = true;
      overlayHost.setVisible(MOROCCO_OVERLAY_SOURCE_ID, true);
      if (state.viewer?.camera?.moveEnd) {
        state.moveEndRemove = state.viewer.camera.moveEnd.addEventListener(() => {
          scheduleFetch(state.viewer);
        });
      }
      void fetchPlaces(state.viewer);
      void ensureMoroccoAirportAircraft().then((layer) => layer.enable(state.viewer));
    },

    disable() {
      state.enabled = false;
      state.abort?.abort();
      clearTimeout(state.timer);
      state.timer = null;
      if (state.moveEndRemove) {
        state.moveEndRemove();
        state.moveEndRemove = null;
      }
      if (state.dataSource) state.dataSource.show = false;
      if (moroccoAirportAircraft) moroccoAirportAircraft.disable();
      clearSelectedEntityContextForLayer(MOROCCO_LAYER_ID);
      clearEntities();
    },

    async update(viewer) {
      return fetchPlaces(viewer || state.viewer);
    },

    destroy(viewer) {
      this.disable();
      if (moroccoAirportAircraft) moroccoAirportAircraft.destroy(viewer);
      if (state.dataSource && viewer) {
        viewer.dataSources.remove(state.dataSource, true);
      }
      state.dataSource = null;
      state.viewer = null;
    },

    getStats() {
      const aircraft = moroccoAirportAircraft?.getStats?.() || { count: 0 };
      return {
        count: state.records.length,
        lastUpdate: state.lastUpdate,
        error: state.error,
        loading: state.loading,
        source: 'OpenStreetMap Overpass',
        airportAircraft: aircraft.count,
      };
    },
  };

  return layer;
}

const moroccoPlacesLayer = createMoroccoPlacesLayer();
export default moroccoPlacesLayer;
