import * as THREE from "three";
import { surfaceWorld, uvToWorldXZ } from "./AimCursor";

export const SOURCE_PIN_STEM_H = 0.3;
export const SOURCE_PIN_STEM_R_TOP = 0.028;
export const SOURCE_PIN_STEM_R_BOT = 0.04;
export const SOURCE_PIN_DROP_R = 0.052;
export const SOURCE_PIN_BASE_R = 0.11;
/** Bury the stem a little so it never hovers above the displaced surface. */
export const SOURCE_PIN_PLANT = 0.012;

export const SOURCE_PIN_IDLE_DROP = 0x6aa8ba;
export const SOURCE_PIN_SEL_DROP = 0x8ee8f4;
export const SOURCE_PIN_IDLE_RING = 0x3fd0e8;
export const SOURCE_PIN_SEL_RING = 0xf4ffff;
export const SOURCE_PIN_IDLE_STEM = 0xb0894a;
export const SOURCE_PIN_SEL_STEM = 0xd4b483;

export type SourcePinUv = { id: string; x: number; y: number };

export type CanvasRect = { left: number; top: number; width: number; height: number };

/** Same XZ as AimCursor / sand.vert — v=0 is +Z after PlaneGeometry rotateX. */
export function sourcePinWorld(
  u: number,
  v: number,
  height01: number,
  traySize: number,
  heightScale: number,
): THREE.Vector3 {
  return surfaceWorld(u, v, height01, traySize, heightScale);
}

export function sourcePinPlantedY(height01: number, heightScale: number): number {
  return height01 * heightScale - SOURCE_PIN_PLANT;
}

/** Pixel slack before a tap becomes a drag. Touch needs more. */
export function sourceDragThresholdPx(pointerType: string): number {
  return pointerType === "touch" || pointerType === "pen" ? 12 : 8;
}

export function sourcePickRadiusPx(pointerType: string): number {
  return pointerType === "touch" || pointerType === "pen" ? 36 : 22;
}

export function pointerPixelDelta(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function shouldStartSourceDrag(deltaPx: number, pointerType: string): boolean {
  return deltaPx >= sourceDragThresholdPx(pointerType);
}

/**
 * Screen-space pick of a planted pin. Uses the same UV → displaced height as AimCursor
 * so the hit target sits where the pin is drawn, not on the flat mesh.
 */
export function pickNearestSourceId(
  clientX: number,
  clientY: number,
  canvas: CanvasRect,
  camera: THREE.Camera,
  sources: SourcePinUv[],
  heightAt: (u: number, v: number) => number,
  traySize: number,
  heightScale: number,
  radiusPx: number,
): string | null {
  if (canvas.width < 1 || canvas.height < 1 || !sources.length) return null;
  let bestId: string | null = null;
  let bestDist = radiusPx;
  const ndc = new THREE.Vector3();
  for (const s of sources) {
    const world = sourcePinWorld(s.x, s.y, heightAt(s.x, s.y), traySize, heightScale);
    ndc.copy(world).project(camera);
    if (ndc.z < -1 || ndc.z > 1) continue;
    const sx = canvas.left + (ndc.x * 0.5 + 0.5) * canvas.width;
    const sy = canvas.top + (-ndc.y * 0.5 + 0.5) * canvas.height;
    const d = Math.hypot(clientX - sx, clientY - sy);
    if (d <= bestDist) {
      bestDist = d;
      bestId = s.id;
    }
  }
  return bestId;
}

/** Stem origin is on the surface (y=0). Bottom of the cylinder sits at y=0. */
export function createSourceMarker(): THREE.Group {
  const g = new THREE.Group();
  g.name = "source-pin";

  const ringGeo = new THREE.RingGeometry(SOURCE_PIN_BASE_R * 0.42, SOURCE_PIN_BASE_R, 28);
  ringGeo.rotateX(-Math.PI / 2);
  const ring = new THREE.Mesh(
    ringGeo,
    new THREE.MeshBasicMaterial({
      color: SOURCE_PIN_IDLE_RING,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  ring.position.y = 0.01;
  ring.renderOrder = 8;

  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(SOURCE_PIN_STEM_R_TOP, SOURCE_PIN_STEM_R_BOT, SOURCE_PIN_STEM_H, 12),
    new THREE.MeshStandardMaterial({
      color: SOURCE_PIN_IDLE_STEM,
      metalness: 0.55,
      roughness: 0.35,
    }),
  );
  stem.position.y = SOURCE_PIN_STEM_H * 0.5;

  const drop = new THREE.Mesh(
    new THREE.SphereGeometry(SOURCE_PIN_DROP_R, 16, 12),
    new THREE.MeshStandardMaterial({
      color: SOURCE_PIN_IDLE_DROP,
      roughness: 0.2,
      metalness: 0.1,
      transparent: true,
      opacity: 0.9,
      emissive: 0x000000,
      emissiveIntensity: 0,
    }),
  );
  drop.position.y = SOURCE_PIN_STEM_H + SOURCE_PIN_DROP_R * 0.45;

  g.add(ring, stem, drop);
  g.userData.drop = drop;
  g.userData.stem = stem;
  g.userData.ring = ring;
  return g;
}

export function applySourceMarkerStyle(g: THREE.Group, selected: boolean, dragging = false): void {
  const drop = g.userData.drop as THREE.Mesh | undefined;
  const stem = g.userData.stem as THREE.Mesh | undefined;
  const ring = g.userData.ring as THREE.Mesh | undefined;
  const on = selected || dragging;
  if (drop) {
    const mat = drop.material as THREE.MeshStandardMaterial;
    mat.color.setHex(on ? SOURCE_PIN_SEL_DROP : SOURCE_PIN_IDLE_DROP);
    mat.emissive.setHex(on ? 0x1a6a78 : 0x000000);
    mat.emissiveIntensity = dragging ? 0.7 : on ? 0.45 : 0;
    drop.scale.setScalar(dragging ? 1.32 : selected ? 1.2 : 1);
  }
  if (stem) {
    const mat = stem.material as THREE.MeshStandardMaterial;
    mat.color.setHex(on ? SOURCE_PIN_SEL_STEM : SOURCE_PIN_IDLE_STEM);
  }
  if (ring) {
    const mat = ring.material as THREE.MeshBasicMaterial;
    mat.color.setHex(on ? SOURCE_PIN_SEL_RING : SOURCE_PIN_IDLE_RING);
    mat.opacity = dragging ? 1 : on ? 0.92 : 0.72;
    ring.scale.setScalar(dragging ? 1.28 : selected ? 1.14 : 1);
  }
}

/** Debug / tests: old Viewport used (v − 0.5) * tray for Z, which mirrored the pin. */
export function legacyFlippedPinZ(v: number, traySize: number): number {
  return (v - 0.5) * traySize;
}

export function correctPinZ(v: number, traySize: number): number {
  return uvToWorldXZ(0, v, traySize).z;
}
