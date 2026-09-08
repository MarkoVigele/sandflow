import { fbm } from "../assets/noise";
import type { SourceKind, WaterSource } from "../state/types";
import { HARD_THRESHOLD } from "./mapsContract";

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
}

export interface PresetBuild {
  terrain: Float32Array;
  sources: WaterSource[];
  hardmask?: Float32Array;
}

export interface PresetDef {
  id: string;
  title: string;
  blurb: string;
  camera: CameraPose;
  build: (size: number) => PresetBuild;
}

const BASE = 0.42;
const TRAY = 0.08;
/** Keep pins / pour kernels off the raised tray lip. */
const SOURCE_RIM = 0.07;
/** Rain / dam inlets that read as a flood, not a lab trickle. */
export const SENSIBLE_SOURCE_RATE_MIN = 0.85;
export const SENSIBLE_SOURCE_RATE_MAX = 1.85;
const MIN_SOURCE_BED = 0.08;

function idx(x: number, y: number, size: number): number {
  return y * size + x;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function source(
  id: string,
  x: number,
  y: number,
  rate = 1.6,
  kind?: SourceKind,
  spread?: number,
): WaterSource {
  const src: WaterSource = { id, x: clamp01(x), y: clamp01(y), rate };
  if (kind) src.kind = kind;
  if (spread != null) src.spread = spread;
  return src;
}

function cellAt(u: number, v: number, size: number): { x: number; y: number; i: number } {
  const x = Math.max(0, Math.min(size - 1, Math.round(u * (size - 1))));
  const y = Math.max(0, Math.min(size - 1, Math.round(v * (size - 1))));
  return { x, y, i: y * size + x };
}

/**
 * Snap a source UV onto the sand bed: not hardmask, not the tray rim.
 * Prefers the lowest nearby sand so pins sit in the channel, not on a wall.
 */
export function placeSourceOnTerrain(
  terrain: Float32Array,
  hard: Float32Array | undefined,
  size: number,
  u: number,
  v: number,
): { x: number; y: number } {
  const lo = SOURCE_RIM;
  const hi = 1 - SOURCE_RIM;
  const u0 = clamp01(Math.max(lo, Math.min(hi, u)));
  const v0 = clamp01(Math.max(lo, Math.min(hi, v)));
  const here = cellAt(u0, v0, size);
  const hereHard = (hard?.[here.i] ?? 0) >= HARD_THRESHOLD;
  if (!hereHard && terrain[here.i] > MIN_SOURCE_BED) {
    return { x: u0, y: v0 };
  }
  const radius = Math.max(6, Math.round(size * 0.08));
  let bestU = u0;
  let bestV = v0;
  let bestScore = -Infinity;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const uu = u0 + dx / Math.max(1, size - 1);
      const vv = v0 + dy / Math.max(1, size - 1);
      if (uu < lo || uu > hi || vv < lo || vv > hi) continue;
      const { i } = cellAt(uu, vv, size);
      if ((hard?.[i] ?? 0) >= HARD_THRESHOLD) continue;
      if (!(terrain[i] > MIN_SOURCE_BED)) continue;
      const dist = Math.hypot(dx, dy);
      const score = 2 - terrain[i] - dist * 0.08;
      if (score > bestScore) {
        bestScore = score;
        bestU = uu;
        bestV = vv;
      }
    }
  }
  return { x: clamp01(bestU), y: clamp01(bestV) };
}

export function sourceSitsOnTerrain(
  terrain: Float32Array,
  hard: Float32Array | undefined,
  size: number,
  src: { x: number; y: number },
): boolean {
  if (src.x < SOURCE_RIM || src.x > 1 - SOURCE_RIM) return false;
  if (src.y < SOURCE_RIM || src.y > 1 - SOURCE_RIM) return false;
  const { i } = cellAt(src.x, src.y, size);
  if ((hard?.[i] ?? 0) >= HARD_THRESHOLD) return false;
  if (!(terrain[i] > MIN_SOURCE_BED) || terrain[i] > 1.6) return false;
  return true;
}

/** OrbitControls window: distance 3.2–15, polar 0.22–π/2−0.14, target on the tray. */
export function cameraLooksAtTray(camera: CameraPose): boolean {
  const [px, py, pz] = camera.position;
  const [tx, ty, tz] = camera.target;
  if (![px, py, pz, tx, ty, tz].every((n) => Number.isFinite(n))) return false;
  const dist = Math.hypot(px - tx, py - ty, pz - tz);
  if (dist < 3.2 || dist > 15) return false;
  const polar = Math.acos(Math.min(1, Math.max(-1, (py - ty) / dist)));
  if (polar < 0.22 || polar > Math.PI / 2 - 0.14) return false;
  if (Math.abs(tx) > 2 || Math.abs(tz) > 2.4) return false;
  if (ty < 0.05 || ty > 1.4) return false;
  return true;
}

function plantSources(
  terrain: Float32Array,
  sources: WaterSource[],
  hardmask?: Float32Array,
): WaterSource[] {
  const size = Math.round(Math.sqrt(terrain.length));
  return sources.map((s) => {
    const p = placeSourceOnTerrain(terrain, hardmask, size, s.x, s.y);
    return { ...s, x: p.x, y: p.y };
  });
}

function showcase(def: PresetDef): PresetDef {
  return {
    ...def,
    build(size) {
      const built = def.build(size);
      return {
        terrain: built.terrain,
        hardmask: built.hardmask,
        sources: plantSources(built.terrain, built.sources, built.hardmask),
      };
    },
  };
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

function blankHard(size: number): Float32Array {
  return new Float32Array(size * size);
}

function fillBox(
  terrain: Float32Array,
  hard: Float32Array,
  size: number,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
  height: number | ((u: number, v: number) => number),
  harden = true,
): void {
  const x0 = Math.max(0, Math.floor(Math.min(u0, u1) * (size - 1)));
  const x1 = Math.min(size - 1, Math.ceil(Math.max(u0, u1) * (size - 1)));
  const y0 = Math.max(0, Math.floor(Math.min(v0, v1) * (size - 1)));
  const y1 = Math.min(size - 1, Math.ceil(Math.max(v0, v1) * (size - 1)));
  for (let y = y0; y <= y1; y++) {
    const v = y / (size - 1);
    for (let x = x0; x <= x1; x++) {
      const u = x / (size - 1);
      const i = idx(x, y, size);
      terrain[i] = typeof height === "function" ? height(u, v) : height;
      if (harden) hard[i] = 1;
    }
  }
}

function paintWallBand(
  terrain: Float32Array,
  hard: Float32Array,
  size: number,
  u0: number,
  u1: number,
  v0: number,
  v1: number,
  height: (u: number, v: number) => number,
): void {
  fillBox(terrain, hard, size, u0, v0, u1, v1, height, true);
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

const PRESET_DEFS: PresetDef[] = [
  {
    id: "flat",
    title: "Flache Wanne",
    blurb: "Eine Quelle oben. Adern entstehen von allein.",
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
    id: "heller-strand",
    title: "Heller Strand",
    blurb: "Helles, flaches Bett. Sanfte Quelle, dünne Adern.",
    camera: { position: [5.6, 6.4, 6.2], target: [0, 0.42, 0.15] },
    build(size) {
      const terrain = new Float32Array(size * size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const v = y / (size - 1);
          terrain[idx(x, y, size)] = BASE + 0.08 + (1 - v) * 0.1;
        }
      }
      grain(terrain, size, 0.01, 7);
      rim(terrain, size, true);
      return { terrain, sources: [source("s-strand", 0.5, 0.16, 1.05)] };
    },
  },
  {
    id: "slope",
    title: "Sanfte Schräge",
    blurb: "Gefälle von oben. Wasser bleibt in der Spur und gräbt nach.",
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
    blurb: "Ein Rinnsal liegt schon da. Ufer werden später angefressen.",
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
    blurb: "Zwei Zuläufe treffen sich in einer Mulde.",
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
    id: "quellen-ziehen",
    title: "Quellen ziehen",
    blurb: "Drei Pins. Tippen wählt, Ziehen verschiebt.",
    camera: { position: [2.8, 7.8, 6.2], target: [0, 0.4, 0.15] },
    build(size) {
      const terrain = new Float32Array(size * size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const v = y / (size - 1);
          terrain[idx(x, y, size)] = BASE + 0.04 + (1 - v) * 0.22;
        }
      }
      grain(terrain, size, 0.014, 23);
      rim(terrain, size, true);
      return {
        terrain,
        sources: [
          source("s-pin-a", 0.26, 0.22, 1.15),
          source("s-pin-b", 0.5, 0.14, 1.15),
          source("s-pin-c", 0.74, 0.26, 1.15),
        ],
      };
    },
  },
  {
    id: "canyon",
    title: "Mini-Canyon",
    blurb: "Steile Wände, tiefes Bett. Wasser bleibt im Schlitz.",
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
    title: "Delta",
    blurb: "Ein Zulauf teilt sich in mehrere Arme.",
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
    blurb: "Tiefes, klares Bett als Vergleichsspur.",
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
    blurb: "Viele feine Rinnen auf der Schräge.",
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
  {
    id: "betonkanal",
    title: "Betonkanal",
    blurb: "Betonwände, Sandsohle. Die Wände erodieren nicht.",
    camera: { position: [0.2, 4.7, -6.15], target: [0, 0.42, 1.05] },
    build(size) {
      const terrain = new Float32Array(size * size);
      const hard = blankHard(size);
      const bedL = 0.38;
      const bedR = 0.62;
      const wallL = 0.22;
      const wallR = 0.78;
      for (let y = 0; y < size; y++) {
        const v = y / (size - 1);
        const slope = (1 - v) * 0.34;
        const bed = BASE + 0.02 + slope;
        const wall = bed + 0.28;
        for (let x = 0; x < size; x++) {
          const u = x / (size - 1);
          const i = idx(x, y, size);
          if (u >= bedL && u <= bedR) {
            terrain[i] = bed;
          } else if (u >= wallL && u < bedL) {
            terrain[i] = wall;
            hard[i] = 1;
          } else if (u > bedR && u <= wallR) {
            terrain[i] = wall;
            hard[i] = 1;
          } else {
            terrain[i] = wall + 0.06;
            hard[i] = 1;
          }
        }
      }
      fillBox(terrain, hard, size, 0.34, 0.0, 0.66, 0.09, (_u, v) => BASE + 0.38 + (1 - v) * 0.04, true);
      grain(terrain, size, 0.008, 19);
      for (let i = 0; i < hard.length; i++) {
        if (hard[i] >= 0.5) {
          const y = (i / size) | 0;
          const v = y / (size - 1);
          const x = i % size;
          const u = x / (size - 1);
          const slope = (1 - v) * 0.34;
          if (u >= bedL && u <= bedR && v > 0.09) continue;
          terrain[i] = BASE + 0.30 + slope;
          if (u < wallL || u > wallR) terrain[i] += 0.06;
        }
      }
      rim(terrain, size, true);
      return { terrain, hardmask: hard, sources: [source("s-flume", 0.5, 0.12, 2.15)] };
    },
  },
  {
    id: "auffangbecken",
    title: "Delta ins Becken",
    blurb: "Sanddelta läuft in ein Betonbecken.",
    camera: { position: [3.4, 7.0, 5.6], target: [0, 0.32, 0.55] },
    build(size) {
      const terrain = new Float32Array(size * size);
      const hard = blankHard(size);
      for (let y = 0; y < size; y++) {
        const v = y / (size - 1);
        for (let x = 0; x < size; x++) {
          terrain[idx(x, y, size)] = BASE + (1 - v) * 0.52;
        }
      }
      carveChannel(terrain, size, () => 0.5, 0.05, 0.13, 0.04, 0.48);
      carveChannel(terrain, size, (v) => 0.5 - (v - 0.44) * 0.48, 0.045, 0.1, 0.44, 0.62);
      carveChannel(terrain, size, (v) => 0.5 + (v - 0.44) * 0.46, 0.045, 0.1, 0.44, 0.62);
      const floor = (_u: number, v: number) => BASE + 0.06 + (1 - v) * 0.04;
      const wallH = (_u: number, v: number) => BASE + 0.34 + (1 - v) * 0.04;
      paintWallBand(terrain, hard, size, 0.08, 0.16, 0.56, 0.96, wallH);
      paintWallBand(terrain, hard, size, 0.84, 0.92, 0.56, 0.96, wallH);
      paintWallBand(terrain, hard, size, 0.08, 0.92, 0.90, 0.98, wallH);
      paintWallBand(terrain, hard, size, 0.08, 0.92, 0.54, 0.60, (u, v) => {
        const notch = Math.abs(u - 0.5) < 0.1;
        return notch ? BASE + 0.16 + (1 - v) * 0.04 : wallH(u, v);
      });
      for (let y = 0; y < size; y++) {
        const v = y / (size - 1);
        if (v < 0.60 || v > 0.90) continue;
        for (let x = 0; x < size; x++) {
          const u = x / (size - 1);
          if (u < 0.16 || u > 0.84) continue;
          const i = idx(x, y, size);
          if (hard[i] >= 0.5) continue;
          terrain[i] = floor(u, v);
        }
      }
      grain(terrain, size, 0.014, 61);
      rim(terrain, size, true);
      return { terrain, hardmask: hard, sources: [source("s-delta-becken", 0.5, 0.08, 2.05)] };
    },
  },
  {
    id: "treppenueberlauf",
    title: "Treppenüberlauf",
    blurb: "Betonkaskade, unten ein Sandfang.",
    camera: { position: [5.6, 5.4, 5.2], target: [0, 0.38, 0.35] },
    build(size) {
      const terrain = new Float32Array(size * size);
      const hard = blankHard(size);
      for (let y = 0; y < size; y++) {
        const v = y / (size - 1);
        for (let x = 0; x < size; x++) {
          terrain[idx(x, y, size)] = BASE + 0.08 + (1 - v) * 0.18;
        }
      }
      const steps = [
        { v0: 0.04, v1: 0.16, h: 0.96 },
        { v0: 0.16, v1: 0.28, h: 0.82 },
        { v0: 0.28, v1: 0.40, h: 0.68 },
        { v0: 0.40, v1: 0.52, h: 0.54 },
        { v0: 0.52, v1: 0.62, h: 0.42 },
      ];
      for (const step of steps) {
        fillBox(terrain, hard, size, 0.28, step.v0, 0.72, step.v1, step.h, true);
        fillBox(terrain, hard, size, 0.22, step.v0, 0.28, step.v1, step.h + 0.16, true);
        fillBox(terrain, hard, size, 0.72, step.v0, 0.78, step.v1, step.h + 0.16, true);
      }
      fillBox(terrain, hard, size, 0.22, 0.02, 0.78, 0.08, 1.02, true);
      grain(terrain, size, 0.012, 41);
      for (let i = 0; i < hard.length; i++) {
        if (hard[i] >= 0.5) {
          const y = (i / size) | 0;
          const v = y / (size - 1);
          const x = i % size;
          const u = x / (size - 1);
          for (const step of steps) {
            if (v >= step.v0 && v < step.v1) {
              terrain[i] = step.h + (u < 0.28 || u > 0.72 ? 0.16 : 0);
            }
          }
          if (v < 0.08) terrain[i] = 1.02;
        }
      }
      for (let y = 0; y < size; y++) {
        const v = y / (size - 1);
        if (v < 0.055 || v > 0.12) continue;
        for (let x = 0; x < size; x++) {
          const u = x / (size - 1);
          if (u < 0.42 || u > 0.58) continue;
          const i = idx(x, y, size);
          hard[i] = 0;
          terrain[i] = 0.99;
        }
      }
      rim(terrain, size, true);
      return { terrain, hardmask: hard, sources: [source("s-stufen", 0.5, 0.09, 2.2)] };
    },
  },
  {
    id: "betonwehr",
    title: "Betonwehr",
    blurb: "Wehr quert die Strecke. Überlauf nagt darunter.",
    camera: { position: [5.5, 5.8, 6.1], target: [0, 0.4, 0.25] },
    build(size) {
      const terrain = new Float32Array(size * size);
      const hard = blankHard(size);
      for (let y = 0; y < size; y++) {
        const v = y / (size - 1);
        for (let x = 0; x < size; x++) {
          terrain[idx(x, y, size)] = BASE + (1 - v) * 0.46;
        }
      }
      carveChannel(
        terrain,
        size,
        (v) => 0.5 + Math.sin(v * Math.PI * 0.8) * 0.03,
        0.09,
        0.12,
        0.04,
        0.96,
      );
      fillBox(terrain, hard, size, 0.12, 0.42, 0.88, 0.52, (u) => {
        const notch = Math.abs(u - 0.5) < 0.07;
        return notch ? BASE + 0.36 : BASE + 0.62;
      }, true);
      fillBox(terrain, hard, size, 0.12, 0.40, 0.18, 0.54, BASE + 0.7, true);
      fillBox(terrain, hard, size, 0.82, 0.40, 0.88, 0.54, BASE + 0.7, true);
      grain(terrain, size, 0.014, 73);
      for (let i = 0; i < hard.length; i++) {
        if (hard[i] < 0.5) continue;
        const y = (i / size) | 0;
        const v = y / (size - 1);
        const x = i % size;
        const u = x / (size - 1);
        const notch = Math.abs(u - 0.5) < 0.07 && v > 0.42 && v < 0.52;
        terrain[i] = notch ? BASE + 0.36 : BASE + 0.62;
        if (u < 0.18 || u > 0.82) terrain[i] = BASE + 0.7;
      }
      rim(terrain, size, true);
      return { terrain, hardmask: hard, sources: [source("s-wehr", 0.5, 0.08, 2.1)] };
    },
  },
  {
    id: "regen-hang",
    title: "Regenhang",
    blurb: "Regen auf der Schräge. Betonrinnen, unten eine Pfütze.",
    camera: { position: [5.4, 6.4, 6.0], target: [0, 0.4, 0.2] },
    build(size) {
      const terrain = new Float32Array(size * size);
      const hard = blankHard(size);
      for (let y = 0; y < size; y++) {
        const v = y / (size - 1);
        for (let x = 0; x < size; x++) {
          terrain[idx(x, y, size)] = BASE + (1 - v) * 0.48;
        }
      }
      const gutters = [0.28, 0.5, 0.72];
      for (const mid of gutters) {
        carveChannel(terrain, size, () => mid, 0.038, 0.07, 0.06, 0.78);
        paintWallBand(terrain, hard, size, mid - 0.062, mid - 0.034, 0.06, 0.78, (_u, v) => {
          return BASE + 0.16 + (1 - v) * 0.48;
        });
        paintWallBand(terrain, hard, size, mid + 0.034, mid + 0.062, 0.06, 0.78, (_u, v) => {
          return BASE + 0.16 + (1 - v) * 0.48;
        });
      }
      const floor = (_u: number, v: number) => BASE + 0.05 + (1 - v) * 0.04;
      const wallH = (_u: number, v: number) => BASE + 0.3 + (1 - v) * 0.04;
      paintWallBand(terrain, hard, size, 0.1, 0.16, 0.76, 0.96, wallH);
      paintWallBand(terrain, hard, size, 0.84, 0.9, 0.76, 0.96, wallH);
      paintWallBand(terrain, hard, size, 0.1, 0.9, 0.9, 0.97, wallH);
      for (let y = 0; y < size; y++) {
        const v = y / (size - 1);
        if (v < 0.79 || v > 0.9) continue;
        for (let x = 0; x < size; x++) {
          const u = x / (size - 1);
          if (u < 0.16 || u > 0.84) continue;
          const i = idx(x, y, size);
          if (hard[i] >= 0.5) continue;
          terrain[i] = floor(u, v);
        }
      }
      grain(terrain, size, 0.012, 91);
      for (let i = 0; i < hard.length; i++) {
        if (hard[i] < 0.5) continue;
        const y = (i / size) | 0;
        const v = y / (size - 1);
        if (v >= 0.74) {
          terrain[i] = BASE + 0.3 + (1 - v) * 0.04;
          continue;
        }
        terrain[i] = BASE + 0.16 + (1 - v) * 0.48;
      }
      rim(terrain, size, true);
      const rainAt = placeSourceOnTerrain(terrain, hard, size, 0.5, 0.16);
      return {
        terrain,
        hardmask: hard,
        sources: [source("s-regen", rainAt.x, rainAt.y, 1.4, "rain", 0.34)],
      };
    },
  },
  {
    id: "staudamm",
    title: "Staudamm",
    blurb: "Staumauer, See oben. Überlauf nagt am Sand.",
    camera: { position: [5.6, 5.9, 5.8], target: [0, 0.42, 0.2] },
    build(size) {
      const terrain = new Float32Array(size * size);
      const hard = blankHard(size);
      for (let y = 0; y < size; y++) {
        const v = y / (size - 1);
        for (let x = 0; x < size; x++) {
          const u = x / (size - 1);
          const valley = ((u - 0.5) ** 2) * 0.72;
          terrain[idx(x, y, size)] = BASE + (1 - v) * 0.38 + valley;
        }
      }
      carveChannel(
        terrain,
        size,
        (v) => 0.5 + Math.sin(v * Math.PI * 0.7) * 0.025,
        0.11,
        0.1,
        0.04,
        0.96,
      );
      fillBox(terrain, hard, size, 0.08, 0.44, 0.92, 0.56, (u) => {
        const notch = Math.abs(u - 0.5) < 0.065;
        return notch ? BASE + 0.4 : BASE + 0.78;
      }, true);
      fillBox(terrain, hard, size, 0.08, 0.42, 0.16, 0.58, BASE + 0.86, true);
      fillBox(terrain, hard, size, 0.84, 0.42, 0.92, 0.58, BASE + 0.86, true);
      grain(terrain, size, 0.014, 67);
      for (let i = 0; i < hard.length; i++) {
        if (hard[i] < 0.5) continue;
        const y = (i / size) | 0;
        const v = y / (size - 1);
        const x = i % size;
        const u = x / (size - 1);
        const notch = Math.abs(u - 0.5) < 0.065 && v > 0.44 && v < 0.56;
        terrain[i] = notch ? BASE + 0.4 : BASE + 0.78;
        if (u < 0.16 || u > 0.84) terrain[i] = BASE + 0.86;
      }
      rim(terrain, size, true);
      const inlet = placeSourceOnTerrain(terrain, hard, size, 0.5, 0.16);
      return { terrain, hardmask: hard, sources: [source("s-stau", inlet.x, inlet.y, 1.65)] };
    },
  },
];

export const PRESETS: PresetDef[] = PRESET_DEFS.map(showcase);

export function getPreset(id: string): PresetDef {
  if (id === "beton-kanal") return PRESETS.find((p) => p.id === "betonkanal") ?? PRESETS[0];
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
