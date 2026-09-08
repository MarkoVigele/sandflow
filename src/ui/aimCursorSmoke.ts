import * as THREE from "three";
import { MAP_R_TERRAIN } from "../sim/mapsContract";
import { pebbleSitY } from "../scene/PropsLite";
import {
  AIM_BRUSH_FILL,
  AIM_POUR_FILL,
  aimCursorVisible,
  aimRadiusWorld,
  isPourAim,
  pickDeformedSand,
  samplePackedHeight,
  surfaceWorld,
  uvToWorldXZ,
  worldXZToUv,
  type AimCursorState,
} from "./AimCursor";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function almost(a: number, b: number, eps = 1e-4, label = ""): void {
  if (Math.abs(a - b) > eps) throw new Error(`${label || "value"} expected ${b}, got ${a}`);
}

const base: AimCursorState = {
  tool: "pour",
  cameraMode: false,
  brushRadius: 0.06,
  pourRate: 1.4,
  traySize: 8,
  active: false,
};

assert(aimCursorVisible(base), "aim should show while using a tool");
assert(!aimCursorVisible({ cameraMode: true }), "aim hidden in camera mode");

const pour = aimRadiusWorld(base);
assert(pour >= 0.3 && pour <= 0.52, `pour radius readable, got ${pour}`);

const brush = aimRadiusWorld({ ...base, tool: "pile" });
assert(Math.abs(brush - 0.06 * 8) < 1e-6, `brush matches world radius, got ${brush}`);

const source = aimRadiusWorld({ ...base, tool: "source" });
assert(source === 0.34, `source placement ring, got ${source}`);

assert(isPourAim("pour") && isPourAim("source"), "pour/source use cyan water ring");
assert(!isPourAim("pile") && !isPourAim("dig") && !isPourAim("smooth") && !isPourAim("dam"), "brushes use gold");
assert(!isPourAim("stone") && !isPourAim("erase"), "kiesel/radierer use gold brush ring");
assert(aimCursorVisible({ cameraMode: false }), "aim stays on for props tools");
assert(!aimCursorVisible({ cameraMode: true }), "aim still hidden in camera mode");
assert(AIM_POUR_FILL === 0x3fd0e8, "pour ring is cyan");
assert(AIM_BRUSH_FILL === 0xe8a44a, "brush ring is gold");

const tray = 8;
const { x: x0, z: z0 } = uvToWorldXZ(0, 0, tray);
almost(x0, -4, 1e-6, "u=0 → −X");
almost(z0, 4, 1e-6, "v=0 → +Z (PlaneGeometry after rotateX)");
const { x: x1, z: z1 } = uvToWorldXZ(1, 1, tray);
almost(x1, 4, 1e-6, "u=1 → +X");
almost(z1, -4, 1e-6, "v=1 → −Z");
const mid = uvToWorldXZ(0.5, 0.5, tray);
almost(mid.x, 0, 1e-6, "center x");
almost(mid.z, 0, 1e-6, "center z");

const back = worldXZToUv(x0, z0, tray);
almost(back.u, 0, 1e-6, "invert u");
almost(back.v, 0, 1e-6, "invert v");
const back1 = worldXZToUv(2, -1, tray);
const fwd = uvToWorldXZ(back1.u, back1.v, tray);
almost(fwd.x, 2, 1e-6, "roundtrip x");
almost(fwd.z, -1, 1e-6, "roundtrip z");

const size = 8;
const packed = new Float32Array(size * size * 4);
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    packed[(y * size + x) * 4 + MAP_R_TERRAIN] = x / (size - 1);
  }
}
almost(samplePackedHeight(packed, size, 0, 0.5), 0, 0.08, "bilinear left");
almost(samplePackedHeight(packed, size, 1, 0.5), 1, 0.08, "bilinear right");
almost(samplePackedHeight(packed, size, 0.5, 0.5), 0.5, 0.08, "bilinear mid");
almost(samplePackedHeight(null, 0, 0.2, 0.2), 0.42, 1e-6, "fallback before first sim frame");

const heightScale = 2.5;
const mound = (u: number, v: number): number => {
  const du = u - 0.5;
  const dv = v - 0.5;
  return 0.2 + 0.6 * Math.exp(-(du * du + dv * dv) * 28);
};

const origin = new THREE.Vector3(0, 4, 4);
const look = new THREE.Vector3(0, mound(0.5, 0.5) * heightScale, 0);
const dir = look.clone().sub(origin).normalize();
const hit = pickDeformedSand(origin, dir, tray, heightScale, mound);
assert(!!hit, "heightfield pick should hit the mound");
almost(hit!.u, 0.5, 0.06, "pick u under pointer");
almost(hit!.v, 0.5, 0.06, "pick v under pointer");
almost(hit!.world.y, mound(hit!.u, hit!.v) * heightScale, 0.02, "Y matches shader displacement");

const planeY = 0;
const tPlane = (planeY - origin.y) / dir.y;
const planeHit = origin.clone().addScaledVector(dir, tPlane);
const planeUv = worldXZToUv(planeHit.x, planeHit.z, tray);
assert(
  Math.hypot(planeUv.u - 0.5, planeUv.v - 0.5) > 0.12,
  "undeformed plane pick is a different UV — that was the old bug",
);

const lifted = surfaceWorld(0.25, 0.75, 0.4, tray, heightScale);
almost(lifted.x, (0.25 - 0.5) * tray, 1e-6, "surface x from uv");
almost(lifted.z, (0.5 - 0.75) * tray, 1e-6, "surface z uses flipped v");
almost(lifted.y, 1.0, 1e-6, "surface y = height * scale");

const sit = pebbleSitY(0.06, -1);
assert(sit > 0.04 && sit < 0.06, `pebble sits on the surface, not buried, got ${sit}`);
assert(sit > 0.06 * 0.42, "pebble lift is above the old half-buried offset");

const miss = pickDeformedSand(
  new THREE.Vector3(20, 4, 20),
  new THREE.Vector3(0, -1, 0),
  tray,
  heightScale,
  mound,
);
assert(!miss, "ray far from tray misses");

const geo = new THREE.PlaneGeometry(tray, tray, 2, 2);
geo.rotateX(-Math.PI / 2);
const pos = geo.getAttribute("position");
const uv = geo.getAttribute("uv");
for (let i = 0; i < pos.count; i++) {
  const mapped = uvToWorldXZ(uv.getX(i), uv.getY(i), tray);
  almost(mapped.x, pos.getX(i), 1e-5, `PlaneGeometry x[${i}]`);
  almost(mapped.z, pos.getZ(i), 1e-5, `PlaneGeometry z[${i}]`);
}

const camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.12, 80);
camera.position.set(6.4, 5.6, 6.8);
camera.lookAt(0, 0.55, 0);
camera.updateMatrixWorld();
camera.updateProjectionMatrix();
const ndcSamples = [
  new THREE.Vector2(0, 0),
  new THREE.Vector2(0.35, -0.2),
  new THREE.Vector2(-0.4, 0.15),
];
const caster = new THREE.Raycaster();
const flat = (): number => 0.42;
for (const ndc of ndcSamples) {
  caster.setFromCamera(ndc, camera);
  const p = pickDeformedSand(caster.ray.origin, caster.ray.direction, tray, heightScale, flat);
  assert(!!p, `NDC (${ndc.x},${ndc.y}) should hit flat sand`);
  const clip = p!.world.clone().project(camera);
  almost(clip.x, ndc.x, 0.03, `reproject x from (${ndc.x},${ndc.y})`);
  almost(clip.y, ndc.y, 0.03, `reproject y from (${ndc.x},${ndc.y})`);
}

console.log("aim-cursor smoke ok");
