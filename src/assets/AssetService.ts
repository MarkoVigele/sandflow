import { fbm, hash2, mulberry32 } from "./noise";
import {
  composeUserPrompt,
  parseSandPalette,
  type SandPalette,
} from "./lookPrompts";

export {
  composeUserPrompt,
  DEFAULT_USER_PROMPT,
  FIXED_INTERNAL_PROMPTS,
} from "./lookPrompts";

export type MapKind = "albedo" | "wetAlbedo" | "normal" | "roughness" | "height";

export interface GeneratedMaps {
  albedo: HTMLCanvasElement;
  wetAlbedo: HTMLCanvasElement;
  normal: HTMLCanvasElement;
  roughness: HTMLCanvasElement;
  height: HTMLCanvasElement;
  prompt: string;
  composedPrompt: string;
  provider: string;
  grain: number;
}

export interface AssetProvider {
  readonly id: string;
  generate(userPrompt: string, size?: number): Promise<GeneratedMaps>;
}

function canvas(size: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  return c;
}

function seedFromPrompt(prompt: string): number {
  let h = 2166136261;
  for (let i = 0; i < prompt.length; i++) {
    h ^= prompt.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mix(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function writeRgb(
  data: Uint8ClampedArray,
  i: number,
  col: [number, number, number],
  jitter = 0,
): void {
  data[i] = Math.max(0, Math.min(255, col[0] + jitter));
  data[i + 1] = Math.max(0, Math.min(255, col[1] + jitter * 0.78));
  data[i + 2] = Math.max(0, Math.min(255, col[2] + jitter * 0.48));
  data[i + 3] = 255;
}

/** Two-pass dry/wet albedo + normal + roughness (R dry / G wet) + height. */
export function paintSandMaps(
  size: number,
  pal: SandPalette,
  seed: number,
): Omit<GeneratedMaps, "prompt" | "composedPrompt" | "provider"> {
  const rand = mulberry32(seed);
  const albedo = canvas(size);
  const wetAlbedo = canvas(size);
  const normal = canvas(size);
  const roughness = canvas(size);
  const height = canvas(size);

  const aCtx = albedo.getContext("2d", { willReadFrequently: false })!;
  const wCtx = wetAlbedo.getContext("2d", { willReadFrequently: false })!;
  const nCtx = normal.getContext("2d", { willReadFrequently: false })!;
  const rCtx = roughness.getContext("2d", { willReadFrequently: false })!;
  const hCtx = height.getContext("2d", { willReadFrequently: false })!;

  const aImg = aCtx.createImageData(size, size);
  const wImg = wCtx.createImageData(size, size);
  const nImg = nCtx.createImageData(size, size);
  const rImg = rCtx.createImageData(size, size);
  const hImg = hCtx.createImageData(size, size);

  const freq = 5.5 + pal.grain * 9;
  const heights = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const n1 = fbm(u * freq, v * freq, 4, seed);
      const n2 = fbm(u * freq * 3.4 + 4.1, v * freq * 3.4, 3, seed + 3);
      const cell = hash2(Math.floor(u * freq * 5.2), Math.floor(v * freq * 5.2), seed + 9);
      const grainBump = (cell - 0.5) * (0.18 + pal.grain * 0.22);
      heights[y * size + x] = Math.min(1, Math.max(0, n1 * 0.62 + n2 * 0.28 + grainBump + 0.12));
    }
  }

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = (y * size + x) * 4;
      const h = heights[y * size + x];
      const n2 = fbm(u * freq * 3.4 + 4.1, v * freq * 3.4, 2, seed + 3);
      const speck = hash2(x * 0.37, y * 0.41, seed);
      const sparkle = hash2(x * 0.91, y * 1.17, seed + 21);

      let dry = mix(pal.dryA, pal.dryB, h);
      let wet = mix(pal.wetA, pal.wetB, h * 0.85 + 0.08);
      if (speck > 0.935 - pal.grain * 0.07) {
        dry = pal.pebble;
        wet = mix(pal.pebble, pal.wetB, 0.55);
      } else if (sparkle > 0.988) {
        dry = pal.quartz;
        wet = mix(pal.quartz, pal.wetA, 0.35);
      }

      const jitter = (rand() - 0.5) * (8 + pal.grain * 6);
      writeRgb(aImg.data, i, dry, jitter);
      writeRgb(wImg.data, i, wet, jitter * 0.45);

      const xL = x === 0 ? size - 1 : x - 1;
      const xR = x === size - 1 ? 0 : x + 1;
      const yD = y === 0 ? size - 1 : y - 1;
      const yU = y === size - 1 ? 0 : y + 1;
      const nx = (heights[y * size + xL] - heights[y * size + xR]) * (1.35 + pal.grain);
      const ny = (heights[yD * size + x] - heights[yU * size + x]) * (1.35 + pal.grain);
      nImg.data[i] = Math.max(0, Math.min(255, 128 + nx * 200));
      nImg.data[i + 1] = Math.max(0, Math.min(255, 128 + ny * 200));
      nImg.data[i + 2] = 255;
      nImg.data[i + 3] = 255;

      const dryRough = 188 + n2 * 42 + pal.grain * 22 + (speck > 0.93 ? 18 : 0);
      const wetRough = 58 + n2 * 28 + pal.grain * 10;
      rImg.data[i] = Math.min(255, dryRough);
      rImg.data[i + 1] = Math.min(255, wetRough);
      rImg.data[i + 2] = rImg.data[i];
      rImg.data[i + 3] = 255;

      const h8 = Math.max(0, Math.min(255, h * 255));
      hImg.data[i] = hImg.data[i + 1] = hImg.data[i + 2] = h8;
      hImg.data[i + 3] = 255;
    }
  }

  aCtx.putImageData(aImg, 0, 0);
  wCtx.putImageData(wImg, 0, 0);
  nCtx.putImageData(nImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);
  hCtx.putImageData(hImg, 0, 0);

  return { albedo, wetAlbedo, normal, roughness, height, grain: pal.grain };
}

/**
 * Dummy KI: user prompt field → canvas / procedural PBR.
 * Fixed internal look prompts are composed in; no external API.
 */
export class DummyKIAssetProvider implements AssetProvider {
  readonly id: string = "dummy-ki";

  async generate(userPrompt: string, size = 512): Promise<GeneratedMaps> {
    const composed = composeUserPrompt(userPrompt);
    const seed = seedFromPrompt(composed);
    const pal = parseSandPalette(userPrompt || composed);
    const maps = paintSandMaps(size, pal, seed);
    return {
      ...maps,
      prompt: userPrompt,
      composedPrompt: composed,
      provider: this.id,
    };
  }
}

/** Kept as a named alias — Sim / App already call createAssetService(). */
export class ProceduralAssetProvider extends DummyKIAssetProvider {
  override readonly id = "procedural";
}

/** Placeholder HTTP slot. Always falls back to Dummy KI unless an endpoint exists. */
export class HttpAssetProvider implements AssetProvider {
  readonly id = "http-placeholder";
  constructor(
    private endpoint: string | null,
    private fallback: AssetProvider,
  ) {}

  async generate(userPrompt: string, size?: number): Promise<GeneratedMaps> {
    if (!this.endpoint) {
      const maps = await this.fallback.generate(userPrompt, size);
      return { ...maps, provider: this.id };
    }
    try {
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: userPrompt, size: size ?? 512 }),
      });
      if (!res.ok) throw new Error("asset api");
      const maps = await this.fallback.generate(userPrompt, size);
      return { ...maps, provider: this.id };
    } catch {
      return this.fallback.generate(userPrompt, size);
    }
  }
}

export function createAssetService(): AssetProvider {
  const dummy = new DummyKIAssetProvider();
  const endpoint = (import.meta.env.VITE_ASSET_API as string | undefined) ?? null;
  return new HttpAssetProvider(endpoint, dummy);
}
