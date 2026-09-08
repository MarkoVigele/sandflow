import {
  darkenCanvas,
  deriveCanvasMaps,
  generateConcreteCanvas,
  generateWoodCanvas,
  imageToCanvas,
  packRoughnessCanvas,
  prepareLabRimCanvas,
  prepareSandCanvas,
  prepareWoodRimCanvas,
} from "./deriveMaps";
import { fbmTiled, hash2, mulberry32 } from "./noise";
import { BAKED_TEXTURE_FILES, bakedTextureUrl, preferBakedSand } from "./texturePaths";

export type MapKind = "albedo" | "normal" | "roughness" | "wet";

export interface GeneratedMaps {
  albedo: HTMLCanvasElement;
  albedoWet?: HTMLCanvasElement;
  normal: HTMLCanvasElement;
  roughness: HTMLCanvasElement;
  wood?: HTMLCanvasElement;
  woodNormal?: HTMLCanvasElement;
  woodRough?: HTMLCanvasElement;
  concrete?: HTMLCanvasElement;
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
  let dryA: [number, number, number] = [236, 216, 178];
  let dryB: [number, number, number] = [210, 188, 148];
  let pebble: [number, number, number] = [164, 144, 110];
  let grain = 0.55;

  if (/dunkel|basalt|vulkan|schwarz/.test(p)) {
    dryA = [92, 78, 68];
    dryB = [58, 50, 44];
    pebble = [36, 32, 30];
  } else if (/hell|weiß|quarz|bleich/.test(p)) {
    dryA = [244, 232, 204];
    dryB = [222, 208, 174];
    pebble = [186, 168, 138];
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

    const freq = Math.max(4, Math.round(5 + pal.grain * 8));
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const n1 = fbmTiled(u, v, freq, 4, seed);
        const n2 = fbmTiled(u, v, freq * 2, 3, seed + 3);
        const n3 = fbmTiled(u, v, freq * 4, 2, seed + 7);
        const speck = hash2(x * 0.37, y * 0.41, seed);
        const t = Math.min(1, Math.max(0, n1 * 0.55 + n2 * 0.32 + n3 * 0.13));
        let col = mix(pal.dryA, pal.dryB, t);
        if (speck > 0.993 - pal.grain * 0.012) col = mix(col, pal.pebble, 0.55);
        const jitter = (rand() - 0.5) * 5.5;
        const i = (y * size + x) * 4;
        aImg.data[i] = Math.max(0, Math.min(255, col[0] + jitter));
        aImg.data[i + 1] = Math.max(0, Math.min(255, col[1] + jitter * 0.8));
        aImg.data[i + 2] = Math.max(0, Math.min(255, col[2] + jitter * 0.5));
        aImg.data[i + 3] = 255;

        const hL = fbmTiled((x - 1) / size, v, freq, 4, seed);
        const hR = fbmTiled((x + 1) / size, v, freq, 4, seed);
        const hD = fbmTiled(u, (y - 1) / size, freq, 4, seed);
        const hU = fbmTiled(u, (y + 1) / size, freq, 4, seed);
        const nx = (hL - hR) * (0.55 + pal.grain * 0.4);
        const ny = (hD - hU) * (0.55 + pal.grain * 0.4);
        nImg.data[i] = Math.max(0, Math.min(255, 128 + nx * 96));
        nImg.data[i + 1] = Math.max(0, Math.min(255, 128 + ny * 96));
        nImg.data[i + 2] = 255;
        nImg.data[i + 3] = 255;

        const rough = 176 + n2 * 46 + pal.grain * 18;
        rImg.data[i] = rImg.data[i + 1] = rImg.data[i + 2] = Math.min(255, rough);
        rImg.data[i + 3] = 255;
      }
    }

    aCtx.putImageData(aImg, 0, 0);
    nCtx.putImageData(nImg, 0, 0);
    rCtx.putImageData(rImg, 0, 0);

    return { albedo, albedoWet: darkenCanvas(albedo), normal, roughness, prompt, provider: this.id };
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

export type ImageLoader = (url: string) => Promise<HTMLImageElement>;

export async function loadHtmlImage(url: string, timeoutMs = 8000): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = window.setTimeout(() => {
      img.src = "";
      reject(new Error(`timeout ${url}`));
    }, timeoutMs);
    img.crossOrigin = "anonymous";
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error(`load ${url}`));
    };
    img.src = url;
  });
}

async function loadOptionalImage(
  url: string,
  loadImage: ImageLoader,
): Promise<HTMLImageElement | null> {
  try {
    return await loadImage(url);
  } catch {
    return null;
  }
}

function withDerivedSand(
  dry: HTMLCanvasElement,
  wet: HTMLCanvasElement,
  wood: HTMLCanvasElement,
  concrete: HTMLCanvasElement,
  prompt: string,
  provider: string,
): GeneratedMaps {
  const dryMaps = deriveCanvasMaps(dry, 1.65);
  const wetMaps = deriveCanvasMaps(wet, 1.05);
  const woodMaps = deriveCanvasMaps(wood, 1.35);
  return {
    albedo: dry,
    albedoWet: wet,
    normal: dryMaps.normal,
    roughness: packRoughnessCanvas(dryMaps.roughness, wetMaps.roughness),
    wood,
    woodNormal: woodMaps.normal,
    woodRough: woodMaps.roughness,
    concrete,
    prompt,
    provider,
  };
}

export async function loadLabMaps(
  prompt: string,
  procedural: AssetProvider,
  loadImage: ImageLoader = loadHtmlImage,
  maxSize = 1024,
): Promise<GeneratedMaps> {
  const dryImg = await loadOptionalImage(bakedTextureUrl(BAKED_TEXTURE_FILES.sandDry), loadImage);
  const wetImg = await loadOptionalImage(bakedTextureUrl(BAKED_TEXTURE_FILES.sandWet), loadImage);
  const labRimImg = await loadOptionalImage(bakedTextureUrl(BAKED_TEXTURE_FILES.labRim), loadImage);
  const woodImg = await loadOptionalImage(bakedTextureUrl(BAKED_TEXTURE_FILES.woodRim), loadImage);

  const rimSize = Math.min(512, maxSize);
  const wood = woodImg
    ? prepareWoodRimCanvas(imageToCanvas(woodImg, maxSize))
    : generateWoodCanvas(rimSize);
  const concrete = labRimImg
    ? prepareLabRimCanvas(imageToCanvas(labRimImg, maxSize))
    : generateConcreteCanvas(rimSize);
  const useBakedDry = preferBakedSand(prompt) && !!dryImg;
  const procSize = Math.min(512, maxSize);
  const dry = useBakedDry
    ? prepareSandCanvas(imageToCanvas(dryImg!, maxSize), "dry")
    : (await procedural.generate(prompt, procSize)).albedo;
  const wet =
    useBakedDry && wetImg ? prepareSandCanvas(imageToCanvas(wetImg, maxSize), "wet") : darkenCanvas(dry);

  const bakedCount = Number(!!dryImg) + Number(!!wetImg) + Number(!!woodImg) + Number(!!labRimImg);
  const provider =
    bakedCount >= 4 && useBakedDry ? "baked" : bakedCount > 0 ? "baked+procedural" : "procedural";

  return withDerivedSand(dry, wet, wood, concrete, prompt, provider);
}

export interface LabAssetService extends AssetProvider {
  loadLab(prompt: string, maxSize?: number): Promise<GeneratedMaps>;
}

export function createAssetService(): LabAssetService {
  const procedural = new ProceduralAssetProvider();
  const endpoint = (import.meta.env.VITE_ASSET_API as string | undefined) ?? null;
  const http = new HttpAssetProvider(endpoint, procedural);
  return {
    id: http.id,
    generate: (prompt, size) => http.generate(prompt, size),
    loadLab: (prompt, maxSize) => loadLabMaps(prompt, procedural, loadHtmlImage, maxSize),
  };
}
