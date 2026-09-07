import * as THREE from "three";

export function createTray(traySize: number): THREE.Group {
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
  return g;
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
