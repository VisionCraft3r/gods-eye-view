/**
 * Bottom-left Morocco flag + country settings sheet.
 * Pattern: compact flag control that opens a glass map-options sheet
 * (Grab / Slopes), with live OSM places and companion globe layers.
 */

import * as Cesium from 'cesium';
import { CITY_POIS, flyToPresetLocation } from './locations.js';
import {
  MOROCCO_CITY_IDS,
  MOROCCO_COMPANION_LAYERS,
  MOROCCO_DEFAULT_KINDS,
  MOROCCO_KIND_IDS,
  MOROCCO_KIND_META,
  MOROCCO_OVERVIEW,
  MOROCCO_PACK_STORAGE_KEY,
  isInMorocco,
  normalizeMoroccoKinds,
} from './data/moroccoBounds.js';
import {
  formatMoroccoCountryLine,
  formatMoroccoMarine,
  formatMoroccoWeather,
} from './data/moroccoContextData.js';

const DEFAULT_COMPANIONS = Object.freeze({
  flights: true,
  'ais-live-vessels': true,
  earthquakes: true,
  'local-firms': true,
  traffic: true,
  radio: false,
  'oncf-trains': true,
});

function readStore() {
  try {
    const raw = localStorage.getItem(MOROCCO_PACK_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeStore(state) {
  try {
    localStorage.setItem(MOROCCO_PACK_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* private mode */
  }
}

function cameraInMorocco(viewer) {
  const carto = viewer?.camera?.positionCartographic;
  if (!carto) return false;
  return isInMorocco(
    Cesium.Math.toDegrees(carto.latitude),
    Cesium.Math.toDegrees(carto.longitude),
  );
}

function flyToMoroccoOverview(viewer) {
  if (!viewer?.camera) return;
  viewer.camera.cancelFlight();
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(
      MOROCCO_OVERVIEW.lon,
      MOROCCO_OVERVIEW.lat,
      MOROCCO_OVERVIEW.heightM,
    ),
    orientation: {
      heading: Cesium.Math.toRadians(MOROCCO_OVERVIEW.headingDeg),
      pitch: Cesium.Math.toRadians(MOROCCO_OVERVIEW.pitchDeg),
      roll: 0,
    },
    duration: 2.4,
    endTransform: Cesium.Matrix4.IDENTITY,
  });
}

function clockFromIso(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(11, 16);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Casablanca',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function fillLinkList(host, items, emptyText) {
  if (!host) return;
  host.innerHTML = '';
  if (!items.length) {
    const empty = document.createElement('li');
    empty.textContent = emptyText;
    host.appendChild(empty);
    return;
  }
  for (const item of items) {
    const li = document.createElement('li');
    if (item.url) {
      const link = document.createElement('a');
      link.href = item.url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = item.title;
      li.appendChild(link);
    } else {
      li.textContent = item.title;
    }
    host.appendChild(li);
  }
}

/**
 * @param {{viewer: object, dataManager: object, styleManager: object}} options
 * @returns {() => void}
 */
export function installMoroccoPack({ viewer, dataManager, styleManager } = {}) {
  const root = document.getElementById('morocco-pack');
  const flag = document.getElementById('morocco-pack-flag');
  const sheet = document.getElementById('morocco-pack-sheet');
  const kindsHost = document.getElementById('morocco-pack-kinds');
  const citiesHost = document.getElementById('morocco-pack-cities');
  const liveHost = document.getElementById('morocco-pack-live');
  const status = document.getElementById('morocco-pack-status');
  const countryLine = document.getElementById('morocco-pack-country');
  const weatherLine = document.getElementById('morocco-pack-weather');
  const marineLine = document.getElementById('morocco-pack-marine');
  const metarLine = document.getElementById('morocco-pack-metar');
  const sunLine = document.getElementById('morocco-pack-sun');
  const prayerLine = document.getElementById('morocco-pack-prayer');
  const quakeLine = document.getElementById('morocco-pack-quake');
  const wiki = document.getElementById('morocco-pack-wiki');
  const catalog = document.getElementById('morocco-pack-catalog');
  const flyBtn = document.getElementById('morocco-pack-fly');
  const enableBtn = document.getElementById('morocco-pack-enable');
  if (!root || !flag || !sheet || !viewer) return () => {};

  const stored = readStore() || {};
  const state = {
    open: false,
    enabled: false,
    kinds: normalizeMoroccoKinds(stored.kinds),
    companions: { ...DEFAULT_COMPANIONS, ...(stored.companions || {}) },
  };

  const persist = () => {
    writeStore({
      kinds: state.kinds,
      companions: state.companions,
    });
  };

  const syncCityPills = () => {
    for (const pill of document.querySelectorAll('.location-pill[data-pack="morocco"]')) {
      pill.hidden = !state.enabled;
    }
  };

  const paintFlag = () => {
    flag.setAttribute('aria-pressed', String(state.open));
    flag.classList.toggle('active', state.enabled);
    sheet.hidden = !state.open;
    root.classList.toggle('open', state.open);
    enableBtn.textContent = state.enabled ? 'Pack on' : 'Turn pack on';
    enableBtn.setAttribute('aria-pressed', String(state.enabled));
    syncCityPills();
  };

  const setKindButtons = () => {
    if (!kindsHost || kindsHost.childElementCount) return;
    for (const id of MOROCCO_KIND_IDS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'morocco-pack-chip';
      button.dataset.kind = id;
      button.textContent = MOROCCO_KIND_META[id].label;
      button.addEventListener('click', () => {
        const next = new Set(state.kinds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        state.kinds = normalizeMoroccoKinds([...next].length ? [...next] : [...MOROCCO_DEFAULT_KINDS]);
        persist();
        paintChips();
        dataManager?.setLayerParams?.(MOROCCO_LAYER, { kinds: state.kinds }, { origin: 'user' });
      });
      kindsHost.appendChild(button);
    }
  };

  const setCityButtons = () => {
    if (!citiesHost || citiesHost.childElementCount) return;
    for (const cityId of ['morocco', ...MOROCCO_CITY_IDS]) {
      const city = CITY_POIS[cityId];
      if (!city) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'morocco-pack-chip';
      button.dataset.city = cityId;
      button.textContent = city.name;
      button.addEventListener('click', () => {
        if (!state.enabled) {
          state.enabled = true;
          void applyEnabled({ flyIfNeeded: false });
        }
        styleManager?._stampNavigation?.();
        if (cityId === 'morocco') flyToMoroccoOverview(viewer);
        else flyToPresetLocation(viewer, cityId, { viewMode: 'overview' });
        styleManager?._setActiveLocation?.(cityId === 'morocco' ? 'casablanca' : cityId);
      });
      citiesHost.appendChild(button);
    }
  };

  const setLiveButtons = () => {
    if (!liveHost || liveHost.childElementCount) return;
    for (const layer of MOROCCO_COMPANION_LAYERS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'morocco-pack-chip';
      button.dataset.layer = layer.id;
      button.textContent = layer.label;
      button.addEventListener('click', async () => {
        const next = !state.companions[layer.id];
        state.companions[layer.id] = next;
        persist();
        paintChips();
        if (state.enabled) {
          await dataManager?.setEnabled?.(layer.id, next, { origin: 'user' });
        }
      });
      liveHost.appendChild(button);
    }
  };

  const paintChips = () => {
    for (const button of kindsHost?.querySelectorAll('[data-kind]') || []) {
      button.setAttribute('aria-pressed', String(state.kinds.includes(button.dataset.kind)));
    }
    for (const button of liveHost?.querySelectorAll('[data-layer]') || []) {
      button.setAttribute('aria-pressed', String(!!state.companions[button.dataset.layer]));
    }
  };

  const MOROCCO_LAYER = 'morocco';

  const applyEnabled = async ({ flyIfNeeded = false } = {}) => {
    persist();
    paintFlag();
    paintChips();
    syncCityPills();
    if (!dataManager) return;
    await dataManager.setEnabled(MOROCCO_LAYER, state.enabled, { origin: 'user' });
    if (state.enabled) {
      dataManager.setLayerParams?.(MOROCCO_LAYER, { kinds: state.kinds }, { origin: 'user' });
      for (const [layerId, on] of Object.entries(state.companions)) {
        if (on) await dataManager.setEnabled(layerId, true, { origin: 'user' });
      }
      if (flyIfNeeded && !cameraInMorocco(viewer)) {
        styleManager?._stampNavigation?.();
        flyToMoroccoOverview(viewer);
      }
    }
  };

  const refreshContext = async () => {
    const carto = viewer.camera?.positionCartographic;
    const lat = carto ? Cesium.Math.toDegrees(carto.latitude) : MOROCCO_OVERVIEW.lat;
    const lon = carto ? Cesium.Math.toDegrees(carto.longitude) : MOROCCO_OVERVIEW.lon;
    try {
      const response = await fetch(`/api/morocco/context?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (countryLine) countryLine.textContent = formatMoroccoCountryLine(payload.country);
      const aqi = payload.airQuality || {};
      const aqiBits = [
        Number.isFinite(aqi.usAqi) ? `US AQI ${Math.round(aqi.usAqi)}` : '',
        Number.isFinite(aqi.pm25) ? `PM2.5 ${aqi.pm25.toFixed(1)} µg/m³` : '',
      ].filter(Boolean);
      if (status) status.textContent = aqiBits.join(' · ') || 'Air quality — unavailable';
      if (weatherLine) {
        weatherLine.textContent = formatMoroccoWeather({
          temperature_2m: payload.weather?.temperatureC,
          weather_code: payload.weather?.weatherCode,
          wind_speed_10m: payload.weather?.windKmh,
        }) || '';
      }
      if (marineLine) {
        marineLine.textContent = formatMoroccoMarine({
          wave_height: payload.marine?.waveHeightM,
          sea_surface_temperature: payload.marine?.sstC,
        }) || '';
      }
      if (metarLine) {
        const metar = payload.metar;
        metarLine.textContent = metar?.raw
          ? `${metar.icao}${metar.fltCat ? ` ${metar.fltCat}` : ''} · ${metar.raw}`
          : '';
      }
      if (sunLine) {
        const rise = clockFromIso(payload.weather?.sunrise);
        const set = clockFromIso(payload.weather?.sunset);
        sunLine.textContent = rise && set ? `Sunrise ${rise} · sunset ${set} (Casablanca)` : '';
      }
      if (prayerLine) {
        const prayer = payload.prayer;
        prayerLine.textContent = prayer
          ? `Prayer · Fajr ${prayer.fajr} · Dhuhr ${prayer.dhuhr} · Maghrib ${prayer.maghrib}`
          : '';
      }
      if (quakeLine) {
        const quake = Array.isArray(payload.quakes) ? payload.quakes[0] : null;
        quakeLine.textContent = quake
          ? `Quake M${quake.mag.toFixed(1)} · ${quake.region}`
          : '';
      }
      fillLinkList(
        wiki,
        Array.isArray(payload.wikipedia) ? payload.wikipedia : [],
        'No nearby Wikipedia pages',
      );
      fillLinkList(
        catalog,
        (Array.isArray(payload.catalog) ? payload.catalog : []).slice(0, 8),
        payload.country?.name
          ? `${payload.country.name} · official catalog unavailable`
          : 'Official catalog unavailable',
      );
    } catch {
      if (status) status.textContent = 'Live Morocco feeds unavailable';
    }
  };

  setKindButtons();
  setCityButtons();
  setLiveButtons();
  paintChips();
  paintFlag();

  const onFlag = () => {
    state.open = !state.open;
    paintFlag();
    if (state.open) void refreshContext();
  };
  const onEnable = () => {
    state.enabled = !state.enabled;
    void applyEnabled({ flyIfNeeded: state.enabled });
  };
  const onFly = () => {
    state.enabled = true;
    styleManager?._stampNavigation?.();
    flyToMoroccoOverview(viewer);
    void applyEnabled({ flyIfNeeded: false });
  };

  flag.addEventListener('click', onFlag);
  enableBtn?.addEventListener('click', onEnable);
  flyBtn?.addEventListener('click', onFly);

  return () => {
    flag.removeEventListener('click', onFlag);
    enableBtn?.removeEventListener('click', onEnable);
    flyBtn?.removeEventListener('click', onFly);
  };
}
