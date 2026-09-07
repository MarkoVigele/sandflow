export type ToolId =
  | "pile"
  | "dig"
  | "smooth"
  | "dam"
  | "tamp"
  | "groove"
  | "flatten"
  | "pour"
  | "source";

export type QualityId = "low" | "medium" | "high" | "ultra";

export type HeatmapMode = "off" | "flow" | "depth";

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

export interface WaterSource {
  id: string;
  x: number;
  y: number;
  rate: number;
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
