import {
  deriveNormalRoughnessRgba,
  flattenMacroRgba,
  gradeSandRgba,
  luma01,
  makeSeamlessRgba,
  packRoughnessRG,
  prepareSandRgba,
} from "./deriveMaps";
import { fbmTiled } from "./noise";
import { TRAY_SAND_CLEARANCE } from "../scene/Tray";
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

const prepared = prepareSandRgba(seam, 32, 32, "dry");
assert(prepared.length === seam.length, "prepare keeps size");
const pLeft = prepared[0]!;
const pRight = prepared[(31) * 4]!;
assert(Math.abs(pLeft - pRight) < 18, "prepared dry still wraps");

console.log("textureMapsSmoke ok");
