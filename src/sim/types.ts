import type { SimParams, WaterSource } from "../state/types";

export type BrushKind =
  | "pile"
  | "dig"
  | "smooth"
  | "dam"
  | "tamp"
  | "groove"
  | "flatten"
  | "concrete"
  | "soft";

export type WorkerIn =
  | {
      type: "init";
      size: number;
      params: SimParams;
      terrain: Float32Array;
      water?: Float32Array;
      wetness?: Float32Array;
      sediment?: Float32Array;
      cohesion?: Float32Array;
      hardmask?: Float32Array;
      sources: WaterSource[];
    }
  | { type: "step"; steps: number }
  | { type: "setParams"; params: Partial<SimParams> }
  | {
      type: "brush";
      kind: BrushKind;
      x: number;
      y: number;
      radius: number;
      strength: number;
    }
  | { type: "pour"; x: number; y: number; amount: number }
  | { type: "addSource"; source: WaterSource }
  | { type: "moveSource"; id: string; x: number; y: number }
  | { type: "removeSource"; id: string }
  | { type: "setSourceRate"; id: string; rate: number }
  | { type: "resetWater" }
  | { type: "flattenAll" }
  | {
      type: "replaceTerrain";
      terrain: Float32Array;
      water?: Float32Array;
      wetness?: Float32Array;
      cohesion?: Float32Array;
      hardmask?: Float32Array;
      sources: WaterSource[];
    }
  | { type: "requestSnapshot" };

export type WorkerOut =
  | {
      type: "frame";
      size: number;
      packed: Float32Array;
      particles: Float32Array;
      waterVolume: number;
      erodedSand: number;
      /** Companion hardmask; sent only when dirty so RGBA frames stay cheap. */
      hard?: Float32Array;
    }
  | {
      type: "snapshot";
      size: number;
      terrain: Float32Array;
      water: Float32Array;
      wetness: Float32Array;
      sediment: Float32Array;
      cohesion: Float32Array;
      hardmask: Float32Array;
      sources: WaterSource[];
      erodedSand: number;
    };

export type { PackedMaps } from "./mapsContract";
export { unpackRgba } from "./mapsContract";
