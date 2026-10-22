import { createApplicationData } from '../app/data.js';
import { installMoroccoPack } from '../moroccoPackUi.js';
import { getStandaloneCatalog } from './catalog.js';
export function createStandaloneData(options) {
  const data = createApplicationData({
    catalog: options?.catalog ?? getStandaloneCatalog(),
    ...options,
  });
  const removePack = installMoroccoPack({
    viewer: options?.scene?.viewer,
    dataManager: data.dataManager,
    styleManager: options?.controls?.styleManager,
  });
  options?.defer?.(removePack);
  return data;
}
