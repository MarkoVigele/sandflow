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
  /** Hard vertex lift ceiling in heightmap units. Needles are impossible above this. */
  sheetCap: number;
  /** 0..1 — shoreline lace / second foam ring. */
  foamDetail: number;
  /** Multiplier on Beer's-law absorption coefficients. */
  beerStrength: number;
  /** Schlick / screen-space fresnel scale. */
  fresnelScale: number;
  /** Hard ceiling so glancing water cannot glitter into needles. */
  fresnelCap: number;
  specPower: number;
  /** Bed caustic mix on the sand shader. 0 = skip. */
  caustic: number;
};

export const WATER_QUALITY: Record<QualityId, WaterQualityTier> = {
  low: {
    id: "low",
    meshSegs: 80,
    waveOctaves: 1,
    waveDisplace: 0,
    sheetCap: 0.012,
    foamDetail: 0.22,
    beerStrength: 0.62,
    fresnelScale: 0.52,
    fresnelCap: 0.22,
    specPower: 10,
    caustic: 0,
  },
  medium: {
    id: "medium",
    meshSegs: 128,
    waveOctaves: 2,
    waveDisplace: 0.00095,
    sheetCap: 0.012,
    foamDetail: 0.48,
    beerStrength: 0.88,
    fresnelScale: 0.68,
    fresnelCap: 0.28,
    specPower: 16,
    caustic: 0.32,
  },
  high: {
    id: "high",
    meshSegs: 224,
    waveOctaves: 3,
    waveDisplace: 0.0016,
    sheetCap: 0.012,
    foamDetail: 0.66,
    beerStrength: 1.05,
    fresnelScale: 0.8,
    fresnelCap: 0.34,
    specPower: 22,
    caustic: 0.58,
  },
  ultra: {
    id: "ultra",
    meshSegs: 352,
    waveOctaves: 4,
    waveDisplace: 0.0024,
    sheetCap: 0.012,
    foamDetail: 0.78,
    beerStrength: 1.22,
    fresnelScale: 0.88,
    fresnelCap: 0.38,
    specPower: 26,
    caustic: 0.82,
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
  const body = smoothstep(0.008, 0.055, Number.isFinite(depth) ? depth : 0);
  const fl = Number.isFinite(flow) ? Math.min(0.35, Math.max(0, flow)) : 0;
  const stream = smoothstep(0.038, 0.15, fl);
  return displace * body * stream * (0.18 + fl * 1.8);
}

/** Isolated inlet cells collapse toward neighbors (matches water.vert blur clamp). */
export function suppressWaterPeak(
  center: number,
  neighbors: readonly [number, number, number, number],
): number {
  const c = Number.isFinite(center) && center > 0 ? center : 0;
  const n = neighbors.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const nMax = Math.max(n[0]!, n[1]!, n[2]!, n[3]!);
  const nAvg = (n[0]! + n[1]! + n[2]! + n[3]!) * 0.25;
  const avg = (c * 4 + nAvg * 8) / 12;
  const isolated = c > nMax * 1.35 + 0.01;
  const pad = isolated ? 0.006 : 0.014;
  return Math.min(avg, nMax + pad);
}

/**
 * Flow-aligned Gerstner-style height. Still / thin water stays 0.
 * Amplitude is hard-capped by the visual sheet so waves cannot needle.
 */
export function gerstnerHeight(
  phase: number,
  flow: number,
  water: number,
  displace: number,
  octaves = 1,
): number {
  const amp0 = flowWaveAmp(water, flow, displace);
  if (amp0 < 1e-8) return 0;
  const cap = WATER_SHEET_CAP * 0.45;
  const amp = Math.min(amp0, cap);
  const p = Number.isFinite(phase) ? phase : 0;
  const n = Number.isFinite(octaves) ? Math.max(1, octaves) : 1;
  let h = Math.sin(p) * amp;
  if (n > 1.5) h += Math.sin(p * 1.7 + 0.8) * amp * 0.38;
  if (n > 2.5) h += Math.sin(p * 2.4 + 1.6) * amp * 0.18;
  if (n > 3.5) h += Math.sin(p * 3.1 + 2.4) * amp * 0.08;
  if (!Number.isFinite(h)) return 0;
  return Math.max(-amp, Math.min(amp, h));
}

export const WATER_SHEET_CAP = 0.012;

/**
 * Visual sheet height above the bed. Thin continuous coating — pool depth
 * is a shading problem, not a vertex spike (matches water.vert.glsl).
 */
export function sheetHeight(water: number, _flow = 0, cap = WATER_SHEET_CAP): number {
  const w = Number.isFinite(water) && water > 0 ? water : 0;
  const cover = smoothstep(0.0006, 0.014, w);
  const body = smoothstep(0.008, 0.1, w);
  return Math.min((0.003 + body * 0.0065) * cover, cap);
}

/** How much the water normal tilts from reconstructed flow. Still water ≈ 0. */
export function flowWaveNormalScale(flow: number): number {
  const fl = Number.isFinite(flow) ? Math.max(0, flow) : 0;
  return smoothstep(0.038, 0.15, fl);
}

/** Hard fresnel ceiling for the quality tier. */
export function waterFresnelCap(quality: QualityId): number {
  return WATER_QUALITY[quality].fresnelCap;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}
