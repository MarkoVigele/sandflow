/** Deterministic 2D value noise — no deps, good enough for sand and presets. */

export function hash2(x: number, y: number, seed = 1337): number {
  let n = Math.sin(x * 127.1 + y * 311.7 + seed * 0.017) * 43758.5453;
  return n - Math.floor(n);
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function valueNoise(x: number, y: number, seed = 1337): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = fade(x - x0);
  const fy = fade(y - y0);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

export function fbm(
  x: number,
  y: number,
  octaves = 5,
  seed = 1337,
): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + i * 19);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

/** Periodic value noise. `periodX` / `periodY` are the wrap period in cells. */
export function valueNoiseTiled(
  x: number,
  y: number,
  periodX: number,
  periodY: number,
  seed = 1337,
): number {
  const px = Math.max(1, Math.round(periodX));
  const py = Math.max(1, Math.round(periodY));
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const x0 = ((xi % px) + px) % px;
  const y0 = ((yi % py) + py) % py;
  const x1 = (x0 + 1) % px;
  const y1 = (y0 + 1) % py;
  const fx = fade(x - xi);
  const fy = fade(y - yi);
  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** Tileable FBM. `u`,`v` in [0,1]; `freq` is rounded to an integer period. */
export function fbmTiled(
  u: number,
  v: number,
  freq = 8,
  octaves = 5,
  seed = 1337,
): number {
  let period = Math.max(1, Math.round(freq));
  let amp = 0.5;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoiseTiled(u * period, v * period, period, period, seed + i * 19);
    norm += amp;
    amp *= 0.5;
    period *= 2;
  }
  return sum / norm;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
