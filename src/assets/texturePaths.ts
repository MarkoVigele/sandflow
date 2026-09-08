import type { QualityId } from "../state/types";

export const DEFAULT_TEXTURE_PROMPT = "feiner Quarzsand, warm, trocken";

export const BAKED_TEXTURE_FILES = {
  sandDry: "sand-dry-albedo.jpg",
  sandWet: "sand-wet-albedo.jpg",
  woodRim: "wood-rim.jpg",
} as const;

/** GPU albedo/normal/rough size. Medium stays at 512 so mobile does not thrash 1k maps. */
export function gpuTexelBudget(quality: QualityId): number {
  if (quality === "low") return 256;
  if (quality === "medium") return 512;
  return 1024;
}

/** Decode + sobel budget. Two tiers so quality flips inside a tier reuse the same canvases. */
export function labTexelBudget(quality: QualityId): number {
  return quality === "high" || quality === "ultra" ? 1024 : 512;
}

export function gpuAnisotropy(quality: QualityId): number {
  if (quality === "low") return 1;
  if (quality === "medium") return 2;
  if (quality === "high") return 4;
  return 8;
}

/** Repeats across the tray. Fine grain tiles more, but stays below the old 3.4–5.4 stamp. */
export function sandUvScale(grain: number): number {
  const g = Math.max(0, Math.min(1, grain));
  return 2.05 + g * 1.2;
}

export function bakedTextureUrl(
  file: string,
  base: string = (import.meta.env.BASE_URL as string | undefined) ?? "./",
): string {
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return `${prefix}textures/${file}`;
}

export function preferBakedSand(prompt: string): boolean {
  const p = prompt.trim().toLowerCase();
  return !p || p === DEFAULT_TEXTURE_PROMPT.toLowerCase();
}
