import * as THREE from "three";
import { fitCanvas } from "../assets/deriveMaps";
import { gpuAnisotropy, gpuTexelBudget } from "../assets/texturePaths";
import { qualityProfile } from "../state/quality";
import type { QualityId } from "../state/types";
import { canvasTexture } from "./mapsTexture";

/** Inner wall sits outside the sand plane so the rim does not z-fight the bed. */
export const TRAY_SAND_CLEARANCE = 0.05;

/** World metres of grain per texture repeat along U / V. */
export const WOOD_PLANK_U = 2.2;
export const WOOD_PLANK_V = 0.85;

export type TrayHandle = {
  group: THREE.Group;
  wood: THREE.MeshStandardMaterial;
  lip: THREE.MeshStandardMaterial;
  maps: THREE.Texture[];
};

/**
 * Scale default 0–1 BoxGeometry UVs so grain density is consistent
 * across long walls, short ends, and the lip. Face order: +X −X +Y −Y +Z −Z.
 */
export function applyBoxPlankUVs(
  geo: THREE.BoxGeometry,
  w: number,
  h: number,
  d: number,
  uWorld = WOOD_PLANK_U,
  vWorld = WOOD_PLANK_V,
): void {
  const uv = geo.getAttribute("uv");
  if (!uv) return;
  const faces: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  const n = uv.count;
  const per = Math.max(1, Math.floor(n / 6));
  for (let f = 0; f < 6; f++) {
    const su = faces[f]![0] / uWorld;
    const sv = faces[f]![1] / vWorld;
    for (let i = 0; i < per; i++) {
      const idx = f * per + i;
      if (idx >= n) break;
      uv.setXY(idx, uv.getX(idx) * su, uv.getY(idx) * sv);
    }
  }
  uv.needsUpdate = true;
}

export function createTray(traySize: number): TrayHandle {
  const g = new THREE.Group();
  g.name = "tray";

  const wood = new THREE.MeshStandardMaterial({
    color: 0x8a6a48,
    roughness: 0.78,
    metalness: 0.03,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const rimDark = new THREE.MeshStandardMaterial({
    color: 0x5c4632,
    roughness: 0.7,
    metalness: 0.04,
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
    const geo = new THREE.BoxGeometry(w, h, d);
    applyBoxPlankUVs(geo, w, h, d);
    const m = new THREE.Mesh(geo, mat);
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

  const look = qualityProfile(quality);
  const size = gpuTexelBudget(quality);
  const aniso = gpuAnisotropy(quality);
  const map = canvasTexture(fitCanvas(albedo, size), aniso);
  map.repeat.set(1, 1);
  tray.maps.push(map);
  tray.wood.map = map;
  tray.wood.color.set(0xf6ecdf);
  tray.wood.roughness = 0.7;
  tray.wood.metalness = 0.025;
  tray.wood.envMapIntensity = 0.22;

  tray.lip.map = map;
  tray.lip.color.set(0xd4b896);
  tray.lip.roughness = 0.64;
  tray.lip.envMapIntensity = 0.18;

  const woodN = look.lookWoodNormal;
  if (normal && woodN > 0.01) {
    const n = canvasTexture(fitCanvas(normal, size), aniso);
    n.colorSpace = THREE.LinearSRGBColorSpace;
    n.repeat.copy(map.repeat);
    tray.maps.push(n);
    tray.wood.normalMap = n;
    tray.wood.normalScale.set(woodN, woodN);
    tray.lip.normalMap = n;
    tray.lip.normalScale.set(woodN * 0.72, woodN * 0.72);
  } else {
    tray.wood.normalMap = null;
    tray.lip.normalMap = null;
  }
  if (roughness && woodN > 0.01) {
    const r = canvasTexture(fitCanvas(roughness, size), aniso);
    r.colorSpace = THREE.LinearSRGBColorSpace;
    r.repeat.copy(map.repeat);
    tray.maps.push(r);
    tray.wood.roughnessMap = r;
    tray.lip.roughnessMap = r;
  } else {
    tray.wood.roughnessMap = null;
    tray.lip.roughnessMap = null;
  }

  tray.wood.needsUpdate = true;
  tray.lip.needsUpdate = true;
}
