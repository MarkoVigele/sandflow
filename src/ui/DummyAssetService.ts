import { createAssetService, type AssetProvider, type GeneratedMaps } from "../assets/AssetService";

/** UI-facing dummy texture service. Local canvas maps today; HTTP hook later. */
export function createDummyAssetService(): AssetProvider {
  return createAssetService();
}

export type { AssetProvider, GeneratedMaps };
