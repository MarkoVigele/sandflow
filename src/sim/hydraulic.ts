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
  const tilt = Math.max(sinTilt(bedSlope), MIN_SIN_TILT);
  // Shallow threads pick; filling / deep pools do not (Jako lmax, original curve).
  const depthRamp = water < 0.026 ? 1 : water > 0.052 ? 0 : 1 - (water - 0.026) / 0.026;
  return capacityK * tilt * speed * depthRamp * (0.07 + water * 0.85);
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

/**
 * Virtual-pipe outflow (4-neighbor). `areaScale` folds flowRate and a
 * channel-conductivity boost so established streams stay thin.
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
      const eta = terrain[i] + w;
      const dL = eta - (terrain[i - 1] + water[i - 1]);
      const dR = eta - (terrain[i + 1] + water[i + 1]);
      const dB = eta - (terrain[i - size] + water[i - size]);
      const dT = eta - (terrain[i + size] + water[i + size]);

      // Conductivity rises in an established thread and on a falling bed.
      const bedFall = Math.max(0, -Math.min(dL, dR, dB, dT) + (w - Math.max(water[i - 1], water[i + 1], water[i - size], water[i + size])));
      const cond = 1 + 14 * Math.min(flow[i], 0.32) + 6 * Math.min(bedFall, 0.08);
      const acc = gAl * cond;

      let fL = Math.max(0, fluxL[i] * PIPE_FRICTION + acc * dL);
      let fR = Math.max(0, fluxR[i] * PIPE_FRICTION + acc * dR);
      let fB = Math.max(0, fluxB[i] * PIPE_FRICTION + acc * dB);
      let fT = Math.max(0, fluxT[i] * PIPE_FRICTION + acc * dT);

      // Concentrate along the steepest downhill pipe so sources form veins.
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
        const boost = 1.55;
        const keep = 0.72;
        fL *= which === 0 ? boost : keep;
        fR *= which === 1 ? boost : keep;
        fB *= which === 2 ? boost : keep;
        fT *= which === 3 ? boost : keep;
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
      const d2 = Math.max(0, d1 + dt * (fin - fout));
      water[i] = d2;
      const avg = 0.5 * (d1 + d2);
      if (avg < 1e-5) {
        velX[i] = 0;
        velY[i] = 0;
        continue;
      }
      const dWx = 0.5 * (fluxR[i - 1] - fluxL[i] + fluxR[i] - fluxL[i + 1]);
      const dWy = 0.5 * (fluxT[i - size] - fluxB[i] + fluxT[i] - fluxB[i + size]);
      velX[i] = dWx / avg;
      velY[i] = dWy / avg;
    }
  }
}
