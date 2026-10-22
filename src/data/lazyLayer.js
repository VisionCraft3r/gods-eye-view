/**
 * Defer loading a heavy data-layer module until the layer is first enabled.
 * Registration still needs a stable id up front for layer-state restore.
 *
 * @param {{ id: string, name?: string, icon?: string, showInTogglePanel?: boolean, updateInterval?: number }} meta
 * @param {() => Promise<{ default: object }>} importer
 */
export function createLazyDataLayer(meta, importer) {
  if (!meta?.id || typeof importer !== 'function') {
    throw new Error('createLazyDataLayer requires id + importer');
  }

  let inner = null;
  let loadPromise = null;
  let initialized = false;

  const ensure = async () => {
    if (inner) return inner;
    if (!loadPromise) {
      loadPromise = importer().then((mod) => {
        const layer = mod?.default || mod;
        if (!layer || layer.id !== meta.id) {
          throw new Error(`Lazy layer ${meta.id} resolved a mismatched module`);
        }
        inner = layer;
        return inner;
      });
    }
    return loadPromise;
  };

  const forward = async (method, viewer, ...args) => {
    const layer = await ensure();
    if (!initialized && typeof layer.init === 'function' && viewer) {
      layer.init(viewer);
      initialized = true;
    }
    if (typeof layer[method] !== 'function') return undefined;
    return layer[method](viewer, ...args);
  };

  return {
    id: meta.id,
    name: meta.name,
    icon: meta.icon,
    showInTogglePanel: meta.showInTogglePanel,
    updateInterval: meta.updateInterval,
    get _lazy() {
      return true;
    },
    get _inner() {
      return inner;
    },
    async init(viewer) {
      // Defer real init until enable so cold start stays lean.
      this._viewer = viewer;
    },
    async enable(viewer) {
      return forward('enable', viewer || this._viewer);
    },
    async disable(viewer) {
      if (!inner) return undefined;
      return inner.disable?.(viewer || this._viewer);
    },
    async update(viewer) {
      if (!inner) return false;
      return inner.update?.(viewer || this._viewer);
    },
    async destroy(viewer) {
      if (!inner) return undefined;
      const result = await inner.destroy?.(viewer || this._viewer);
      initialized = false;
      return result;
    },
    getStats() {
      return inner?.getStats?.() || { count: 0, loading: !!loadPromise && !inner };
    },
    getNearby(...args) {
      return inner?.getNearby?.(...args) || [];
    },
    getAllPositions(...args) {
      return inner?.getAllPositions?.(...args) || [];
    },
    findByQuery(...args) {
      return inner?.findByQuery?.(...args) ?? null;
    },
    getAnalystRecords(...args) {
      return inner?.getAnalystRecords?.(...args) || [];
    },
    selectById(...args) {
      return inner?.selectById?.(...args) || false;
    },
    clearSelection(...args) {
      return inner?.clearSelection?.(...args);
    },
    getSelectedInfo(...args) {
      return inner?.getSelectedInfo?.(...args) || null;
    },
    attachDataManager(manager) {
      this._pendingManager = manager;
      if (inner?.attachDataManager) inner.attachDataManager(manager);
      else {
        void ensure().then((layer) => {
          if (this._pendingManager && layer.attachDataManager) {
            layer.attachDataManager(this._pendingManager);
          }
        });
      }
    },
  };
}
