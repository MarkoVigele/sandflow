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
    color: 0x5a4632,
    roughness: 0.82,
    metalness: 0.04,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const rimDark = new THREE.MeshStandardMaterial({
    color: 0x2c241c,
    roughness: 0.7,
    metalness: 0.08,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 2,
  });
  const bench = new THREE.MeshStandardMaterial({
    color: 0x1a1714,
    roughness: 0.9,
    metalness: 0.02,
  });

  // Flat bed sits near BASE * default heightScale ≈ 1.34; the rim is a frame, not a lid.
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
    new THREE.MeshStandardMaterial({ color: 0x3d3226, roughness: 0.95 }),
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

  const size = Math.min(512, gpuTexelBudget(quality));
  const aniso = gpuAnisotropy(quality);
  const map = canvasTexture(fitCanvas(albedo, size), aniso);
  map.repeat.set(2.4, 0.95);
  tray.maps.push(map);
  tray.wood.map = map;
  tray.wood.color.set(0xf3e6d2);
  tray.wood.roughness = 0.7;
  tray.wood.metalness = 0.02;
  tray.wood.envMapIntensity = 0.35;

  tray.lip.map = map;
  tray.lip.color.set(0xe4d2b4);
  tray.lip.roughness = 0.68;
  tray.lip.envMapIntensity = 0.3;

  if (normal) {
    const n = canvasTexture(fitCanvas(normal, size), aniso);
    n.colorSpace = THREE.LinearSRGBColorSpace;
    n.repeat.copy(map.repeat);
    tray.maps.push(n);
    tray.wood.normalMap = n;
    tray.wood.normalScale.set(0.42, 0.42);
    tray.lip.normalMap = n;
    tray.lip.normalScale.set(0.3, 0.3);
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
