import type { Viewport } from "../scene/Viewport";
import { createSimApi, type SimApi } from "../sim/api";
import { PRESETS, resampleHeight } from "../sim/presets";
import type { Store } from "../state/store";
import { QUALITY_GRID } from "../state/types";

/** Wraps the live viewport when Sim has bootstrapped it. Missing methods fall back to stubs. */
export function bindViewport(viewport: Viewport, store: Store): SimApi {
  return createSimApi({
    hasLiveBackend: () => true,
    listPresets: () => PRESETS.map((p) => ({ id: p.id, title: p.title, blurb: p.blurb })),
    loadPreset: (id) => viewport.loadPreset(id, true),
    setQuality: (quality) => viewport.applyQuality(quality, true),
    stepOnce: () => viewport.stepOnce(),
    undo: () => viewport.undo(),
    redo: () => viewport.redo(),
    canUndo: () => viewport.history.canUndo,
    canRedo: () => viewport.history.canRedo,
    resetWater: () => viewport.resetWater(),
    resetScene: () => viewport.resetScene(),
    applyParams: () => viewport.applyParams(),
    getSources: () => viewport.sources.map((s) => ({ ...s })),
    removeSelectedSource: async () => {
      await viewport.pushHistory();
      viewport.removeSelectedSource();
    },
    setSelectedRate: (rate) => viewport.setSelectedRate(rate),
    snapshot: () => viewport.snapshot(),
    applySnapshot: (snap) => viewport.applySnapshot(snap),
    screenshotPng: () => viewport.screenshotPng(),
    getStats: () => ({
      waterVolume: viewport.waterVolume,
      erodedSand: viewport.erodedSand,
      fps: viewport.fps,
      grid: viewport.lastSize,
    }),
    applyGeneratedMaps: (maps) => viewport.applyGeneratedMaps(maps),
    applyLoadedScene: (data) => {
      const grid = QUALITY_GRID[store.state.quality];
      const terrain =
        data.size === grid ? data.terrain : resampleHeight(data.terrain, data.size, grid);
      const water = data.size === grid ? data.water : resampleHeight(data.water, data.size, grid);
      const wetness =
        data.size === grid ? data.wetness : resampleHeight(data.wetness, data.size, grid);
      store.patch({
        params: data.params,
        presetId: data.presetId,
        texturePrompt: data.texturePrompt,
        selectedSourceId: data.sources[0]?.id ?? null,
      });
      viewport.sources = data.sources.map((s) => ({ ...s }));
      viewport.applySnapshot({
        size: grid,
        terrain,
        water,
        wetness,
        sediment: new Float32Array(grid * grid),
        sources: data.sources,
        erodedSand: 0,
      });
      viewport.applyParams();
    },
  });
}
