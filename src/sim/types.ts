import type { SimParams, WaterSource } from "../state/types";

export type BrushKind = "pile" | "dig" | "smooth" | "dam";

export type WorkerIn =
  | {
      type: "init";
      size: number;
      params: SimParams;
      terrain: Float32Array;
      water?: Float32Array;
      wetness?: Float32Array;
      sediment?: Float32Array;
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
  | {
      type: "replaceTerrain";
      terrain: Float32Array;
      water?: Float32Array;
      wetness?: Float32Array;
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
    }
  | {
      type: "snapshot";
      size: number;
      terrain: Float32Array;
      water: Float32Array;
      wetness: Float32Array;
      sediment: Float32Array;
      sources: WaterSource[];
      erodedSand: number;
    };

export interface PackedMaps {
  terrain: Float32Array;
  water: Float32Array;
  wetness: Float32Array;
  flow: Float32Array;
}

export function unpackRgba(
  packed: Float32Array,
  size: number,
): PackedMaps {
  const n = size * size;
  const terrain = new Float32Array(n);
  const water = new Float32Array(n);
  const wetness = new Float32Array(n);
  const flow = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    terrain[i] = packed[o];
    water[i] = packed[o + 1];
    wetness[i] = packed[o + 2];
    flow[i] = packed[o + 3];
  }
  return { terrain, water, wetness, flow };
}
