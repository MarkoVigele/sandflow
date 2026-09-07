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
 * Required sim uniforms (names stay):
 *   uMaps, uHeightScale, uTexel
 *
 * Particles: triples [u, v, terrain+water] in 0..1 uv, height in sim units.
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
