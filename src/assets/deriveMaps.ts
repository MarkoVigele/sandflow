import { fbmTiled, hash2, mulberry32 } from "./noise";

export function luma01(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function wrap(i: number, n: number): number {
  return ((i % n) + n) % n;
}

function pix(
  src: Uint8Array | Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
): [number, number, number, number] {
  const i = (y * width + x) * 4;
  return [src[i] ?? 0, src[i + 1] ?? 0, src[i + 2] ?? 0, src[i + 3] ?? 255];
}

function setPix(
  dst: Uint8Array,
  width: number,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a = 255,
): void {
  const i = (y * width + x) * 4;
  dst[i] = Math.max(0, Math.min(255, Math.round(r)));
  dst[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
  dst[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
  dst[i + 3] = Math.max(0, Math.min(255, Math.round(a)));
}

/** Drop JPEG/vignette borders, then resample so GPU size stays stable. */
export function insetCropRgba(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  frac = 0.06,
): { data: Uint8Array; width: number; height: number } {
  const ix = Math.max(0, Math.round(width * frac));
  const iy = Math.max(0, Math.round(height * frac));
  const cw = width - ix * 2;
  const ch = height - iy * 2;
  if (cw < 16 || ch < 16 || (ix === 0 && iy === 0)) {
    return { data: rgba instanceof Uint8Array ? rgba : new Uint8Array(rgba), width, height };
  }
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sy = iy + ((y + 0.5) / height) * (ch - 1);
    const y0 = Math.min(ch - 1, Math.floor(sy));
    const y1 = Math.min(ch - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < width; x++) {
      const sx = ix + ((x + 0.5) / width) * (cw - 1);
      const x0 = Math.min(cw - 1, Math.floor(sx));
      const x1 = Math.min(cw - 1, x0 + 1);
      const fx = sx - x0;
      const a = pix(rgba, width, ix + x0, iy + y0);
      const b = pix(rgba, width, ix + x1, iy + y0);
      const c = pix(rgba, width, ix + x0, iy + y1);
      const d = pix(rgba, width, ix + x1, iy + y1);
      const r =
        a[0] + (b[0] - a[0]) * fx + (c[0] - a[0]) * fy + (a[0] - b[0] - c[0] + d[0]) * fx * fy;
      const g =
        a[1] + (b[1] - a[1]) * fx + (c[1] - a[1]) * fy + (a[1] - b[1] - c[1] + d[1]) * fx * fy;
      const bl =
        a[2] + (b[2] - a[2]) * fx + (c[2] - a[2]) * fy + (a[2] - b[2] - c[2] + d[2]) * fx * fy;
      setPix(out, width, x, y, r, g, bl, 255);
    }
  }
  return { data: out, width, height };
}

/**
 * Narrow identical edge strips so RepeatWrapping matches without a half-offset ghost.
 */
export function makeSeamlessRgba(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  blendFrac = 0.05,
): Uint8Array {
  const bx = Math.max(2, Math.round(width * blendFrac));
  const by = Math.max(2, Math.round(height * blendFrac));
  const tmp = new Uint8Array(width * height * 4);
  const out = new Uint8Array(width * height * 4);
  const mix4 = (a: readonly number[], b: readonly number[], t: number) =>
    [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
      255,
    ] as const;
  const ease = (t: number) => {
    const x = Math.min(1, Math.max(0, t));
    return x * x * (3 - 2 * x);
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x < bx) {
        const t = ease(bx <= 1 ? 1 : x / (bx - 1));
        const m = mix4(pix(rgba, width, width - bx + x, y), pix(rgba, width, x, y), t);
        setPix(tmp, width, x, y, m[0], m[1], m[2], m[3]);
      } else if (x >= width - bx) {
        const x0 = x - (width - bx);
        const t = ease(bx <= 1 ? 1 : x0 / (bx - 1));
        const m = mix4(pix(rgba, width, x, y), pix(rgba, width, x0, y), t);
        setPix(tmp, width, x, y, m[0], m[1], m[2], m[3]);
      } else {
        const p = pix(rgba, width, x, y);
        setPix(tmp, width, x, y, p[0], p[1], p[2], p[3]);
      }
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (y < by) {
        const t = ease(by <= 1 ? 1 : y / (by - 1));
        const m = mix4(pix(tmp, width, x, height - by + y), pix(tmp, width, x, y), t);
        setPix(out, width, x, y, m[0], m[1], m[2], m[3]);
      } else if (y >= height - by) {
        const y0 = y - (height - by);
        const t = ease(by <= 1 ? 1 : y0 / (by - 1));
        const m = mix4(pix(tmp, width, x, y), pix(tmp, width, x, y0), t);
        setPix(out, width, x, y, m[0], m[1], m[2], m[3]);
      } else {
        const p = pix(tmp, width, x, y);
        setPix(out, width, x, y, p[0], p[1], p[2], p[3]);
      }
    }
  }
  return out;
}

/** Subtract a coarse luminance grid and add back the mean — kills vignette / stamp. */
export function flattenMacroRgba(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  cells = 24,
): Uint8Array {
  const gw = Math.max(4, Math.min(cells, width));
  const gh = Math.max(4, Math.min(cells, height));
  const grid = new Float32Array(gw * gh * 3);
  const count = new Float32Array(gw * gh);
  for (let y = 0; y < height; y++) {
    const gy = Math.min(gh - 1, Math.floor((y / height) * gh));
    for (let x = 0; x < width; x++) {
      const gx = Math.min(gw - 1, Math.floor((x / width) * gw));
      const i = (y * width + x) * 4;
      const gi = (gy * gw + gx) * 3;
      grid[gi] += rgba[i] ?? 0;
      grid[gi + 1] += rgba[i + 1] ?? 0;
      grid[gi + 2] += rgba[i + 2] ?? 0;
      count[gy * gw + gx] += 1;
    }
  }
  let mr = 0;
  let mg = 0;
  let mb = 0;
  let n = 0;
  for (let i = 0; i < gw * gh; i++) {
    const c = count[i] || 1;
    grid[i * 3] /= c;
    grid[i * 3 + 1] /= c;
    grid[i * 3 + 2] /= c;
    mr += grid[i * 3] ?? 0;
    mg += grid[i * 3 + 1] ?? 0;
    mb += grid[i * 3 + 2] ?? 0;
    n++;
  }
  mr /= n;
  mg /= n;
  mb /= n;

  const sampleGrid = (u: number, v: number, c: number): number => {
    const x = u * (gw - 1);
    const y = v * (gh - 1);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(gw - 1, x0 + 1);
    const y1 = Math.min(gh - 1, y0 + 1);
    const fx = x - x0;
    const fy = y - y0;
    const a = grid[(y0 * gw + x0) * 3 + c] ?? 0;
    const b = grid[(y0 * gw + x1) * 3 + c] ?? 0;
    const d = grid[(y1 * gw + x0) * 3 + c] ?? 0;
    const e = grid[(y1 * gw + x1) * 3 + c] ?? 0;
    return a + (b - a) * fx + (d - a) * fy + (a - b - d + e) * fx * fy;
  };

  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const u = (x + 0.5) / width;
      const v = (y + 0.5) / height;
      setPix(
        out,
        width,
        x,
        y,
        (rgba[i] ?? 0) - sampleGrid(u, v, 0) + mr,
        (rgba[i + 1] ?? 0) - sampleGrid(u, v, 1) + mg,
        (rgba[i + 2] ?? 0) - sampleGrid(u, v, 2) + mb,
        255,
      );
    }
  }
  return out;
}

export function gradeSandRgba(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  kind: "dry" | "wet",
): Uint8Array {
  const n = width * height;
  let mr = 0;
  let mg = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    mr += rgba[p] ?? 0;
    mg += rgba[p + 1] ?? 0;
    mb += rgba[p + 2] ?? 0;
  }
  mr /= n;
  mg /= n;
  mb /= n;
  const target = kind === "dry" ? [198, 164, 116] : [88, 70, 56];
  const pull = kind === "dry" ? 0.12 : 0.16;
  const sr = mr + (target[0]! - mr) * pull;
  const sg = mg + (target[1]! - mg) * pull;
  const sb = mb + (target[2]! - mb) * pull;
  const contrast = kind === "dry" ? 1.06 : 0.88;
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    let r = sr + ((rgba[p] ?? 0) - mr) * contrast;
    let g = sg + ((rgba[p + 1] ?? 0) - mg) * contrast;
    let b = sb + ((rgba[p + 2] ?? 0) - mb) * contrast;
    const L = luma01(r, g, b);
    const meanL = luma01(sr, sg, sb);
    if (L < meanL - 0.22) {
      const t = 0.45;
      r = r + (sr - r) * t;
      g = g + (sg - g) * t;
      b = b + (sb - b) * t;
    }
    if (kind === "wet") {
      r *= 0.98;
      g *= 0.94;
      b *= 0.88;
    }
    setPix(out, width, i % width, Math.floor(i / width), r, g, b, 255);
  }
  return out;
}

/** Pale concrete / lab bench — lift dark plank seams so the rim does not stamp. */
export function gradeLabRimRgba(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): Uint8Array {
  const n = width * height;
  let mr = 0;
  let mg = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    mr += rgba[p] ?? 0;
    mg += rgba[p + 1] ?? 0;
    mb += rgba[p + 2] ?? 0;
  }
  mr /= n;
  mg /= n;
  mb /= n;
  const sr = mr + (186 - mr) * 0.34;
  const sg = mg + (180 - mg) * 0.34;
  const sb = mb + (170 - mb) * 0.34;
  const meanL = luma01(sr, sg, sb);
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    let r = sr + ((rgba[p] ?? 0) - mr) * 0.78;
    let g = sg + ((rgba[p + 1] ?? 0) - mg) * 0.78;
    let b = sb + ((rgba[p + 2] ?? 0) - mb) * 0.78;
    const L = luma01(r, g, b);
    if (L < meanL * 0.78) {
      const t = 0.55;
      r = r + (sr * 0.9 - r) * t;
      g = g + (sg * 0.9 - g) * t;
      b = b + (sb * 0.9 - b) * t;
    }
    setPix(out, width, i % width, Math.floor(i / width), r, g, b, 255);
  }
  return out;
}

export function darkenRgba(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  mul = 0.48,
): Uint8Array {
  const n = width * height;
  let mr = 0;
  let mg = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    mr += rgba[p] ?? 0;
    mg += rgba[p + 1] ?? 0;
    mb += rgba[p + 2] ?? 0;
  }
  mr /= n;
  mg /= n;
  mb /= n;
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const r = (rgba[p] ?? 0) * mul * 1.0 + mr * 0.08;
    const g = (rgba[p + 1] ?? 0) * mul * 0.9 + mg * 0.07;
    const b = (rgba[p + 2] ?? 0) * mul * 0.78 + mb * 0.06;
    setPix(out, width, i % width, Math.floor(i / width), r, g, b, 255);
  }
  return out;
}

export function fillLabRimRgba(size: number, seed = 0x51a7d): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const rand = mulberry32(seed);
  const freq = 8;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const n1 = fbmTiled(u, v, freq, 5, seed);
      const n2 = fbmTiled(u, v, freq * 2, 3, seed + 11);
      const grit = hash2(x * 0.73, y * 0.61, seed);
      let r = 186 + n1 * 20 + n2 * 8;
      let g = 180 + n1 * 18 + n2 * 6;
      let b = 170 + n1 * 14 + n2 * 5;
      if (grit > 0.994) {
        r -= 16;
        g -= 14;
        b -= 12;
      }
      const jitter = (rand() - 0.5) * 5;
      setPix(out, size, x, y, r + jitter, g + jitter * 0.85, b + jitter * 0.7, 255);
    }
  }
  return out;
}

export function prepareSandRgba(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  kind: "dry" | "wet",
): Uint8Array {
  const cropped = width >= 256 && height >= 256 ? insetCropRgba(rgba, width, height, 0.03) : { data: rgba, width, height };
  const flat = flattenMacroRgba(cropped.data, cropped.width, cropped.height, 16);
  const graded = gradeSandRgba(flat, cropped.width, cropped.height, kind);
  return makeSeamlessRgba(graded, cropped.width, cropped.height, 0.05);
}

export function prepareLabRimRgba(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): Uint8Array {
  const cropped = width >= 256 && height >= 256 ? insetCropRgba(rgba, width, height, 0.03) : { data: rgba, width, height };
  const flat = flattenMacroRgba(cropped.data, cropped.width, cropped.height, 16);
  const graded = gradeLabRimRgba(flat, cropped.width, cropped.height);
  return makeSeamlessRgba(graded, cropped.width, cropped.height, 0.05);
}

function wrappedBoxBlur(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  if (radius < 1) return src.slice();
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const k = radius * 2 + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let i = -radius; i <= radius; i++) acc += src[y * w + wrap(i, w)] ?? 0;
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / k;
      acc += (src[y * w + wrap(x + radius + 1, w)] ?? 0) - (src[y * w + wrap(x - radius, w)] ?? 0);
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let i = -radius; i <= radius; i++) acc += tmp[wrap(i, h) * w + x] ?? 0;
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / k;
      acc += (tmp[wrap(y + radius + 1, h) * w + x] ?? 0) - (tmp[wrap(y - radius, h) * w + x] ?? 0);
    }
  }
  return out;
}

/** Sobel normal (tangent) + contrast/luma roughness. High-pass so baked lighting does not slope the bed. */
export function deriveNormalRoughnessRgba(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  strength = 1.55,
): { normal: Uint8Array; roughness: Uint8Array } {
  const count = width * height;
  const normal = new Uint8Array(count * 4);
  const roughness = new Uint8Array(count * 4);
  const luma = new Float32Array(count);

  const lumAt = (x: number, y: number): number => {
    const xx = wrap(x, width);
    const yy = wrap(y, height);
    const i = (yy * width + xx) * 4;
    return luma01(rgba[i] ?? 0, rgba[i + 1] ?? 0, rgba[i + 2] ?? 0);
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) luma[y * width + x] = lumAt(x, y);
  }
  const radius = Math.max(1, Math.round(Math.min(width, height) / 128));
  const blurred = wrappedBoxBlur(luma, width, height, radius);

  const heightAt = (x: number, y: number): number => {
    const p = wrap(y, height) * width + wrap(x, width);
    const L = luma[p] ?? 0;
    const hp = L - (blurred[p] ?? L);
    return L * 0.42 + (hp + 0.5) * 0.58;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx =
        -heightAt(x - 1, y - 1) +
        heightAt(x + 1, y - 1) +
        -2 * heightAt(x - 1, y) +
        2 * heightAt(x + 1, y) +
        -heightAt(x - 1, y + 1) +
        heightAt(x + 1, y + 1);
      const dy =
        -heightAt(x - 1, y - 1) -
        2 * heightAt(x, y - 1) -
        heightAt(x + 1, y - 1) +
        heightAt(x - 1, y + 1) +
        2 * heightAt(x, y + 1) +
        heightAt(x + 1, y + 1);

      let nx = -dx * strength;
      let ny = -dy * strength;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;

      const i = (y * width + x) * 4;
      normal[i] = Math.round((nx * 0.5 + 0.5) * 255);
      normal[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      normal[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      normal[i + 3] = 255;

      const p = y * width + x;
      const L = luma[p] ?? 0;
      const hp = Math.abs(L - (blurred[p] ?? L));
      const contrast = Math.min(1, Math.abs(dx) + Math.abs(dy) + hp * 1.6);
      const rough = Math.min(1, Math.max(0, 0.38 + contrast * 0.95 + L * 0.38 - (1 - L) * 0.18));
      const r8 = Math.round(rough * 255);
      roughness[i] = r8;
      roughness[i + 1] = r8;
      roughness[i + 2] = r8;
      roughness[i + 3] = 255;
    }
  }

  return { normal, roughness };
}

/** Pack dry roughness in R, wet roughness in G (B unused). */
export function packRoughnessRG(
  dry: Uint8Array | Uint8ClampedArray,
  wet: Uint8Array | Uint8ClampedArray,
): Uint8Array {
  const n = Math.min(dry.length, wet.length);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 4) {
    out[i] = dry[i] ?? 220;
    out[i + 1] = wet[i] ?? 90;
    out[i + 2] = dry[i] ?? 220;
    out[i + 3] = 255;
  }
  return out;
}

export function makeCanvas(size: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  return c;
}

export function canvasFromRgba(rgba: Uint8Array, width: number, height: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d")!;
  const clamped = rgba instanceof Uint8ClampedArray ? rgba : new Uint8ClampedArray(rgba);
  ctx.putImageData(new ImageData(clamped, width, height), 0, 0);
  return c;
}

export function imageToCanvas(img: CanvasImageSource, maxSize = 1024): HTMLCanvasElement {
  const srcW = "width" in img ? Number(img.width) : maxSize;
  const srcH = "height" in img ? Number(img.height) : maxSize;
  const scale = Math.min(1, maxSize / Math.max(srcW, srcH, 1));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d")!.drawImage(img, 0, 0, w, h);
  return c;
}

/** Downscale for GPU upload. Reuses the source when it already fits the budget. */
export function fitCanvas(src: HTMLCanvasElement, maxSize: number): HTMLCanvasElement {
  const longest = Math.max(src.width, src.height, 1);
  if (longest <= maxSize) return src;
  const scale = maxSize / longest;
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, w, h);
  return c;
}

export function readRgba(canvas: HTMLCanvasElement): {
  data: Uint8ClampedArray;
  width: number;
  height: number;
} {
  const ctx = canvas.getContext("2d")!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { data: img.data, width: canvas.width, height: canvas.height };
}

export function darkenCanvas(src: HTMLCanvasElement, mul = 0.48): HTMLCanvasElement {
  const { data, width, height } = readRgba(src);
  return canvasFromRgba(darkenRgba(data, width, height, mul), width, height);
}

/** Clean lab-bench concrete. Used when no baked rim file loads. */
export function generateLabRimCanvas(size = 512, seed = 0x51a7d): HTMLCanvasElement {
  const rgba = fillLabRimRgba(size, seed);
  return canvasFromRgba(rgba, size, size);
}

/** Same albedo as the tray rim — Beton cells share `concrete-albedo.jpg`. */
export function generateConcreteCanvas(size = 512, seed = 0xc0c0e): HTMLCanvasElement {
  return generateLabRimCanvas(size, seed);
}

/** Pale ash fallback — no floorboard seams. */
export function generateWoodCanvas(size = 512, seed = 0x51a7d): HTMLCanvasElement {
  const c = makeCanvas(size);
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  const rand = mulberry32(seed);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const grain = fbmTiled(u, v * 0.45 + u * 0.02, 10, 5, seed);
      const ring = fbmTiled(u * 0.5, v, 6, 3, seed + 9);
      let r = 196 + grain * 28 + ring * 10;
      let g = 184 + grain * 22 + ring * 8;
      let b = 166 + grain * 16 + ring * 6;
      const jitter = (rand() - 0.5) * 6;
      const i = (y * size + x) * 4;
      img.data[i] = Math.max(0, Math.min(255, r + jitter));
      img.data[i + 1] = Math.max(0, Math.min(255, g + jitter * 0.8));
      img.data[i + 2] = Math.max(0, Math.min(255, b + jitter * 0.55));
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function prepareSandCanvas(src: HTMLCanvasElement, kind: "dry" | "wet"): HTMLCanvasElement {
  const { data, width, height } = readRgba(src);
  const prepared = prepareSandRgba(data, width, height, kind);
  return canvasFromRgba(prepared, width, height);
}

export function prepareLabRimCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const { data, width, height } = readRgba(src);
  const prepared = prepareLabRimRgba(data, width, height);
  return canvasFromRgba(prepared, width, height);
}

export function deriveCanvasMaps(
  albedo: HTMLCanvasElement,
  strength = 1.55,
): { normal: HTMLCanvasElement; roughness: HTMLCanvasElement } {
  const { data, width, height } = readRgba(albedo);
  const maps = deriveNormalRoughnessRgba(data, width, height, strength);
  return {
    normal: canvasFromRgba(maps.normal, width, height),
    roughness: canvasFromRgba(maps.roughness, width, height),
  };
}

export function packRoughnessCanvas(
  dry: HTMLCanvasElement,
  wet: HTMLCanvasElement,
): HTMLCanvasElement {
  const a = readRgba(dry);
  const b = readRgba(wet);
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  if (a.width !== b.width || a.height !== b.height) {
    const dryFit = document.createElement("canvas");
    dryFit.width = w;
    dryFit.height = h;
    dryFit.getContext("2d")!.drawImage(dry, 0, 0, w, h);
    const wetFit = document.createElement("canvas");
    wetFit.width = w;
    wetFit.height = h;
    wetFit.getContext("2d")!.drawImage(wet, 0, 0, w, h);
    return packRoughnessCanvas(dryFit, wetFit);
  }
  const packed = packRoughnessRG(a.data, b.data);
  return canvasFromRgba(packed, w, h);
}
