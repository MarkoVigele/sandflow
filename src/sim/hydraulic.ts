/**
 * Fast hydraulic erosion helpers — original implementation of published ideas.
 *
 * Algorithms (no GPL/LGPL source was copied):
 * - Virtual pipes / hydrostatic flux: O'Brien & Hodgins 1995; Mei, Decaudin & Hu
 *   2007, "Fast Hydraulic Erosion Simulation and Visualization on GPU".
 * - Sediment capacity C ∝ sin(α)·|v|: Mei et al. / Julien & Simons 1985.
 * - Equilibrium mass transfer (approach C with a rate, not instant dissolve):
 *   soillib / McDonald hydrology *concept only*.
 * - MacCormack (forward + reverse + ½ error) advection with neighborhood clamp:
 *   Selle, Fedkiw et al. 2008; Stam 1999 semi-Lagrangian backtrace.
 *
 * WebGPU is out of scope — these kernels stay CPU-side for the WebGL2 worker.
 */

export const PIPE_DT = 0.2;
export const PIPE_G = 0.42;
export const PIPE_AREA = 0.38;
export const PIPE_FRICTION = 0.88;
/** Floor on sin(α) so a gentle sand slope still carries a little sediment. */
export const MIN_SIN_TILT = 0.035;
/** Standing / ponded columns sit under this speed. */
export const STILL_SPEED = 0.012;
/** Shear = speed × bed slope. Below this, no pick-up (no burn-in). */
export const MIN_SHEAR = 2.2e-6;
export const MIN_SAND = 0.04;
export const MAX_ERODE_FRAC = 0.014;
/** Established thread flux — rain speckles sit below this. */
export const PICK_MIN_FLOW = 0.016;
export const PICK_MIN_SPEED = 0.045;
/** Thin films / filling pools stay outside the pick window (Jáko lmax). */
export const PICK_MIN_WATER = 0.007;
export const PICK_MAX_WATER = 0.048;
/** Filling sheets on a flat bed stop earlier than a sloped thread. */
export const PICK_MAX_WATER_FLAT = 0.026;
/**
 * Water-column ceiling. Coarse grids (Low 128²) need ~1 of head so a
 * carved delta can overtop into arms. Ultra (768²) must stay lower or the
 * pipe solve blows up.
 */
export const MAX_WATER_DEPTH = 1.15;
export const MAX_WATER_DEPTH_ULTRA = 0.28;
const ULTRA_GRID = 640;
/**
 * Deeper than this, the cell is a pond/lake: equalize, no vein boost.
 * Thin films stay in the thread-concentrate regime.
 */
export const POND_DEPTH = 0.024;
/** Extra √h on a rising bed so barrier flux ~ weir Q ∝ h^{3/2}. */
export const WEIR_COEFF = 1.55;
const HYDRO_SPIKE_RATIO = 1.35;
const HYDRO_SPIKE_PAD = 0.006;

export function maxWaterDepthFor(size: number): number {
  if (size >= ULTRA_GRID) return MAX_WATER_DEPTH_ULTRA;
  return MAX_WATER_DEPTH;
}

/** Cells / time — MacCormack backtrace stays local even on a 768² grid. */
export const MAX_PIPE_SPEED = 8;

export function clampWaterDepth(w: number, max = MAX_WATER_DEPTH): number {
  if (!(w > 0)) return 0;
  return w > max ? max : w;
}

export function clampWaterField(water: Float32Array, max = MAX_WATER_DEPTH): void {
  for (let i = 0; i < water.length; i++) {
    const w = water[i];
    if (w > max) water[i] = max;
    else if (!(w > 0)) water[i] = 0;
  }
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export function sampleBilinear(field: Float32Array, size: number, x: number, y: number): number {
  const max = size - 1.001;
  const xs = clamp(x, 0, max);
  const ys = clamp(y, 0, max);
  const x0 = xs | 0;
  const y0 = ys | 0;
  const x1 = x0 < size - 1 ? x0 + 1 : x0;
  const y1 = y0 < size - 1 ? y0 + 1 : y0;
  const fx = xs - x0;
  const fy = ys - y0;
  const a = field[y0 * size + x0];
  const b = field[y0 * size + x1];
  const c = field[y1 * size + x0];
  const d = field[y1 * size + x1];
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}

export function neighborhoodMinMax(
  field: Float32Array,
  size: number,
  x: number,
  y: number,
): { min: number; max: number } {
  const maxC = size - 1.001;
  const xs = clamp(x, 0, maxC);
  const ys = clamp(y, 0, maxC);
  const x0 = xs | 0;
  const y0 = ys | 0;
  const x1 = x0 < size - 1 ? x0 + 1 : x0;
  const y1 = y0 < size - 1 ? y0 + 1 : y0;
  const a = field[y0 * size + x0];
  const b = field[y0 * size + x1];
  const c = field[y1 * size + x0];
  const d = field[y1 * size + x1];
  return {
    min: Math.min(a, b, c, d),
    max: Math.max(a, b, c, d),
  };
}

/**
 * Semi-Lagrangian backtrace. `sign` is +1 for forward, −1 for the reverse pass.
 * Velocity is in cells per unit time.
 */
export function advectSemiLagrange(
  src: Float32Array,
  dst: Float32Array,
  velX: Float32Array,
  velY: Float32Array,
  size: number,
  dt: number,
  sign: number,
): void {
  const n = size * size;
  for (let i = 0; i < n; i++) {
    const x = i % size;
    const y = (i - x) / size;
    dst[i] = sampleBilinear(src, size, x - sign * velX[i] * dt, y - sign * velY[i] * dt);
  }
}

/**
 * MacCormack: φ* = A(φ), φ** = A⁻¹(φ*), φ = φ* + ½(φ − φ**), then clamp
 * to the bilinear neighborhood of the forward sample (extrema limiter).
 */
export function advectMacCormack(
  src: Float32Array,
  fwd: Float32Array,
  bwd: Float32Array,
  velX: Float32Array,
  velY: Float32Array,
  size: number,
  dt: number,
): void {
  advectSemiLagrange(src, fwd, velX, velY, size, dt, 1);
  advectSemiLagrange(fwd, bwd, velX, velY, size, dt, -1);
  const n = size * size;
  for (let i = 0; i < n; i++) {
    const x = i % size;
    const y = (i - x) / size;
    const corrected = fwd[i] + 0.5 * (src[i] - bwd[i]);
    const { min, max } = neighborhoodMinMax(
      src,
      size,
      x - velX[i] * dt,
      y - velY[i] * dt,
    );
    const v = corrected < min ? min : corrected > max ? max : corrected;
    fwd[i] = v < 0 ? 0 : v;
  }
}

/** Local tilt used by Mei: sin(α) from the bed slope magnitude. */
export function sinTilt(bedSlope: number): number {
  const s = bedSlope < 0 ? 0 : bedSlope;
  return s / Math.sqrt(1 + s * s);
}

/**
 * Equilibrium suspended-sediment capacity.
 * C = Kc · max(sin α, α_min) · |v| · depthRamp  (Mei + Jako depth limiter).
 * Standing water (|v|≈0 or flat bed) → C≈0, so no burn-in.
 */
export function sedimentCapacity(
  speed: number,
  bedSlope: number,
  water: number,
  capacityK: number,
): number {
  if (!(speed > STILL_SPEED) || !(water > 1e-5)) return 0;
  const shear = speed * Math.max(0, bedSlope);
  if (shear < MIN_SHEAR) return 0;
  // Isolated rain films on a hang are not a thread — they must concentrate first.
  if (water < 0.012 && speed < 0.12) return 0;
  const tilt = Math.max(sinTilt(bedSlope), MIN_SIN_TILT);
  // Shallow threads pick; filling / deep pools do not (Jako lmax, original curve).
  const depthRamp = water < 0.026 ? 1 : water > 0.052 ? 0 : 1 - (water - 0.026) / 0.026;
  return capacityK * tilt * speed * depthRamp * (0.07 + water * 0.85);
}

export type PickProbe = {
  ponded: boolean;
  flow: number;
  speed: number;
  shear: number;
  bedFrac: number;
  slope: number;
  water: number;
  /** Cardinal neighbors that already look like a wet thread. Isolated rain = 0. */
  threadNeighbors?: number;
};

/**
 * Pick only in an established shallow thread.
 * Standing rain, circulating basins, and source mounds stay at C≈0.
 */
export function canPickSediment(p: PickProbe): boolean {
  if (p.ponded) return false;
  if (!((p.threadNeighbors ?? 2) >= 1)) return false;
  if (!(p.flow > PICK_MIN_FLOW)) return false;
  if (!(p.speed > PICK_MIN_SPEED)) return false;
  if (!(p.shear > MIN_SHEAR)) return false;
  if (!(p.bedFrac >= 0.28)) return false;
  if (!(p.slope > 0.0014)) return false;
  const maxW = p.slope > 0.0038 ? PICK_MAX_WATER : PICK_MAX_WATER_FLAT;
  if (!(p.water > PICK_MIN_WATER) || !(p.water < maxW)) return false;
  return true;
}

/**
 * Relax sediment toward capacity. Positive → pick sand; negative → deposit.
 * Rate split: dissolve uses erosionK, settle uses depositionK (soillib-style).
 */
export function equilibriumTransfer(
  capacity: number,
  suspended: number,
  erosionK: number,
  depositionK: number,
): number {
  const gap = capacity - suspended;
  if (gap > 0) return gap * clamp(erosionK, 0, 1.4);
  return gap * clamp(depositionK, 0, 1.4);
}

export function bedSlopeAt(
  terrain: Float32Array,
  size: number,
  x: number,
  y: number,
): number {
  const i = y * size + x;
  const dx = 0.5 * (terrain[i + 1] - terrain[i - 1]);
  const dy = 0.5 * (terrain[i + size] - terrain[i - size]);
  return Math.hypot(dx, dy);
}

/** Higher of two beds — Audusse interface for well-balanced SWE/pipes. */
export function interfaceBed(z0: number, z1: number): number {
  return z0 > z1 ? z0 : z1;
}

/** Water-surface height above an interface bed. 0 if the column cannot wet it. */
export function hydroHead(eta: number, zInterface: number): number {
  const h = eta - zInterface;
  return h > 0 ? h : 0;
}

/**
 * Extra scale on a rising bed. Combined with flux ∝ Δh this is a weir
 * Q ∝ h^{3/2} so a dam crest sheets instead of dumping a needle.
 */
export function weirFluxScale(head: number, bedRise: number): number {
  if (!(head > 0) || !(bedRise > 0.006)) return 1;
  return Math.min(2.6, 1 + WEIR_COEFF * Math.sqrt(head));
}

/**
 * Virtual-pipe outflow (4-neighbor). Hydrostatic reconstruction: no flux
 * onto a neighbor whose bed sits above this cell's free surface. Deep
 * ponds equalize instead of vein-boosting, so a reservoir can rise.
 *
 * f ← max(0, f·friction + dt·A·g·Δh / l), then scale so Σf·dt ≤ water.
 */
export function updatePipeFlux(
  fluxL: Float32Array,
  fluxR: Float32Array,
  fluxT: Float32Array,
  fluxB: Float32Array,
  terrain: Float32Array,
  water: Float32Array,
  flow: Float32Array,
  size: number,
  areaScale: number,
  dt: number,
): void {
  const gAl = PIPE_G * PIPE_AREA * areaScale * dt;
  for (let y = 1; y < size - 1; y++) {
    const row = y * size;
    for (let x = 1; x < size - 1; x++) {
      const i = row + x;
      const w = water[i];
      if (w < 1e-6) {
        fluxL[i] = 0;
        fluxR[i] = 0;
        fluxT[i] = 0;
        fluxB[i] = 0;
        continue;
      }
      const z0 = terrain[i];
      const eta = z0 + w;
      const zL = terrain[i - 1];
      const zR = terrain[i + 1];
      const zB = terrain[i - size];
      const zT = terrain[i + size];
      const etaL = zL + water[i - 1];
      const etaR = zR + water[i + 1];
      const etaB = zB + water[i - size];
      const etaT = zT + water[i + size];
      const headL = hydroHead(eta, interfaceBed(z0, zL));
      const headR = hydroHead(eta, interfaceBed(z0, zR));
      const headB = hydroHead(eta, interfaceBed(z0, zB));
      const headT = hydroHead(eta, interfaceBed(z0, zT));
      const dL = headL > 0 ? eta - etaL : 0;
      const dR = headR > 0 ? eta - etaR : 0;
      const dB = headB > 0 ? eta - etaB : 0;
      const dT = headT > 0 ? eta - etaT : 0;

      const surfaceDrop = Math.max(0, dL, dR, dB, dT);
      const pond = w > POND_DEPTH && surfaceDrop < 0.01;
      const thin = pond ? 1 : w < 0.02 ? 0.78 + 11 * w : 1;
      const bedFall = Math.max(
        0,
        -Math.min(dL, dR, dB, dT) +
          (w - Math.max(water[i - 1], water[i + 1], water[i - size], water[i + size])),
      );
      const cond = pond
        ? 1.35 + 10 * Math.min(w, 0.4)
        : (1 + 14 * Math.min(flow[i], 0.32) + 6 * Math.min(bedFall, 0.08)) * thin;
      const acc = gAl * cond;
      const friction = pond ? 0.7 : PIPE_FRICTION;

      let fL = Math.max(0, fluxL[i] * friction + acc * dL * weirFluxScale(headL, zL - z0));
      let fR = Math.max(0, fluxR[i] * friction + acc * dR * weirFluxScale(headR, zR - z0));
      let fB = Math.max(0, fluxB[i] * friction + acc * dB * weirFluxScale(headB, zB - z0));
      let fT = Math.max(0, fluxT[i] * friction + acc * dT * weirFluxScale(headT, zT - z0));

      // Streams stay thin. Still ponds must not — a lake has to reach the wall.
      if (!pond) {
        let steep = fL;
        let which = 0;
        if (fR > steep) {
          steep = fR;
          which = 1;
        }
        if (fB > steep) {
          steep = fB;
          which = 2;
        }
        if (fT > steep) {
          steep = fT;
          which = 3;
        }
        if (steep > 1e-8) {
          const boost = w < 0.018 ? 1.7 : 1.55;
          const keep = w < 0.018 ? 0.6 : 0.72;
          fL *= which === 0 ? boost : keep;
          fR *= which === 1 ? boost : keep;
          fB *= which === 2 ? boost : keep;
          fT *= which === 3 ? boost : keep;
        }
      }

      const out = fL + fR + fB + fT;
      const k = out * dt > w ? w / (out * dt) : 1;
      fluxL[i] = x <= 1 ? 0 : fL * k;
      fluxR[i] = x >= size - 2 ? 0 : fR * k;
      fluxB[i] = y <= 1 ? 0 : fB * k;
      fluxT[i] = y >= size - 2 ? 0 : fT * k;
    }
  }
}

/**
 * Physics despike that will not teleport a column onto a bed above its
 * free surface (the display Lipschitz can walk water over a dam).
 */
export function relaxPhysicsSpikesHydro(
  water: Float32Array,
  terrain: Float32Array,
  scratch: Float32Array,
  size: number,
  iters = 3,
): void {
  if (size < 3) return;
  const nPass = Math.max(1, iters | 0);
  for (let pass = 0; pass < nPass; pass++) {
    scratch.set(water);
    for (let y = 1; y < size - 1; y++) {
      const row = y * size;
      for (let x = 1; x < size - 1; x++) {
        const i = row + x;
        const w = scratch[i];
        if (w < 1e-6) continue;
        const nMax = Math.max(scratch[i - 1], scratch[i + 1], scratch[i - size], scratch[i + size]);
        const ceil = nMax * HYDRO_SPIKE_RATIO + HYDRO_SPIKE_PAD;
        if (w <= ceil) continue;
        const eta = terrain[i] + w;
        let dests = 0;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            if (ox === 0 && oy === 0) continue;
            if (terrain[i + oy * size + ox] < eta) dests++;
          }
        }
        if (dests === 0) continue;
        const share = (w - ceil) / dests;
        water[i] = ceil;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            if (ox === 0 && oy === 0) continue;
            const j = i + oy * size + ox;
            if (terrain[j] < eta) water[j] += share;
          }
        }
      }
    }
  }
}

/**
 * Flatten the free surface of a pond without dumping down a cliff.
 * Overflow / weirs stay in the pipe solve.
 */
export function equalizePondSurface(
  terrain: Float32Array,
  water: Float32Array,
  delta: Float32Array,
  size: number,
  passes = 2,
): void {
  if (size < 3) return;
  const n = size * size;
  const nPass = Math.max(1, passes | 0);
  for (let p = 0; p < nPass; p++) {
    delta.fill(0);
    for (let y = 1; y < size - 1; y++) {
      const row = y * size;
      for (let x = 1; x < size - 1; x++) {
        const i = row + x;
        const w = water[i];
        if (w < POND_DEPTH) continue;
        const z0 = terrain[i];
        const eta = z0 + w;
        const neigh = [i - 1, i + 1, i - size, i + size];
        let openFall = 0;
        for (let k = 0; k < 4; k++) {
          const j = neigh[k];
          if (terrain[j] < z0 - 0.003 && terrain[j] + water[j] < eta - 0.004) openFall++;
        }
        if (openFall > 0) continue;
        let share = 0;
        let dests = 0;
        const dest = [0, 0, 0, 0];
        const amt = [0, 0, 0, 0];
        for (let k = 0; k < 4; k++) {
          const j = neigh[k];
          const zj = terrain[j];
          if (zj >= eta) continue;
          if (zj > z0 + 0.008) continue;
          if (z0 - zj > 0.014) continue;
          const etaJ = zj + water[j];
          const drop = eta - etaJ;
          if (drop <= 1e-5) continue;
          const move = Math.min(w * 0.22, drop * 0.45);
          if (move < 1e-7) continue;
          dest[dests] = j;
          amt[dests] = move;
          share += move;
          dests++;
        }
        if (dests === 0 || share < 1e-8) continue;
        const k = share > w * 0.55 ? (w * 0.55) / share : 1;
        let sent = 0;
        for (let d = 0; d < dests; d++) {
          const move = amt[d] * k;
          delta[dest[d]] += move;
          sent += move;
        }
        delta[i] -= sent;
      }
    }
    for (let i = 0; i < n; i++) {
      const next = water[i] + delta[i];
      water[i] = next > 0 ? next : 0;
    }
  }
}

/** Apply net pipe flux to water; write cell velocity (cells / time). */
export function applyPipeFlux(
  fluxL: Float32Array,
  fluxR: Float32Array,
  fluxT: Float32Array,
  fluxB: Float32Array,
  water: Float32Array,
  velX: Float32Array,
  velY: Float32Array,
  size: number,
  dt: number,
): void {
  for (let y = 1; y < size - 1; y++) {
    const row = y * size;
    for (let x = 1; x < size - 1; x++) {
      const i = row + x;
      const d1 = water[i];
      const fin =
        fluxR[i - 1] + fluxL[i + 1] + fluxT[i - size] + fluxB[i + size];
      const fout = fluxL[i] + fluxR[i] + fluxT[i] + fluxB[i];
      const d2 = clampWaterDepth(d1 + dt * (fin - fout), maxWaterDepthFor(size));
      water[i] = d2;
      const avg = 0.5 * (d1 + d2);
      if (avg < 1e-5) {
        velX[i] = 0;
        velY[i] = 0;
        continue;
      }
      const dWx = 0.5 * (fluxR[i - 1] - fluxL[i] + fluxR[i] - fluxL[i + 1]);
      const dWy = 0.5 * (fluxT[i - size] - fluxB[i] + fluxT[i] - fluxB[i + size]);
      velX[i] = clamp(dWx / avg, -MAX_PIPE_SPEED, MAX_PIPE_SPEED);
      velY[i] = clamp(dWy / avg, -MAX_PIPE_SPEED, MAX_PIPE_SPEED);
    }
  }
}
