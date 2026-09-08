import { MAP_G_WATER, MAP_R_TERRAIN, packMapsRgba } from "./mapsContract";
import { resampleHeight } from "./presets";

/** UI / shader compare: live, screen-space wipe, or full before. */
export type CompareMode = "off" | "wipe" | "before";

export interface CompareSnap {
  size: number;
  terrain: Float32Array;
  /** Optional water column at capture time; zeros if omitted. */
  water: Float32Array;
}

export const COMPARE_MODE_CODE: Record<CompareMode, number> = {
  off: 0,
  wipe: 1,
  before: 2,
};

export function clampWipe(wipe: number): number {
  const w = Number.isFinite(wipe) ? wipe : 0.5;
  return Math.max(0, Math.min(1, w));
}

export function isCompareMode(value: unknown): value is CompareMode {
  return value === "off" || value === "wipe" || value === "before";
}

/** off → wipe → before → off. Without a snap, stay off. */
export function cycleCompareMode(mode: CompareMode, hasSnap: boolean): CompareMode {
  if (!hasSnap) return "off";
  if (mode === "off") return "wipe";
  if (mode === "wipe") return "before";
  return "off";
}

export function captureCompareSnap(packed: Float32Array, size: number): CompareSnap | null {
  if (!Number.isFinite(size) || size < 2) return null;
  const n = size * size;
  if (!packed || packed.length < n * 4) return null;
  const terrain = new Float32Array(n);
  const water = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    terrain[i] = packed[o + MAP_R_TERRAIN] ?? 0;
    water[i] = packed[o + MAP_G_WATER] ?? 0;
  }
  return { size, terrain, water };
}

export function compareSnapFromFields(
  size: number,
  terrain: Float32Array,
  water?: Float32Array,
): CompareSnap | null {
  if (!Number.isFinite(size) || size < 2) return null;
  const n = size * size;
  if (!terrain || terrain.length < n) return null;
  const w = new Float32Array(n);
  if (water && water.length >= n) w.set(water.subarray(0, n));
  return { size, terrain: terrain.slice(0, n), water: w };
}

export function resampleCompareSnap(snap: CompareSnap, nextSize: number): CompareSnap {
  if (!Number.isFinite(nextSize) || nextSize < 2) return snap;
  if (snap.size === nextSize) {
    return { size: snap.size, terrain: snap.terrain.slice(), water: snap.water.slice() };
  }
  return {
    size: nextSize,
    terrain: resampleHeight(snap.terrain, snap.size, nextSize),
    water: resampleHeight(snap.water, snap.size, nextSize),
  };
}

export function packCompareSnap(snap: CompareSnap): Float32Array {
  const empty = new Float32Array(snap.size * snap.size);
  return packMapsRgba(snap.terrain, snap.water, empty, empty);
}

export function pickCompareSample(
  mode: CompareMode,
  wipe: number,
  screenX01: number,
  live: { h: number; w: number },
  before: { h: number; w: number },
): { h: number; w: number } {
  if (mode === "off") return live;
  if (mode === "before") return before;
  const x = Number.isFinite(screenX01) ? screenX01 : 0;
  return x < clampWipe(wipe) ? before : live;
}
