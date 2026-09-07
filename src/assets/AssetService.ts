/**
 * Dummy texture service for V1: a short description becomes local canvas maps.
 * HttpAssetProvider is the later hook (VITE_ASSET_API); it falls back here.
 */
import { fbm, hash2, mulberry32 } from "./noise";

export type MapKind = "albedo" | "normal" | "roughness" | "wet";

export interface GeneratedMaps {
  albedo: HTMLCanvasElement;
  normal: HTMLCanvasElement;
  roughness: HTMLCanvasElement;
  prompt: string;
  provider: string;
}

export interface AssetProvider {
  readonly id: string;
  generate(prompt: string, size?: number): Promise<GeneratedMaps>;
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

interface Palette {
  dryA: [number, number, number];
  dryB: [number, number, number];
  pebble: [number, number, number];
  grain: number;
}

function parsePrompt(prompt: string): Palette {
  const p = prompt.toLowerCase();
  let dryA: [number, number, number] = [196, 162, 112];
  let dryB: [number, number, number] = [168, 132, 86];
  let pebble: [number, number, number] = [122, 98, 72];
  let grain = 0.55;

  if (/dunkel|basalt|vulkan|schwarz/.test(p)) {
    dryA = [92, 78, 68];
    dryB = [58, 50, 44];
    pebble = [36, 32, 30];
  } else if (/hell|weiß|quarz|bleich/.test(p)) {
    dryA = [228, 214, 186];
    dryB = [206, 188, 154];
    pebble = [176, 158, 128];
  } else if (/rot|laterit|rost|terra/.test(p)) {
    dryA = [176, 96, 62];
    dryB = [140, 72, 46];
    pebble = [98, 52, 36];
  } else if (/oliv|grün|moos/.test(p)) {
    dryA = [150, 138, 86];
    dryB = [112, 108, 64];
    pebble = [78, 80, 52];
  }

  if (/grob|kies|körnig|rau/.test(p)) grain = 0.9;
  if (/fein|mehl|glatt|staub/.test(p)) grain = 0.28;
  if (/feucht|nass|nass|wet/.test(p)) {
    dryA = dryA.map((c) => c * 0.72) as [number, number, number];
    dryB = dryB.map((c) => c * 0.68) as [number, number, number];
  }
  return { dryA, dryB, pebble, grain };
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

export class ProceduralAssetProvider implements AssetProvider {
  readonly id = "procedural";

  async generate(prompt: string, size = 512): Promise<GeneratedMaps> {
    const seed = seedFromPrompt(prompt || "quarzsand warm");
    const pal = parsePrompt(prompt || "feiner Quarzsand, warm, trocken");
    const rand = mulberry32(seed);
    const albedo = canvas(size);
    const normal = canvas(size);
    const roughness = canvas(size);
    const aCtx = albedo.getContext("2d")!;
    const nCtx = normal.getContext("2d")!;
    const rCtx = roughness.getContext("2d")!;
    const aImg = aCtx.createImageData(size, size);
    const nImg = nCtx.createImageData(size, size);
    const rImg = rCtx.createImageData(size, size);

    const freq = 6 + pal.grain * 10;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const n1 = fbm(u * freq, v * freq, 5, seed);
        const n2 = fbm(u * freq * 3.2 + 4.1, v * freq * 3.2, 3, seed + 3);
        const speck = hash2(x * 0.37, y * 0.41, seed);
        const t = Math.min(1, Math.max(0, n1 * 0.75 + n2 * 0.25));
        let col = mix(pal.dryA, pal.dryB, t);
        if (speck > 0.93 - pal.grain * 0.08) col = pal.pebble;
        const jitter = (rand() - 0.5) * 10;
        const i = (y * size + x) * 4;
        aImg.data[i] = Math.max(0, Math.min(255, col[0] + jitter));
        aImg.data[i + 1] = Math.max(0, Math.min(255, col[1] + jitter * 0.8));
        aImg.data[i + 2] = Math.max(0, Math.min(255, col[2] + jitter * 0.5));
        aImg.data[i + 3] = 255;

        const hL = fbm((x - 1) / size * freq, v * freq, 4, seed);
        const hR = fbm((x + 1) / size * freq, v * freq, 4, seed);
        const hD = fbm(u * freq, (y - 1) / size * freq, 4, seed);
        const hU = fbm(u * freq, (y + 1) / size * freq, 4, seed);
        const nx = (hL - hR) * (1.2 + pal.grain);
        const ny = (hD - hU) * (1.2 + pal.grain);
        nImg.data[i] = Math.max(0, Math.min(255, 128 + nx * 180));
        nImg.data[i + 1] = Math.max(0, Math.min(255, 128 + ny * 180));
        nImg.data[i + 2] = 255;
        nImg.data[i + 3] = 255;

        const rough = 180 + n2 * 50 + pal.grain * 20;
        rImg.data[i] = rImg.data[i + 1] = rImg.data[i + 2] = Math.min(255, rough);
        rImg.data[i + 3] = 255;
      }
    }

    aCtx.putImageData(aImg, 0, 0);
    nCtx.putImageData(nImg, 0, 0);
    rCtx.putImageData(rImg, 0, 0);

    return { albedo, normal, roughness, prompt, provider: this.id };
  }
}

/** Placeholder for a later HTTP image service. Falls back to procedural. */
export class HttpAssetProvider implements AssetProvider {
  readonly id = "http-placeholder";
  constructor(
    private endpoint: string | null,
    private fallback: AssetProvider,
  ) {}

  async generate(prompt: string, size?: number): Promise<GeneratedMaps> {
    if (!this.endpoint) {
      const maps = await this.fallback.generate(prompt, size);
      return { ...maps, provider: this.id };
    }
    try {
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, size: size ?? 512 }),
      });
      if (!res.ok) throw new Error("asset api");
      const maps = await this.fallback.generate(prompt, size);
      return { ...maps, provider: this.id };
    } catch {
      return this.fallback.generate(prompt, size);
    }
  }
}

export function createAssetService(): AssetProvider {
  const procedural = new ProceduralAssetProvider();
  const endpoint = (import.meta.env.VITE_ASSET_API as string | undefined) ?? null;
  return new HttpAssetProvider(endpoint, procedural);
}
