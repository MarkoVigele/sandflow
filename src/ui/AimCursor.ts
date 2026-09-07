import * as THREE from "three";
import type { ToolId } from "../state/types";

const UP = new THREE.Vector3(0, 1, 0);

const WATER_FILL = 0x5ec4d8;
const WATER_RING = 0xe8f7fb;
const SAND_FILL = 0xf2d39a;
const SAND_RING = 0xfff6e4;

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

/** World-space radius of the aim disc. Pour splat is a few cells — keep the marker readable. */
export function aimRadiusWorld(state: AimCursorState): number {
  if (state.tool === "source") return 0.22;
  if (state.tool === "pour") {
    return THREE.MathUtils.clamp(0.2 + state.pourRate * 0.06, 0.24, 0.46);
  }
  return Math.max(0.16, state.brushRadius * state.traySize);
}

export function aimCursorVisible(state: Pick<AimCursorState, "cameraMode">): boolean {
  return !state.cameraMode;
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
  gradient.addColorStop(0, "rgba(255,255,255,0.62)");
  gradient.addColorStop(0.42, "rgba(255,255,255,0.28)");
  gradient.addColorStop(0.78, "rgba(255,255,255,0.08)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function overlayMaterial(color: number, opacity: number, map?: THREE.Texture): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    map: map ?? null,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    toneMapped: false,
  });
}

/**
 * Soft disc + ring that sits on the sand under the pointer.
 * Viewport only supplies the raycast hit (UV + world height) and tool state.
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
  private baseRadius = 0.28;
  private waterish = true;

  constructor() {
    this.group.name = "aim-cursor";
    this.group.renderOrder = 20;
    this.group.visible = false;
    this.group.raycast = () => {
      /* ignore so the marker never steals the sand hit */
    };

    this.discMap = makeSoftDiscTexture();

    const discGeo = new THREE.CircleGeometry(1, 48);
    discGeo.rotateX(-Math.PI / 2);
    this.discMat = overlayMaterial(WATER_FILL, 0.34, this.discMap);
    this.disc = new THREE.Mesh(discGeo, this.discMat);
    this.disc.renderOrder = 20;

    const ringGeo = new THREE.RingGeometry(0.78, 1, 64);
    ringGeo.rotateX(-Math.PI / 2);
    this.ringMat = overlayMaterial(WATER_RING, 0.95);
    this.ring = new THREE.Mesh(ringGeo, this.ringMat);
    this.ring.renderOrder = 22;

    const haloGeo = new THREE.RingGeometry(1, 1.38, 48);
    haloGeo.rotateX(-Math.PI / 2);
    this.haloMat = overlayMaterial(WATER_FILL, 0.22, this.discMap);
    this.halo = new THREE.Mesh(haloGeo, this.haloMat);
    this.halo.renderOrder = 19;

    const pipGeo = new THREE.CircleGeometry(0.11, 20);
    pipGeo.rotateX(-Math.PI / 2);
    this.pipMat = overlayMaterial(WATER_RING, 0.9);
    this.pip = new THREE.Mesh(pipGeo, this.pipMat);
    this.pip.position.y = 0.004;
    this.pip.renderOrder = 23;

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

    this.waterish = state.tool === "pour" || state.tool === "source";
    const fill = this.waterish ? WATER_FILL : SAND_FILL;
    const stroke = this.waterish ? WATER_RING : SAND_RING;
    this.discMat.color.setHex(fill);
    this.haloMat.color.setHex(fill);
    this.ringMat.color.setHex(stroke);
    this.pipMat.color.setHex(stroke);

    this.baseRadius = aimRadiusWorld(state);
    this.group.scale.setScalar(this.baseRadius);
    this.group.position.copy(hit.world);
    this.group.position.y += 0.04;

    if (hit.normal && hit.normal.lengthSq() > 0.2) {
      this.group.quaternion.setFromUnitVectors(UP, hit.normal);
    } else {
      this.group.quaternion.identity();
    }

    const press = state.active ? 1 : 0;
    this.discMat.opacity = (this.waterish ? 0.36 : 0.22) + press * 0.16;
    this.ringMat.opacity = 0.88 + press * 0.1;
    this.haloMat.opacity = 0.16 + press * 0.14;
    this.pipMat.opacity = this.waterish ? 0.92 : 0.55;
    this.pip.visible = this.waterish;
    this.group.visible = true;
  }

  tick(elapsed: number, active: boolean): void {
    if (!this.group.visible) return;
    const pulse = active && this.waterish ? 1 + Math.sin(elapsed * 10) * 0.07 : 1;
    this.group.scale.setScalar(this.baseRadius * pulse);
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
