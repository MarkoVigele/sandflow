/**
 * Thermal / talus slip — original implementation of published ideas.
 *
 * Musgrave et al. 1989 (talus angle); Beneš & Forsbach 2002; Jáko & Tóth 2011
 * (thermal pipes merged with hydraulic). After water cuts a channel, banks
 * steeper than the repose angle slump. Hard / concrete cells never move.
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
      const talus = talusLimit(grain, localC, wetness[i]);
      // Dry sand creeps slowly; wet banks after a cut slump faster.
      const wetBoost = water[i] > 0.003 && water[i] < 0.05 ? 1.85 : 1;
      const k = 0.07 * (1.05 - localC) * (1 - Math.min(0.5, wetness[i] * 0.5)) * wetBoost;

      for (let nK = 0; nK < 4; nK++) {
        const j = (y + CARDINALS[nK][1]) * size + (x + CARDINALS[nK][0]);
        if (hardmask[j] >= HARD_THRESHOLD) continue;
        // Two deep still cells: pool floor, do not flatten through thermal.
        if (ponded && water[j] > 0.045) continue;
        const dh = terrain[i] - terrain[j];
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
