import * as THREE from "three";
import { MAP_R_TERRAIN } from "../sim/mapsContract";
import type { ToolId } from "../state/types";

export const AIM_POUR_FILL = 0x3fd0e8;
export const AIM_POUR_RING = 0xf4ffff;
export const AIM_BRUSH_FILL = 0xe8a44a;
export const AIM_BRUSH_RING = 0xffe08a;

export type AimHit = {
  u: number;
  v: number;
  world: THREE.Vector3;
  normal?: THREE.Vector3;
};

export type AimCursorState = {
  tool: ToolId;
  cameraMode: boolean;
  brushRadius: number;
  pourRate: number;
  traySize: number;
  active: boolean;
};

export type HeightSampleFn = (u: number, v: number) => number;

/**
 * PlaneGeometry (Three r170+) after rotateX(-π/2):
 *   u=0 → −X, u=1 → +X
 *   v=0 → +Z, v=1 → −Z
 * Matches sand.vert: pos.y = texture2D(uMaps, uv).r * uHeightScale
 */
export function uvToWorldXZ(u: number, v: number, traySize: number): { x: number; z: number } {
  return {
    x: (u - 0.5) * traySize,
    z: (0.5 - v) * traySize,
  };
}

export function worldXZToUv(x: number, z: number, traySize: number): { u: number; v: number } {
  return {
    u: x / traySize + 0.5,
    v: 0.5 - z / traySize,
  };
}

/** Bilinear R-channel sample matching texture2D LINEAR on a flipY=false DataTexture. */
export function samplePackedHeight(
  packed: Float32Array | null,
  size: number,
  u: number,
  v: number,
  fallback = 0.42,
): number {
  if (!packed || size < 1) return fallback;
  const uu = THREE.MathUtils.clamp(u, 0, 1);
  const vv = THREE.MathUtils.clamp(v, 0, 1);
  const fx = uu * size - 0.5;
  const fy = vv * size - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const at = (ix: number, iy: number): number => {
    const x = Math.max(0, Math.min(size - 1, ix));
    const y = Math.max(0, Math.min(size - 1, iy));
    return packed[(y * size + x) * 4 + MAP_R_TERRAIN] ?? fallback;
  };
  const h00 = at(x0, y0);
  const h10 = at(x0 + 1, y0);
  const h01 = at(x0, y0 + 1);
  const h11 = at(x0 + 1, y0 + 1);
  return h00 * (1 - tx) * (1 - ty) + h10 * tx * (1 - ty) + h01 * (1 - tx) * ty + h11 * tx * ty;
}

export function surfaceWorld(
  u: number,
  v: number,
  height01: number,
  traySize: number,
  heightScale: number,
): THREE.Vector3 {
  const { x, z } = uvToWorldXZ(u, v, traySize);
  return new THREE.Vector3(x, height01 * heightScale, z);
}

/**
 * World-space normal of the displaced sand plane.
 * u+ → +X, v+ → −Z; Y = height01 * heightScale. Matches sand.vert.
 */
export function heightfieldNormal(
  u: number,
  v: number,
  heightScale: number,
  traySize: number,
  heightAt: HeightSampleFn,
  du = 1 / 64,
): THREE.Vector3 {
  const hL = heightAt(u - du, v) * heightScale;
  const hR = heightAt(u + du, v) * heightScale;
  const hVp = heightAt(u, v + du) * heightScale;
  const hVm = heightAt(u, v - du) * heightScale;
  const dx = du * traySize;
  return new THREE.Vector3(hL - hR, 2 * dx, hVp - hVm).normalize();
}

export function isPourAim(tool: ToolId): boolean {
  return tool === "pour" || tool === "source";
}

/** World-space radius of the aim disc. Pour splat is a few cells — keep the marker readable. */
export function aimRadiusWorld(state: AimCursorState): number {
  if (state.tool === "source") return 0.34;
  if (state.tool === "pour") {
    return THREE.MathUtils.clamp(0.26 + state.pourRate * 0.07, 0.3, 0.52);
  }
  return Math.max(0.22, state.brushRadius * state.traySize);
}

export function aimCursorVisible(state: Pick<AimCursorState, "cameraMode">): boolean {
  return !state.cameraMode;
}

function rayAabb(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  min: THREE.Vector3,
  max: THREE.Vector3,
): { t0: number; t1: number } | null {
  let t0 = 0;
  let t1 = 1e6;
  const axes: Array<"x" | "y" | "z"> = ["x", "y", "z"];
  for (const axis of axes) {
    const d = dir[axis];
    const o = origin[axis];
    if (Math.abs(d) < 1e-8) {
      if (o < min[axis] || o > max[axis]) return null;
      continue;
    }
    let tNear = (min[axis] - o) / d;
    let tFar = (max[axis] - o) / d;
    if (tNear > tFar) {
      const tmp = tNear;
      tNear = tFar;
      tFar = tmp;
    }
    t0 = Math.max(t0, tNear);
    t1 = Math.min(t1, tFar);
    if (t1 < t0) return null;
  }
  return { t0, t1 };
}

function heightAtPoint(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  t: number,
  traySize: number,
  heightAt: HeightSampleFn,
): { u: number; v: number; px: number; py: number; pz: number; h: number; inside: boolean } {
  const px = origin.x + dir.x * t;
  const py = origin.y + dir.y * t;
  const pz = origin.z + dir.z * t;
  const { u, v } = worldXZToUv(px, pz, traySize);
  const inside = u >= 0 && u <= 1 && v >= 0 && v <= 1;
  const h = inside ? heightAt(u, v) : 0;
  return { u, v, px, py, pz, h, inside };
}

/**
 * Intersect a camera ray with the shader-displaced heightfield.
 * Mesh raycasts miss because CPU geometry stays on y=0.
 */
export function pickDeformedSand(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  traySize: number,
  heightScale: number,
  heightAt: HeightSampleFn,
): AimHit | null {
  const half = traySize * 0.5;
  const bounds = rayAabb(
    origin,
    dir,
    new THREE.Vector3(-half, -0.08, -half),
    new THREE.Vector3(half, heightScale * 2.5 + 0.6, half),
  );
  if (!bounds) return fallbackPlanePick(origin, dir, traySize, heightScale, heightAt);

  const { t0, t1 } = bounds;
  if (t1 < t0) return fallbackPlanePick(origin, dir, traySize, heightScale, heightAt);

  const steps = 48;
  let tPrev = t0;
  let abovePrev: boolean | null = null;
  let tLo = t0;
  let tHi = t1;
  let found = false;

  for (let i = 0; i <= steps; i++) {
    const t = t0 + (t1 - t0) * (i / steps);
    const s = heightAtPoint(origin, dir, t, traySize, heightAt);
    if (!s.inside) {
      tPrev = t;
      continue;
    }
    const above = s.py > s.h * heightScale + 1e-4;
    if (abovePrev === true && !above) {
      tLo = tPrev;
      tHi = t;
      found = true;
      break;
    }
    abovePrev = above;
    tPrev = t;
  }

  if (!found) {
    return fallbackPlanePick(origin, dir, traySize, heightScale, heightAt);
  }

  for (let i = 0; i < 14; i++) {
    const t = 0.5 * (tLo + tHi);
    const s = heightAtPoint(origin, dir, t, traySize, heightAt);
    if (!s.inside || s.py > s.h * heightScale) tLo = t;
    else tHi = t;
  }

  const t = 0.5 * (tLo + tHi);
  const s = heightAtPoint(origin, dir, t, traySize, heightAt);
  if (!s.inside) return fallbackPlanePick(origin, dir, traySize, heightScale, heightAt);
  return surfaceHit(s.u, s.v, s.h, traySize, heightScale, heightAt, s);
}

function fallbackPlanePick(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  traySize: number,
  heightScale: number,
  heightAt: HeightSampleFn,
): AimHit | null {
  if (Math.abs(dir.y) < 1e-6) return null;
  let yGuess = 0.42 * heightScale;
  let u = 0.5;
  let v = 0.5;
  let h = 0.42;
  for (let i = 0; i < 8; i++) {
    const t = (yGuess - origin.y) / dir.y;
    if (t < 0) return null;
    const px = origin.x + dir.x * t;
    const pz = origin.z + dir.z * t;
    const uv = worldXZToUv(px, pz, traySize);
    if (uv.u < 0 || uv.u > 1 || uv.v < 0 || uv.v > 1) return null;
    u = uv.u;
    v = uv.v;
    h = heightAt(u, v);
    yGuess = h * heightScale;
  }
  const t = (yGuess - origin.y) / dir.y;
  return surfaceHit(u, v, h, traySize, heightScale, heightAt, {
    px: origin.x + dir.x * t,
    py: origin.y + dir.y * t,
    pz: origin.z + dir.z * t,
  });
}

function surfaceHit(
  u: number,
  v: number,
  height01: number,
  traySize: number,
  heightScale: number,
  heightAt: HeightSampleFn,
  rayPoint?: { px: number; py: number; pz: number },
): AimHit {
  // Stay on the camera ray so the ring projects under the pointer.
  const y = height01 * heightScale;
  const world = rayPoint
    ? new THREE.Vector3(rayPoint.px, y, rayPoint.pz)
    : surfaceWorld(u, v, height01, traySize, heightScale);
  const normal = heightfieldNormal(u, v, heightScale, traySize, heightAt);
  return { u, v, world, normal };
}

function makeSoftDiscTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }
  const mid = size / 2;
  const gradient = ctx.createRadialGradient(mid, mid, 0, mid, mid, mid);
  gradient.addColorStop(0, "rgba(255,255,255,0.85)");
  gradient.addColorStop(0.38, "rgba(255,255,255,0.42)");
  gradient.addColorStop(0.72, "rgba(255,255,255,0.14)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function overlayMaterial(
  color: number,
  opacity: number,
  map?: THREE.Texture,
  additive = false,
): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    map: map ?? null,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

/**
 * Soft disc + ring that sits on the deformed sand under the pointer.
 * Viewport supplies a heightfield hit (UV + world matching shader displacement).
 */
export class AimCursor {
  readonly group = new THREE.Group();
  private disc: THREE.Mesh;
  private ring: THREE.Mesh;
  private halo: THREE.Mesh;
  private pip: THREE.Mesh;
  private discMat: THREE.MeshBasicMaterial;
  private ringMat: THREE.MeshBasicMaterial;
  private haloMat: THREE.MeshBasicMaterial;
  private pipMat: THREE.MeshBasicMaterial;
  private discMap: THREE.CanvasTexture;
  private baseRadius = 0.32;
  private waterish = true;
  private up = new THREE.Vector3(0, 1, 0);

  constructor() {
    this.group.name = "aim-cursor";
    this.group.renderOrder = 40;
    this.group.visible = false;
    this.group.raycast = () => {
      /* ignore so the marker never steals the sand hit */
    };

    this.discMap = makeSoftDiscTexture();

    const discGeo = new THREE.CircleGeometry(1, 48);
    discGeo.rotateX(-Math.PI / 2);
    this.discMat = overlayMaterial(AIM_POUR_FILL, 0.55, this.discMap, true);
    this.disc = new THREE.Mesh(discGeo, this.discMat);
    this.disc.renderOrder = 40;

    const ringGeo = new THREE.RingGeometry(0.78, 1.04, 64);
    ringGeo.rotateX(-Math.PI / 2);
    this.ringMat = overlayMaterial(AIM_POUR_RING, 1);
    this.ring = new THREE.Mesh(ringGeo, this.ringMat);
    this.ring.renderOrder = 42;
    this.ring.position.y = 0.006;

    const haloGeo = new THREE.RingGeometry(1.04, 1.28, 48);
    haloGeo.rotateX(-Math.PI / 2);
    this.haloMat = overlayMaterial(AIM_POUR_FILL, 0.35, this.discMap, true);
    this.halo = new THREE.Mesh(haloGeo, this.haloMat);
    this.halo.renderOrder = 39;

    const pipGeo = new THREE.CircleGeometry(0.1, 20);
    pipGeo.rotateX(-Math.PI / 2);
    this.pipMat = overlayMaterial(AIM_POUR_RING, 1);
    this.pip = new THREE.Mesh(pipGeo, this.pipMat);
    this.pip.position.y = 0.01;
    this.pip.renderOrder = 43;

    this.group.add(this.halo, this.disc, this.ring, this.pip);
  }

  hide(): void {
    this.group.visible = false;
  }

  show(hit: AimHit, state: AimCursorState): void {
    if (!aimCursorVisible(state)) {
      this.hide();
      return;
    }

    this.waterish = isPourAim(state.tool);
    const fill = this.waterish ? AIM_POUR_FILL : AIM_BRUSH_FILL;
    const stroke = this.waterish ? AIM_POUR_RING : AIM_BRUSH_RING;
    this.discMat.color.setHex(fill);
    this.haloMat.color.setHex(fill);
    this.ringMat.color.setHex(stroke);
    this.pipMat.color.setHex(stroke);
    this.discMat.blending = this.waterish ? THREE.AdditiveBlending : THREE.NormalBlending;
    this.haloMat.blending = this.waterish ? THREE.AdditiveBlending : THREE.NormalBlending;

    this.baseRadius = aimRadiusWorld(state);
    this.group.scale.setScalar(this.baseRadius);
    this.group.position.copy(hit.world);
    if (hit.normal && hit.normal.lengthSq() > 1e-6) {
      this.group.quaternion.setFromUnitVectors(this.up, hit.normal);
      this.group.position.addScaledVector(hit.normal, 0.03);
    } else {
      this.group.quaternion.identity();
      this.group.position.y += 0.03;
    }

    const press = state.active ? 1 : 0;
    this.discMat.opacity = (this.waterish ? 0.55 : 0.4) + press * 0.16;
    this.ringMat.opacity = 1;
    this.haloMat.opacity = 0.22 + press * 0.12;
    this.pipMat.opacity = this.waterish ? 1 : 0.8;
    this.pip.visible = true;
    this.group.visible = true;
  }

  tick(_elapsed: number, _active: boolean): void {
    if (!this.group.visible) return;
    this.group.scale.setScalar(this.baseRadius);
  }

  dispose(): void {
    this.disc.geometry.dispose();
    this.ring.geometry.dispose();
    this.halo.geometry.dispose();
    this.pip.geometry.dispose();
    this.discMat.dispose();
    this.ringMat.dispose();
    this.haloMat.dispose();
    this.pipMat.dispose();
    this.discMap.dispose();
  }
}
