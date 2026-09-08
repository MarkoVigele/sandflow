import { hash2 } from "../assets/noise";
import type { SimParams, WaterSource } from "../state/types";
import {
  KIND_BUBBLE,
  KIND_FOAM,
  KIND_GRAIN,
  MAX_BUBBLES,
  MAX_FOAM,
  MAX_FX,
  MAX_GRAINS,
  MAX_PARTICLES,
  PARTICLE_STRIDE,
  bubbleSpawnScore,
  clusterJitter,
  grainSpawnScore,
  packParticleAttr,
  type ParticleKind,
} from "./flowFx";
import {
  MAX_ERODE_FRAC,
  MIN_SAND,
  PIPE_DT,
  STILL_SPEED,
  advectMacCormack,
  applyPipeFlux,
  bedSlopeAt,
  canPickSediment,
  equilibriumTransfer,
  sedimentCapacity,
  updatePipeFlux,
} from "./hydraulic";
import { HARD_THRESHOLD, packMapsRgba } from "./mapsContract";
import { thermalSlip } from "./thermalErosion";
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
const CONCENTRATE = 2.92;
/** Water-surface drop below this is a still pool, not a stream. */
const MIN_SURFACE_SLOPE = 0.0016;
const INERTIA = 0.74;
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
  /** Companion hardmask. 1 = concrete/stone: no erosion, no deposition. */
  hardmask: Float32Array;
  sources: WaterSource[] = [];
  erodedSand = 0;
  /** Quality cap. 0 skips foam + FX packing. */
  particleBudget = MAX_PARTICLES;
  private waterDelta: Float32Array;
  private sedDelta: Float32Array;
  private terrDelta: Float32Array;
  private nDrop = new Float32Array(8);
  private nDest = new Int32Array(8);
  private nW = new Float32Array(8);
  private nBed = new Float32Array(8);
  private lastDir: Uint8Array;
  /** Cell-centered momentum (water × velocity) for FX / inertia. */
  private momX: Float32Array;
  private momY: Float32Array;
  /** Mei virtual-pipe outflow (L, R, T, B). */
  private fluxL: Float32Array;
  private fluxR: Float32Array;
  private fluxT: Float32Array;
  private fluxB: Float32Array;
  /** Velocity in cells / time, derived from pipe flux. */
  private velX: Float32Array;
  private velY: Float32Array;
  private sedFwd: Float32Array;
  private sedBwd: Float32Array;
  /** Transient aeration from high shear / drops. Visual only. */
  private aerate: Float32Array;
  private fxU = new Float32Array(MAX_FX);
  private fxV = new Float32Array(MAX_FX);
  private fxH = new Float32Array(MAX_FX);
  private fxKind = new Uint8Array(MAX_FX);
  private fxAge = new Uint8Array(MAX_FX);
  private fxLife = new Uint8Array(MAX_FX);
  private fxN = 0;
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
    this.hardmask = new Float32Array(n);
    this.waterDelta = new Float32Array(n);
    this.sedDelta = new Float32Array(n);
    this.terrDelta = new Float32Array(n);
    this.momX = new Float32Array(n);
    this.momY = new Float32Array(n);
    this.fluxL = new Float32Array(n);
    this.fluxR = new Float32Array(n);
    this.fluxT = new Float32Array(n);
    this.fluxB = new Float32Array(n);
    this.velX = new Float32Array(n);
    this.velY = new Float32Array(n);
    this.sedFwd = new Float32Array(n);
    this.sedBwd = new Float32Array(n);
    this.aerate = new Float32Array(n);
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
    this.virtualPipes();
    this.virtualPipes();
    this.threadConcentrate();
    this.erodeDeposit();
    this.advectSediment();
    this.undercutBanks();
    this.soakAndDrain();
    this.thermal();
    const air = this.aerate;
    for (let i = 0; i < air.length; i++) air[i] *= 0.88;
  }

  private addSources(): void {
    for (const src of this.sources) {
      if (src.kind === "rain") this.addRain(src);
      else this.addPointSource(src);
    }
  }

  private addPointSource(src: WaterSource): void {
    const { size } = this;
    const water = this.water;
    const x = Math.max(1, Math.min(size - 2, Math.round(src.x * (size - 1))));
    const y = Math.max(1, Math.min(size - 2, Math.round(src.y * (size - 1))));
    const add = src.rate * 0.048;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const fall = Math.exp(-(dx * dx + dy * dy) * 0.95);
        water[this.i(x + dx, y + dy)] += add * fall * 0.62;
      }
    }
  }

  /** Sparse rain band: seeds rivulets instead of a sheet. */
  private addRain(src: WaterSource): void {
    const { size } = this;
    const water = this.water;
    const halfU = Math.max(0.08, src.spread ?? 0.4);
    const halfV = Math.max(0.028, halfU * 0.14);
    const x0 = Math.max(1, Math.floor((src.x - halfU) * (size - 1)));
    const x1 = Math.min(size - 2, Math.ceil((src.x + halfU) * (size - 1)));
    const y0 = Math.max(1, Math.floor((src.y - halfV) * (size - 1)));
    const y1 = Math.min(size - 2, Math.ceil((src.y + halfV) * (size - 1)));
    const cells = Math.max(1, (x1 - x0 + 1) * (y1 - y0 + 1));
    const add = (src.rate * 0.28) / cells;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const u = x / (size - 1);
        const v = y / (size - 1);
        const du = (u - src.x) / halfU;
        const dv = (v - src.y) / halfV;
        const fall = Math.exp(-(du * du + dv * dv) * 1.15);
        if (fall < 0.08) continue;
        const drop = hash2(x, y, this.tick + 17);
        if (drop < 0.52) continue;
        water[this.i(x, y)] += add * fall * (0.5 + drop);
      }
    }
  }

  /**
   * Mei / O'Brien virtual pipes: flux → water → velocity.
   * Hardmask is ignored for routing — water still crosses concrete.
   */
  private virtualPipes(): void {
    const { size, params } = this;
    const areaScale = 0.72 + 0.55 * params.flowRate;
    updatePipeFlux(
      this.fluxL,
      this.fluxR,
      this.fluxT,
      this.fluxB,
      this.terrain,
      this.water,
      this.flow,
      size,
      areaScale,
      PIPE_DT,
    );
    applyPipeFlux(
      this.fluxL,
      this.fluxR,
      this.fluxT,
      this.fluxB,
      this.water,
      this.velX,
      this.velY,
      size,
      PIPE_DT,
    );
    const n = size * size;
    const vx = this.velX;
    const vy = this.velY;
    const mx = this.momX;
    const my = this.momY;
    const water = this.water;
    const flow = this.flow;
    for (let i = 0; i < n; i++) {
      const w = water[i];
      mx[i] = vx[i] * w;
      my[i] = vy[i] * w;
      const spd = Math.hypot(vx[i], vy[i]);
      if (w < 1e-5 || spd < STILL_SPEED) {
        flow[i] *= 0.7;
        continue;
      }
      const stream = Math.min(0.45, spd * Math.min(w, 0.1) * 2.4);
      flow[i] = flow[i] * 0.52 + stream * 0.48;
    }
  }

  /**
   * D8 thread concentrate after the pipe solve — keeps point sources as veins
   * instead of a sheet. Moves water only; sediment rides MacCormack advection.
   */
  private threadConcentrate(): void {
    const { size, params } = this;
    const n = size * size;
    const terrain = this.terrain;
    const water = this.water;
    const flow = this.flow;
    const lastDir = this.lastDir;
    const wD = this.waterDelta;
    wD.fill(0);

    const transfer = 0.55 * params.flowRate;

    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const i = this.i(x, y);
        const w = water[i];
        if (w < 1e-5) {
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
          const j = this.i(x + NEIGH[k][0], y + NEIGH[k][1]);
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
          lastDir[i] = 255;
          continue;
        }

        const head = Math.max(0, h - minHn);
        const ponded = maxDrop < MIN_SURFACE_SLOPE;
        const bedFall = Math.max(0, terrain[i] - minBed);
        // A water mound in a hole is not a stream — leave it for the pipes.
        if (ponded || bedFall < 0.0014) {
          lastDir[i] = 255;
          continue;
        }
        const inThread = bedFall > 0.006;
        const reserve = inThread ? Math.min(w * 0.36, 0.026) : Math.min(w * 0.22, 0.014);
        const movable = Math.min(
          Math.max(0, w - reserve) * transfer,
          Math.max(0, w - reserve) * 0.72,
          Math.max(head * 0.85, w * (inThread ? 0.14 : 0.18)),
        );
        if (movable < 1e-7) continue;

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

        const flux = flow[i];
        const ratio = second >= 0 ? this.nDrop[second] / Math.max(this.nDrop[steep], 1e-6) : 0;
        const canBranch =
          second >= 0 &&
          flux > BRANCH_FLUX &&
          ratio >= BRANCH_RATIO &&
          this.nBed[second] > 1e-5;
        const leakK = canBranch ? 0.12 : w > 0.055 ? 0.1 : flux > 0.018 ? 0.038 : 0.062;
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
        }
      }
    }

    for (let i = 0; i < n; i++) {
      water[i] = Math.max(0, water[i] + wD[i]);
    }
  }

  /**
   * Equilibrium sediment: C = Kc · sin(α) · |v|, then relax toward C.
   * Erosion only when flow × bed slope exceeds MIN_SHEAR — stagnant drops
   * sit at C≈0 and cannot burn holes.
   */
  private erodeDeposit(): void {
    const { size, params } = this;
    const n = size * size;
    const terrain = this.terrain;
    const water = this.water;
    const sediment = this.sediment;
    const hard = this.hardmask;
    const tD = this.terrDelta;
    tD.fill(0);

    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const i = this.i(x, y);
        const w = water[i];
        if (w < 1e-5 && sediment[i] < 1e-6) continue;

        const speed = Math.hypot(this.velX[i], this.velY[i]);
        const slope = bedSlopeAt(terrain, size, x, y);
        const shear = speed * Math.max(0, slope);
        const ponded = this.pondedAt(x, y);
        const surf = this.surfaceSlopeAt(x, y);
        if (!ponded && w > 0.006) {
          const drop = Math.max(slope, surf);
          const fluxFx = drop > 0.018 ? Math.max(this.flow[i], 0.055) : this.flow[i];
          const score = bubbleSpawnScore(Math.max(shear, drop * 2e-3), drop, fluxFx, w);
          if (score > this.aerate[i]) this.aerate[i] = score;
        }

        if (hard[i] >= HARD_THRESHOLD) continue;
        if (this.nearPointSource(x, y)) continue;

        const surface = this.surfaceSlopeAt(x, y);
        const bedFrac = slope / Math.max(surface, 1e-6);
        let threadN = 0;
        for (let k = 0; k < 4; k++) {
          const j = this.i(x + NEIGH[k][0], y + NEIGH[k][1]);
          if (this.flow[j] > 0.012 && water[j] > 0.005) threadN++;
        }
        // Bed must explain the drop — rain films and circulating pools do not pick.
        const canPick = canPickSediment({
          ponded,
          flow: this.flow[i],
          speed,
          shear,
          bedFrac,
          slope,
          water: w,
          threadNeighbors: threadN,
        });

        const cap = canPick ? sedimentCapacity(speed, slope, w, params.sedimentCapacity) : 0;
        const wetC = this.wetness[i] * 0.08;
        const localC = Math.min(0.95, params.cohesion + this.cohesion[i] + wetC);
        const erodeK = params.erosionRate * (1.05 - localC) * 0.42;
        const xfer = equilibriumTransfer(cap, sediment[i], erodeK, params.deposition * 0.85);
        if (xfer > 0 && canPick) {
          const pick = Math.min(
            xfer,
            Math.max(0, terrain[i] - MIN_SAND) * MAX_ERODE_FRAC,
            w * 0.16,
          );
          tD[i] -= pick;
          sediment[i] += pick;
        } else if (xfer < 0) {
          const drop = Math.min(-xfer, sediment[i], 0.005);
          tD[i] += drop;
          sediment[i] -= drop;
        }
      }
    }

    for (let i = 0; i < n; i++) {
      if (hard[i] >= HARD_THRESHOLD) continue;
      const before = terrain[i];
      terrain[i] = Math.max(MIN_SAND, terrain[i] + tD[i]);
      if (tD[i] < 0) this.erodedSand += before - terrain[i];
    }
  }

  private pondedAt(x: number, y: number): boolean {
    const i = this.i(x, y);
    const w = this.water[i];
    const h = this.terrain[i] + w;
    let maxDrop = 0;
    let lowerBeds = 0;
    for (let k = 0; k < 4; k++) {
      const j = this.i(x + NEIGH[k][0], y + NEIGH[k][1]);
      const dh = h - (this.terrain[j] + this.water[j]);
      if (dh > maxDrop) maxDrop = dh;
      if (this.terrain[j] < this.terrain[i] - 0.002) lowerBeds++;
    }
    if (maxDrop < MIN_SURFACE_SLOPE) return true;
    if (Math.hypot(this.velX[i], this.velY[i]) < STILL_SPEED) return true;
    const slope = bedSlopeAt(this.terrain, this.size, x, y);
    // Bowl / catch-basin floor — hang threads always have a downhill bed.
    if (w > 0.016 && lowerBeds === 0) return true;
    if (w > 0.02 && lowerBeds <= 1 && slope < 0.0032) return true;
    return false;
  }

  /** Point-source kernel — a pour mound, not a thread. Rain bands are excluded. */
  private nearPointSource(x: number, y: number): boolean {
    const { size } = this;
    for (const src of this.sources) {
      if (src.kind === "rain") continue;
      const sx = src.x * (size - 1);
      const sy = src.y * (size - 1);
      const dx = x - sx;
      const dy = y - sy;
      if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) return true;
    }
    return false;
  }

  private surfaceSlopeAt(x: number, y: number): number {
    const i = this.i(x, y);
    const s = this.size;
    const dx = 0.5 * (this.terrain[i + 1] + this.water[i + 1] - (this.terrain[i - 1] + this.water[i - 1]));
    const dy = 0.5 * (this.terrain[i + s] + this.water[i + s] - (this.terrain[i - s] + this.water[i - s]));
    return Math.hypot(dx, dy);
  }

  private advectSediment(): void {
    advectMacCormack(
      this.sediment,
      this.sedFwd,
      this.sedBwd,
      this.velX,
      this.velY,
      this.size,
      PIPE_DT * 1.15,
    );
    this.sediment.set(this.sedFwd);
  }

  /** Dam overflow / bank undercut. Standing pools stay gated. */
  private undercutBanks(): void {
    const { size, params } = this;
    const n = size * size;
    const terrain = this.terrain;
    const water = this.water;
    const hard = this.hardmask;
    const tD = this.terrDelta;
    const sD = this.sedDelta;
    tD.fill(0);
    sD.fill(0);

    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const i = this.i(x, y);
        const w = water[i];
        if (w < 0.004 || hard[i] >= HARD_THRESHOLD) continue;
        if (this.pondedAt(x, y) || this.nearPointSource(x, y)) continue;
        const h = terrain[i] + w;
        let minHn = h;
        for (let k = 0; k < 4; k++) {
          const j = this.i(x + NEIGH[k][0], y + NEIGH[k][1]);
          const hn = terrain[j] + water[j];
          if (hn < minHn) minHn = hn;
        }
        const head = h - minHn;
        const flux = this.flow[i];
        if (flux < 0.018 && head < 0.016) continue;
        const wetC = this.wetness[i] * 0.08;
        const localC = Math.min(0.95, params.cohesion + this.cohesion[i] + wetC);
        const localErodeK = params.erosionRate * (1.05 - localC);
        for (let k = 0; k < 4; k++) {
          const j = this.i(x + NEIGH[k][0], y + NEIGH[k][1]);
          const bank = terrain[j] - terrain[i];
          if (bank > 0.008 && hard[j] < HARD_THRESHOLD) {
            const hold = 1 - Math.min(0.5, this.wetness[j] * 0.45);
            const overflowK = head > 0.01 ? 1.7 + head * 16 : 1;
            const nibble = Math.min(
              bank * 0.024 * localErodeK * Math.min(Math.max(flux, head), 0.14) * overflowK * hold,
              bank * 0.1,
            );
            tD[j] -= nibble;
            sD[i] += nibble * 0.72;
          }
        }
      }
    }

    for (let i = 0; i < n; i++) {
      this.sediment[i] = Math.max(0, this.sediment[i] + sD[i]);
      if (hard[i] >= HARD_THRESHOLD) continue;
      const before = terrain[i];
      terrain[i] = Math.max(MIN_SAND, terrain[i] + tD[i]);
      if (tD[i] < 0) this.erodedSand += before - terrain[i];
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
      const still = moving < 0.008;
      const deepStill = still && w > 0.03;
      const soakScale = w < 0.03 ? 0.16 : deepStill ? 0.1 : 1;
      const soak = Math.min(w, (inf * 0.36 * soakScale * w) / (1 + moving * 24));
      this.water[i] -= soak;
      this.wetness[i] = Math.min(1, this.wetness[i] + soak * 8 + (w > 0.0015 ? 0.08 : 0));
      this.wetness[i] *= 0.993;
      this.water[i] *= 1 - eva * (deepStill ? 0.16 : still ? 0.7 : 0.3);
      if (y >= last && this.water[i] > 0 && moving > 0.01) this.water[i] *= 0.9;
      if (this.water[i] < 1e-5) {
        this.water[i] = 0;
        this.sediment[i] *= 0.88;
      }
    }
  }

  private thermal(): void {
    thermalSlip(
      this.terrain,
      this.water,
      this.wetness,
      this.cohesion,
      this.hardmask,
      this.terrDelta,
      this.size,
      this.params.grain,
      this.params.cohesion,
    );
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
            const i = this.i(x, y);
            if (this.hardmask[i] >= HARD_THRESHOLD) continue;
            const w = Math.exp(-d2 / (r2 * 0.45));
            mean += copy[i] * w;
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
          const i = this.i(x, y);
          if (this.hardmask[i] >= HARD_THRESHOLD) continue;
          const w = Math.exp(-d2 / (r2 * 0.45)) * strength * (kind === "flatten" ? 0.55 : 0.35);
          if (kind === "flatten") {
            this.terrain[i] += (mean - this.terrain[i]) * Math.min(1, w);
            continue;
          }
          let acc = 0;
          let c = 0;
          for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
              const j = this.i(x + ox, y + oy);
              if (this.hardmask[j] >= HARD_THRESHOLD) continue;
              acc += copy[j];
              c++;
            }
          }
          if (c > 0) this.terrain[i] += (acc / c - this.terrain[i]) * w;
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
        if (kind === "concrete") {
          // Binary hardmask: core of the brush snaps fully hard so erosion
          // cannot nibble a soft halo of 0.2–0.49 cells.
          if (fall >= 0.22) this.hardmask[i] = 1;
          const slab = fall * strength * 0.018;
          const wall = fall * Math.max(0, strength - 0.85) * 0.055;
          this.terrain[i] += slab + wall;
          continue;
        }
        if (kind === "soft") {
          if (fall >= 0.18) this.hardmask[i] = 0;
          continue;
        }
        if (this.hardmask[i] >= HARD_THRESHOLD) continue;
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
        const i = this.i(x, y);
        if (this.hardmask[i] >= HARD_THRESHOLD) continue;
        sum += this.terrain[i];
        count++;
      }
    }
    const mean = count > 0 ? sum / count : 0.42;
    for (let y = edge; y < size - edge; y++) {
      for (let x = edge; x < size - edge; x++) {
        const i = this.i(x, y);
        if (this.hardmask[i] >= HARD_THRESHOLD) continue;
        this.terrain[i] = mean;
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
        const fall = Math.exp(-(dx * dx + dy * dy) * 0.58);
        this.water[this.i(x, y)] += amount * fall * 0.5;
      }
    }
  }

  resetWater(): void {
    this.water.fill(0);
    this.sediment.fill(0);
    this.flow.fill(0);
    this.momX.fill(0);
    this.momY.fill(0);
    this.fluxL.fill(0);
    this.fluxR.fill(0);
    this.fluxT.fill(0);
    this.fluxB.fill(0);
    this.velX.fill(0);
    this.velY.fill(0);
    this.aerate.fill(0);
    this.fxN = 0;
    this.lastDir.fill(255);
  }

  pack(): Float32Array {
    return packMapsRgba(this.terrain, this.water, this.wetness, this.flow);
  }

  collectParticles(): Float32Array {
    this.advanceFlowFx();
    const cap = Math.max(0, Math.min(MAX_PARTICLES, this.particleBudget | 0));
    if (cap <= 0) return new Float32Array(0);
    const { size } = this;
    const n = size * size;
    const scan = size > 300 ? 3 : 2;
    const foamCap = Math.min(MAX_FOAM, cap);
    const foam: number[] = [];
    for (let i = 0; i < n && foam.length < foamCap; i += scan) {
      if (this.flow[i] > 0.016 && this.water[i] > 0.004) foam.push(i);
    }
    const count = Math.min(cap, foam.length + this.fxN);
    const out = new Float32Array(count * PARTICLE_STRIDE);
    let w = 0;
    for (let k = 0; k < foam.length && w < count; k++) {
      const i = foam[k];
      const x = i % size;
      const y = (i - x) / size;
      const o = w * PARTICLE_STRIDE;
      out[o] = x / (size - 1);
      out[o + 1] = y / (size - 1);
      out[o + 2] = this.terrain[i] + this.water[i];
      out[o + 3] = packParticleAttr(KIND_FOAM, 1);
      w++;
    }
    for (let k = 0; k < this.fxN && w < count; k++) {
      const o = w * PARTICLE_STRIDE;
      out[o] = this.fxU[k];
      out[o + 1] = this.fxV[k];
      out[o + 2] = this.fxH[k];
      const life = 1 - this.fxAge[k] / Math.max(1, this.fxLife[k]);
      out[o + 3] = packParticleAttr(this.fxKind[k] as ParticleKind, life);
      w++;
    }
    return out;
  }

  private pushFx(u: number, v: number, h: number, kind: ParticleKind, life: number): void {
    if (this.fxN >= MAX_FX) return;
    const i = this.fxN++;
    this.fxU[i] = u;
    this.fxV[i] = v;
    this.fxH[i] = h;
    this.fxKind[i] = kind;
    this.fxAge[i] = 0;
    this.fxLife[i] = life;
  }

  /** Age / spawn visual FX once per emitted frame, not per SWE step. */
  private advanceFlowFx(): void {
    const { size } = this;
    const n = size * size;
    const denom = size - 1;
    let keep = 0;
    for (let k = 0; k < this.fxN; k++) {
      const age = this.fxAge[k] + 1;
      if (age >= this.fxLife[k]) continue;
      const x = Math.max(1, Math.min(size - 2, Math.round(this.fxU[k] * denom)));
      const y = Math.max(1, Math.min(size - 2, Math.round(this.fxV[k] * denom)));
      const i = this.i(x, y);
      const w = this.water[i];
      if (w < 0.002) continue;
      if (this.fxKind[k] === KIND_GRAIN) {
        if (this.flow[i] < 0.012) continue;
        const inv = 1 / Math.max(w, 1e-4);
        this.fxU[k] = Math.min(0.98, Math.max(0.02, this.fxU[k] + this.momX[i] * inv * 0.004));
        this.fxV[k] = Math.min(0.98, Math.max(0.02, this.fxV[k] + this.momY[i] * inv * 0.004));
        this.fxH[k] = this.terrain[i] + Math.min(w * 0.14, 0.005);
      } else {
        const lift = 0.35 + (this.fxU[k] * 17 + this.fxV[k] * 9) % 0.5;
        this.fxH[k] = this.terrain[i] + w * Math.min(0.92, lift);
      }
      if (keep !== k) {
        this.fxU[keep] = this.fxU[k];
        this.fxV[keep] = this.fxV[k];
        this.fxH[keep] = this.fxH[k];
        this.fxKind[keep] = this.fxKind[k];
        this.fxLife[keep] = this.fxLife[k];
      }
      this.fxAge[keep] = age;
      keep++;
    }
    this.fxN = keep;

    const scan = size > 300 ? 3 : 2;
    for (let i = 0; i < n; i++) this.aerate[i] *= 0.68;

    let bubbles = 0;
    let grains = 0;
    for (let k = 0; k < this.fxN; k++) {
      if (this.fxKind[k] === KIND_GRAIN) grains++;
      else bubbles++;
    }

    for (let i = 0; i < n && grains < MAX_GRAINS && this.fxN < MAX_FX; i += scan) {
      const w = this.water[i];
      const score = grainSpawnScore(this.flow[i], w, this.sediment[i]);
      if (score < 0.14) continue;
      const x = i % size;
      const y = ((i - x) / size) | 0;
      if (hash2(x, y, this.tick + 61) < 0.58) continue;
      const u = Math.min(0.99, Math.max(0.01, x / denom + (hash2(x, y, 203) - 0.5) * 0.012));
      const v = Math.min(0.99, Math.max(0.01, y / denom + (hash2(x + 5, y, 211) - 0.5) * 0.012));
      const h = this.terrain[i] + Math.min(w * 0.14, 0.005);
      const life = 16 + ((hash2(x, y, this.tick + 83) * 10) | 0);
      this.pushFx(u, v, h, KIND_GRAIN, life);
      grains++;
    }

    for (let i = 0; i < n && bubbles < MAX_BUBBLES && this.fxN < MAX_FX; i += scan) {
      const air = this.aerate[i];
      const w = this.water[i];
      if (air < 0.2 || w < 0.006) continue;
      const x = i % size;
      const y = ((i - x) / size) | 0;
      if (hash2(x, y, this.tick + 7) < 0.38) continue;
      const nBub = 2 + ((hash2(x + 3, y, this.tick) * 3.4) | 0);
      for (let k = 0; k < nBub && bubbles < MAX_BUBBLES && this.fxN < MAX_FX; k++) {
        const j = clusterJitter(x, y, k, this.tick + k * 13);
        const u = Math.min(0.99, Math.max(0.01, x / denom + j.du));
        const v = Math.min(0.99, Math.max(0.01, y / denom + j.dv));
        const h = this.terrain[i] + w * j.lift;
        const life = 8 + ((hash2(x, k, this.tick + 29) * 7) | 0);
        this.pushFx(u, v, h, KIND_BUBBLE, life);
        bubbles++;
      }
    }
  }

  waterVolume(): number {
    let s = 0;
    for (let i = 0; i < this.water.length; i++) s += this.water[i];
    return s;
  }

  aerationPeak(): number {
    let m = 0;
    for (let i = 0; i < this.aerate.length; i++) if (this.aerate[i] > m) m = this.aerate[i];
    return m;
  }
}
