import { packMapsRgba } from "./mapsContract";
import {
  captureCompareSnap,
  clampWipe,
  compareSnapFromFields,
  cycleCompareMode,
  packCompareSnap,
  pickCompareSample,
  resampleCompareSnap,
} from "./compare";
import {
  decodeGrayPng,
  decodeHeightBytes,
  decodeHeightPng,
  decodeHeightRaw,
  encodeGrayPng16,
  encodeHeightPng16,
  encodeHeightPng8,
  encodeHeightRaw,
  heightToU16,
  heightToU8,
  heightmapFilename,
  inferGridSize,
  isPngBuffer,
  lumaToHeight,
  u16ToHeight,
  u8ToHeight,
} from "./heightmap";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function almost(a: number, b: number, eps: number, msg: string): void {
  if (Math.abs(a - b) > eps) throw new Error(`${msg}: ${a} vs ${b}`);
}

const size = 8;
const terrain = new Float32Array(size * size);
const water = new Float32Array(size * size);
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    terrain[y * size + x] = x / (size - 1);
    water[y * size + x] = y === 3 && x === 4 ? 0.22 : 0;
  }
}
const packed = packMapsRgba(terrain, water, new Float32Array(size * size), new Float32Array(size * size));
const snap = captureCompareSnap(packed, size);
assert(!!snap && snap.size === 8, "capture size");
assert(snap!.terrain[7] > 0.9 && snap!.terrain[0] < 0.05, "capture rising bed");
assert(snap!.water[3 * size + 4] > 0.2, "capture water mask");
assert(captureCompareSnap(new Float32Array(4), 8) === null, "reject undersized pack");

const fields = compareSnapFromFields(4, new Float32Array(16).fill(0.5));
assert(!!fields && fields.water[0] === 0 && fields.terrain[3] === 0.5, "fields default water");

const big = resampleCompareSnap(snap!, 16);
assert(big.size === 16 && big.terrain.length === 256, "resample 8→16");
almost(big.terrain[0], 0, 0.08, "resample left");
almost(big.terrain[15], 1, 0.08, "resample right");

const packedSnap = packCompareSnap(snap!);
assert(packedSnap[0] === snap!.terrain[0] && packedSnap[1] === snap!.water[0], "pack compare RGBA");

assert(clampWipe(-1) === 0 && clampWipe(2) === 1 && clampWipe(0.4) === 0.4, "wipe clamp");
assert(cycleCompareMode("off", false) === "off", "no snap stays off");
assert(cycleCompareMode("off", true) === "wipe", "off→wipe");
assert(cycleCompareMode("wipe", true) === "before", "wipe→before");
assert(cycleCompareMode("before", true) === "off", "before→off");

const live = { h: 0.2, w: 0.5 };
const before = { h: 0.8, w: 0.0 };
assert(pickCompareSample("off", 0.5, 0.1, live, before).h === 0.2, "off uses live");
assert(pickCompareSample("before", 0.5, 0.9, live, before).h === 0.8, "before uses snap");
assert(pickCompareSample("wipe", 0.4, 0.2, live, before).h === 0.8, "wipe left is before");
assert(pickCompareSample("wipe", 0.4, 0.7, live, before).w === 0.5, "wipe right is live");

assert(inferGridSize(256) === 16 && inferGridSize(15) === null, "grid infer");
const u8 = heightToU8(new Float32Array([0, 0.5, 1]));
assert(u8[0] === 0 && u8[2] === 255 && u8[1] >= 126 && u8[1] <= 128, "u8 quant");
almost(u8ToHeight(u8)[2]!, 1, 1e-6, "u8 roundtrip high");
const u16 = heightToU16(new Float32Array([0, 0.25, 1]));
assert(u16[0] === 0 && u16[2] === 65535, "u16 quant");
almost(u16ToHeight(u16)[1]!, 0.25, 2 / 65535, "u16 mid");

const png16 = encodeHeightPng16(terrain, size);
assert(isPngBuffer(png16), "png16 signature");
const back16 = decodeHeightPng(png16);
assert(back16?.size === 8, "png16 size");
almost(back16!.terrain[7]!, 1, 2 / 65535, "png16 high");
almost(back16!.terrain[0]!, 0, 2 / 65535, "png16 low");
const decoded16 = decodeGrayPng(png16);
assert(decoded16?.bitDepth === 16, "png16 depth");

const png8 = encodeHeightPng8(terrain, size);
const back8 = decodeHeightPng(png8);
assert(back8?.size === 8, "png8 size");
almost(back8!.terrain[size - 1]!, 1, 1 / 255, "png8 high");

const raw = encodeHeightRaw(terrain, size);
const backRaw = decodeHeightRaw(raw);
assert(backRaw?.size === 8 && backRaw.terrain[4] === terrain[4], "raw header roundtrip");
const plain = new Uint8Array(terrain.buffer.slice(0));
const backPlain = decodeHeightRaw(plain);
assert(backPlain?.size === 8 && backPlain.terrain[10] === terrain[10], "raw bare floats");

assert(decodeHeightBytes(png16)?.size === 8, "bytes png");
assert(decodeHeightBytes(raw)?.size === 8, "bytes raw");

const rgba = new Uint8ClampedArray(4 * 4);
rgba[0] = 255;
rgba[1] = 255;
rgba[2] = 255;
rgba[4] = 0;
rgba[5] = 0;
rgba[6] = 0;
const luma = lumaToHeight(rgba, 2, 2);
almost(luma[0]!, 1, 1e-4, "luma white");
almost(luma[1]!, 0, 1e-4, "luma black");

assert(
  heightmapFilename(512, "png16", new Date("2026-09-08T16:54:00.000Z")) ===
    "sandflow-height-512-2026-09-08-16-54-00.png",
  "png16 name",
);
assert(heightmapFilename(128, "raw", new Date("2026-09-08T16:54:00.000Z")).endsWith(".r32"), "raw name");
assert(encodeGrayPng16(heightToU16(terrain), size).length > 40, "gray16 helper");

console.log("compare smoke ok");
