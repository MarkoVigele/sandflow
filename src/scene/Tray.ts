import * as THREE from "three";
import { canvasTexture } from "./mapsTexture";

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
  });
  const rimDark = new THREE.MeshStandardMaterial({
    color: 0x2c241c,
    roughness: 0.7,
    metalness: 0.08,
  });
  const bench = new THREE.MeshStandardMaterial({
    color: 0x1a1714,
    roughness: 0.9,
    metalness: 0.02,
  });

  const wallH = 0.42;
  const wallT = 0.22;
  const inner = traySize;
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

  const lip = mk(outer + 0.12, 0.06, outer + 0.12, rimDark);
  lip.position.y = wallH + 0.01;

  const table = mk(outer + 3.4, 0.16, outer + 3.4, bench);
  table.position.y = -0.08;

  const under = new THREE.Mesh(
    new THREE.BoxGeometry(inner, 0.12, inner),
    new THREE.MeshStandardMaterial({ color: 0x3d3226, roughness: 0.95 }),
  );
  under.position.y = -0.02;
  under.receiveShadow = true;

  g.add(north, south, west, east, lip, table, under);
  return { group: g, wood, lip: rimDark, maps: [] };
}

export function applyTrayWood(
  tray: TrayHandle,
  albedo: HTMLCanvasElement,
  normal?: HTMLCanvasElement,
  roughness?: HTMLCanvasElement,
): void {
  for (const tex of tray.maps) tex.dispose();
  tray.maps.length = 0;

  const map = canvasTexture(albedo);
  map.repeat.set(2.4, 1);
  tray.maps.push(map);
  tray.wood.map = map;
  tray.wood.color.set(0xffffff);
  tray.wood.roughness = 0.74;
  tray.wood.metalness = 0.03;

  tray.lip.map = map;
  tray.lip.color.set(0x6e5a42);
  tray.lip.roughness = 0.7;

  if (normal) {
    const n = canvasTexture(normal);
    n.colorSpace = THREE.LinearSRGBColorSpace;
    n.repeat.copy(map.repeat);
    tray.maps.push(n);
    tray.wood.normalMap = n;
    tray.wood.normalScale.set(0.42, 0.42);
    tray.lip.normalMap = n;
    tray.lip.normalScale.set(0.3, 0.3);
  }
  if (roughness) {
    const r = canvasTexture(roughness);
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
