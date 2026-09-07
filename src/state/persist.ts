import type { SimParams, QualityId, WaterSource } from "./types";

export interface SceneFile {
  version: 1;
  name: string;
  quality: QualityId;
  params: SimParams;
  presetId: string;
  size: number;
  terrainB64: string;
  waterB64: string;
  wetnessB64: string;
  sources: WaterSource[];
  texturePrompt: string;
}

function f32ToB64(data: Float32Array): string {
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function b64ToF32(b64: string): Float32Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

export function encodeScene(file: Omit<SceneFile, "version">): SceneFile {
  return { version: 1, ...file };
}

export function toJson(file: SceneFile): string {
  return JSON.stringify(file);
}

export function parseScene(json: string): SceneFile {
  const data = JSON.parse(json) as SceneFile;
  if (data.version !== 1) throw new Error("Unbekanntes Szenenformat");
  return data;
}

export function packMaps(terrain: Float32Array, water: Float32Array, wetness: Float32Array) {
  return {
    terrainB64: f32ToB64(terrain),
    waterB64: f32ToB64(water),
    wetnessB64: f32ToB64(wetness),
  };
}

export function unpackMaps(file: SceneFile) {
  return {
    terrain: b64ToF32(file.terrainB64),
    water: b64ToF32(file.waterB64),
    wetness: b64ToF32(file.wetnessB64),
  };
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadText(filename: string, text: string, mime: string): void {
  downloadBlob(filename, new Blob([text], { type: mime }));
}

export function downloadDataUrl(filename: string, dataUrl: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}
