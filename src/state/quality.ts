import { QUALITY_GRID, QUALITY_LABEL, isMobile, type QualityId } from "./types";
import { MAX_PARTICLES } from "../sim/flowFx";

/**
 * App-layer quality knobs. Low/Med/High/Ultra each change sim grid,
 * particle cap, shadows, and device-pixel ratio — not just look polish.
 */
export type QualityProfile = {
  id: QualityId;
  grid: number;
  /** Hard cap on foam + FX particles the worker emits / the GPU draws. */
  particles: number;
  /** 0..1 fraction of incoming flow particles to draw (derived from `particles`). */
  particleRatio: number;
  shadows: boolean;
  shadowMap: number;
  pixelRatioCap: number;
  antialias: boolean;
  /** Heightfield contact-shadow march steps. 0 = 4-tap AO only. */
  lookAoSteps: number;
  /** Opposite fill-light weight 0..1 (shader + scene). */
  lookFill: number;
  /** Albedo micro-grain / normal mix. */
  lookGrain: number;
  /** Water specular ceiling — Low/Med stay mobile-safe. */
  lookSpecCap: number;
  /** Soft shore foam from flow velocity. */
  lookShoreFoam: number;
  /** Animated bed caustics under water. 0 = skip (Low). */
  lookCaustic: number;
  /** Height-normal micro-relief (dFdx of bed height). 0 = skip. */
  lookHeightMicro: number;
  /** Tray wood normal scale. 0 = albedo only (Low). */
  lookWoodNormal: number;
  /** Screen-edge vignette 0..1. Low stays off (CSS overlay is free). */
  lookVignette: number;
  /** Cheap tray contact blob 0..1. Low skips the extra plane. */
  lookTrayShadow: number;
};

export const QUALITY_ORDER: QualityId[] = ["low", "medium", "high", "ultra"];

/** Auto steps down one tier if FPS stays below this for `AUTO_FPS_HOLD_MS`. */
export const AUTO_FPS_FLOOR = 40;
export const AUTO_FPS_HOLD_MS = 2000;
export const AUTO_FPS_SAMPLE_MS = 500;

const PARTICLE_CAP: Record<QualityId, number> = {
  low: 0,
  medium: 80,
  high: 180,
  ultra: MAX_PARTICLES,
};

export const QUALITY_PROFILE: Record<QualityId, QualityProfile> = {
  low: {
    id: "low",
    grid: QUALITY_GRID.low,
    particles: PARTICLE_CAP.low,
    particleRatio: 0,
    shadows: false,
    shadowMap: 0,
    pixelRatioCap: 1,
    antialias: false,
    lookAoSteps: 0,
    lookFill: 0.22,
    lookGrain: 0.22,
    lookSpecCap: 0.055,
    lookShoreFoam: 0.28,
    lookCaustic: 0,
    lookHeightMicro: 0,
    lookWoodNormal: 0,
    lookVignette: 0,
    lookTrayShadow: 0,
  },
  medium: {
    id: "medium",
    grid: QUALITY_GRID.medium,
    particles: PARTICLE_CAP.medium,
    particleRatio: PARTICLE_CAP.medium / MAX_PARTICLES,
    shadows: false,
    shadowMap: 512,
    pixelRatioCap: 1.25,
    antialias: true,
    lookAoSteps: 3,
    lookFill: 0.32,
    lookGrain: 0.38,
    lookSpecCap: 0.075,
    lookShoreFoam: 0.42,
    lookCaustic: 0.32,
    lookHeightMicro: 0.14,
    lookWoodNormal: 0.28,
    lookVignette: 0.18,
    lookTrayShadow: 0.22,
  },
  high: {
    id: "high",
    grid: QUALITY_GRID.high,
    particles: PARTICLE_CAP.high,
    particleRatio: PARTICLE_CAP.high / MAX_PARTICLES,
    shadows: true,
    shadowMap: 1024,
    pixelRatioCap: 1.5,
    antialias: true,
    lookAoSteps: 6,
    lookFill: 0.4,
    lookGrain: 0.55,
    lookSpecCap: 0.1,
    lookShoreFoam: 0.62,
    lookCaustic: 0.58,
    lookHeightMicro: 0.26,
    lookWoodNormal: 0.52,
    lookVignette: 0.28,
    lookTrayShadow: 0.34,
  },
  ultra: {
    id: "ultra",
    grid: QUALITY_GRID.ultra,
    particles: PARTICLE_CAP.ultra,
    particleRatio: 1,
    shadows: true,
    shadowMap: 2048,
    pixelRatioCap: 2,
    antialias: true,
    lookAoSteps: 8,
    lookFill: 0.46,
    lookGrain: 0.72,
    lookSpecCap: 0.12,
    lookShoreFoam: 0.78,
    lookCaustic: 0.82,
    lookHeightMicro: 0.36,
    lookWoodNormal: 0.68,
    lookVignette: 0.34,
    lookTrayShadow: 0.42,
  },
};

export function qualityProfile(quality: QualityId): QualityProfile {
  return QUALITY_PROFILE[quality] ?? QUALITY_PROFILE.medium;
}

/** iOS/iPadOS WebKit (Safari and all iOS browsers) — context-loss prone. */
export function isIosWebKit(
  ua = typeof navigator !== "undefined" ? navigator.userAgent : "",
  platform = typeof navigator !== "undefined" ? navigator.platform : "",
  maxTouchPoints = typeof navigator !== "undefined" ? navigator.maxTouchPoints : 0,
): boolean {
  const ios = /iP(ad|hone|od)/.test(ua) || (platform === "MacIntel" && maxTouchPoints > 1);
  return ios && /WebKit/i.test(ua);
}

export function pixelRatioFor(
  quality: QualityId,
  dpr = 1,
  mobile = isMobile(),
  iosWebKit = isIosWebKit(),
): number {
  const profile = qualityProfile(quality);
  let cap = quality === "medium" && mobile ? 1.15 : profile.pixelRatioCap;
  if (iosWebKit) cap = Math.min(cap, quality === "low" ? 1 : 1.25);
  const device = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  return Math.min(device, cap);
}

export function particleDrawCount(incoming: number, quality: QualityId): number {
  const n = Number.isFinite(incoming) ? Math.max(0, incoming | 0) : 0;
  const cap = qualityProfile(quality).particles;
  if (cap <= 0 || n <= 0) return 0;
  return Math.min(n, cap);
}

export function qualityChangesSim(a: QualityId, b: QualityId): boolean {
  return qualityProfile(a).grid !== qualityProfile(b).grid;
}

export type QualityMapsAction = "resample" | "keep" | "allocEmpty";

/**
 * Live packed terrain must never be replaced with empty maps.
 * Auto step-down passes `resample: false` so the sim grid stays put.
 */
export function planQualityMaps(input: {
  resample: boolean;
  hasPacked: boolean;
  lastSize: number;
  mapWidth: number;
  nextGrid: number;
}): QualityMapsAction {
  const gridChanged = input.lastSize > 0 && input.lastSize !== input.nextGrid;
  if (input.hasPacked && input.resample && gridChanged) return "resample";
  if (input.hasPacked) return "keep";
  if (input.mapWidth !== input.nextGrid) return "allocEmpty";
  return "keep";
}

/** Auto FPS drop only changes look/GPU knobs — never rebuilds the heightfield. */
export function autoQualityResamplesSim(): boolean {
  return false;
}

export function nextLowerQuality(quality: QualityId): QualityId | null {
  const order: QualityId[] = ["ultra", "high", "medium", "low"];
  const i = order.indexOf(quality);
  if (i < 0 || i >= order.length - 1) return null;
  return order[i + 1];
}

export function autoQualityToast(next: QualityId): string {
  return `Qualität automatisch auf ${QUALITY_LABEL[next]} gesenkt.`;
}

/**
 * Accumulate low-FPS time. When `fps` stays under the floor for `holdMs`,
 * signal a single one-tier drop and reset the accumulator.
 */
export function tickAutoQuality(
  fps: number,
  lowFpsMs: number,
  sampleMs = AUTO_FPS_SAMPLE_MS,
  floor = AUTO_FPS_FLOOR,
  holdMs = AUTO_FPS_HOLD_MS,
): { lowFpsMs: number; shouldDrop: boolean } {
  if (!(fps > 0) || fps >= floor) return { lowFpsMs: 0, shouldDrop: false };
  const dt = Number.isFinite(sampleMs) && sampleMs > 0 ? sampleMs : AUTO_FPS_SAMPLE_MS;
  const next = lowFpsMs + dt;
  if (next >= holdMs) return { lowFpsMs: 0, shouldDrop: true };
  return { lowFpsMs: next, shouldDrop: false };
}

export function rendererPowerPreference(iosWebKit = isIosWebKit()): WebGLPowerPreference {
  return iosWebKit ? "default" : "high-performance";
}

export function qualityAntialias(quality: QualityId, mobile = isMobile(), iosWebKit = isIosWebKit()): boolean {
  if (iosWebKit || mobile) return false;
  return qualityProfile(quality).antialias;
}
