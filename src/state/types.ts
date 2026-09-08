export type ToolId =
  | "pile"
  | "dig"
  | "smooth"
  | "dam"
  | "tamp"
  | "groove"
  | "flatten"
  | "concrete"
  | "stone"
  | "erase"
  | "pour"
  | "source";

export type QualityId = "low" | "medium" | "high" | "ultra";

export const QUALITY_LABEL: Record<QualityId, string> = {
  low: "Niedrig",
  medium: "Mittel",
  high: "Hoch",
  ultra: "Ultra",
};

export const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];

export function speedLabel(speed: number): string {
  return `${String(speed).replace(".", ",")}×`;
}

export type HeatmapMode = "off" | "flow" | "depth";

/** Plain-language labels for the cheap sand overlay (flow = speed, depth = wetness). */
export const HEATMAP_LABEL: Record<HeatmapMode, string> = {
  off: "Aus",
  flow: "Strömung",
  depth: "Nässe",
};

export type OnboardStep = 0 | 1 | 2 | 3;

export interface SimParams {
  grain: number;
  cohesion: number;
  infiltration: number;
  erosionRate: number;
  sedimentCapacity: number;
  deposition: number;
  evaporation: number;
  flowRate: number;
}

export type SourceKind = "point" | "rain";

export interface WaterSource {
  id: string;
  x: number;
  y: number;
  rate: number;
  /** Default point. Rain sprinkles over `spread` instead of a 3×3 pin kernel. */
  kind?: SourceKind;
  /** UV half-width for rain. Ignored for point sources. */
  spread?: number;
}

export function sourceKindOf(src: WaterSource): SourceKind {
  return src.kind === "rain" ? "rain" : "point";
}

export interface SimStats {
  waterVolume: number;
  erodedSand: number;
  fps: number;
  grid: number;
}

export const QUALITY_GRID: Record<QualityId, number> = {
  low: 128,
  medium: 256,
  high: 512,
  ultra: 512,
};

/** Preset bed height. Relief exaggerates deviation so the slab does not lift into the camera. */
export const HEIGHT_PIVOT = 0.42;
/** World Y per heightmap unit at Relief = 1. */
export const HEIGHT_WORLD = 2.5;
export const DEFAULT_RELIEF = 1.5;
export const RELIEF_MIN = 0.8;
export const RELIEF_MAX = 2.4;
export const DEFAULT_WAVES = 1;
export const WAVES_MIN = 0;
export const WAVES_MAX = 1.4;

export const DEFAULT_PARAMS: SimParams = {
  grain: 0.55,
  cohesion: 0.28,
  infiltration: 0.01,
  erosionRate: 0.62,
  sedimentCapacity: 0.58,
  deposition: 0.3,
  evaporation: 0.004,
  flowRate: 1.22,
};

export function isMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function defaultQuality(): QualityId {
  return isMobile() ? "medium" : "high";
}
