import { fbm } from "../assets/noise";
import type { WaterSource } from "../state/types";

export interface PresetDef {
  id: string;
  title: string;
  blurb: string;
  build: (size: number) => { terrain: Float32Array; sources: WaterSource[] };
}

const BASE = 0.42;
const TRAY = 0.08;

function idx(x: number, y: number, size: number): number {
  return y * size + x;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function source(id: string, x: number, y: number, rate = 1.6): WaterSource {
  return { id, x: clamp01(x), y: clamp01(y), rate };
}

function rim(terrain: Float32Array, size: number): void {
  const edge = Math.max(3, Math.round(size * 0.03));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = Math.min(x, size - 1 - x);
      const dy = Math.min(y, size - 1 - y);
      const d = Math.min(dx, dy);
      if (d < edge) {
        const t = 1 - d / edge;
        terrain[idx(x, y, size)] += t * t * TRAY * 2.4;
      }
    }
  }
}

function grain(terrain: Float32Array, size: number, amp: number, seed: number): void {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      terrain[idx(x, y, size)] +=
        (fbm(u * 7.5, v * 7.5, 4, seed) - 0.5) * amp;
    }
  }
}

export const PRESETS: PresetDef[] = [
  {
    id: "flat",
    title: "Flache Wanne",
    blurb: "Ebenes Sandbett, eine Quelle oben in der Mitte. Gut, um zu sehen, wie sich Adern von allein suchen.",
    build(size) {
      const terrain = new Float32Array(size * size);
      for (let i = 0; i < terrain.length; i++) terrain[i] = BASE;
      grain(terrain, size, 0.028, 11);
      rim(terrain, size);
      return { terrain, sources: [source("s-top", 0.5, 0.12, 1.8)] };
    },
  },
  {
    id: "slope",
    title: "Sanfte Schräge",
    blurb: "Leichtes Gefälle von oben nach unten. Wasser bleibt in der Spur, gräbt aber tiefer nach.",
    build(size) {
      const terrain = new Float32Array(size * size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const v = y / (size - 1);
          terrain[idx(x, y, size)] = BASE + (1 - v) * 0.38;
        }
      }
      grain(terrain, size, 0.034, 29);
      rim(terrain, size);
      return { terrain, sources: [source("s-high", 0.5, 0.1, 1.7)] };
    },
  },
  {
    id: "bed",
    title: "Vorgegrabenes Bett",
    blurb: "Ein flaches Rinnsal liegt schon da. Wasser folgt erst, dann frisst es Ufer und verzweigt sich.",
    build(size) {
      const terrain = new Float32Array(size * size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const u = x / (size - 1);
          const v = y / (size - 1);
          const slope = (1 - v) * 0.32;
          const meander = 0.5 + Math.sin(v * Math.PI * 2.2) * 0.12 + Math.sin(v * 9.1) * 0.03;
          const dist = Math.abs(u - meander);
          const channel = Math.exp(-((dist * 18) ** 2)) * 0.16;
          terrain[idx(x, y, size)] = BASE + slope - channel;
        }
      }
      grain(terrain, size, 0.03, 47);
      rim(terrain, size);
      return { terrain, sources: [source("s-bed", 0.5, 0.08, 1.9)] };
    },
  },
  {
    id: "meet",
    title: "Zwei Quellen",
    blurb: "Zwei Zuläufe treffen sich in einer Mulde. Ablagerung und Überlauf entstehen von allein.",
    build(size) {
      const terrain = new Float32Array(size * size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const u = x / (size - 1);
          const v = y / (size - 1);
          const bowl = ((u - 0.5) ** 2 + (v - 0.62) ** 2) * 0.55;
          const left = Math.max(0, 0.22 - Math.hypot(u - 0.18, v - 0.18)) * 0.35;
          const right = Math.max(0, 0.22 - Math.hypot(u - 0.82, v - 0.2)) * 0.35;
          terrain[idx(x, y, size)] = BASE + 0.22 + bowl - left - right;
        }
      }
      grain(terrain, size, 0.03, 71);
      rim(terrain, size);
      return {
        terrain,
        sources: [
          source("s-a", 0.2, 0.16, 1.45),
          source("s-b", 0.8, 0.18, 1.45),
        ],
      };
    },
  },
];

export function getPreset(id: string): PresetDef {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0];
}

export function resampleHeight(
  src: Float32Array,
  srcSize: number,
  dstSize: number,
): Float32Array {
  if (srcSize === dstSize) return src.slice();
  const dst = new Float32Array(dstSize * dstSize);
  const scale = (srcSize - 1) / (dstSize - 1);
  for (let y = 0; y < dstSize; y++) {
    for (let x = 0; x < dstSize; x++) {
      const fx = x * scale;
      const fy = y * scale;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const x1 = Math.min(srcSize - 1, x0 + 1);
      const y1 = Math.min(srcSize - 1, y0 + 1);
      const tx = fx - x0;
      const ty = fy - y0;
      const a = src[y0 * srcSize + x0];
      const b = src[y0 * srcSize + x1];
      const c = src[y1 * srcSize + x0];
      const d = src[y1 * srcSize + x1];
      dst[y * dstSize + x] =
        a * (1 - tx) * (1 - ty) +
        b * tx * (1 - ty) +
        c * (1 - tx) * ty +
        d * tx * ty;
    }
  }
  return dst;
}
