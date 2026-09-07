import { fbm } from "../assets/noise";
import type { WaterSource } from "../state/types";

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
}

export interface PresetDef {
  id: string;
  title: string;
  blurb: string;
  camera: CameraPose;
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

function rim(terrain: Float32Array, size: number, openDown = false): void {
  const edge = Math.max(3, Math.round(size * 0.03));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = Math.min(x, size - 1 - x);
      const dy = Math.min(y, size - 1 - y);
      const d = Math.min(dx, dy);
      if (d >= edge) continue;
      const t = 1 - d / edge;
      const down = openDown && y > size - edge - 1;
      terrain[idx(x, y, size)] += t * t * TRAY * (down ? 0.28 : 2.4);
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

/** Carve a V-channel along u = center(v). width/depth in heightmap units. */
function carveChannel(
  terrain: Float32Array,
  size: number,
  center: (v: number) => number,
  width: number,
  depth: number,
  v0 = 0.02,
  v1 = 0.98,
): void {
  for (let y = 0; y < size; y++) {
    const v = y / (size - 1);
    if (v < v0 || v > v1) continue;
    const mid = center(v);
    for (let x = 0; x < size; x++) {
      const u = x / (size - 1);
      const dist = Math.abs(u - mid) / width;
      if (dist >= 1) continue;
      const cut = (1 - dist) * (1 - dist);
      terrain[idx(x, y, size)] -= cut * depth;
    }
  }
}

export const PRESETS: PresetDef[] = [
  {
    id: "flat",
    title: "Flache Wanne",
    blurb: "Ebenes Sandbett, eine Quelle oben in der Mitte. Gut, um zu sehen, wie sich Adern von allein suchen.",
    camera: { position: [6.4, 5.6, 6.8], target: [0, 0.55, 0] },
    build(size) {
      const terrain = new Float32Array(size * size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const v = y / (size - 1);
          terrain[idx(x, y, size)] = BASE + (1 - v) * 0.12;
        }
      }
      grain(terrain, size, 0.016, 11);
      rim(terrain, size, true);
      return { terrain, sources: [source("s-top", 0.5, 0.12, 2.0)] };
    },
  },
  {
    id: "slope",
    title: "Sanfte Schräge",
    blurb: "Leichtes Gefälle von oben nach unten. Wasser bleibt in der Spur, gräbt aber tiefer nach.",
    camera: { position: [5.8, 5.8, 6.6], target: [0, 0.5, 0.2] },
    build(size) {
      const terrain = new Float32Array(size * size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const v = y / (size - 1);
          terrain[idx(x, y, size)] = BASE + (1 - v) * 0.62;
        }
      }
      grain(terrain, size, 0.016, 29);
      rim(terrain, size, true);
      return { terrain, sources: [source("s-high", 0.5, 0.1, 2.0)] };
    },
  },
  {
    id: "bed",
    title: "Vorgegrabenes Bett",
    blurb: "Ein flaches Rinnsal liegt schon da. Wasser folgt erst, dann frisst es Ufer und verzweigt sich.",
    camera: { position: [0.4, 5.2, -6.4], target: [0, 0.4, 1.1] },
    build(size) {
      const terrain = new Float32Array(size * size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const u = x / (size - 1);
          const v = y / (size - 1);
          const slope = (1 - v) * 0.52;
          const meander = 0.5 + Math.sin(v * Math.PI * 2.2) * 0.12 + Math.sin(v * 9.1) * 0.03;
          const dist = Math.abs(u - meander);
          const channel = Math.exp(-((dist * 18) ** 2)) * 0.16;
          terrain[idx(x, y, size)] = BASE + slope - channel;
        }
      }
      grain(terrain, size, 0.018, 47);
      rim(terrain, size, true);
      return { terrain, sources: [source("s-bed", 0.5, 0.08, 2.1)] };
    },
  },
  {
    id: "meet",
    title: "Zwei Quellen",
    blurb: "Zwei Zuläufe treffen sich in einer Mulde. Ablagerung und Überlauf entstehen von allein.",
    camera: { position: [5.4, 6.2, 6.6], target: [0, 0.4, 0.8] },
    build(size) {
      const terrain = new Float32Array(size * size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const u = x / (size - 1);
          const v = y / (size - 1);
          const bowl = ((u - 0.5) ** 2 + (v - 0.64) ** 2) * 0.72;
          const left = Math.max(0, 0.24 - Math.hypot(u - 0.2, v - 0.16)) * 0.42;
          const right = Math.max(0, 0.24 - Math.hypot(u - 0.8, v - 0.18)) * 0.42;
          terrain[idx(x, y, size)] = BASE + 0.26 + bowl - left - right;
        }
      }
      carveChannel(terrain, size, (v) => 0.2 + v * 0.28, 0.07, 0.09, 0.12, 0.62);
      carveChannel(terrain, size, (v) => 0.8 - v * 0.28, 0.07, 0.09, 0.12, 0.62);
      grain(terrain, size, 0.026, 71);
      rim(terrain, size);
      return {
        terrain,
        sources: [
          source("s-a", 0.2, 0.14, 1.55),
          source("s-b", 0.8, 0.16, 1.55),
        ],
      };
    },
  },
  {
    id: "canyon",
    title: "Mini-Canyon",
    blurb: "Steile Wände, tiefes Bett. Eine Quelle oben — das Wasser bleibt im Schlitz.",
    camera: { position: [5.8, 3.7, 5.4], target: [0, 0.28, 0.1] },
    build(size) {
      const terrain = new Float32Array(size * size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const v = y / (size - 1);
          terrain[idx(x, y, size)] = BASE + 0.38 + (1 - v) * 0.18;
        }
      }
      carveChannel(
        terrain,
        size,
        (v) => 0.5 + Math.sin(v * Math.PI * 1.6) * 0.06 + Math.sin(v * 8.2) * 0.012,
        0.085,
        0.38,
      );
      grain(terrain, size, 0.014, 101);
      rim(terrain, size, true);
      return { terrain, sources: [source("s-canyon", 0.5, 0.08, 2.15)] };
    },
  },
  {
    id: "delta",
    title: "Delta / Verzweigung",
    blurb: "Ein Zulauf teilt sich in mehrere Arme. Gut, um Verzweigung und Ablagerung zu sehen.",
    camera: { position: [3.1, 7.2, 5.9], target: [0, 0.28, 0.45] },
    build(size) {
      const terrain = new Float32Array(size * size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const v = y / (size - 1);
          terrain[idx(x, y, size)] = BASE + (1 - v) * 0.48;
        }
      }
      carveChannel(terrain, size, () => 0.5, 0.055, 0.14, 0.04, 0.46);
      carveChannel(terrain, size, (v) => 0.5 - (v - 0.42) * 0.55, 0.048, 0.11, 0.42, 0.96);
      carveChannel(terrain, size, (v) => 0.5 + (v - 0.42) * 0.52, 0.048, 0.11, 0.42, 0.96);
      carveChannel(terrain, size, (v) => 0.5 + (v - 0.5) * 0.08, 0.04, 0.09, 0.48, 0.96);
      grain(terrain, size, 0.016, 59);
      rim(terrain, size, true);
      return { terrain, sources: [source("s-delta", 0.5, 0.07, 2.05)] };
    },
  },
  {
    id: "referenz",
    title: "Referenz-Rinne",
    blurb: "Tiefes, klares Bett wie in der Referenz: Wasser hat eine Spur, Ufer bleiben stehen.",
    camera: { position: [0.15, 4.9, -6.2], target: [0, 0.38, 1.2] },
    build(size) {
      const terrain = new Float32Array(size * size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const v = y / (size - 1);
          terrain[idx(x, y, size)] = BASE + (1 - v) * 0.4;
        }
      }
      carveChannel(
        terrain,
        size,
        (v) => 0.5 + Math.sin(v * Math.PI * 0.9) * 0.035,
        0.07,
        0.22,
      );
      grain(terrain, size, 0.01, 17);
      rim(terrain, size, true);
      return { terrain, sources: [source("s-ref", 0.5, 0.07, 2.2)] };
    },
  },
  {
    id: "veins",
    title: "Dünne Adern",
    blurb: "Viele feine Rinnen auf der Schräge. Wasser sucht sich die dünnen Adern.",
    camera: { position: [5.2, 6.5, 6.2], target: [0, 0.42, 0.15] },
    build(size) {
      const terrain = new Float32Array(size * size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const v = y / (size - 1);
          terrain[idx(x, y, size)] = BASE + (1 - v) * 0.5;
        }
      }
      const offsets = [-0.28, -0.18, -0.08, 0.02, 0.12, 0.22, 0.32];
      for (let i = 0; i < offsets.length; i++) {
        const off = offsets[i];
        const seed = 13 + i * 7;
        carveChannel(
          terrain,
          size,
          (v) => 0.5 + off + Math.sin(v * Math.PI * (1.4 + i * 0.18) + seed) * 0.035,
          0.022,
          0.055,
          0.06,
          0.94,
        );
      }
      grain(terrain, size, 0.012, 83);
      rim(terrain, size, true);
      return {
        terrain,
        sources: [
          source("s-vein-a", 0.36, 0.08, 1.15),
          source("s-vein-b", 0.62, 0.1, 1.15),
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
