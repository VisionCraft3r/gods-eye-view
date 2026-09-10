/**
 * Tiny grounded airplane.glb models on Moroccan airports.
 * Data from `/api/morocco/airport-aircraft`, refreshed every 5 minutes.
 */

import * as Cesium from 'cesium';
import { governorRequestRender } from '../renderGovernor.js';
import {
  registerEntityContext,
  removeEntityContextsForLayer,
} from './contextStore.js';
import { isInMorocco } from './moroccoBounds.js';

export const MOROCCO_AIRPORT_AIRCRAFT_LAYER_ID = 'morocco-airport-aircraft';
export const MOROCCO_AIRPORT_AIRCRAFT_INTERVAL_MS = 5 * 60_000;
const MODEL_URL = '/models/airplane.glb';
const MODEL_SCALE = 0.16;
const MODEL_HEADING_OFFSET_DEG = 180;

function lookAtInMorocco(viewer) {
  const carto = viewer?.camera?.positionCartographic;
  if (!carto) return false;
  return isInMorocco(
    Cesium.Math.toDegrees(carto.latitude),
    Cesium.Math.toDegrees(carto.longitude),
  );
}

export function createMoroccoAirportAircraftLayer() {
  const state = {
    viewer: null,
    dataSource: null,
    enabled: false,
    loading: false,
      records: [],
      lastUpdate: null,
      error: null,
      abort: null,
      timer: null,
      debounce: null,
      moveEndRemove: null,
  };

  const clear = () => {
    state.records = [];
    state.dataSource?.entities.removeAll();
    removeEntityContextsForLayer(MOROCCO_AIRPORT_AIRCRAFT_LAYER_ID);
    governorRequestRender('morocco-airport-aircraft');
  };

  const paint = (records) => {
    if (!state.dataSource) return;
    state.dataSource.entities.removeAll();
    removeEntityContextsForLayer(MOROCCO_AIRPORT_AIRCRAFT_LAYER_ID);
    state.records = records;
    for (const record of records) {
      const position = Cesium.Cartesian3.fromDegrees(record.longitude, record.latitude);
      const heading = Cesium.Math.toRadians((record.headingDeg || 75) + MODEL_HEADING_OFFSET_DEG);
      const orientation = Cesium.Transforms.headingPitchRollQuaternion(
        position,
        new Cesium.HeadingPitchRoll(heading, 0, 0),
      );
      const label = record.callsign || record.icao24.toUpperCase();
      const entity = state.dataSource.entities.add({
        id: `${MOROCCO_AIRPORT_AIRCRAFT_LAYER_ID}:${record.id}`,
        name: label,
        position,
        orientation,
        model: {
          uri: MODEL_URL,
          scale: MODEL_SCALE,
          minimumPixelSize: 8,
          maximumScale: 0.4,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          color: Cesium.Color.fromCssColorString('#eef3f8'),
          colorBlendMode: Cesium.ColorBlendMode.MIX,
          colorBlendAmount: 0.9,
        },
      });
      registerEntityContext({
        layerId: MOROCCO_AIRPORT_AIRCRAFT_LAYER_ID,
        id: record.id,
        label: `${label} · ${record.airportIcao}`,
        entity,
        record,
      });
    }
    governorRequestRender('morocco-airport-aircraft');
  };

  const fetchAircraft = async (viewer) => {
    if (!state.enabled || !viewer) return false;
    if (!lookAtInMorocco(viewer)) {
      clear();
      state.error = null;
      return true;
    }
    state.abort?.abort();
    const abort = new AbortController();
    state.abort = abort;
    state.loading = true;
    try {
      const response = await fetch('/api/morocco/airport-aircraft', { signal: abort.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (abort.signal.aborted) return false;
      paint(Array.isArray(payload?.records) ? payload.records : []);
      state.lastUpdate = Date.now();
      state.error = payload?.error || null;
      return true;
    } catch (error) {
      if (error?.name === 'AbortError') return false;
      state.error = 'Morocco airport aircraft unavailable';
      console.warn('[Data:Morocco] airport aircraft fetch failed', error);
      return false;
    } finally {
      if (state.abort === abort) {
        state.loading = false;
        state.abort = null;
      }
    }
  };

  const armTimer = (viewer) => {
    clearTimeout(state.timer);
    state.timer = window.setTimeout(() => {
      void fetchAircraft(viewer).finally(() => {
        if (state.enabled) armTimer(viewer);
      });
    }, MOROCCO_AIRPORT_AIRCRAFT_INTERVAL_MS);
  };

  const scheduleFetch = (viewer) => {
    clearTimeout(state.debounce);
    state.debounce = window.setTimeout(() => {
      void fetchAircraft(viewer);
    }, 600);
  };

  return {
    init(viewer) {
      state.viewer = viewer;
      state.dataSource = new Cesium.CustomDataSource(MOROCCO_AIRPORT_AIRCRAFT_LAYER_ID);
      state.dataSource.show = false;
      viewer.dataSources.add(state.dataSource);
    },

    enable(viewer) {
      state.enabled = true;
      state.viewer = viewer || state.viewer;
      if (state.dataSource) state.dataSource.show = true;
      if (state.viewer?.camera?.moveEnd) {
        state.moveEndRemove = state.viewer.camera.moveEnd.addEventListener(() => {
          scheduleFetch(state.viewer);
        });
      }
      void fetchAircraft(state.viewer).finally(() => {
        if (state.enabled) armTimer(state.viewer);
      });
    },

    disable() {
      state.enabled = false;
      state.abort?.abort();
      clearTimeout(state.timer);
      clearTimeout(state.debounce);
      state.timer = null;
      state.debounce = null;
      if (state.moveEndRemove) {
        state.moveEndRemove();
        state.moveEndRemove = null;
      }
      if (state.dataSource) state.dataSource.show = false;
      clear();
    },

    destroy(viewer) {
      this.disable();
      if (state.dataSource && viewer) {
        viewer.dataSources.remove(state.dataSource, true);
      }
      state.dataSource = null;
      state.viewer = null;
    },

    getStats() {
      return {
        count: state.records.length,
        lastUpdate: state.lastUpdate,
        error: state.error,
        loading: state.loading,
      };
    },
  };
}

const moroccoAirportAircraft = createMoroccoAirportAircraftLayer();
export default moroccoAirportAircraft;
