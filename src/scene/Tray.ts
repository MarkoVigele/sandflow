import * as THREE from "three";
import {
  createLabBenchMaterial,
  createRimLipMaterial,
  createUnderBedMaterial,
  createWoodMaterial,
} from "../assets/trayMaterials";

export function createTray(traySize: number): THREE.Group {
  const g = new THREE.Group();
  g.name = "tray";

  const wood = createWoodMaterial();
  const rimDark = createRimLipMaterial();
  const bench = createLabBenchMaterial();
  const underMat = createUnderBedMaterial();

  // Sand sits near y = 0.42 * HEIGHT_SCALE ≈ 1.5; walls must clear that
  // so a wood rim reads from the default camera.
  const wallH = 1.78;
  const wallT = 0.3;
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
  north.name = "tray-rim-n";
  const south = mk(outer, wallH, wallT, wood);
  south.position.set(0, wallH / 2, inner / 2 + wallT / 2);
  south.name = "tray-rim-s";
  const west = mk(wallT, wallH, inner, wood);
  west.position.set(-inner / 2 - wallT / 2, wallH / 2, 0);
  west.name = "tray-rim-w";
  const east = mk(wallT, wallH, inner, wood);
  east.position.set(inner / 2 + wallT / 2, wallH / 2, 0);
  east.name = "tray-rim-e";

  const lip = mk(outer + 0.12, 0.06, outer + 0.12, rimDark);
  lip.position.y = wallH + 0.01;
  lip.name = "tray-lip";

  const table = mk(outer + 3.4, 0.16, outer + 3.4, bench);
  table.position.y = -0.08;
  table.name = "lab-bench";

  const under = new THREE.Mesh(new THREE.BoxGeometry(inner, 0.12, inner), underMat);
  under.position.y = -0.02;
  under.receiveShadow = true;
  under.name = "tray-bed";

  g.add(north, south, west, east, lip, table, under);
  return g;
}

export function createSourceMarker(): THREE.Group {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.045, 0.28, 12),
    new THREE.MeshStandardMaterial({
      color: 0xb0894a,
      metalness: 0.58,
      roughness: 0.32,
      envMapIntensity: 0.85,
    }),
  );
  stem.position.y = 0.22;
  const drop = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 16, 12),
    new THREE.MeshStandardMaterial({
      color: 0x6aa8ba,
      roughness: 0.16,
      metalness: 0.08,
      transparent: true,
      opacity: 0.82,
      envMapIntensity: 1.1,
    }),
  );
  drop.position.y = 0.42;
  g.add(stem, drop);
  g.userData.drop = drop;
  return g;
}
