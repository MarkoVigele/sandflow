import * as THREE from "three";
import { MAP_R_TERRAIN } from "../sim/mapsContract";
import { HEIGHT_WORLD } from "../state/types";
import { effectiveHeight01 } from "../scene/heightDisplace";
import {
  pickDeformedSand,
  samplePackedHeight,
  surfaceWorld,
  uvToWorldXZ,
} from "./AimCursor";
import {
  allowOneFingerOrbit,
  claimSourceGesture,
  pinGrabBeatsOrbit,
} from "./sourceGesture";
import {
  SOURCE_PIN_PLANT,
  SOURCE_PIN_STEM_H,
  applySourceMarkerStyle,
  correctPinZ,
  createSourceMarker,
  legacyFlippedPinZ,
  pickNearestSourceId,
  pointerPixelDelta,
  shouldStartSourceDrag,
  sourceDragThresholdPx,
  sourcePickRadiusPx,
  sourcePinHeadWorld,
  sourcePinPlantedY,
  sourcePinWorld,
} from "./sourcePins";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function almost(a: number, b: number, eps = 1e-4, label = ""): void {
  if (Math.abs(a - b) > eps) throw new Error(`${label || "value"} expected ${b}, got ${a}`);
}

const tray = 8;
const heightScale = HEIGHT_WORLD;

const world = sourcePinWorld(0.25, 0.75, 0.4, tray, heightScale);
const xz = uvToWorldXZ(0.25, 0.75, tray);
almost(world.x, xz.x, 1e-6, "pin x matches AimCursor");
almost(world.z, xz.z, 1e-6, "pin z matches AimCursor (v flipped)");
almost(world.y, 0.4 * heightScale, 1e-6, "pin y is displaced height");
almost(world.z, (0.5 - 0.75) * tray, 1e-6, "v=0.75 → −Z");
assert(Math.abs(world.z - legacyFlippedPinZ(0.75, tray)) > 3, "must not use the old (v−0.5) Z");
almost(correctPinZ(0.75, tray), world.z, 1e-6, "correctPinZ");
almost(correctPinZ(0.12, tray), (0.5 - 0.12) * tray, 1e-6, "preset source near v=0 sits at +Z");

const lifted = sourcePinWorld(0.5, 0.5, 0.8, tray, heightScale);
const low = sourcePinWorld(0.5, 0.5, 0.3, tray, heightScale);
almost(lifted.y, 2.0, 1e-6, "taller sand lifts the pin");
almost(low.y, 0.75, 1e-6, "eroded sand lowers the pin");
assert(lifted.y !== low.y, "frame-to-frame height sync changes Y");
almost(sourcePinPlantedY(0.8, heightScale), 0.8 * heightScale - SOURCE_PIN_PLANT, 1e-9, "plant offset");

const mound = (u: number, v: number): number => {
  const du = u - 0.5;
  const dv = v - 0.5;
  return 0.2 + 0.6 * Math.exp(-(du * du + dv * dv) * 28);
};
const pinOnMound = sourcePinWorld(0.5, 0.5, mound(0.5, 0.5), tray, heightScale);
almost(pinOnMound.y, mound(0.5, 0.5) * heightScale, 1e-6, "pin Y matches shader displacement");
const origin = new THREE.Vector3(0, 4, 4);
const look = new THREE.Vector3(0, mound(0.5, 0.5) * heightScale, 0);
const dir = look.clone().sub(origin).normalize();
const hit = pickDeformedSand(origin, dir, tray, heightScale, mound);
assert(!!hit, "AimCursor heightfield pick still hits");
almost(hit!.world.y, pinOnMound.y, 0.02, "pin and aim share the same surface Y");
almost(hit!.u, 0.5, 0.06, "pour pick u unchanged");
almost(hit!.v, 0.5, 0.06, "pour pick v unchanged");

const size = 8;
const packed = new Float32Array(size * size * 4);
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    packed[(y * size + x) * 4 + MAP_R_TERRAIN] = 0.3 + (x / (size - 1)) * 0.5;
  }
}
const hL = effectiveHeight01(samplePackedHeight(packed, size, 0.1, 0.5), 1);
const hR = effectiveHeight01(samplePackedHeight(packed, size, 0.9, 0.5), 1);
assert(sourcePinWorld(0.9, 0.5, hR, tray, heightScale).y > sourcePinWorld(0.1, 0.5, hL, tray, heightScale).y + 0.2, "pins follow heightfield slope");

const marker = createSourceMarker();
const stem = marker.userData.stem as THREE.Mesh;
almost(stem.position.y, SOURCE_PIN_STEM_H * 0.5, 1e-6, "stem centered so base is on the surface");
almost(stem.position.y - SOURCE_PIN_STEM_H / 2, 0, 1e-6, "stem bottom at local y=0");
applySourceMarkerStyle(marker, false, false);
const drop = marker.userData.drop as THREE.Mesh;
almost(drop.scale.x, 1, 1e-6, "idle drop scale");
applySourceMarkerStyle(marker, true, false);
assert(drop.scale.x > 1.1, "selected pin is highlighted");
applySourceMarkerStyle(marker, true, true);
assert(drop.scale.x > 1.25, "dragging pin is stronger highlight");

assert(sourceDragThresholdPx("mouse") === 8, "mouse drag slack");
assert(sourceDragThresholdPx("touch") === 12, "finger drag slack");
assert(!shouldStartSourceDrag(3, "mouse"), "tap must not start a drag");
assert(shouldStartSourceDrag(8, "mouse"), "mouse drag after slack");
assert(!shouldStartSourceDrag(11, "touch"), "finger tap slack");
assert(shouldStartSourceDrag(12, "touch"), "finger drag after slack");
almost(pointerPixelDelta({ x: 10, y: 10 }, { x: 14, y: 13 }), 5, 1e-6, "pixel delta");
assert(sourcePickRadiusPx("touch") > sourcePickRadiusPx("mouse"), "finger pick is generous");
assert(sourcePickRadiusPx("mouse", true) > sourcePickRadiusPx("mouse"), "camera-mode pick is wider");
const head = sourcePinHeadWorld(0.5, 0.5, 0.42, tray, heightScale);
assert(head.y > sourcePinWorld(0.5, 0.5, 0.42, tray, heightScale).y + 0.2, "drop head sits above the plant");

const camera = new THREE.PerspectiveCamera(48, 1, 0.12, 80);
camera.position.set(0, 8, 0.15);
camera.lookAt(0, 1.05, 0);
camera.updateMatrixWorld();
camera.updateProjectionMatrix();
const canvas = { left: 0, top: 0, width: 800, height: 800 };
const flat = (): number => 0.42;
const sources = [
  { id: "a", x: 0.5, y: 0.5 },
  { id: "b", x: 0.2, y: 0.2 },
];
const aWorld = sourcePinWorld(0.5, 0.5, 0.42, tray, heightScale);
const aNdc = aWorld.clone().project(camera);
const ax = canvas.left + (aNdc.x * 0.5 + 0.5) * canvas.width;
const ay = canvas.top + (-aNdc.y * 0.5 + 0.5) * canvas.height;
assert(pickNearestSourceId(ax, ay, canvas, camera, sources, flat, tray, heightScale, 22) === "a", "pick pin under pointer");
assert(pickNearestSourceId(ax + 80, ay, canvas, camera, sources, flat, tray, heightScale, 22) === null, "miss far from pin");
const bWorld = sourcePinWorld(0.2, 0.2, 0.42, tray, heightScale);
const bNdc = bWorld.clone().project(camera);
const bx = (bNdc.x * 0.5 + 0.5) * canvas.width;
const by = (-bNdc.y * 0.5 + 0.5) * canvas.height;
assert(pickNearestSourceId(bx, by, canvas, camera, sources, flat, tray, heightScale, 28) === "b", "pick second pin");

const aimStatePour = surfaceWorld(0.3, 0.6, 0.5, tray, heightScale);
const pinSame = sourcePinWorld(0.3, 0.6, 0.5, tray, heightScale);
almost(aimStatePour.x, pinSame.x, 1e-9, "shared helper x");
almost(aimStatePour.y, pinSame.y, 1e-9, "shared helper y");
almost(aimStatePour.z, pinSame.z, 1e-9, "shared helper z");

const grab = claimSourceGesture({
  tool: "source",
  cameraMode: true,
  hitSourceId: "a",
  draggingSource: null,
});
assert(pinGrabBeatsOrbit(grab), "pin grab wins over camera orbit");
const camEmpty = claimSourceGesture({
  tool: "pour",
  cameraMode: true,
  hitSourceId: null,
  draggingSource: null,
});
assert(camEmpty.orbit && !pinGrabBeatsOrbit(camEmpty), "missed pin still orbits");
assert(allowOneFingerOrbit(true, false) && !allowOneFingerOrbit(true, true), "orbit yields while pin claimed");

console.log("source-pins smoke ok");
