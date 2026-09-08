/** Visual flow FX — bubbles and bedload grains. Does not change SWE / hardmask. */

import { hash2 } from "../assets/noise";

export const PARTICLE_STRIDE = 4;
export const KIND_FOAM = 0;
export const KIND_BUBBLE = 1;
export const KIND_GRAIN = 2;

export const MAX_FOAM = 110;
export const MAX_BUBBLES = 120;
export const MAX_GRAINS = 56;
export const MAX_FX = MAX_BUBBLES + MAX_GRAINS;
export const MAX_PARTICLES = MAX_FOAM + MAX_FX;

export type ParticleKind = typeof KIND_FOAM | typeof KIND_BUBBLE | typeof KIND_GRAIN;

export type ListedParticle = {
  u: number;
  v: number;
  h: number;
  kind: ParticleKind;
  life: number;
};

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/** Must match `sheetFromColumn` in the water shaders — foam sits on the coating. */
export const VISUAL_WATER_SHEET_CAP = 0.012;

export function visualWaterSheet(water: number): number {
  const w = Number.isFinite(water) && water > 0 ? water : 0;
  const cover = smoothstep(0.0006, 0.014, w);
  const body = smoothstep(0.008, 0.1, w);
  return Math.min((0.003 + body * 0.0065) * cover, VISUAL_WATER_SHEET_CAP);
}

/** attr = kind + life∈[0,1). Foam uses life≈1 so it stays fully visible. */
export function packParticleAttr(kind: ParticleKind, life: number): number {
  const k = kind === KIND_BUBBLE || kind === KIND_GRAIN ? kind : KIND_FOAM;
  return k + clamp01(life) * 0.999;
}

export function unpackParticleKind(attr: number): ParticleKind {
  if (!Number.isFinite(attr)) return KIND_FOAM;
  const k = Math.floor(attr + 1e-6);
  if (k === KIND_BUBBLE) return KIND_BUBBLE;
  if (k === KIND_GRAIN) return KIND_GRAIN;
  return KIND_FOAM;
}

export function unpackParticleLife(attr: number): number {
  if (!Number.isFinite(attr)) return 1;
  const kind = unpackParticleKind(attr);
  return clamp01(attr - kind);
}

/**
 * High shear or a free-surface drop (step / overflow) can nucleate bubbles.
 * Standing films and slow threads stay at 0.
 */
export function bubbleSpawnScore(shear: number, drop: number, flow: number, water: number): number {
  if (!(water > 0.007) || !(flow > 0.02)) return 0;
  const sh = Number.isFinite(shear) ? shear : 0;
  const dp = Number.isFinite(drop) ? drop : 0;
  const fl = Number.isFinite(flow) ? flow : 0;
  const shearN = sh > 2.2e-5 ? Math.min(1, (sh - 1.2e-5) * 2.8e4) : 0;
  const dropN = dp > 0.016 ? Math.min(1, (dp - 0.012) * 16) : 0;
  if (shearN < 0.16 && dropN < 0.2) return 0;
  const fluxN = fl > 0.055 ? Math.min(0.35, (fl - 0.055) * 2.4) : 0;
  return Math.min(1, Math.max(shearN, dropN) + fluxN * 0.25);
}

/**
 * Sparse bedload in fast, relatively clear water. Turbid or ponded columns stay empty.
 */
export function grainSpawnScore(flow: number, water: number, sediment: number): number {
  if (!(flow > 0.0024) || !(water > 0.0045) || water > 0.1) return 0;
  const fl = Number.isFinite(flow) ? flow : 0;
  const w = Number.isFinite(water) ? water : 0;
  const sed = Number.isFinite(sediment) && sediment > 0 ? sediment : 0;
  const conc = sed / Math.max(w, 1e-4);
  if (conc > 0.42) return 0;
  const fast = Math.min(1, (fl - 0.002) * 200);
  const clear = 1 - Math.min(1, conc / 0.42);
  const body = w < 0.01 ? w / 0.01 : 1;
  const score = fast * (0.4 + 0.6 * clear) * body;
  return score > 0.14 ? Math.min(1, score) : 0;
}

export function clusterJitter(
  x: number,
  y: number,
  k: number,
  seed: number,
): { du: number; dv: number; lift: number } {
  return {
    du: (hash2(x + k * 7, y, seed) - 0.5) * 0.02,
    dv: (hash2(x, y + k * 11, seed + 19) - 0.5) * 0.02,
    lift: 0.3 + hash2(x, k, seed + 41) * 0.62,
  };
}

export function listParticles(buf: Float32Array | null | undefined): ListedParticle[] {
  if (!buf || buf.length < 3) return [];
  const stride = buf.length % PARTICLE_STRIDE === 0 ? PARTICLE_STRIDE : 3;
  const n = (buf.length / stride) | 0;
  const out: ListedParticle[] = [];
  for (let i = 0; i < n; i++) {
    const o = i * stride;
    const u = buf[o];
    const v = buf[o + 1];
    const h = buf[o + 2];
    const attr = stride === PARTICLE_STRIDE ? buf[o + 3] : packParticleAttr(KIND_FOAM, 1);
    if (!Number.isFinite(u) || !Number.isFinite(v) || !Number.isFinite(h)) continue;
    out.push({
      u,
      v,
      h,
      kind: unpackParticleKind(attr),
      life: unpackParticleLife(attr),
    });
  }
  return out;
}

export function countByKind(list: readonly ListedParticle[]): {
  foam: number;
  bubble: number;
  grain: number;
} {
  let foam = 0;
  let bubble = 0;
  let grain = 0;
  for (const p of list) {
    if (p.kind === KIND_BUBBLE) bubble++;
    else if (p.kind === KIND_GRAIN) grain++;
    else foam++;
  }
  return { foam, bubble, grain };
}
