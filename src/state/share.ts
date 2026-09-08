import { countHardCells, HARD_THRESHOLD, resampleMask } from "../sim/mapsContract";
import { resampleHeight } from "../sim/presets";
import type { CameraPose } from "../sim/presets";
import type { SceneFile } from "./persist";
import { parseScene } from "./persist";
import {
  DEFAULT_PARAMS,
  type QualityId,
  type SimParams,
  type SourceKind,
  type WaterSource,
} from "./types";

const QUALITIES: QualityId[] = ["low", "medium", "high", "ultra"];

export function sanitizeQuality(value: unknown, fallback: QualityId = "high"): QualityId {
  return QUALITIES.includes(value as QualityId) ? (value as QualityId) : fallback;
}

export const SHARE_PREFIX = "sf2.";
export const SHARE_HASH_GRID = 64;
export const SHARE_FILE_GRID = 128;
/** Outer b64 of JSON that already embeds a 64² height. 7.8k dropped typical scenes. */
export const SHARE_HASH_SOFT_LIMIT = 12000;

export interface ShareProp {
  u: number;
  v: number;
  s: number;
  r: number;
  k: number;
}

export interface SharePayload {
  v: 2;
  preset: string;
  quality: QualityId;
  speed: number;
  params: SimParams;
  sources: Array<{ x: number; y: number; rate: number; kind?: SourceKind; spread?: number }>;
  prompt: string;
  camera?: { p: [number, number, number]; t: [number, number, number] };
  props?: ShareProp[];
  hn?: number;
  h?: string;
  wn?: number;
  w?: string;
  mn?: number;
  m?: string;
}

export interface ShareBuildInput {
  presetId: string;
  quality: QualityId;
  speed: number;
  params: SimParams;
  sources: WaterSource[];
  texturePrompt: string;
  camera?: CameraPose;
  props?: ShareProp[];
  terrain?: Float32Array;
  water?: Float32Array;
  hardmask?: Float32Array;
  size?: number;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function finite01(n: unknown, fallback: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return clamp01(v);
}

function finiteRate(n: unknown, fallback = 1.5): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return fallback;
  return Math.min(8, v);
}

function asGridSize(n: unknown): number | undefined {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 2 || v > 1024) return undefined;
  return v | 0;
}

function isVec3(v: unknown): v is [number, number, number] {
  return Array.isArray(v) && v.length === 3 && v.every((x) => Number.isFinite(Number(x)));
}

function sanitizeParams(raw: unknown): SimParams {
  const src = raw && typeof raw === "object" ? (raw as Partial<SimParams>) : {};
  const out = { ...DEFAULT_PARAMS };
  (Object.keys(DEFAULT_PARAMS) as Array<keyof SimParams>).forEach((key) => {
    const n = Number(src[key]);
    if (Number.isFinite(n)) out[key] = n;
  });
  return compactParams(out);
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function bytesToB64Url(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function b64UrlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function textToB64Url(text: string): string {
  return bytesToB64Url(new TextEncoder().encode(text));
}

export function b64UrlToText(s: string): string {
  return new TextDecoder().decode(b64UrlToBytes(s));
}

export function quantizeHeight(src: Float32Array, srcSize: number, dstSize: number): Uint8Array {
  const resampled = resampleHeight(src, srcSize, dstSize);
  const out = new Uint8Array(dstSize * dstSize);
  for (let i = 0; i < out.length; i++) {
    out[i] = Math.round(clamp01(resampled[i]) * 255);
  }
  return out;
}

export function quantizeMask(src: Float32Array, srcSize: number, dstSize: number): Uint8Array {
  const resampled = resampleMask(src, srcSize, dstSize);
  const out = new Uint8Array(dstSize * dstSize);
  for (let i = 0; i < out.length; i++) {
    out[i] = resampled[i] >= HARD_THRESHOLD ? 255 : 0;
  }
  return out;
}

export function dequantizeMask(q: Uint8Array, srcSize: number, dstSize: number): Float32Array {
  const f = new Float32Array(srcSize * srcSize);
  const n = Math.min(f.length, q.length);
  for (let i = 0; i < n; i++) f[i] = q[i] >= 128 ? 1 : 0;
  return resampleMask(f, srcSize, dstSize);
}

export function dequantizeHeight(q: Uint8Array, srcSize: number, dstSize: number): Float32Array {
  const f = new Float32Array(srcSize * srcSize);
  const n = Math.min(f.length, q.length);
  for (let i = 0; i < n; i++) f[i] = q[i] / 255;
  return resampleHeight(f, srcSize, dstSize);
}

function compactParams(p: SimParams): SimParams {
  return {
    grain: round3(p.grain),
    cohesion: round3(p.cohesion),
    infiltration: round3(p.infiltration),
    erosionRate: round3(p.erosionRate),
    sedimentCapacity: round3(p.sedimentCapacity),
    deposition: round3(p.deposition),
    evaporation: round3(p.evaporation),
    flowRate: round3(p.flowRate),
  };
}

function compactProps(props: ShareProp[] | undefined): ShareProp[] | undefined {
  if (!props?.length) return undefined;
  return props.map((p) => ({
    u: round3(p.u),
    v: round3(p.v),
    s: round3(p.s),
    r: round3(p.r),
    k: p.k | 0,
  }));
}

export function buildSharePayload(input: ShareBuildInput, grid: number, includeWater: boolean): SharePayload {
  const payload: SharePayload = {
    v: 2,
    preset: input.presetId,
    quality: input.quality,
    speed: input.speed,
    params: compactParams(input.params),
    sources: input.sources.map((s) => {
      const out: SharePayload["sources"][number] = {
        x: round3(s.x),
        y: round3(s.y),
        rate: round3(s.rate),
      };
      if (s.kind === "rain") {
        out.kind = "rain";
        if (s.spread != null) out.spread = round3(s.spread);
      }
      return out;
    }),
    prompt: input.texturePrompt.slice(0, 80),
    props: compactProps(input.props),
  };
  if (input.camera) {
    payload.camera = {
      p: input.camera.position.map(round3) as [number, number, number],
      t: input.camera.target.map(round3) as [number, number, number],
    };
  }
  if (input.terrain && input.size) {
    payload.hn = grid;
    payload.h = bytesToB64Url(quantizeHeight(input.terrain, input.size, grid));
  }
  if (includeWater && input.water && input.size) {
    payload.wn = grid;
    payload.w = bytesToB64Url(quantizeHeight(input.water, input.size, grid));
  }
  if (input.hardmask && input.size && countHardCells(input.hardmask) > 0) {
    payload.mn = grid;
    payload.m = bytesToB64Url(quantizeMask(input.hardmask, input.size, grid));
  }
  return payload;
}

export function encodeShareHash(payload: SharePayload): string {
  return SHARE_PREFIX + textToB64Url(JSON.stringify(payload));
}

export function parseSharePayload(data: unknown): SharePayload {
  if (!data || typeof data !== "object") throw new Error("Unbekanntes Szenenformat");
  const raw = data as Partial<SharePayload> & { version?: number };
  const version = raw.v ?? raw.version;
  if (version !== 2) throw new Error("Unbekanntes Szenenformat");
  if (!raw.preset || !raw.params || !Array.isArray(raw.sources)) {
    throw new Error("Unbekanntes Szenenformat");
  }
  const camera =
    raw.camera && isVec3(raw.camera.p) && isVec3(raw.camera.t)
      ? {
          p: raw.camera.p.map((n) => Number(n)) as [number, number, number],
          t: raw.camera.t.map((n) => Number(n)) as [number, number, number],
        }
      : undefined;
  return {
    v: 2,
    preset: String(raw.preset),
    quality: sanitizeQuality(raw.quality),
    speed: typeof raw.speed === "number" && Number.isFinite(raw.speed) ? raw.speed : 1,
    params: sanitizeParams(raw.params),
    sources: raw.sources.map((s) => ({
      x: finite01(s?.x, 0.5),
      y: finite01(s?.y, 0.12),
      rate: finiteRate(s?.rate),
      kind: s?.kind === "rain" ? "rain" : undefined,
      spread: s?.spread != null ? finite01(s.spread, 0.4) : undefined,
    })),
    prompt: String(raw.prompt ?? "").slice(0, 80),
    camera,
    props: raw.props,
    hn: asGridSize(raw.hn),
    h: raw.h,
    wn: asGridSize(raw.wn),
    w: raw.w,
    mn: asGridSize(raw.mn),
    m: raw.m,
  };
}

export function parseShareHash(hash: string): SharePayload | null {
  let raw = hash.startsWith("#") ? hash.slice(1) : hash;
  try {
    raw = decodeURIComponent(raw);
  } catch {
    /* already decoded or malformed — try as-is */
  }
  if (!raw.startsWith(SHARE_PREFIX)) return null;
  try {
    return parseSharePayload(JSON.parse(b64UrlToText(raw.slice(SHARE_PREFIX.length))));
  } catch {
    return null;
  }
}

export function decodeHeightField(b64: string | undefined, srcSize: number | undefined, dstSize: number): Float32Array | null {
  const n = asGridSize(srcSize);
  if (!b64 || !n) return null;
  try {
    return dequantizeHeight(b64UrlToBytes(b64), n, dstSize);
  } catch {
    return null;
  }
}

export function decodeMaskField(b64: string | undefined, srcSize: number | undefined, dstSize: number): Float32Array | null {
  const n = asGridSize(srcSize);
  if (!b64 || !n) return null;
  try {
    return dequantizeMask(b64UrlToBytes(b64), n, dstSize);
  } catch {
    return null;
  }
}

export function shareSources(share: SharePayload): WaterSource[] {
  return share.sources.map((s, i) => ({
    id: `s-share-${i}`,
    x: finite01(s.x, 0.5),
    y: finite01(s.y, 0.12),
    rate: finiteRate(s.rate),
    kind: s.kind === "rain" ? "rain" : undefined,
    spread: s.spread != null ? finite01(s.spread, 0.4) : undefined,
  }));
}

export function shareCamera(share: SharePayload): CameraPose | undefined {
  if (!isVec3(share.camera?.p) || !isVec3(share.camera?.t)) return undefined;
  return {
    position: share.camera.p.map(Number) as [number, number, number],
    target: share.camera.t.map(Number) as [number, number, number],
  };
}

/** Decode maps + sources for a quality grid. Used by App.applyShare and smoke tests. */
export function decodeShareScene(share: SharePayload, grid: number): {
  terrain: Float32Array | null;
  water: Float32Array | null;
  hardmask: Float32Array | null;
  sources: WaterSource[];
  camera: CameraPose | undefined;
} {
  return {
    terrain: decodeHeightField(share.h, share.hn, grid),
    water: decodeHeightField(share.w, share.wn, grid),
    hardmask: decodeMaskField(share.m, share.mn, grid),
    sources: shareSources(share),
    camera: shareCamera(share),
  };
}

export function compactShareForHash(input: ShareBuildInput): { hash: string; omittedHeight: boolean } {
  const full = buildSharePayload(input, SHARE_HASH_GRID, false);
  let hash = encodeShareHash(full);
  if (hash.length <= SHARE_HASH_SOFT_LIMIT) return { hash, omittedHeight: false };
  const slim = { ...full };
  delete slim.m;
  delete slim.mn;
  hash = encodeShareHash(slim);
  if (hash.length <= SHARE_HASH_SOFT_LIMIT) return { hash, omittedHeight: false };
  delete slim.h;
  delete slim.hn;
  delete slim.w;
  delete slim.wn;
  hash = encodeShareHash(slim);
  return { hash, omittedHeight: !!full.h };
}

export type LoadedScene =
  | { kind: "v1"; file: SceneFile }
  | { kind: "v2"; share: SharePayload };

export function parseAnyScene(json: string): LoadedScene {
  const data = JSON.parse(json) as { version?: number; v?: number };
  if (data.v === 2 || data.version === 2) {
    return { kind: "v2", share: parseSharePayload(data) };
  }
  return { kind: "v1", file: parseScene(json) };
}

export function shareHref(hashBody: string): string {
  const base = typeof location === "undefined" ? "" : `${location.origin}${location.pathname}${location.search}`;
  return `${base}#${hashBody}`;
}
