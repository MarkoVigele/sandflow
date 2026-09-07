import * as THREE from "three";
import type { ToolId } from "../state/types";

const WATER_FILL = 0x3fd0e8;
const WATER_RING = 0xf4ffff;
const SAND_FILL = 0xe8a44a;
const SAND_RING = 0xffe08a;

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
  if (state.tool === "source") return 0.34;
  if (state.tool === "pour") {
    return THREE.MathUtils.clamp(0.26 + state.pourRate * 0.07, 0.3, 0.52);
  }
  return Math.max(0.22, state.brushRadius * state.traySize);
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
 * Soft disc + ring that sits on the sand under the pointer.
 * Viewport only supplies the raycast hit (UV + world height) and tool state.
 */
export class AimCursor {
  readonly group = new THREE.Group();
  readonly hud: HTMLDivElement;
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
  private host: HTMLElement | null = null;

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
    this.discMat = overlayMaterial(WATER_FILL, 0.55, this.discMap, true);
    this.disc = new THREE.Mesh(discGeo, this.discMat);
    this.disc.renderOrder = 40;

    const ringGeo = new THREE.RingGeometry(0.7, 1.02, 64);
    ringGeo.rotateX(-Math.PI / 2);
    this.ringMat = overlayMaterial(WATER_RING, 1);
    this.ring = new THREE.Mesh(ringGeo, this.ringMat);
    this.ring.renderOrder = 42;
    this.ring.position.y = 0.006;

    const haloGeo = new THREE.RingGeometry(1.02, 1.42, 48);
    haloGeo.rotateX(-Math.PI / 2);
    this.haloMat = overlayMaterial(WATER_FILL, 0.35, this.discMap, true);
    this.halo = new THREE.Mesh(haloGeo, this.haloMat);
    this.halo.renderOrder = 39;

    const pipGeo = new THREE.CircleGeometry(0.14, 20);
    pipGeo.rotateX(-Math.PI / 2);
    this.pipMat = overlayMaterial(WATER_RING, 1);
    this.pip = new THREE.Mesh(pipGeo, this.pipMat);
    this.pip.position.y = 0.01;
    this.pip.renderOrder = 43;

    this.group.add(this.halo, this.disc, this.ring, this.pip);

    this.hud = document.createElement("div");
    this.hud.className = "aim-hud";
    this.hud.setAttribute("aria-hidden", "true");
    this.hud.innerHTML = `<span class="aim-hud-disc"></span><span class="aim-hud-ring"></span>`;
  }

  attachHud(host: HTMLElement): void {
    this.host = host;
    host.appendChild(this.hud);
  }

  hide(): void {
    this.group.visible = false;
    this.hud.classList.remove("is-visible");
  }

  show(hit: AimHit, state: AimCursorState, screen?: { clientX: number; clientY: number }): void {
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
    this.discMat.blending = this.waterish ? THREE.AdditiveBlending : THREE.NormalBlending;
    this.haloMat.blending = this.waterish ? THREE.AdditiveBlending : THREE.NormalBlending;

    this.baseRadius = aimRadiusWorld(state);
    this.group.scale.setScalar(this.baseRadius);
    this.group.position.copy(hit.world);
    this.group.position.y += 0.08;
    this.group.quaternion.identity();

    const press = state.active ? 1 : 0;
    this.discMat.opacity = (this.waterish ? 0.62 : 0.42) + press * 0.18;
    this.ringMat.opacity = 1;
    this.haloMat.opacity = 0.28 + press * 0.16;
    this.pipMat.opacity = this.waterish ? 1 : 0.75;
    this.pip.visible = true;
    this.group.visible = true;
    this.placeHud(state, screen);
  }

  private placeHud(state: AimCursorState, screen?: { clientX: number; clientY: number }): void {
    if (!this.host || !screen) return;
    const rect = this.host.getBoundingClientRect();
    const px = Math.round(48 + this.baseRadius * 42);
    this.hud.style.setProperty("--aim-r", `${px}px`);
    this.hud.style.left = `${screen.clientX - rect.left}px`;
    this.hud.style.top = `${screen.clientY - rect.top}px`;
    this.hud.classList.toggle("is-water", this.waterish);
    this.hud.classList.toggle("is-sand", !this.waterish);
    this.hud.classList.toggle("is-active", state.active);
    this.hud.classList.add("is-visible");
  }

  tick(elapsed: number, active: boolean): void {
    if (!this.group.visible) return;
    const pulse = active && this.waterish ? 1 + Math.sin(elapsed * 10) * 0.08 : 1;
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
    this.hud.remove();
  }
}
