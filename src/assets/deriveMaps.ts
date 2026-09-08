import { fbm, hash2, mulberry32 } from "./noise";

export function luma01(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Sobel normal (tangent) + contrast/luma roughness from an albedo buffer. */
export function deriveNormalRoughnessRgba(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  strength = 1.55,
): { normal: Uint8Array; roughness: Uint8Array } {
  const count = width * height;
  const normal = new Uint8Array(count * 4);
  const roughness = new Uint8Array(count * 4);

  const lumAt = (x: number, y: number): number => {
    const xx = ((x % width) + width) % width;
    const yy = ((y % height) + height) % height;
    const i = (yy * width + xx) * 4;
    return luma01(rgba[i] ?? 0, rgba[i + 1] ?? 0, rgba[i + 2] ?? 0);
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx =
        -lumAt(x - 1, y - 1) +
        lumAt(x + 1, y - 1) +
        -2 * lumAt(x - 1, y) +
        2 * lumAt(x + 1, y) +
        -lumAt(x - 1, y + 1) +
        lumAt(x + 1, y + 1);
      const dy =
        -lumAt(x - 1, y - 1) -
        2 * lumAt(x, y - 1) -
        lumAt(x + 1, y - 1) +
        lumAt(x - 1, y + 1) +
        2 * lumAt(x, y + 1) +
        lumAt(x + 1, y + 1);

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

      const L = lumAt(x, y);
      const contrast = Math.min(1, Math.abs(dx) + Math.abs(dy));
      const rough = Math.min(1, Math.max(0, 0.4 + contrast * 1.05 + L * 0.4 - (1 - L) * 0.2));
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

export function readRgba(canvas: HTMLCanvasElement): {
  data: Uint8ClampedArray;
  width: number;
  height: number;
} {
  const ctx = canvas.getContext("2d")!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { data: img.data, width: canvas.width, height: canvas.height };
}

export function darkenCanvas(src: HTMLCanvasElement, mul = 0.46): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.max(0, Math.min(255, (d[i] ?? 0) * mul));
    d[i + 1] = Math.max(0, Math.min(255, (d[i + 1] ?? 0) * mul * 0.94));
    d[i + 2] = Math.max(0, Math.min(255, (d[i + 2] ?? 0) * mul * 0.86));
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function generateWoodCanvas(size = 512, seed = 0x51a7d): HTMLCanvasElement {
  const c = makeCanvas(size);
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  const rand = mulberry32(seed);
  const plank = size / 8;

  for (let y = 0; y < size; y++) {
    const row = Math.floor(y / plank);
    const seam = Math.abs((y % plank) - plank * 0.5) > plank * 0.46 ? 0.55 : 1;
    const offset = (row % 2) * 0.37;
    for (let x = 0; x < size; x++) {
      const u = (x / size + offset) * 7.2;
      const v = y / size;
      const grain = fbm(u, v * 0.35, 5, seed);
      const ring = fbm(u * 0.45 + row * 1.7, v * 2.2, 3, seed + 9);
      const knot = hash2(x * 0.08, y * 0.11, seed + row);
      let r = 168 + grain * 52 + ring * 18;
      let g = 122 + grain * 38 + ring * 10;
      let b = 78 + grain * 22;
      if (knot > 0.992) {
        r *= 0.55;
        g *= 0.5;
        b *= 0.42;
      }
      const jitter = (rand() - 0.5) * 8;
      const i = (y * size + x) * 4;
      img.data[i] = Math.max(0, Math.min(255, r * seam + jitter));
      img.data[i + 1] = Math.max(0, Math.min(255, g * seam + jitter * 0.8));
      img.data[i + 2] = Math.max(0, Math.min(255, b * seam + jitter * 0.5));
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
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
