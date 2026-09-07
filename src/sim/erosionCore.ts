import type { SimParams, WaterSource } from "../state/types";
import type { BrushKind } from "./types";

const NEIGH = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

const DIAG = 1.41421356;
const MAX_PARTICLES = 280;

export class ErosionSim {
  size: number;
  params: SimParams;
  terrain: Float32Array;
  water: Float32Array;
  sediment: Float32Array;
  wetness: Float32Array;
  flow: Float32Array;
  sources: WaterSource[] = [];
  erodedSand = 0;
  private waterDelta: Float32Array;
  private sedDelta: Float32Array;
  private terrDelta: Float32Array;
  private nDrop = new Float32Array(8);
  private nDest = new Int32Array(8);

  constructor(size: number, params: SimParams, terrain: Float32Array) {
    this.size = size;
    this.params = { ...params };
    const n = size * size;
    this.terrain = terrain;
    this.water = new Float32Array(n);
    this.sediment = new Float32Array(n);
    this.wetness = new Float32Array(n);
    this.flow = new Float32Array(n);
    this.waterDelta = new Float32Array(n);
    this.sedDelta = new Float32Array(n);
    this.terrDelta = new Float32Array(n);
  }

  private i(x: number, y: number): number {
    return y * this.size + x;
  }

  step(count: number): void {
    for (let s = 0; s < count; s++) this.stepOnce();
  }

  private stepOnce(): void {
    const { size, params } = this;
    const n = size * size;
    const terrain = this.terrain;
    const water = this.water;
    const sediment = this.sediment;
    const wetness = this.wetness;
    const flow = this.flow;
    const wD = this.waterDelta;
    const sD = this.sedDelta;
    const tD = this.terrDelta;
    wD.fill(0);
    sD.fill(0);
    tD.fill(0);

    for (const src of this.sources) {
      const x = Math.max(1, Math.min(size - 2, Math.round(src.x * (size - 1))));
      const y = Math.max(1, Math.min(size - 2, Math.round(src.y * (size - 1))));
      const r = 1;
      const add = src.rate * 0.045;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const w = 1 / (1 + dx * dx + dy * dy);
          water[this.i(x + dx, y + dy)] += add * w;
        }
      }
    }

    const transfer = 0.42 * params.flowRate;
    const erodeK = params.erosionRate * (1.05 - params.cohesion);
    const capK = params.sedimentCapacity;
    const depK = params.deposition;
    const minSand = 0.04;

    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const i = this.i(x, y);
        const w = water[i];
        if (w < 1e-5) {
          flow[i] *= 0.85;
          continue;
        }
        const h = terrain[i] + w;
        let totalDrop = 0;
        let drops = 0;

        for (let k = 0; k < 8; k++) {
          const nx = x + NEIGH[k][0];
          const ny = y + NEIGH[k][1];
          const j = this.i(nx, ny);
          const hn = terrain[j] + water[j];
          const dh = h - hn;
          if (dh > 1e-6) {
            const len = k < 4 ? 1 : DIAG;
            const d = dh / len;
            this.nDrop[drops] = d;
            this.nDest[drops] = j;
            totalDrop += d;
            drops++;
          }
        }

        if (drops === 0 || totalDrop < 1e-8) {
          flow[i] *= 0.8;
          continue;
        }

        const movable = Math.min(w * transfer, w * 0.72);
        const slope = totalDrop / drops;
        flow[i] = flow[i] * 0.45 + movable * (0.35 + slope * 2.2) * 0.55;

        for (let k = 0; k < drops; k++) {
          const share = (this.nDrop[k] / totalDrop) * movable;
          const j = this.nDest[k];
          wD[i] -= share;
          wD[j] += share;

          const localSlope = this.nDrop[k];
          const capacity = share * capK * (0.18 + localSlope * 3.4);
          const pick = Math.min(
            capacity * erodeK,
            Math.max(0, terrain[i] - minSand) * 0.08,
          );
          tD[i] -= pick;
          const sedShare = sediment[i] * (share / Math.max(w, 1e-6));
          sD[i] -= sedShare;
          sD[j] += sedShare + pick;
        }
      }
    }

    for (let i = 0; i < n; i++) {
      water[i] = Math.max(0, water[i] + wD[i]);
      sediment[i] = Math.max(0, sediment[i] + sD[i]);
      const before = terrain[i];
      terrain[i] = Math.max(minSand, terrain[i] + tD[i]);
      if (tD[i] < 0) this.erodedSand += before - terrain[i];
    }

    for (let i = 0; i < n; i++) {
      const w = water[i];
      const cap = w * capK * 0.55;
      if (sediment[i] > cap) {
        const extra = (sediment[i] - cap) * depK;
        terrain[i] += extra;
        sediment[i] -= extra;
      }
    }

    const inf = params.infiltration;
    const eva = params.evaporation;
    for (let i = 0; i < n; i++) {
      const soak = Math.min(water[i], inf * (0.35 + water[i] * 2.5));
      water[i] -= soak;
      wetness[i] = Math.min(1, wetness[i] + soak * 6.5);
      wetness[i] *= 0.996;
      water[i] *= 1 - eva;
      if (water[i] < 1e-5) {
        water[i] = 0;
        sediment[i] *= 0.9;
      }
    }

    this.thermal();
  }

  private thermal(): void {
    const { size, params } = this;
    const terrain = this.terrain;
    const talus = 0.085 + params.grain * 0.04 + params.cohesion * 0.05;
    const k = 0.08 * (1.1 - params.cohesion);
    const tD = this.terrDelta;
    tD.fill(0);

    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const i = this.i(x, y);
        for (let kN = 0; kN < 4; kN++) {
          const j = this.i(x + NEIGH[kN][0], y + NEIGH[kN][1]);
          const dh = terrain[i] - terrain[j];
          if (dh > talus) {
            const m = (dh - talus) * k;
            tD[i] -= m;
            tD[j] += m;
          }
        }
      }
    }
    const n = size * size;
    for (let i = 0; i < n; i++) terrain[i] = Math.max(0.04, terrain[i] + tD[i]);
  }

  brush(kind: BrushKind, u: number, v: number, radius: number, strength: number): void {
    const { size } = this;
    const cx = u * (size - 1);
    const cy = v * (size - 1);
    const r = Math.max(1.5, radius * size);
    const r2 = r * r;
    const x0 = Math.max(1, Math.floor(cx - r));
    const x1 = Math.min(size - 2, Math.ceil(cx + r));
    const y0 = Math.max(1, Math.floor(cy - r));
    const y1 = Math.min(size - 2, Math.ceil(cy + r));

    if (kind === "smooth") {
      const copy = this.terrain.slice();
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x - cx;
          const dy = y - cy;
          const d2 = dx * dx + dy * dy;
          if (d2 > r2) continue;
          const w = Math.exp(-d2 / (r2 * 0.45)) * strength * 0.35;
          let acc = 0;
          let c = 0;
          for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
              acc += copy[this.i(x + ox, y + oy)];
              c++;
            }
          }
          const i = this.i(x, y);
          this.terrain[i] += (acc / c - this.terrain[i]) * w;
        }
      }
      return;
    }

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const fall = Math.exp(-d2 / (r2 * 0.38));
        const i = this.i(x, y);
        if (kind === "pile") {
          this.terrain[i] += fall * strength * 0.055;
        } else if (kind === "dig") {
          this.terrain[i] = Math.max(0.05, this.terrain[i] - fall * strength * 0.05);
        } else if (kind === "dam") {
          const ridge = Math.exp(-d2 / (r2 * 0.18));
          this.terrain[i] += ridge * strength * 0.07;
        }
      }
    }
  }

  pour(u: number, v: number, amount: number): void {
    const { size } = this;
    const cx = Math.round(u * (size - 1));
    const cy = Math.round(v * (size - 1));
    const r = 2;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 1 || y < 1 || x >= size - 1 || y >= size - 1) continue;
        const w = 1 / (1 + dx * dx + dy * dy);
        this.water[this.i(x, y)] += amount * w;
      }
    }
  }

  resetWater(): void {
    this.water.fill(0);
    this.sediment.fill(0);
    this.flow.fill(0);
  }

  pack(): Float32Array {
    const n = this.size * this.size;
    const packed = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      packed[o] = this.terrain[i];
      packed[o + 1] = this.water[i];
      packed[o + 2] = this.wetness[i];
      packed[o + 3] = this.flow[i];
    }
    return packed;
  }

  collectParticles(): Float32Array {
    const { size } = this;
    const n = size * size;
    const stride = size > 300 ? 3 : 2;
    const idx: number[] = [];
    for (let i = 0; i < n && idx.length < MAX_PARTICLES; i += stride) {
      if (this.flow[i] > 0.014 && this.water[i] > 0.004) idx.push(i);
    }
    const out = new Float32Array(idx.length * 3);
    for (let k = 0; k < idx.length; k++) {
      const i = idx[k];
      const x = i % size;
      const y = (i - x) / size;
      out[k * 3] = x / (size - 1);
      out[k * 3 + 1] = y / (size - 1);
      out[k * 3 + 2] = this.terrain[i] + this.water[i];
    }
    return out;
  }

  waterVolume(): number {
    let s = 0;
    for (let i = 0; i < this.water.length; i++) s += this.water[i];
    return s;
  }
}
