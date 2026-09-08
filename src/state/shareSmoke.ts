import { DEFAULT_PARAMS } from "./types";
import {
  SHARE_HASH_GRID,
  SHARE_PREFIX,
  b64UrlToBytes,
  b64UrlToText,
  buildSharePayload,
  bytesToB64Url,
  compactShareForHash,
  decodeHeightField,
  dequantizeHeight,
  encodeShareHash,
  parseAnyScene,
  parseShareHash,
  parseSharePayload,
  quantizeHeight,
  sanitizeQuality,
  shareSources,
  textToB64Url,
} from "./share";

function fail(msg: string): never {
  console.error(msg);
  throw new Error(msg);
}

function almost(a: number, b: number, eps: number, label: string): void {
  if (Math.abs(a - b) > eps) fail(`${label}: ${a} ≠ ${b}`);
}

const srcSize = 32;
const terrain = new Float32Array(srcSize * srcSize);
for (let y = 0; y < srcSize; y++) {
  for (let x = 0; x < srcSize; x++) {
    terrain[y * srcSize + x] = 0.2 + 0.6 * (x / (srcSize - 1)) * (y / (srcSize - 1));
  }
}

const q = quantizeHeight(terrain, srcSize, 16);
if (q.length !== 16 * 16) fail(`quantize size ${q.length}`);
const back = dequantizeHeight(q, 16, srcSize);
almost(back[0], terrain[0], 0.08, "dequant corner");
almost(back[back.length - 1], terrain[terrain.length - 1], 0.08, "dequant far");

const mid = ((srcSize / 2) | 0) * srcSize + ((srcSize / 2) | 0);
almost(back[mid], terrain[mid], 0.08, "dequant mid");

const packed = bytesToB64Url(q);
const round = b64UrlToBytes(packed);
if (round.length !== q.length) fail("b64 length");
for (let i = 0; i < q.length; i++) {
  if (round[i] !== q[i]) fail(`b64 byte ${i}`);
}

const phrase = "Sandflow Teilen";
if (b64UrlToText(textToB64Url(phrase)) !== phrase) fail("text b64");

const payload = buildSharePayload(
  {
    presetId: "slope",
    quality: "medium",
    speed: 8,
    params: { ...DEFAULT_PARAMS, grain: 0.44 },
    sources: [{ id: "a", x: 0.5, y: 0.12, rate: 1.7 }],
    texturePrompt: "grober Laterit",
    camera: { position: [6, 5, 7], target: [0, 0.5, 0] },
    props: [{ u: 0.4, v: 0.6, s: 0.07, r: 1.2, k: 2 }],
    terrain,
    water: new Float32Array(srcSize * srcSize),
    size: srcSize,
  },
  SHARE_HASH_GRID,
  false,
);

if (payload.v !== 2) fail("version");
if (!payload.h || payload.hn !== SHARE_HASH_GRID) fail("height missing");
if (payload.w) fail("hash payload should omit water when asked");
if (payload.props?.[0].k !== 2) fail("prop kind");

const hash = encodeShareHash(payload);
if (!hash.startsWith(SHARE_PREFIX)) fail("prefix");
const parsed = parseShareHash(`#${hash}`);
if (!parsed) fail("parse hash");
const parsedEncoded = parseShareHash(`#${encodeURIComponent(hash)}`);
if (!parsedEncoded || parsedEncoded.preset !== "slope") fail("encoded hash roundtrip");
if (parsed.preset !== "slope" || parsed.speed !== 8) fail("hash fields");
if (parsed.params.grain !== 0.44) fail("params");
if (parsed.prompt !== "grober Laterit") fail("prompt umlaut/text");
if (parsed.quality !== "medium") fail("quality");
if (!parsed.camera || parsed.camera.p[0] !== 6) fail("camera");
if (sanitizeQuality("nope") !== "high") fail("sanitize quality");
if (sanitizeQuality("medium") !== "medium") fail("keep quality");
const srcs = shareSources(parsed);
if (srcs.length !== 1 || Math.abs(srcs[0].x - 0.5) > 1e-6) fail("sources");
const decoded = decodeHeightField(parsed.h, parsed.hn, srcSize);
if (!decoded || decoded.length !== terrain.length) fail("decode height");
almost(decoded[mid], terrain[mid], 0.1, "hash height mid");

const compact = compactShareForHash({
  presetId: "flat",
  quality: "low",
  speed: 1,
  params: DEFAULT_PARAMS,
  sources: [],
  texturePrompt: "fein",
  props: [],
});
if (compact.omittedHeight) fail("empty height should not omit");
if (!parseShareHash(compact.hash)) fail("compact hash");

const compactH = compactShareForHash({
  presetId: "slope",
  quality: "medium",
  speed: 1,
  params: DEFAULT_PARAMS,
  sources: [{ id: "a", x: 0.5, y: 0.12, rate: 1.7 }],
  texturePrompt: "feiner Quarzsand, warm, trocken",
  camera: { position: [6, 5, 7], target: [0, 0.5, 0] },
  props: [{ u: 0.4, v: 0.6, s: 0.07, r: 1.2, k: 2 }],
  terrain,
  size: srcSize,
});
if (compactH.omittedHeight) fail("typical 64² height should stay in the hash");
const kept = parseShareHash(compactH.hash);
if (!kept?.h || kept.hn !== SHARE_HASH_GRID) fail("compact hash keeps height");
const keptH = decodeHeightField(kept.h, kept.hn, srcSize);
if (!keptH) fail("compact height decodes");
almost(keptH[mid], terrain[mid], 0.1, "compact height mid");

const anyV2 = parseAnyScene(JSON.stringify(payload));
if (anyV2.kind !== "v2") fail("any v2");

const v1 = {
  version: 1 as const,
  name: "x",
  quality: "high" as const,
  params: DEFAULT_PARAMS,
  presetId: "flat",
  size: 2,
  terrainB64: "",
  waterB64: "",
  wetnessB64: "",
  sources: [],
  texturePrompt: "",
};
try {
  parseSharePayload(v1);
  fail("v1 must not parse as share");
} catch {
  /* expected */
}

try {
  parseShareHash("#nope");
} catch {
  fail("bad hash should be null, not throw");
}
if (parseShareHash("#nope") !== null) fail("bad hash null");

console.log(
  JSON.stringify({
    hashChars: hash.length,
    grid: SHARE_HASH_GRID,
    grain: parsed.params.grain,
    props: parsed.props?.length,
  }),
);
console.log("share smoke ok");
