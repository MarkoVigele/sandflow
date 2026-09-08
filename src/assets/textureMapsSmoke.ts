import {
  deriveNormalRoughnessRgba,
  luma01,
  packRoughnessRG,
} from "./deriveMaps";
import {
  BAKED_TEXTURE_FILES,
  bakedTextureUrl,
  DEFAULT_TEXTURE_PROMPT,
  preferBakedSand,
} from "./texturePaths";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

assert(BAKED_TEXTURE_FILES.sandDry === "sand-dry-albedo.jpg", "dry albedo filename");
assert(BAKED_TEXTURE_FILES.sandWet === "sand-wet-albedo.jpg", "wet albedo filename");
assert(BAKED_TEXTURE_FILES.woodRim === "wood-rim.jpg", "wood rim filename");

const url = bakedTextureUrl(BAKED_TEXTURE_FILES.sandDry, "./");
assert(url === "./textures/sand-dry-albedo.jpg", `baked url, got ${url}`);
assert(
  bakedTextureUrl(BAKED_TEXTURE_FILES.woodRim, "/sandflow/") ===
    "/sandflow/textures/wood-rim.jpg",
  "pages base url",
);

assert(preferBakedSand(DEFAULT_TEXTURE_PROMPT), "default prompt uses baked sand");
assert(preferBakedSand("  "), "empty prompt uses baked sand");
assert(!preferBakedSand("grober roter Laterit"), "custom prompt skips baked dry");

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

console.log("textureMapsSmoke ok");
