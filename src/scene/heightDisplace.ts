import { HEIGHT_PIVOT, HEIGHT_WORLD } from "../state/types";

/** Heightmap 0–1 → effective 0–1 used as `* HEIGHT_WORLD` in shaders and AimCursor. */
export function effectiveHeight01(height01: number, relief: number, pivot = HEIGHT_PIVOT): number {
  return pivot + (height01 - pivot) * relief;
}

export function displaceY(height01: number, relief: number, world = HEIGHT_WORLD, pivot = HEIGHT_PIVOT): number {
  return effectiveHeight01(height01, relief, pivot) * world;
}
