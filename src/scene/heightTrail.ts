import { MAP_R_TERRAIN } from "../sim/mapsContract";

/** Per-step persistence of the height-change ghost while Zeitraffer is on. */
export const TRAIL_FADE = 0.91;
/** Scale from height-delta (sim units) into a visible trail. */
export const TRAIL_GAIN = 14;
/** Faster fade when Zeitraffer or Spur is off. */
export const TRAIL_DECAY = 0.78;
export const TRAIL_CLAMP = 1.2;

export function extractTerrain(packed: Float32Array, size: number, out: Float32Array): void {
  const n = size * size;
  for (let i = 0; i < n; i++) out[i] = packed[i * 4 + MAP_R_TERRAIN];
}

export function copyField(src: Float32Array, dst: Float32Array): void {
  const n = Math.min(src.length, dst.length);
  for (let i = 0; i < n; i++) dst[i] = src[i];
}

export function stepHeightTrail(
  trail: Float32Array,
  current: Float32Array,
  previous: Float32Array,
  fade = TRAIL_FADE,
  gain = TRAIL_GAIN,
): void {
  const n = Math.min(trail.length, current.length, previous.length);
  for (let i = 0; i < n; i++) {
    const next = trail[i] * fade + (current[i] - previous[i]) * gain;
    trail[i] = next < -TRAIL_CLAMP ? -TRAIL_CLAMP : next > TRAIL_CLAMP ? TRAIL_CLAMP : next;
  }
}

export function decayHeightTrail(trail: Float32Array, fade = TRAIL_DECAY): void {
  for (let i = 0; i < trail.length; i++) trail[i] *= fade;
}

export function trailVisible(lapse: boolean, trailFade: boolean): boolean {
  return lapse && trailFade;
}
