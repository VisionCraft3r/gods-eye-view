/**
 * Bottom-left Morocco flag + glass HUD sheet.
 * Matches DATA LAYERS / LOCATION / CCTV: glass panel, mono title,
 * scene-btn actions, and location-style chips — not a consumer-app sheet.
 */

import * as Cesium from 'cesium';
import { CITY_POIS, flyToPresetLocation } from './locations.js';
import {
  MOROCCO_CITY_IDS,
  MOROCCO_COMPANION_LAYERS,
  MOROCCO_DEFAULT_KINDS,
  MOROCCO_FOCUS_KEEP_LAYER_IDS,
  MOROCCO_FOCUS_KINDS,
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

const MOROCCO_LAYER = 'morocco';

const DEFAULT_COMPANIONS = Object.freeze(
  Object.fromEntries(
    // Stay lean on first enable: companions are opt-in so restart/API burn stays low.
    MOROCCO_COMPANION_LAYERS.map((layer) => [layer.id, false]),
  ),
);

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
  const focusBtn = document.getElementById('morocco-pack-focus');
  const focusHint = document.getElementById('morocco-pack-focus-hint');
  if (!root || !flag || !sheet || !viewer) return () => {};

  const stored = readStore() || {};
  const state = {
    open: false,
    enabled: stored.enabled === true,
    // Default ON: Morocco sessions stay snappy until the operator opts out.
    focus: stored.focus !== false,
    kinds: normalizeMoroccoKinds(stored.kinds),
    fullKinds: normalizeMoroccoKinds(stored.fullKinds || stored.kinds),
    companions: { ...DEFAULT_COMPANIONS, ...(stored.companions || {}) },
    parkedLayers: Array.isArray(stored.parkedLayers) ? stored.parkedLayers.map(String) : [],
  };

  const persist = () => {
    writeStore({
      enabled: state.enabled,
      focus: state.focus,
      kinds: state.kinds,
      fullKinds: state.fullKinds,
      companions: state.companions,
      parkedLayers: state.parkedLayers,
    });
  };

  const keepIds = () => {
    const keep = new Set(MOROCCO_FOCUS_KEEP_LAYER_IDS);
    for (const [layerId, on] of Object.entries(state.companions)) {
      if (on) keep.add(layerId);
    }
    return keep;
  };

  const applyFocusKinds = () => {
    if (state.focus) {
      state.fullKinds = normalizeMoroccoKinds(state.kinds.length ? state.kinds : state.fullKinds);
      state.kinds = normalizeMoroccoKinds([...MOROCCO_FOCUS_KINDS]);
    } else if (state.fullKinds?.length) {
      state.kinds = normalizeMoroccoKinds(state.fullKinds);
    }
  };

  const parkNonMoroccoLayers = async () => {
    if (!dataManager?.getEnabledLayerIds || !dataManager?.setEnabled) return;
    const enabled = [...dataManager.getEnabledLayerIds()];
    const keep = keepIds();
    const toPark = enabled.filter((id) => !keep.has(id));
    // Remember previously-on layers so Focus OFF can restore them.
    const parked = new Set(state.parkedLayers);
    for (const id of toPark) parked.add(id);
    state.parkedLayers = [...parked];
    persist();
    for (const id of toPark) {
      await dataManager.setEnabled(id, false, { origin: 'morocco-focus' });
    }
  };

  const restoreParkedLayers = async () => {
    if (!dataManager?.setEnabled) return;
    const restore = [...state.parkedLayers];
    state.parkedLayers = [];
    persist();
    for (const id of restore) {
      if (id === MOROCCO_LAYER) continue;
      await dataManager.setEnabled(id, true, { origin: 'morocco-focus-restore' });
    }
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
    if (enableBtn) {
      enableBtn.textContent = state.enabled ? 'PACK ON' : 'PACK OFF';
      enableBtn.setAttribute('aria-pressed', String(state.enabled));
    }
    if (focusBtn) {
      focusBtn.textContent = state.focus ? 'FOCUS ON' : 'FOCUS OFF';
      focusBtn.setAttribute('aria-pressed', String(state.focus));
      focusBtn.disabled = !state.enabled;
    }
    if (focusHint) {
      focusHint.textContent = state.focus
        ? 'Focus parks world layers (satellites, CCTV, rockets, …). Live chips below stay available.'
        : 'Focus off — previously parked world layers are restored when you leave Focus.';
    }
    syncCityPills();
  };

  const paintChips = () => {
    for (const button of kindsHost?.querySelectorAll('[data-kind]') || []) {
      button.setAttribute('aria-pressed', String(state.kinds.includes(button.dataset.kind)));
    }
    for (const button of liveHost?.querySelectorAll('[data-layer]') || []) {
      button.setAttribute('aria-pressed', String(!!state.companions[button.dataset.layer]));
    }
  };

  const applyEnabled = async ({ flyIfNeeded = false } = {}) => {
    if (state.enabled && state.focus) applyFocusKinds();
    persist();
    paintFlag();
    paintChips();
    syncCityPills();
    if (!dataManager) return;
    if (state.enabled) {
      if (state.focus) await parkNonMoroccoLayers();
      await dataManager.setEnabled(MOROCCO_LAYER, true, { origin: 'user' });
      dataManager.setLayerParams?.(MOROCCO_LAYER, { kinds: state.kinds }, { origin: 'user' });
      for (const [layerId, on] of Object.entries(state.companions)) {
        await dataManager.setEnabled(layerId, !!on, { origin: 'user' });
      }
      if (flyIfNeeded && !cameraInMorocco(viewer)) {
        styleManager?._stampNavigation?.();
        flyToMoroccoOverview(viewer);
      }
    } else {
      await dataManager.setEnabled(MOROCCO_LAYER, false, { origin: 'user' });
      // Turning the pack off restores anything Focus parked.
      if (state.parkedLayers.length) await restoreParkedLayers();
    }
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
        state.kinds = normalizeMoroccoKinds(
          [...next].length ? [...next] : [...MOROCCO_DEFAULT_KINDS],
        );
        if (!state.focus) state.fullKinds = state.kinds;
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

  const refreshContext = async () => {
    const carto = viewer.camera?.positionCartographic;
    const lat = carto ? Cesium.Math.toDegrees(carto.latitude) : MOROCCO_OVERVIEW.lat;
    const lon = carto ? Cesium.Math.toDegrees(carto.longitude) : MOROCCO_OVERVIEW.lon;
    try {
      const response = await fetch(
        `/api/morocco/context?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`,
      );
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
        const raw = metar?.rawOb || metar?.raw || '';
        const icao = metar?.icaoId || metar?.icao || '';
        metarLine.textContent = raw
          ? `${icao}${metar.fltCat ? ` ${metar.fltCat}` : ''} · ${raw}`
          : '';
      }
      if (sunLine) {
        const rise = clockFromIso(payload.weather?.sunrise);
        const set = clockFromIso(payload.weather?.sunset);
        sunLine.textContent = rise && set
          ? `Sunrise ${rise} · sunset ${set} (Casablanca)`
          : '';
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
          ? `Quake M${Number(quake.mag).toFixed(1)} · ${quake.region || quake.flynn_region || 'Morocco'}`
          : '';
      }
      fillLinkList(
        wiki,
        Array.isArray(payload.wikipedia) ? payload.wikipedia : [],
        'No nearby Wikipedia pages',
      );
      const catalogItems = Array.isArray(payload.catalog)
        ? payload.catalog
        : (Array.isArray(payload.catalog?.results) ? payload.catalog.results : []);
      fillLinkList(
        catalog,
        catalogItems.slice(0, 8).map((item) => ({
          title: item.title || item.name || item.id,
          url: item.url || item.link || null,
        })),
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

  // Restore last pack enablement only — companions already filtered to saved prefs.
  if (state.enabled) {
    void applyEnabled({ flyIfNeeded: false });
  }

  const onFlag = () => {
    state.open = !state.open;
    paintFlag();
    if (state.open) void refreshContext();
  };
  const onEnable = () => {
    state.enabled = !state.enabled;
    void applyEnabled({ flyIfNeeded: state.enabled });
  };
  const onFocus = () => {
    if (!state.enabled) return;
    const next = !state.focus;
    state.focus = next;
    void (async () => {
      if (next) {
        applyFocusKinds();
        persist();
        paintFlag();
        paintChips();
        dataManager?.setLayerParams?.(MOROCCO_LAYER, { kinds: state.kinds }, { origin: 'user' });
        await parkNonMoroccoLayers();
      } else {
        if (state.fullKinds?.length) {
          state.kinds = normalizeMoroccoKinds(state.fullKinds);
        }
        persist();
        paintFlag();
        paintChips();
        dataManager?.setLayerParams?.(MOROCCO_LAYER, { kinds: state.kinds }, { origin: 'user' });
        await restoreParkedLayers();
      }
    })();
  };
  const onFly = () => {
    state.enabled = true;
    styleManager?._stampNavigation?.();
    flyToMoroccoOverview(viewer);
    void applyEnabled({ flyIfNeeded: false });
  };

  flag.addEventListener('click', onFlag);
  enableBtn?.addEventListener('click', onEnable);
  focusBtn?.addEventListener('click', onFocus);
  flyBtn?.addEventListener('click', onFly);

  return () => {
    flag.removeEventListener('click', onFlag);
    enableBtn?.removeEventListener('click', onEnable);
    focusBtn?.removeEventListener('click', onFocus);
    flyBtn?.removeEventListener('click', onFly);
  };
}
