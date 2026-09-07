import { hash2 } from "../assets/noise";
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
const CONCENTRATE = 2.15;
const MIN_SAND = 0.04;

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
  private nW = new Float32Array(8);
  private tick = 0;

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
    this.tick++;
    this.addSources();
    this.routeAndErode();
    this.routeAndErode();
    this.settleSediment();
    this.soakAndDrain();
    if ((this.tick & 1) === 0) this.thermal();
  }

  private addSources(): void {
    const { size } = this;
    const water = this.water;
    for (const src of this.sources) {
      const x = Math.max(1, Math.min(size - 2, Math.round(src.x * (size - 1))));
      const y = Math.max(1, Math.min(size - 2, Math.round(src.y * (size - 1))));
      const add = src.rate * 0.03;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          water[this.i(x + dx, y + dy)] += add / (1 + dx * dx + dy * dy);
        }
      }
    }
  }

  private routeAndErode(): void {
    const { size, params } = this;
    const n = size * size;
    const terrain = this.terrain;
    const water = this.water;
    const sediment = this.sediment;
    const flow = this.flow;
    const wD = this.waterDelta;
    const sD = this.sedDelta;
    const tD = this.terrDelta;
    wD.fill(0);
    sD.fill(0);
    tD.fill(0);

    const transfer = 0.74 * params.flowRate;
    const erodeK = params.erosionRate * (1.05 - params.cohesion);
    const capK = params.sedimentCapacity;

    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const i = this.i(x, y);
        const w = water[i];
        if (w < 1e-5) {
          flow[i] *= 0.82;
          continue;
        }

        const h = terrain[i] + w;
        let totalW = 0;
        let drops = 0;
        let maxDrop = 0;
        let minHn = h;

        for (let k = 0; k < 8; k++) {
          const nx = x + NEIGH[k][0];
          const ny = y + NEIGH[k][1];
          const j = this.i(nx, ny);
          const hn = terrain[j] + water[j];
          if (hn < minHn) minHn = hn;
          const dh = h - hn;
          if (dh <= 1e-6) continue;
          const len = k < 4 ? 1 : DIAG;
          const drop = dh / len;
          const bed = Math.max(0, terrain[i] - terrain[j]);
          const wander = 0.9 + 0.2 * hash2(x + k * 13, y, 91);
          const weight = Math.pow(drop * wander, CONCENTRATE) * (1 + 2.6 * bed);
          this.nDrop[drops] = drop;
          this.nDest[drops] = j;
          this.nW[drops] = weight;
          totalW += weight;
          if (drop > maxDrop) maxDrop = drop;
          drops++;
        }

        if (drops === 0 || totalW < 1e-12) {
          flow[i] *= 0.78;
          continue;
        }

        const head = Math.max(0, h - minHn);
        const movable = Math.min(w * transfer, w * 0.94, Math.max(head * 0.9, w * 0.55));
        flow[i] = flow[i] * 0.38 + movable * (0.35 + maxDrop * 2.1) * 0.62;
        const flux = flow[i];
        const ponded = maxDrop < 0.004;

        let steep = 0;
        for (let k = 1; k < drops; k++) {
          if (this.nDrop[k] > this.nDrop[steep]) steep = k;
        }

        for (let k = 0; k < drops; k++) {
          const leak = 0.18 * (this.nW[k] / totalW);
          const share = movable * (k === steep ? 0.82 + leak : leak);
          const j = this.nDest[k];
          wD[i] -= share;
          wD[j] += share;

          if (ponded || w > 0.14) continue;
          const slope = this.nDrop[k];
          const capacity = share * capK * (0.1 + slope * 3.6) * (0.5 + flux);
          const pick = Math.min(
            capacity * erodeK,
            Math.max(0, terrain[i] - MIN_SAND) * 0.018,
            share * 0.16,
          );
          tD[i] -= pick;
          const sedShare = sediment[i] * (share / Math.max(w, 1e-6));
          sD[i] -= sedShare;
          sD[j] += sedShare + pick;
        }

        if (tD[i] < -(terrain[i] - MIN_SAND) * 0.018) {
          tD[i] = -(terrain[i] - MIN_SAND) * 0.018;
        }

        if (w > 0.02 && !ponded) {
          for (let k = 0; k < 4; k++) {
            const j = this.i(x + NEIGH[k][0], y + NEIGH[k][1]);
            const bank = terrain[j] - terrain[i];
            if (bank > 0.01) {
              const nibble = Math.min(bank * 0.02 * erodeK * Math.min(w, 0.08), bank * 0.08);
              tD[j] -= nibble;
              sD[i] += nibble * 0.7;
            }
          }
        }
      }
    }

    for (let i = 0; i < n; i++) {
      water[i] = Math.max(0, water[i] + wD[i]);
      sediment[i] = Math.max(0, sediment[i] + sD[i]);
      const before = terrain[i];
      terrain[i] = Math.max(MIN_SAND, terrain[i] + tD[i]);
      if (tD[i] < 0) this.erodedSand += before - terrain[i];
    }
  }

  private settleSediment(): void {
    const { size, params } = this;
    const terrain = this.terrain;
    const water = this.water;
    const sediment = this.sediment;
    const flow = this.flow;
    const capK = params.sedimentCapacity;
    const depK = params.deposition;

    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const i = this.i(x, y);
        if (sediment[i] < 1e-6) continue;
        const w = water[i];
        const h = terrain[i] + w;
        let hasFall = false;
        for (let k = 0; k < 4 && !hasFall; k++) {
          const j = this.i(x + NEIGH[k][0], y + NEIGH[k][1]);
          if (h > terrain[j] + water[j] + 0.004) hasFall = true;
        }
        if (hasFall && flow[i] > 0.008) continue;
        const cap = w * capK * 0.85;
        if (sediment[i] <= cap) continue;
        const extra = Math.min((sediment[i] - cap) * depK * 0.35, 0.0035);
        terrain[i] += extra;
        sediment[i] -= extra;
      }
    }
  }

  private soakAndDrain(): void {
    const { size, params } = this;
    const n = size * size;
    const inf = params.infiltration;
    const eva = params.evaporation;
    const last = size - 4;
    for (let i = 0; i < n; i++) {
      const y = (i / size) | 0;
      const moving = this.flow[i];
      const w = this.water[i];
      const soakScale = w < 0.03 ? 0.12 : 1;
      const soak = Math.min(w, (inf * 0.35 * soakScale * w) / (1 + moving * 14));
      this.water[i] -= soak;
      this.wetness[i] = Math.min(1, this.wetness[i] + soak * 8 + (w > 0.0015 ? 0.07 : 0));
      this.wetness[i] *= 0.994;
      this.water[i] *= 1 - eva * 0.6;
      if (y >= last && this.water[i] > 0) this.water[i] *= 0.88;
      if (this.water[i] < 1e-5) {
        this.water[i] = 0;
        this.sediment[i] *= 0.88;
      }
    }
  }

  private thermal(): void {
    const { size, params } = this;
    const terrain = this.terrain;
    const water = this.water;
    const talus = 0.1 + params.grain * 0.045 + params.cohesion * 0.06;
    const k = 0.028 * (1.05 - params.cohesion);
    const tD = this.terrDelta;
    tD.fill(0);

    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const i = this.i(x, y);
        if (water[i] > 0.01) continue;
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
    for (let i = 0; i < n; i++) terrain[i] = Math.max(MIN_SAND, terrain[i] + tD[i]);
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
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 1 || y < 1 || x >= size - 1 || y >= size - 1) continue;
        this.water[this.i(x, y)] += amount / (1 + dx * dx + dy * dy);
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
