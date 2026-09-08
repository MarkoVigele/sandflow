/**
 * Display-side water field for GPU upload.
 *
 * Physics (`ErosionSim.water` / `.flow`) stays unsmoothed. Shaders own look
 * (Gerstner, foam, beer). This module owns G/A field data: despike, a strong
 * channel-preserving blur, and flow damping so vertex displacement cannot
 * grow 1-cell needles.
 */

import { packMapsRgba } from "./mapsContract";

/** Per-event pour increment. Leftover spreads so volume is kept. */
export const POUR_CELL_ADD_CAP = 0.008;
/** Point-source increment per step. */
export const SOURCE_CELL_ADD_CAP = 0.007;
/** Sparse rain drop increment. */
export const RAIN_CELL_ADD_CAP = 0.003;

const WET_EPS = 0.00035;
const DESPIKE_RATIO = 1.22;
const DESPIKE_PAD = 0.0035;
const DRY_WEIGHT = 0.08;
const BLUR_PASSES = 4;
const TEMPORAL_WATER = 0.34;
const TEMPORAL_FLOW = 0.48;
const FLOW_SOFT_KNEE = 0.09;
const FLOW_THIN = 0.008;
const KERNEL = [1, 3, 6, 3, 1] as const;
/** Display G: no cell may tower over its 4-neighbors. */
export const LIPSCHITZ_RATIO = 1.1;
export const LIPSCHITZ_PAD = 0.0024;
export const LIPSCHITZ_ITERS = 8;
/** Physics pour/source: kill columns, leave threads. */
export const PHYSICS_LIPSCHITZ_RATIO = 1.35;
export const PHYSICS_LIPSCHITZ_PAD = 0.006;
export const DISPLAY_WATER_CAP = 0.2;

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? x : x;
}

export function softFlow(flow: number, knee = FLOW_SOFT_KNEE): number {
  if (!(flow > 0)) return 0;
  const k = knee > 1e-6 ? knee : FLOW_SOFT_KNEE;
  return flow / (1 + flow / k);
}

function idx(x: number, y: number, size: number): number {
  return y * size + x;
}

function inInterior(x: number, y: number, size: number): boolean {
  return x >= 1 && y >= 1 && x < size - 1 && y < size - 1;
}

/**
 * Fan `leftover` into expanding rings around (x, y). Each ring cell is
 * add-capped so the origin cannot restack a needle.
 */
export function spreadLeftover(
  water: Float32Array,
  size: number,
  x: number,
  y: number,
  leftover: number,
  cap: number,
): void {
  if (!(leftover > 0) || !Number.isFinite(leftover)) return;
  const limit = cap > 0 ? cap : POUR_CELL_ADD_CAP;
  let rest = leftover;
  let lastRing: number[] | null = null;
  for (let r = 1; r <= 8 && rest > 1e-9; r++) {
    const ring: number[] = [];
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const xx = x + dx;
        const yy = y + dy;
        if (!inInterior(xx, yy, size)) continue;
        ring.push(idx(xx, yy, size));
      }
    }
    if (!ring.length) continue;
    lastRing = ring;
    const share = rest / ring.length;
    if (share <= limit) {
      for (const j of ring) water[j] += share;
      rest = 0;
      break;
    }
    for (const j of ring) water[j] += limit;
    rest -= limit * ring.length;
  }
  if (rest > 1e-9 && lastRing && lastRing.length) {
    const share = rest / lastRing.length;
    for (const j of lastRing) water[j] += share;
  }
}

/**
 * Add `delta` to one cell. Anything above `cap` fans into expanding rings
 * so a pour / source / rain tick cannot plant a needle.
 */
export function addCappedDelta(
  water: Float32Array,
  size: number,
  x: number,
  y: number,
  delta: number,
  cap: number,
): void {
  if (!(delta > 0) || !Number.isFinite(delta)) return;
  const limit = cap > 0 ? cap : POUR_CELL_ADD_CAP;
  if (!inInterior(x, y, size)) return;
  const first = Math.min(delta, limit);
  water[idx(x, y, size)] += first;
  spreadLeftover(water, size, x, y, delta - first, limit);
}

/**
 * Unnormalized falloff kernel (matches the old pour / source stamps).
 * Each stamp cell is add-capped once; leftover fans out from the center
 * so overlapping rings cannot restack a needle.
 */
export function addWaterKernelCapped(
  water: Float32Array,
  size: number,
  cx: number,
  cy: number,
  amount: number,
  sigma: number,
  radius: number,
  scale: number,
  cap: number,
): void {
  if (!(amount > 0) || !Number.isFinite(amount)) return;
  const r = Math.max(1, radius | 0);
  const limit = cap > 0 ? cap : POUR_CELL_ADD_CAP;
  let leftover = 0;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (!inInterior(x, y, size)) continue;
      const fall = Math.exp(-(dx * dx + dy * dy) * sigma);
      if (fall < 0.02) continue;
      const want = amount * fall * scale;
      const add = Math.min(want, limit);
      water[idx(x, y, size)] += add;
      leftover += want - add;
    }
  }
  if (leftover > 1e-9) spreadLeftover(water, size, cx, cy, leftover, limit);
}

function neighborMax4(src: Float32Array, size: number, x: number, y: number): number {
  const i = idx(x, y, size);
  return Math.max(src[i - 1], src[i + 1], src[i - size], src[i + size]);
}

/**
 * Flatten isolated columns (center ≫ 4-neighbors) into a 3×3 mound.
 * Display only — does not write the physics field.
 */
export function despikeWater(src: Float32Array, dst: Float32Array, size: number): void {
  dst.set(src);
  if (size < 3) return;
  for (let y = 1; y < size - 1; y++) {
    const row = y * size;
    for (let x = 1; x < size - 1; x++) {
      const i = row + x;
      const w = src[i];
      if (w < WET_EPS) continue;
      const nMax = neighborMax4(src, size, x, y);
      const ceil = nMax * DESPIKE_RATIO + DESPIKE_PAD;
      if (w <= ceil) continue;
      const keep = Math.max(nMax + DESPIKE_PAD * 0.45, ceil * 0.72);
      const excess = w - keep;
      dst[i] = keep;
      const share = excess / 8;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (ox === 0 && oy === 0) continue;
          dst[idx(x + ox, y + oy, size)] += share;
        }
      }
    }
  }
}

function blurAxis(
  src: Float32Array,
  dst: Float32Array,
  size: number,
  horizontal: boolean,
): void {
  dst.set(src);
  if (size < 3) return;
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const i = idx(x, y, size);
      const center = src[i];
      const nMax = neighborMax4(src, size, x, y);
      const spike = center > nMax * DESPIKE_RATIO + DESPIKE_PAD;
      let acc = 0;
      let wsum = 0;
      for (let k = -2; k <= 2; k++) {
        const xx = horizontal ? x + k : x;
        const yy = horizontal ? y : y + k;
        if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
        const s = src[idx(xx, yy, size)];
        const kern = KERNEL[k + 2];
        const wet = s > WET_EPS || center > WET_EPS;
        const allowDry = spike || center < WET_EPS;
        const w = kern * (wet ? (s > WET_EPS || allowDry ? 1 : DRY_WEIGHT) : DRY_WEIGHT);
        acc += s * w;
        wsum += w;
      }
      dst[i] = wsum > 1e-9 ? acc / wsum : center;
    }
  }
}

/**
 * Strong separable blur that keeps established 1-cell veins from sheeting.
 * Isolated peaks still flatten because despike runs first.
 */
/**
 * Guarantee: after this, no interior cell is a needle relative to its
 * 4-neighbors. Excess fans into the neighborhood so the GPU never sees a
 * 1-cell column — even if a shader does `terrain + water`.
 */
export function clampWaterLipschitz(
  field: Float32Array,
  scratch: Float32Array,
  size: number,
  ratio = LIPSCHITZ_RATIO,
  pad = LIPSCHITZ_PAD,
  iters = LIPSCHITZ_ITERS,
): void {
  if (size < 3) return;
  const n = Math.max(1, iters | 0);
  const r = ratio > 1 ? ratio : LIPSCHITZ_RATIO;
  const p = pad > 0 ? pad : LIPSCHITZ_PAD;
  for (let pass = 0; pass < n; pass++) {
    scratch.set(field);
    for (let y = 1; y < size - 1; y++) {
      const row = y * size;
      for (let x = 1; x < size - 1; x++) {
        const i = row + x;
        const w = scratch[i];
        if (w < WET_EPS) continue;
        const nMax = neighborMax4(scratch, size, x, y);
        const ceil = nMax * r + p;
        if (w <= ceil) continue;
        const excess = w - ceil;
        field[i] = ceil;
        const share = excess / 8;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            if (ox === 0 && oy === 0) continue;
            field[idx(x + ox, y + oy, size)] += share;
          }
        }
      }
    }
  }
}

/** Conservative physics despike after pour / sources — preview frames skip pipes. */
export function relaxPhysicsSpikes(
  water: Float32Array,
  scratch: Float32Array,
  size: number,
  iters = 3,
): void {
  clampWaterLipschitz(
    water,
    scratch,
    size,
    PHYSICS_LIPSCHITZ_RATIO,
    PHYSICS_LIPSCHITZ_PAD,
    iters,
  );
}

export function blurWaterField(
  src: Float32Array,
  dst: Float32Array,
  scratch: Float32Array,
  size: number,
  passes = BLUR_PASSES,
): void {
  dst.set(src);
  const n = Math.max(1, passes | 0);
  for (let p = 0; p < n; p++) {
    blurAxis(dst, scratch, size, true);
    blurAxis(scratch, dst, size, false);
  }
}

export function dampFlowField(
  flow: Float32Array,
  water: Float32Array,
  dst: Float32Array,
  scratch: Float32Array,
  size: number,
): void {
  if (size < 3) {
    dst.set(flow);
    return;
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = idx(x, y, size);
      if (x < 1 || y < 1 || x >= size - 1 || y >= size - 1) {
        scratch[i] = softFlow(flow[i]);
        continue;
      }
      let acc = 0;
      let wsum = 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const j = idx(x + ox, y + oy, size);
          const kern = ox === 0 && oy === 0 ? 4 : ox === 0 || oy === 0 ? 2 : 1;
          acc += flow[j] * kern;
          wsum += kern;
        }
      }
      scratch[i] = acc / wsum;
    }
  }
  for (let i = 0; i < dst.length; i++) {
    const w = water[i];
    const thin = w < FLOW_THIN ? w / FLOW_THIN : 1;
    const f = softFlow(scratch[i]) * thin;
    dst[i] = f > 0 ? f : 0;
  }
}

function temporalMix(
  next: Float32Array,
  prev: Float32Array | undefined,
  keep: number,
): void {
  if (!prev || prev.length !== next.length) return;
  const a = clamp01(keep);
  if (a < 1e-6) return;
  const b = 1 - a;
  for (let i = 0; i < next.length; i++) {
    const p = prev[i];
    if (p > 0) next[i] = p * a + next[i] * b;
  }
}

/**
 * Build the G/A fields that go to `uMaps`. Physics arrays are not written.
 * `prevWater` / `prevFlow` (usually last display buffers) add a light temporal hold.
 */
export function prepareDisplayMaps(
  water: Float32Array,
  flow: Float32Array,
  size: number,
  outWater: Float32Array,
  outFlow: Float32Array,
  scratch: Float32Array,
  prevWater?: Float32Array,
  prevFlow?: Float32Array,
): void {
  const n = size * size;
  if (outWater.length !== n || outFlow.length !== n || scratch.length !== n) {
    throw new Error("prepareDisplayMaps: buffer size mismatch");
  }
  despikeWater(water, outWater, size);
  blurWaterField(outWater, outWater, scratch, size);
  clampWaterLipschitz(outWater, scratch, size);
  for (let i = 0; i < n; i++) {
    let w = outWater[i];
    if (!(w > WET_EPS) || !Number.isFinite(w)) {
      outWater[i] = 0;
      continue;
    }
    if (w > DISPLAY_WATER_CAP) w = DISPLAY_WATER_CAP;
    outWater[i] = w;
  }
  temporalMix(outWater, prevWater, TEMPORAL_WATER);
  dampFlowField(flow, outWater, outFlow, scratch, size);
  temporalMix(outFlow, prevFlow, TEMPORAL_FLOW);
}

/** One-shot pack for undo / snapshot apply. Worker frames use `ErosionSim.pack`. */
export function packDisplayMapsRgba(
  terrain: Float32Array,
  water: Float32Array,
  wetness: Float32Array,
  flow: Float32Array,
  size: number,
): Float32Array {
  const n = size * size;
  const dw = new Float32Array(n);
  const df = new Float32Array(n);
  const scratch = new Float32Array(n);
  prepareDisplayMaps(water, flow, size, dw, df, scratch);
  return packMapsRgba(terrain, dw, wetness, df);
}

export function peakNeighborRatio(field: Float32Array, size: number, min = 0.004): number {
  let worst = 1;
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const w = field[idx(x, y, size)];
      if (w < min) continue;
      const nMax = Math.max(neighborMax4(field, size, x, y), 1e-6);
      const r = w / nMax;
      if (r > worst) worst = r;
    }
  }
  return worst;
}
