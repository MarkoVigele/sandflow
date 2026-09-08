import { qualityProfile } from "../state/quality";
import { isMobile, type QualityId } from "../state/types";

/**
 * Shared look math for the cinematic sand-tray pass.
 * Shaders implement the same curves; this module is the contract the smoke test pins.
 */

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/**
 * Wet/dry mix. Residual moisture inland stays a soft bank;
 * the waterline snaps darker so the shoreline reads as a hard contact.
 */
export function wetDryMask(wet: number, water: number): number {
  const w = Number.isFinite(wet) ? clamp01(wet) : 0;
  const d = Number.isFinite(water) && water > 0 ? water : 0;
  const bank = smoothstep(0.02, 0.16, w);
  const shore = smoothstep(0.0006, 0.022, d);
  const sharp = smoothstep(0.006, 0.045, w);
  return clamp01(Math.max(shore, mix(bank, sharp, shore)));
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Cheap screen-space bump from height derivatives (dFdx/dFdy of the bed).
 * Strength 0 is a no-op so Low can skip the mix.
 */
export function heightMicroRelief(
  dHx: number,
  dHz: number,
  strength: number,
): { nx: number; nz: number } {
  const s = Number.isFinite(strength) ? clamp01(strength) : 0;
  if (s <= 1e-5) return { nx: 0, nz: 0 };
  const hx = Math.max(-0.06, Math.min(0.06, Number.isFinite(dHx) ? dHx : 0));
  const hz = Math.max(-0.06, Math.min(0.06, Number.isFinite(dHz) ? dHz : 0));
  return { nx: -hx * s * 2.4, nz: -hz * s * 2.4 };
}

/** Albedo luma → lighting/roughness grain. 1 = neutral. */
export function albedoMicroGrain(luma: number, strength: number): number {
  const y = Number.isFinite(luma) ? luma : 0.5;
  const s = Number.isFinite(strength) ? clamp01(strength) : 0;
  return 1 + (y - 0.5) * s * 0.22;
}

/**
 * Concave/ridge AO from neighbor heights above the sample.
 * Diagonals are High/Ultra only so Low stays a cheap 4-tap.
 */
export function ridgeAO(h0: number, neighbors: readonly number[], diagonals = false): number {
  const c = Number.isFinite(h0) ? h0 : 0;
  let acc = 0;
  const n = neighbors.length;
  const ortho = Math.min(4, n);
  for (let i = 0; i < ortho; i++) {
    const h = Number.isFinite(neighbors[i]!) ? neighbors[i]! : c;
    acc += Math.max(h - c, 0);
  }
  if (diagonals) {
    for (let i = 4; i < n; i++) {
      const h = Number.isFinite(neighbors[i]!) ? neighbors[i]! : c;
      acc += Math.max(h - c, 0) * 0.65;
    }
  }
  return clamp01(Math.max(0.48, 1 - acc * 1.85));
}

/** Soft contact along a light ray. `steps` 0 skips the march. */
export function contactShadow(
  h0: number,
  samples: readonly number[],
  lightY: number,
  stepWorld: number,
  steps: number,
): number {
  const n = Math.max(0, Math.min(8, steps | 0));
  if (n <= 0 || samples.length === 0) return 1;
  const ly = Number.isFinite(lightY) ? lightY : 0.7;
  const sw = Number.isFinite(stepWorld) && stepWorld > 1e-4 ? stepWorld : 0.02;
  let y = Number.isFinite(h0) ? h0 : 0;
  let shadow = 1;
  for (let i = 0; i < n; i++) {
    y += ly * sw;
    const hs = Number.isFinite(samples[i]!) ? samples[i]! : y;
    const occ = (hs - y) / Math.max(sw * 2.4, 1e-3);
    shadow *= 1 - clamp01(occ) * 0.28;
  }
  return Math.max(0.55, Math.min(1, shadow));
}

/**
 * Extra body darken for deeper columns. Shallow films stay close to 1
 * so the bed remains readable; deep water picks up a sand-brown tint.
 */
export function depthTint(depth: number): [number, number, number] {
  const d = Number.isFinite(depth) && depth > 0 ? depth : 0;
  const t = smoothstep(0.02, 0.16, d) * 0.72;
  return [mix(1, 0.56, t), mix(1, 0.48, t), mix(1, 0.4, t)];
}

/**
 * Soft lace at the contact line when water is actually moving.
 * Still pools stay clear — velocity is the gate, not a dry-neighbor glow.
 */
export function shoreFoamFromVelocity(
  depth: number,
  dryNeighbors: number,
  flow: number,
  detail = 1,
): number {
  const d = Number.isFinite(depth) ? Math.max(0, depth) : 0;
  if (d < 0.0009) return 0;
  const fl = Number.isFinite(flow) ? clamp01(flow) : 0;
  const dry = Number.isFinite(dryNeighbors) ? Math.max(0, dryNeighbors) : 0;
  const thin = 1 - smoothstep(0.01, 0.058, d);
  const contact = smoothstep(0.55, 2.6, dry) * thin;
  const moving = smoothstep(0.045, 0.14, fl);
  return clamp01(contact * moving * mix(0.35, 1, clamp01(detail)));
}

/** Tight specular ceiling on Low/Med (and any mobile Medium). */
export function waterSpecCap(quality: QualityId, mobile = isMobile()): number {
  const cap = qualityProfile(quality).lookSpecCap;
  if (mobile && (quality === "low" || quality === "medium")) {
    return Math.min(cap, 0.08);
  }
  return cap;
}

export function lookAoSteps(quality: QualityId): number {
  return qualityProfile(quality).lookAoSteps;
}

/** Screen vignette strength. Low is 0 so the overlay is a no-op. */
export function lookVignette(quality: QualityId): number {
  return qualityProfile(quality).lookVignette;
}

/** Tray contact-blob opacity. Low hides the plane. */
export function trayShadowOpacity(quality: QualityId): number {
  return qualityProfile(quality).lookTrayShadow;
}
