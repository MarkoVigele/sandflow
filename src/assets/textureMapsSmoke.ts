import {
  deriveNormalRoughnessRgba,
  flattenMacroRgba,
  gradeLabRimRgba,
  gradeSandRgba,
  gradeWoodRimRgba,
  luma01,
  makeSeamlessRgba,
  packRoughnessRG,
  prepareSandRgba,
} from "./deriveMaps";
import * as THREE from "three";
import { applyBoxPlankUVs, TRAY_SAND_CLEARANCE } from "../scene/Tray";
import { fbmTiled } from "./noise";
import {
  BAKED_TEXTURE_FILES,
  bakedTextureUrl,
  DEFAULT_TEXTURE_PROMPT,
  gpuAnisotropy,
  gpuTexelBudget,
  labTexelBudget,
  preferBakedSand,
  sandUvScale,
} from "./texturePaths";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

assert(BAKED_TEXTURE_FILES.sandDry === "sand-dry-albedo.jpg", "dry albedo filename");
assert(BAKED_TEXTURE_FILES.sandWet === "sand-wet-albedo.jpg", "wet albedo filename");
assert(BAKED_TEXTURE_FILES.woodRim === "wood-rim.jpg", "wood rim filename");
assert(BAKED_TEXTURE_FILES.labRim === "concrete-albedo.jpg", "lab rim filename");
assert(BAKED_TEXTURE_FILES.concrete === "concrete-albedo.jpg", "concrete albedo filename");
assert(
  BAKED_TEXTURE_FILES.concrete === BAKED_TEXTURE_FILES.labRim,
  "lab rim and Beton share the same jpg",
);

const url = bakedTextureUrl(BAKED_TEXTURE_FILES.sandDry, "./");
assert(url === "./textures/sand-dry-albedo.jpg", `baked url, got ${url}`);
assert(
  bakedTextureUrl(BAKED_TEXTURE_FILES.woodRim, "/sandflow/") ===
    "/sandflow/textures/wood-rim.jpg",
  "pages base url",
);
assert(
  bakedTextureUrl(BAKED_TEXTURE_FILES.labRim, "./") === "./textures/concrete-albedo.jpg",
  "lab rim url",
);
assert(
  bakedTextureUrl(BAKED_TEXTURE_FILES.concrete, "./") === "./textures/concrete-albedo.jpg",
  "concrete url",
);

assert(preferBakedSand(DEFAULT_TEXTURE_PROMPT), "default prompt uses baked sand");
assert(preferBakedSand("  "), "empty prompt uses baked sand");
assert(!preferBakedSand("grober roter Laterit"), "custom prompt skips baked dry");

assert(gpuTexelBudget("medium") === 512, "medium GPU budget");
assert(gpuTexelBudget("low") === 256, "low GPU budget");
assert(labTexelBudget("medium") === 512 && labTexelBudget("high") === 1024, "lab tiers");
assert(gpuAnisotropy("medium") === 2, "medium aniso stays modest");
assert(gpuAnisotropy("high") >= 8, "high aniso uses mips well");
assert(gpuAnisotropy("ultra") >= 8, "ultra aniso");
assert(sandUvScale(0.55) < 3.0, "UV scale below the old stamp repeat");
assert(sandUvScale(0) >= 1.8 && sandUvScale(1) <= 3.0, "UV scale in a grainy but tileable band");
assert(TRAY_SAND_CLEARANCE > 0.02, "rim sits outside the sand plane");

const seamPlank = new Uint8Array(16 * 16 * 4);
for (let y = 0; y < 16; y++) {
  for (let x = 0; x < 16; x++) {
    const i = (y * 16 + x) * 4;
    const dark = x < 3;
    seamPlank[i] = dark ? 48 : 196;
    seamPlank[i + 1] = dark ? 36 : 152;
    seamPlank[i + 2] = dark ? 22 : 96;
    seamPlank[i + 3] = 255;
  }
}
const woodG = gradeWoodRimRgba(seamPlank, 16, 16);
const labG = gradeLabRimRgba(seamPlank, 16, 16);
const woodSeam = luma01(woodG[0]!, woodG[1]!, woodG[2]!);
const labSeam = luma01(labG[0]!, labG[1]!, labG[2]!);
const woodPlankL = luma01(woodG[12 * 4]!, woodG[12 * 4 + 1]!, woodG[12 * 4 + 2]!);
assert(woodSeam < labSeam - 0.04, `wood keeps plank seams (${woodSeam} vs ${labSeam})`);
assert(woodPlankL > woodSeam + 0.12, "wood grade keeps grain contrast");

const box = new THREE.BoxGeometry(4.4, 1.18, 0.3);
applyBoxPlankUVs(box, 4.4, 1.18, 0.3, 2.2, 0.85);
const uv = box.getAttribute("uv");
assert(!!uv && uv.count >= 24, "box plank UVs");
const faceZU = Math.max(uv.getX(16), uv.getX(17), uv.getX(19));
assert(faceZU > 1.5, `long wall U should span planks, got ${faceZU}`);

const wrapA = fbmTiled(0, 0.37, 8, 4, 99);
const wrapB = fbmTiled(1, 0.37, 8, 4, 99);
assert(Math.abs(wrapA - wrapB) < 1e-6, `tiled fbm wraps on U, ${wrapA} vs ${wrapB}`);
const wrapC = fbmTiled(0.4, 0, 8, 4, 99);
const wrapD = fbmTiled(0.4, 1, 8, 4, 99);
assert(Math.abs(wrapC - wrapD) < 1e-6, "tiled fbm wraps on V");

const w = 16;
const h = 16;
const rgba = new Uint8Array(w * h * 4);
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const t = x < w / 2 ? 0 : 1;
    rgba[i] = t ? 220 : 48;
    rgba[i + 1] = t ? 190 : 38;
    rgba[i + 2] = t ? 140 : 28;
    rgba[i + 3] = 255;
  }
}

const maps = deriveNormalRoughnessRgba(rgba, w, h, 2);
assert(maps.normal.length === rgba.length && maps.roughness.length === rgba.length, "map size");

const edge = ((h / 2) * w + (w / 2)) * 4;
const nx = maps.normal[edge]! / 255 * 2 - 1;
const nz = maps.normal[edge + 2]! / 255 * 2 - 1;
assert(nx < -0.05, `step edge should lean -X, nx=${nx}`);
assert(nz > 0.15, `normal Z stays up, nz=${nz}`);

const darkI = ((h / 2) * w + 3) * 4;
const lightI = ((h / 2) * w + 12) * 4;
assert(luma01(rgba[lightI]!, rgba[lightI + 1]!, rgba[lightI + 2]!) > 0.5, "light patch");
assert(maps.roughness[lightI]! > maps.roughness[darkI]!, "darker sand is smoother");

const packed = packRoughnessRG(maps.roughness, maps.roughness);
assert(packed[0] === maps.roughness[0] && packed[1] === maps.roughness[0], "RG pack");

const seam = new Uint8Array(32 * 32 * 4);
for (let y = 0; y < 32; y++) {
  for (let x = 0; x < 32; x++) {
    const i = (y * 32 + x) * 4;
    const onEdge = x < 3 || x > 28 || y < 3 || y > 28;
    seam[i] = onEdge ? 20 : 180;
    seam[i + 1] = onEdge ? 16 : 160;
    seam[i + 2] = onEdge ? 12 : 140;
    seam[i + 3] = 255;
  }
}
const tiled = makeSeamlessRgba(seam, 32, 32, 0.2);
const left = tiled[0]!;
const right = tiled[(0 * 32 + 31) * 4]!;
assert(Math.abs(left - right) < 8, `seamless X edges match (${left} vs ${right})`);
const top = tiled[0]!;
const bot = tiled[(31 * 32 + 0) * 4]!;
assert(Math.abs(top - bot) < 12, `seamless Y edges match (${top} vs ${bot})`);

const vignette = new Uint8Array(32 * 32 * 4);
for (let y = 0; y < 32; y++) {
  for (let x = 0; x < 32; x++) {
    const i = (y * 32 + x) * 4;
    const dx = (x - 16) / 16;
    const dy = (y - 16) / 16;
    const v = Math.max(0, 1 - Math.hypot(dx, dy) * 0.7);
    vignette[i] = 80 + v * 140;
    vignette[i + 1] = 70 + v * 120;
    vignette[i + 2] = 50 + v * 90;
    vignette[i + 3] = 255;
  }
}
const flat = flattenMacroRgba(vignette, 32, 32, 8);
const edgeL = luma01(flat[0]!, flat[1]!, flat[2]!);
const midL = luma01(flat[(16 * 32 + 16) * 4]!, flat[(16 * 32 + 16) * 4 + 1]!, flat[(16 * 32 + 16) * 4 + 2]!);
assert(Math.abs(edgeL - midL) < 0.18, `macro flatten evens vignette (${edgeL} vs ${midL})`);

const graded = gradeSandRgba(rgba, w, h, "wet");
assert(
  luma01(graded[lightI]!, graded[lightI + 1]!, graded[lightI + 2]!) <
    luma01(rgba[lightI]!, rgba[lightI + 1]!, rgba[lightI + 2]!),
  "wet grade darkens",
);

const dryGraded = gradeSandRgba(rgba, w, h, "dry");
const dryL = luma01(dryGraded[lightI]!, dryGraded[lightI + 1]!, dryGraded[lightI + 2]!);
const wetL = luma01(graded[lightI]!, graded[lightI + 1]!, graded[lightI + 2]!);
assert(dryL > wetL + 0.12, `dry grade stays brighter than wet (${dryL} vs ${wetL})`);
assert(
  dryGraded[lightI]! > 200 && dryGraded[lightI + 2]! > dryGraded[lightI + 1]! * 0.68,
  `dry grade target is cream-gold, not burnt orange (${dryGraded[lightI]}, ${dryGraded[lightI + 2]})`,
);

const prepared = prepareSandRgba(seam, 32, 32, "dry");
assert(prepared.length === seam.length, "prepare keeps size");
const pLeft = prepared[0]!;
const pRight = prepared[(31) * 4]!;
assert(Math.abs(pLeft - pRight) < 18, "prepared dry still wraps");

console.log("textureMapsSmoke ok");
