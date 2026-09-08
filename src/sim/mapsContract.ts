/**
 * Stable GPU contract between the erosion worker and the viewport shaders.
 * Look/Assets may restyle lighting and PBR, but must keep these meanings.
 *
 * uMaps (RGBA32F, size×size):
 *   R — terrain height
 *   G — water depth
 *   B — wetness 0..1
 *   A — flow magnitude (turbidity / particles)
 *
 * Companion uHard (R32F, size×size) — NOT packed into uMaps RGBA:
 *   0 — sand (erodible)
 *   1 — hard / concrete / stone
 *   Cells with value >= HARD_THRESHOLD skip erosion, deposition and thermal
 *   creep. Water still routes over them. Sand brushes skip those cells.
 *   Upload separately; do not steal a uMaps channel.
 *
 * Required sim uniforms (names stay):
 *   uMaps, uHeightScale, uTexel
 * Optional look uniforms: uTraySize (world width), uRelief, uPivot,
 *   uWaveAmp, uWaveDetail, uTime (water surface only).
 * Water displacement adds a depth sheet + quality-scaled Gerstner on top of R.
 * AimCursor still samples R + relief only.
 * Displacement: Y = (uPivot + (R − uPivot) * uRelief) * uHeightScale
 * sand.vert normals: N = (hL-hR, 2·texel·tray, h(v+)-h(v−)) — same as AimCursor.heightfieldNormal.
 * Optional visual uniforms:
 *   uHard, uConcrete
 *
 * Particles: quads [u, v, height, attr] in 0..1 uv, height in sim units.
 *   attr = kind + life∈[0,1) — kind 0 foam, 1 bubble cluster, 2 bedload grain.
 */

export const MAP_R_TERRAIN = 0;
export const MAP_G_WATER = 1;
export const MAP_B_WETNESS = 2;
export const MAP_A_FLOW = 3;

export const SIM_UNIFORMS = {
  maps: "uMaps",
  heightScale: "uHeightScale",
  texel: "uTexel",
} as const;

export interface PackedMaps {
  terrain: Float32Array;
  water: Float32Array;
  wetness: Float32Array;
  flow: Float32Array;
}

export function packMapsRgba(
  terrain: Float32Array,
  water: Float32Array,
  wetness: Float32Array,
  flow: Float32Array,
): Float32Array {
  const n = terrain.length;
  const packed = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    packed[o + MAP_R_TERRAIN] = terrain[i];
    packed[o + MAP_G_WATER] = water[i];
    packed[o + MAP_B_WETNESS] = wetness[i];
    packed[o + MAP_A_FLOW] = flow[i];
  }
  return packed;
}

export function unpackRgba(packed: Float32Array, size: number): PackedMaps {
  const n = size * size;
  const terrain = new Float32Array(n);
  const water = new Float32Array(n);
  const wetness = new Float32Array(n);
  const flow = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    terrain[i] = packed[o + MAP_R_TERRAIN];
    water[i] = packed[o + MAP_G_WATER];
    wetness[i] = packed[o + MAP_B_WETNESS];
    flow[i] = packed[o + MAP_A_FLOW];
  }
  return { terrain, water, wetness, flow };
}

/** Hard / concrete / stone. Keep out of the RGBA visual pack. */
export const HARD_SAND = 0;
export const HARD_ROCK = 1;
export const HARD_THRESHOLD = 0.5;

export const HARD_UNIFORMS = {
  hard: "uHard",
  concrete: "uConcrete",
} as const;

export function isHardCell(value: number): boolean {
  return value >= HARD_THRESHOLD;
}

/** Nearest-neighbor resample so channel walls stay crisp across quality grids. */
export function resampleMask(src: Float32Array, srcSize: number, dstSize: number): Float32Array {
  if (srcSize === dstSize) return src.slice();
  const dst = new Float32Array(dstSize * dstSize);
  const scale = srcSize / dstSize;
  for (let y = 0; y < dstSize; y++) {
    for (let x = 0; x < dstSize; x++) {
      const sx = Math.min(srcSize - 1, Math.max(0, Math.floor((x + 0.5) * scale)));
      const sy = Math.min(srcSize - 1, Math.max(0, Math.floor((y + 0.5) * scale)));
      dst[y * dstSize + x] = src[sy * srcSize + sx] >= HARD_THRESHOLD ? HARD_ROCK : HARD_SAND;
    }
  }
  return dst;
}

export function countHardCells(mask: Float32Array | undefined | null): number {
  if (!mask) return 0;
  let n = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] >= HARD_THRESHOLD) n++;
  }
  return n;
}
