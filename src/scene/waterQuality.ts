import type { QualityId } from "../state/types";

/** 0 = low … 3 = ultra. Matches `uQuality` in water shaders. */
export const WATER_QUALITY_INDEX: Record<QualityId, number> = {
  low: 0,
  medium: 1,
  high: 2,
  ultra: 3,
};

export type WaterQualityTier = {
  id: QualityId;
  /** PlaneGeometry segments. Ultra is dense enough for vertex waves. */
  meshSegs: number;
  /** Sine octaves in the water shaders. Low is one cheap ripple. */
  waveOctaves: number;
  /** Extra sheet height in heightmap units. 0 on Low (fragment ripples only). */
  waveDisplace: number;
  /** 0..1 — shoreline lace / second foam ring. */
  foamDetail: number;
  /** Multiplier on Beer's-law absorption coefficients. */
  beerStrength: number;
  /** Schlick / screen-space fresnel scale. */
  fresnelScale: number;
  specPower: number;
};

export const WATER_QUALITY: Record<QualityId, WaterQualityTier> = {
  low: {
    id: "low",
    meshSegs: 80,
    waveOctaves: 1,
    waveDisplace: 0,
    foamDetail: 0.28,
    beerStrength: 0.52,
    fresnelScale: 0.68,
    specPower: 10,
  },
  medium: {
    id: "medium",
    meshSegs: 128,
    waveOctaves: 2,
    waveDisplace: 0.00115,
    foamDetail: 0.52,
    beerStrength: 0.74,
    fresnelScale: 0.92,
    specPower: 16,
  },
  high: {
    id: "high",
    meshSegs: 224,
    waveOctaves: 3,
    waveDisplace: 0.00225,
    foamDetail: 0.72,
    beerStrength: 0.9,
    fresnelScale: 1.12,
    specPower: 22,
  },
  ultra: {
    id: "ultra",
    meshSegs: 352,
    waveOctaves: 4,
    waveDisplace: 0.00355,
    foamDetail: 0.88,
    beerStrength: 1.08,
    fresnelScale: 1.22,
    specPower: 24,
  },
};

export function waterQualityIndex(quality: QualityId): number {
  return WATER_QUALITY_INDEX[quality];
}

export function waterQualityTier(quality: QualityId): WaterQualityTier {
  return WATER_QUALITY[quality];
}

/**
 * Beer's-law transmittance through a water column.
 * `sigma` is absorption per unit depth (R absorbs most). Path ≈ depth / ndv.
 */
export function beerTransmittance(
  depth: number,
  ndv: number,
  sigma: readonly [number, number, number],
  strength = 1,
): [number, number, number] {
  const d = Number.isFinite(depth) && depth > 0 ? depth : 0;
  const n = Number.isFinite(ndv) && ndv > 0.12 ? ndv : 0.12;
  const path = (d / n) * strength;
  return [
    Math.exp(-sigma[0] * path),
    Math.exp(-sigma[1] * path),
    Math.exp(-sigma[2] * path),
  ];
}

/** Schlick fresnel for water (F0 ≈ 0.02). */
export function schlickFresnel(ndv: number, f0 = 0.02, scale = 1): number {
  const x = 1 - Math.min(1, Math.max(0, ndv));
  return (f0 + (1 - f0) * x * x * x * x * x) * scale;
}

/**
 * Contact-line foam from dry/shallow neighbors.
 * `neighborDepths` are the four (or eight) adjacent water samples.
 */
export function contactLineFoam(
  centerDepth: number,
  neighborDepths: readonly number[],
  flow: number,
  detail = 1,
): number {
  const depth = Number.isFinite(centerDepth) ? Math.max(0, centerDepth) : 0;
  if (depth < 0.0009) return 0;
  const fl = Number.isFinite(flow) ? Math.min(1, Math.max(0, flow)) : 0;
  let shore = 0;
  for (const w of neighborDepths) {
    const ww = Number.isFinite(w) ? w : 0;
    if (ww < 0.0009) shore += 1;
    else shore += Math.min(1, Math.abs(ww - depth) * 18);
  }
  const thin = 1 - smoothstep(0.01, 0.058, depth);
  const edge = smoothstep(0.55, 2.6, shore);
  let jump = 0;
  for (const w of neighborDepths) {
    const ww = Number.isFinite(w) ? w : 0;
    jump = Math.max(jump, Math.abs(ww - depth));
  }
  const turb = fl > 0.055 && jump > 0.016;
  const flowBoost = 0.2 + fl * 0.9;
  const turbFoam = turb ? clamp01(edge * thin * flowBoost * (0.3 + detail * 0.55)) : 0;
  // Shore lace only at high velocity — mid-flow and still pools stay clear.
  const moving = smoothstep(0.045, 0.14, fl);
  const velFoam = clamp01(edge * thin * moving * mix(0.35, 1, clamp01(detail)));
  return Math.max(turbFoam, velFoam);
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function flowWaveAmp(depth: number, flow: number, displace: number): number {
  if (displace <= 0) return 0;
  const body = smoothstep(0.005, 0.05, Number.isFinite(depth) ? depth : 0);
  const fl = Number.isFinite(flow) ? Math.min(0.4, Math.max(0, flow)) : 0;
  const stream = smoothstep(0.012, 0.1, fl);
  return displace * body * stream * (0.22 + fl * 3.2);
}

/**
 * Visual sheet height above the bed. Films stay thin; pools lift so
 * carved basins read as volume (matches `water.vert.glsl`).
 */
export function sheetHeight(water: number, flow = 0): number {
  const w = Number.isFinite(water) && water > 0.0008 ? water : 0;
  if (w <= 0) return 0;
  const film = Math.min(w, 0.02);
  const pool = Math.max(0, Math.min(w, 0.24) - 0.02);
  const deep = smoothstep(0.022, 0.13, w);
  const fl = Number.isFinite(flow) ? Math.min(0.18, Math.max(0, flow)) : 0;
  return 0.0034 + film * 0.22 + pool * 0.44 + deep * 0.016 + fl * 0.008;
}

/** How much the water normal tilts from reconstructed flow. Still water ≈ 0. */
export function flowWaveNormalScale(flow: number): number {
  const fl = Number.isFinite(flow) ? Math.max(0, flow) : 0;
  return smoothstep(0.012, 0.11, fl);
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}
