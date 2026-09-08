import { QUALITY_GRID, isMobile, type QualityId } from "./types";

/**
 * App-layer quality knobs. Grid sizes stay in QUALITY_GRID so the sim
 * contract does not move; this layer maps Low/Med/High onto pixel ratio
 * and how many flow particles the viewport actually draws.
 */
export type QualityProfile = {
  id: QualityId;
  grid: number;
  pixelRatioCap: number;
  /** 0..1 fraction of incoming flow particles to draw. */
  particleRatio: number;
};

export const QUALITY_PROFILE: Record<QualityId, QualityProfile> = {
  low: { id: "low", grid: QUALITY_GRID.low, pixelRatioCap: 1, particleRatio: 0 },
  medium: { id: "medium", grid: QUALITY_GRID.medium, pixelRatioCap: 1.25, particleRatio: 0.35 },
  high: { id: "high", grid: QUALITY_GRID.high, pixelRatioCap: 1.5, particleRatio: 0.75 },
  ultra: { id: "ultra", grid: QUALITY_GRID.ultra, pixelRatioCap: 2, particleRatio: 1 },
};

export function qualityProfile(quality: QualityId): QualityProfile {
  return QUALITY_PROFILE[quality] ?? QUALITY_PROFILE.medium;
}

export function pixelRatioFor(quality: QualityId, dpr = 1, mobile = isMobile()): number {
  const cap =
    quality === "medium" && mobile ? 1.15 : qualityProfile(quality).pixelRatioCap;
  const device = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  return Math.min(device, cap);
}

export function particleDrawCount(incoming: number, quality: QualityId): number {
  const n = Number.isFinite(incoming) ? Math.max(0, incoming | 0) : 0;
  const ratio = qualityProfile(quality).particleRatio;
  if (ratio <= 0 || n <= 0) return 0;
  return Math.max(1, Math.min(n, Math.round(n * ratio)));
}

export function qualityChangesSim(a: QualityId, b: QualityId): boolean {
  return qualityProfile(a).grid !== qualityProfile(b).grid;
}
