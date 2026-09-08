import * as THREE from "three";
import { fitCanvas } from "../assets/deriveMaps";
import { gpuAnisotropy, gpuTexelBudget } from "../assets/texturePaths";
import type { QualityId } from "../state/types";
import { canvasTexture } from "./mapsTexture";

/** Inner wall sits outside the sand plane so the rim does not z-fight the bed. */
export const TRAY_SAND_CLEARANCE = 0.05;

export type TrayHandle = {
  group: THREE.Group;
  wood: THREE.MeshStandardMaterial;
  lip: THREE.MeshStandardMaterial;
  maps: THREE.Texture[];
};

export function createTray(traySize: number): TrayHandle {
  const g = new THREE.Group();
  g.name = "tray";

  const wood = new THREE.MeshStandardMaterial({
    color: 0x6a6560,
    roughness: 0.86,
    metalness: 0.05,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const rimDark = new THREE.MeshStandardMaterial({
    color: 0x3a3834,
    roughness: 0.74,
    metalness: 0.06,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 2,
  });
  const bench = new THREE.MeshStandardMaterial({
    color: 0x161514,
    roughness: 0.92,
    metalness: 0.03,
  });

  // Flat bed stays near BASE * HEIGHT_WORLD ≈ 1.05; Relief exaggerates ridges, not the slab.
  const wallH = 1.18;
  const wallT = 0.3;
  const inner = traySize + TRAY_SAND_CLEARANCE * 2;
  const outer = inner + wallT * 2;

  const mk = (w: number, h: number, d: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };

  const north = mk(outer, wallH, wallT, wood);
  north.position.set(0, wallH / 2, -inner / 2 - wallT / 2);
  const south = mk(outer, wallH, wallT, wood);
  south.position.set(0, wallH / 2, inner / 2 + wallT / 2);
  const west = mk(wallT, wallH, inner, wood);
  west.position.set(-inner / 2 - wallT / 2, wallH / 2, 0);
  const east = mk(wallT, wallH, inner, wood);
  east.position.set(inner / 2 + wallT / 2, wallH / 2, 0);

  // Frame only — a solid slab here would cap the sand once the rim clears the bed.
  // N/S take the corners; E/W are shorter so the lips do not occupy the same volume.
  const lipH = 0.07;
  const lipOver = 0.07;
  const lipY = wallH + lipH / 2 + 0.003;
  const lipN = mk(outer + lipOver * 2, lipH, wallT + lipOver, rimDark);
  lipN.position.set(0, lipY, -inner / 2 - wallT / 2);
  const lipS = mk(outer + lipOver * 2, lipH, wallT + lipOver, rimDark);
  lipS.position.set(0, lipY, inner / 2 + wallT / 2);
  const lipSpanEW = inner - (wallT + lipOver) - 0.01;
  const lipW = mk(wallT + lipOver, lipH, Math.max(0.2, lipSpanEW), rimDark);
  lipW.position.set(-inner / 2 - wallT / 2, lipY, 0);
  const lipE = mk(wallT + lipOver, lipH, Math.max(0.2, lipSpanEW), rimDark);
  lipE.position.set(inner / 2 + wallT / 2, lipY, 0);

  const table = mk(outer + 3.4, 0.16, outer + 3.4, bench);
  table.position.y = -0.08;

  const under = new THREE.Mesh(
    new THREE.BoxGeometry(inner, 0.12, inner),
    new THREE.MeshStandardMaterial({ color: 0x3a3834, roughness: 0.95 }),
  );
  under.position.y = -0.02;
  under.receiveShadow = true;

  g.add(north, south, west, east, lipN, lipS, lipW, lipE, table, under);
  return { group: g, wood, lip: rimDark, maps: [] };
}

export function applyTrayWood(
  tray: TrayHandle,
  albedo: HTMLCanvasElement,
  normal?: HTMLCanvasElement,
  roughness?: HTMLCanvasElement,
  quality: QualityId = "high",
): void {
  for (const tex of tray.maps) tex.dispose();
  tray.maps.length = 0;

  const size = gpuTexelBudget(quality);
  const aniso = gpuAnisotropy(quality);
  const map = canvasTexture(fitCanvas(albedo, size), aniso);
  map.repeat.set(1.15, 0.72);
  tray.maps.push(map);
  tray.wood.map = map;
  tray.wood.color.set(0xe8e4dc);
  tray.wood.roughness = 0.78;
  tray.wood.metalness = 0.04;
  tray.wood.envMapIntensity = 0.28;

  tray.lip.map = map;
  tray.lip.color.set(0xc9c4ba);
  tray.lip.roughness = 0.72;
  tray.lip.envMapIntensity = 0.24;

  if (normal) {
    const n = canvasTexture(fitCanvas(normal, size), aniso);
    n.colorSpace = THREE.LinearSRGBColorSpace;
    n.repeat.copy(map.repeat);
    tray.maps.push(n);
    tray.wood.normalMap = n;
    tray.wood.normalScale.set(0.22, 0.22);
    tray.lip.normalMap = n;
    tray.lip.normalScale.set(0.16, 0.16);
  }
  if (roughness) {
    const r = canvasTexture(fitCanvas(roughness, size), aniso);
    r.colorSpace = THREE.LinearSRGBColorSpace;
    r.repeat.copy(map.repeat);
    tray.maps.push(r);
    tray.wood.roughnessMap = r;
    tray.lip.roughnessMap = r;
  }

  tray.wood.needsUpdate = true;
  tray.lip.needsUpdate = true;
}

export function createSourceMarker(): THREE.Group {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.045, 0.28, 12),
    new THREE.MeshStandardMaterial({
      color: 0xb0894a,
      metalness: 0.55,
      roughness: 0.35,
    }),
  );
  stem.position.y = 0.22;
  const drop = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 16, 12),
    new THREE.MeshStandardMaterial({
      color: 0x6aa8ba,
      roughness: 0.2,
      metalness: 0.1,
      transparent: true,
      opacity: 0.85,
    }),
  );
  drop.position.y = 0.42;
  g.add(stem, drop);
  g.userData.drop = drop;
  return g;
}
