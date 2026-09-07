import type { QualityId, SimParams, SimStats, WaterSource } from "../state/types";

/**
 * Thin public surface for the UI layer.
 * Sim owns the live backend; UI may ship stubs until that surface is wired.
 */
export interface PresetCard {
  id: string;
  title: string;
  blurb: string;
}

export interface SceneSnapshot {
  size: number;
  terrain: Float32Array;
  water: Float32Array;
  wetness: Float32Array;
  sediment: Float32Array;
  sources: WaterSource[];
  erodedSand: number;
}

export interface GeneratedTextureMaps {
  albedo: HTMLCanvasElement;
  normal: HTMLCanvasElement;
  roughness: HTMLCanvasElement;
  prompt: string;
  provider: string;
}

export interface SimApi {
  listPresets(): PresetCard[];
  loadPreset(id: string): void;
  setQuality(quality: QualityId): void;
  stepOnce(): void;
  undo(): Promise<void>;
  redo(): Promise<void>;
  canUndo(): boolean;
  canRedo(): boolean;
  resetWater(): void;
  resetScene(): void;
  applyParams(): void;
  getSources(): WaterSource[];
  removeSelectedSource(): Promise<void>;
  setSelectedRate(rate: number): void;
  snapshot(): Promise<SceneSnapshot | null>;
  applySnapshot(snap: SceneSnapshot): void;
  screenshotPng(): string | null;
  getStats(): SimStats;
  applyGeneratedMaps(maps: GeneratedTextureMaps): void;
  applyLoadedScene(data: LoadedScene): void;
  hasLiveBackend(): boolean;
}

export interface LoadedScene {
  params: SimParams;
  presetId: string;
  texturePrompt: string;
  sources: WaterSource[];
  size: number;
  terrain: Float32Array;
  water: Float32Array;
  wetness: Float32Array;
}

export const STUB_PRESETS: PresetCard[] = [
  {
    id: "flat",
    title: "Flache Wanne",
    blurb: "Ebenes Sandbett, eine Quelle oben in der Mitte. Gut, um zu sehen, wie sich Adern von allein suchen.",
  },
  {
    id: "slope",
    title: "Sanfte Schräge",
    blurb: "Leichtes Gefälle von oben nach unten. Wasser bleibt in der Spur, gräbt aber tiefer nach.",
  },
  {
    id: "bed",
    title: "Vorgegrabenes Bett",
    blurb: "Ein flaches Rinnsal liegt schon da. Wasser folgt erst, dann frisst es Ufer und verzweigt sich.",
  },
  {
    id: "meet",
    title: "Zwei Quellen",
    blurb: "Zwei Zuläufe treffen sich in einer Mulde. Ablagerung und Überlauf entstehen von allein.",
  },
];

const emptyStats = (): SimStats => ({
  waterVolume: 0,
  erodedSand: 0,
  fps: 0,
  grid: 0,
});

export function createStubSimApi(): SimApi {
  return {
    listPresets: () => STUB_PRESETS.map((p) => ({ ...p })),
    loadPreset: () => undefined,
    setQuality: () => undefined,
    stepOnce: () => undefined,
    undo: async () => undefined,
    redo: async () => undefined,
    canUndo: () => false,
    canRedo: () => false,
    resetWater: () => undefined,
    resetScene: () => undefined,
    applyParams: () => undefined,
    getSources: () => [],
    removeSelectedSource: async () => undefined,
    setSelectedRate: () => undefined,
    snapshot: async () => null,
    applySnapshot: () => undefined,
    screenshotPng: () => null,
    getStats: emptyStats,
    applyGeneratedMaps: () => undefined,
    applyLoadedScene: () => undefined,
    hasLiveBackend: () => false,
  };
}

export function createSimApi(backend?: Partial<SimApi>): SimApi {
  return { ...createStubSimApi(), ...backend };
}
