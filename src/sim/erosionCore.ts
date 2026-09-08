import { hash2 } from "../assets/noise";
import type { SimParams, WaterSource } from "../state/types";
import { packMapsRgba } from "./mapsContract";
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
const CONCENTRATE = 2.92;
const MIN_SAND = 0.04;
/** Water-surface drop below this is a still pool, not a stream. Keep — standing water must not burn holes. */
const MIN_SURFACE_SLOPE = 0.0016;
/** Bed must explain this share of a neighbor drop before we pick sand. */
const MIN_BED_FRAC = 0.28;
/** Shear = outgoing flux × bed slope. Standing mounds sit near 0. */
const MIN_SHEAR = 2.5e-6;
const INERTIA = 0.74;
const MAX_ERODE_FRAC = 0.014;
/** Scales tiny per-cell bed slopes (~0.005 on the slope preset) into capacity. */
const BED_SLOPE_GAIN = 44;
/** Established streams may split when a second downhill path is close. */
const BRANCH_FLUX = 0.02;
const BRANCH_RATIO = 0.4;

export class ErosionSim {
  size: number;
  params: SimParams;
  terrain: Float32Array;
  water: Float32Array;
  sediment: Float32Array;
  wetness: Float32Array;
  flow: Float32Array;
  /** Local cohesion boost 0–0.85. Not packed into visual maps. */
  cohesion: Float32Array;
  sources: WaterSource[] = [];
  erodedSand = 0;
  private waterDelta: Float32Array;
  private sedDelta: Float32Array;
  private terrDelta: Float32Array;
  private nDrop = new Float32Array(8);
  private nDest = new Int32Array(8);
  private nW = new Float32Array(8);
  private nBed = new Float32Array(8);
  private lastDir: Uint8Array;
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
    this.cohesion = new Float32Array(n);
    this.waterDelta = new Float32Array(n);
    this.sedDelta = new Float32Array(n);
    this.terrDelta = new Float32Array(n);
    this.lastDir = new Uint8Array(n);
    this.lastDir.fill(255);
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
      const add = src.rate * 0.034;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const fall = Math.exp(-(dx * dx + dy * dy) * 0.95);
          water[this.i(x + dx, y + dy)] += add * fall * 0.62;
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
    const lastDir = this.lastDir;
    const wD = this.waterDelta;
    const sD = this.sedDelta;
    const tD = this.terrDelta;
    wD.fill(0);
    sD.fill(0);
    tD.fill(0);

    const transfer = 0.76 * params.flowRate;
    const capK = params.sedimentCapacity;
    const cohesion = this.cohesion;

    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const i = this.i(x, y);
        const w = water[i];
        if (w < 1e-5) {
          flow[i] *= 0.78;
          lastDir[i] = 255;
          continue;
        }

        const h = terrain[i] + w;
        let totalW = 0;
        let drops = 0;
        let maxDrop = 0;
        let minHn = h;
        let minBed = terrain[i];

        for (let k = 0; k < 8; k++) {
          const nx = x + NEIGH[k][0];
          const ny = y + NEIGH[k][1];
          const j = this.i(nx, ny);
          const hn = terrain[j] + water[j];
          if (hn < minHn) minHn = hn;
          if (terrain[j] < minBed) minBed = terrain[j];
          const dh = h - hn;
          if (dh <= 1e-6) continue;
          const len = k < 4 ? 1 : DIAG;
          const drop = dh / len;
          const bed = Math.max(0, terrain[i] - terrain[j]);
          const wander = 0.94 + 0.12 * hash2(x + k * 13, y, 91);
          const channel = 1 + 20 * bed + 4.2 * Math.min(flow[j], 0.3);
          let weight = Math.pow(drop * wander, CONCENTRATE) * channel;
          if (lastDir[i] === k) weight *= 1 + INERTIA;
          else if (lastDir[i] < 8) {
            const pdx = NEIGH[lastDir[i]][0];
            const pdy = NEIGH[lastDir[i]][1];
            const align =
              (pdx * NEIGH[k][0] + pdy * NEIGH[k][1]) / (len * (lastDir[i] < 4 ? 1 : DIAG));
            if (align > 0.2) weight *= 1 + INERTIA * 0.45 * align;
          }
          this.nDrop[drops] = drop;
          this.nDest[drops] = j;
          this.nW[drops] = weight;
          this.nBed[drops] = bed / len;
          totalW += weight;
          if (drop > maxDrop) maxDrop = drop;
          drops++;
        }

        if (drops === 0 || totalW < 1e-12) {
          flow[i] *= 0.72;
          lastDir[i] = 255;
          continue;
        }

        const head = Math.max(0, h - minHn);
        const ponded = maxDrop < MIN_SURFACE_SLOPE;
        const bedFall = Math.max(0, terrain[i] - minBed);
        const inThread = bedFall > 0.006 && maxDrop >= MIN_SURFACE_SLOPE;
        const reserve = inThread ? Math.min(w * 0.16, 0.01) : 0;
        const movable = Math.min(
          Math.max(0, w - reserve) * transfer,
          Math.max(0, w - reserve) * 0.9,
          Math.max(head * 0.95, w * (inThread ? 0.18 : 0.22)),
        );

        let steep = 0;
        let second = -1;
        for (let k = 1; k < drops; k++) {
          if (this.nDrop[k] > this.nDrop[steep]) {
            second = steep;
            steep = k;
          } else if (second < 0 || this.nDrop[k] > this.nDrop[second]) {
            second = k;
          }
        }
        lastDir[i] = 255;
        for (let k = 0; k < 8; k++) {
          if (this.i(x + NEIGH[k][0], y + NEIGH[k][1]) === this.nDest[steep]) {
            lastDir[i] = k;
            break;
          }
        }

        const steepBed = this.nBed[steep];
        const steepFrac = steepBed / Math.max(this.nDrop[steep], 1e-6);
        const shear = movable * steepBed;
        const carving = !ponded && steepFrac >= MIN_BED_FRAC && shear > MIN_SHEAR && bedFall > 0;
        const localC = Math.min(0.95, params.cohesion + cohesion[i]);
        const localErodeK = params.erosionRate * (1.05 - localC);

        const moving = !ponded && movable > 0.0015;
        const stream = moving ? movable * (0.38 + maxDrop * 2.6) : movable * 0.05;
        flow[i] = flow[i] * 0.46 + stream * 0.54;
        const flux = flow[i];

        const ratio = second >= 0 ? this.nDrop[second] / Math.max(this.nDrop[steep], 1e-6) : 0;
        const canBranch =
          carving &&
          second >= 0 &&
          flux > BRANCH_FLUX &&
          ratio >= BRANCH_RATIO &&
          this.nBed[second] > 1e-5;
        const overflow = carving && w > 0.055;
        const leakK = canBranch ? 0.12 : overflow ? 0.1 : flux > 0.018 ? 0.038 : 0.062;
        const branchShare = canBranch ? 0.24 + 0.28 * Math.min(1, (ratio - BRANCH_RATIO) / 0.36) : 0;
        const steepShare = Math.max(0.52, 1 - leakK - branchShare);

        for (let k = 0; k < drops; k++) {
          const leak = leakK * (this.nW[k] / totalW);
          let share = movable * leak;
          if (k === steep) share += movable * steepShare;
          else if (canBranch && k === second) share += movable * branchShare;
          const j = this.nDest[k];
          wD[i] -= share;
          wD[j] += share;

          const sedShare = sediment[i] * (share / Math.max(w, 1e-6));
          sD[i] -= sedShare;
          sD[j] += sedShare;

          if (!carving) continue;
          const bedSlope = this.nBed[k];
          const neighFrac = bedSlope / Math.max(this.nDrop[k], 1e-6);
          if (bedSlope < 1e-5 || neighFrac < MIN_BED_FRAC) continue;
          const capacity =
            share * capK * (0.14 + bedSlope * BED_SLOPE_GAIN) * (0.9 + flux * 2.6);
          const pick = Math.min(
            capacity * localErodeK,
            Math.max(0, terrain[i] - MIN_SAND) * MAX_ERODE_FRAC,
            share * 0.18,
          );
          tD[i] -= pick;
          sD[j] += pick;
        }

        if (tD[i] < -(terrain[i] - MIN_SAND) * MAX_ERODE_FRAC) {
          tD[i] = -(terrain[i] - MIN_SAND) * MAX_ERODE_FRAC;
        }

        if (carving && flux > 0.016) {
          for (let k = 0; k < 4; k++) {
            const j = this.i(x + NEIGH[k][0], y + NEIGH[k][1]);
            const bank = terrain[j] - terrain[i];
            if (bank > 0.012) {
              const nibble = Math.min(bank * 0.017 * localErodeK * Math.min(flux, 0.09), bank * 0.05);
              tD[j] -= nibble;
              sD[i] += nibble * 0.62;
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
        const still = !hasFall || flow[i] < 0.01;
        const cap = still ? w * capK * 0.2 : w * capK * 0.95;
        if (sediment[i] <= cap) continue;
        const rate = still ? depK * 0.58 : depK * 0.18;
        const extra = Math.min((sediment[i] - cap) * rate, still ? 0.005 : 0.002);
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
      const soakScale = w < 0.03 ? 0.16 : 1;
      const soak = Math.min(w, (inf * 0.36 * soakScale * w) / (1 + moving * 24));
      this.water[i] -= soak;
      this.wetness[i] = Math.min(1, this.wetness[i] + soak * 8 + (w > 0.0015 ? 0.08 : 0));
      this.wetness[i] *= 0.993;
      const still = moving < 0.008;
      this.water[i] *= 1 - eva * (still ? 0.88 : 0.3);
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
    const cohesion = this.cohesion;
    const tD = this.terrDelta;
    tD.fill(0);

    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const i = this.i(x, y);
        if (water[i] > 0.01) continue;
        const localC = Math.min(0.95, params.cohesion + cohesion[i]);
        const talus = 0.1 + params.grain * 0.045 + localC * 0.06;
        const k = 0.028 * (1.05 - localC);
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

    if (kind === "smooth" || kind === "flatten") {
      const copy = this.terrain.slice();
      let mean = 0;
      let meanW = 0;
      if (kind === "flatten") {
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const dx = x - cx;
            const dy = y - cy;
            const d2 = dx * dx + dy * dy;
            if (d2 > r2) continue;
            const w = Math.exp(-d2 / (r2 * 0.45));
            mean += copy[this.i(x, y)] * w;
            meanW += w;
          }
        }
        mean = meanW > 0 ? mean / meanW : 0.42;
      }
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x - cx;
          const dy = y - cy;
          const d2 = dx * dx + dy * dy;
          if (d2 > r2) continue;
          const w = Math.exp(-d2 / (r2 * 0.45)) * strength * (kind === "flatten" ? 0.55 : 0.35);
          const i = this.i(x, y);
          if (kind === "flatten") {
            this.terrain[i] += (mean - this.terrain[i]) * Math.min(1, w);
            continue;
          }
          let acc = 0;
          let c = 0;
          for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
              acc += copy[this.i(x + ox, y + oy)];
              c++;
            }
          }
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
        } else if (kind === "tamp") {
          this.cohesion[i] = Math.min(0.85, this.cohesion[i] + fall * strength * 0.22);
          this.terrain[i] = Math.max(0.05, this.terrain[i] - fall * strength * 0.01);
        } else if (kind === "groove") {
          const t = Math.sqrt(d2) / r;
          if (t < 0.55) {
            const cut = (1 - t / 0.55) ** 2;
            this.terrain[i] = Math.max(0.05, this.terrain[i] - cut * strength * 0.07);
          } else {
            const bank = 1 - Math.abs(t - 0.78) / 0.25;
            if (bank > 0) this.terrain[i] += bank * strength * 0.016;
          }
        }
      }
    }
  }

  flattenAll(): void {
    const { size } = this;
    const edge = Math.max(3, Math.round(size * 0.03));
    let sum = 0;
    let count = 0;
    for (let y = edge; y < size - edge; y++) {
      for (let x = edge; x < size - edge; x++) {
        sum += this.terrain[this.i(x, y)];
        count++;
      }
    }
    const mean = count > 0 ? sum / count : 0.42;
    for (let y = edge; y < size - edge; y++) {
      for (let x = edge; x < size - edge; x++) {
        this.terrain[this.i(x, y)] = mean;
      }
    }
  }

  pour(u: number, v: number, amount: number): void {
    const { size } = this;
    const cx = Math.round(u * (size - 1));
    const cy = Math.round(v * (size - 1));
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 1 || y < 1 || x >= size - 1 || y >= size - 1) continue;
        const fall = Math.exp(-(dx * dx + dy * dy) * 0.38);
        this.water[this.i(x, y)] += amount * fall * 0.22;
      }
    }
  }

  resetWater(): void {
    this.water.fill(0);
    this.sediment.fill(0);
    this.flow.fill(0);
    this.lastDir.fill(255);
  }

  pack(): Float32Array {
    return packMapsRgba(this.terrain, this.water, this.wetness, this.flow);
  }

  collectParticles(): Float32Array {
    const { size } = this;
    const n = size * size;
    const stride = size > 300 ? 3 : 2;
    const idx: number[] = [];
    for (let i = 0; i < n && idx.length < MAX_PARTICLES; i += stride) {
      if (this.flow[i] > 0.016 && this.water[i] > 0.004) idx.push(i);
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
