/**
 * Thermal / talus slip — original implementation of published ideas.
 *
 * Musgrave et al. 1989 (talus angle); Beneš & Forsbach 2002; Jáko & Tóth 2011
 * (thermal pipes merged with hydraulic). After water cuts a channel, banks
 * steeper than the repose angle slump. Hard / concrete cells never move.
 * Sand against a taller hard lip stands steeper and does not fill the gutter.
 */

import { HARD_THRESHOLD } from "./mapsContract";
import { MIN_SAND } from "./hydraulic";

const CARDINALS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

export function talusLimit(grain: number, cohesion: number, wetness: number): number {
  const hold = Math.min(0.95, cohesion + wetness * 0.22);
  // Wetter banks stand a little steeper when cohesive, but lubricated sand yields.
  const wetSlip = wetness > 0.12 ? wetness * 0.035 : 0;
  return 0.095 + grain * 0.048 + hold * 0.075 - wetSlip;
}

/** Cardinal hard neighbors that stand above this cell — a concrete wall / lip. */
export function hardSupportCount(
  hardmask: Float32Array,
  terrain: Float32Array,
  size: number,
  x: number,
  y: number,
): number {
  if (x <= 0 || y <= 0 || x >= size - 1 || y >= size - 1) return 0;
  const i = y * size + x;
  const h = terrain[i];
  let n = 0;
  for (let k = 0; k < 4; k++) {
    const j = (y + CARDINALS[k][1]) * size + (x + CARDINALS[k][0]);
    if (hardmask[j] >= HARD_THRESHOLD && terrain[j] > h + 0.018) n++;
  }
  return n;
}

export function thermalSlip(
  terrain: Float32Array,
  water: Float32Array,
  wetness: Float32Array,
  cohesion: Float32Array,
  hardmask: Float32Array,
  delta: Float32Array,
  size: number,
  grain: number,
  cohesion0: number,
): void {
  const n = size * size;
  delta.fill(0);

  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const i = y * size + x;
      if (hardmask[i] >= HARD_THRESHOLD) continue;

      const ponded = water[i] > 0.045;
      const localC = Math.min(0.95, cohesion0 + cohesion[i] + wetness[i] * 0.28);
      const support = hardSupportCount(hardmask, terrain, size, x, y);
      // A concrete lip holds adjacent sand steeper — do not melt the channel wall.
      const talus = talusLimit(grain, localC, wetness[i]) + support * 0.085;
      // Dry sand creeps slowly; wet banks after a cut slump faster.
      const wetBoost = water[i] > 0.003 && water[i] < 0.05 ? 1.85 : 1;
      const wallHold = support > 0 ? 0.38 : 1;
      const k = 0.07 * (1.05 - localC) * (1 - Math.min(0.5, wetness[i] * 0.5)) * wetBoost * wallHold;

      for (let nK = 0; nK < 4; nK++) {
        const nx = x + CARDINALS[nK][0];
        const ny = y + CARDINALS[nK][1];
        const j = ny * size + nx;
        if (hardmask[j] >= HARD_THRESHOLD) continue;
        // Two deep still cells: pool floor, do not flatten through thermal.
        if (ponded && water[j] > 0.045) continue;
        const dh = terrain[i] - terrain[j];
        // Do not dump sand into a hard-walled gutter / channel floor.
        if (dh > 0.012 && hardSupportCount(hardmask, terrain, size, nx, ny) > 0) continue;
        if (dh > talus) {
          const m = (dh - talus) * k;
          delta[i] -= m;
          delta[j] += m;
        }
      }
    }
  }

  for (let i = 0; i < n; i++) {
    if (hardmask[i] >= HARD_THRESHOLD) continue;
    terrain[i] = Math.max(MIN_SAND, terrain[i] + delta[i]);
  }
}
