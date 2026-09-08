import type { SimParams, WaterSource } from "../state/types";
import type { BrushKind, WorkerIn, WorkerOut } from "./types";

export interface SimFrame {
  size: number;
  packed: Float32Array;
  particles: Float32Array;
  waterVolume: number;
  erodedSand: number;
  hard?: Float32Array;
}

export interface SimSnapshot {
  size: number;
  terrain: Float32Array;
  water: Float32Array;
  wetness: Float32Array;
  sediment: Float32Array;
  cohesion: Float32Array;
  hardmask?: Float32Array;
  sources: WaterSource[];
  erodedSand: number;
}

export class SimClient {
  private worker: Worker;
  busy = false;
  private frameHandlers = new Set<(f: SimFrame) => void>();
  private snapWaiters: Array<(s: SimSnapshot) => void> = [];

  constructor() {
    this.worker = new Worker(new URL("./erosion.worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = (ev: MessageEvent<WorkerOut>) => {
      const msg = ev.data;
      if (msg.type === "frame") {
        this.busy = false;
        const frame: SimFrame = {
          size: msg.size,
          packed: msg.packed,
          particles: msg.particles,
          waterVolume: msg.waterVolume,
          erodedSand: msg.erodedSand,
          hard: msg.hard,
        };
        for (const h of this.frameHandlers) h(frame);
      } else if (msg.type === "snapshot") {
        const snap: SimSnapshot = {
          size: msg.size,
          terrain: msg.terrain,
          water: msg.water,
          wetness: msg.wetness,
          sediment: msg.sediment,
          cohesion: msg.cohesion,
          hardmask: msg.hardmask,
          sources: msg.sources,
          erodedSand: msg.erodedSand,
        };
        const waiters = this.snapWaiters.splice(0);
        for (const w of waiters) w(snap);
      }
    };
  }

  onFrame(handler: (f: SimFrame) => void): () => void {
    this.frameHandlers.add(handler);
    return () => this.frameHandlers.delete(handler);
  }

  send(msg: WorkerIn): void {
    this.worker.postMessage(msg);
  }

  init(
    size: number,
    params: SimParams,
    terrain: Float32Array,
    sources: WaterSource[],
    extras?: {
      water?: Float32Array;
      wetness?: Float32Array;
      sediment?: Float32Array;
      cohesion?: Float32Array;
      hardmask?: Float32Array;
    },
  ): void {
    this.busy = true;
    this.send({
      type: "init",
      size,
      params,
      terrain,
      water: extras?.water,
      wetness: extras?.wetness,
      sediment: extras?.sediment,
      cohesion: extras?.cohesion,
      hardmask: extras?.hardmask,
      sources,
    });
  }

  step(steps: number): void {
    if (this.busy) return;
    this.busy = true;
    this.send({ type: "step", steps });
  }

  setParams(params: Partial<SimParams>): void {
    this.send({ type: "setParams", params });
  }

  brush(kind: BrushKind, x: number, y: number, radius: number, strength: number): void {
    this.send({ type: "brush", kind, x, y, radius, strength });
  }

  pour(x: number, y: number, amount: number): void {
    this.send({ type: "pour", x, y, amount });
  }

  addSource(source: WaterSource): void {
    this.send({ type: "addSource", source });
  }

  moveSource(id: string, x: number, y: number): void {
    this.send({ type: "moveSource", id, x, y });
  }

  removeSource(id: string): void {
    this.send({ type: "removeSource", id });
  }

  setSourceRate(id: string, rate: number): void {
    this.send({ type: "setSourceRate", id, rate });
  }

  resetWater(): void {
    this.send({ type: "resetWater" });
  }

  flattenAll(): void {
    this.send({ type: "flattenAll" });
  }

  replaceTerrain(
    terrain: Float32Array,
    sources: WaterSource[],
    water?: Float32Array,
    wetness?: Float32Array,
    hardmask?: Float32Array,
  ): void {
    this.busy = true;
    this.send({ type: "replaceTerrain", terrain, sources, water, wetness, hardmask });
  }

  requestSnapshot(): Promise<SimSnapshot> {
    return new Promise((resolve) => {
      this.snapWaiters.push(resolve);
      this.send({ type: "requestSnapshot" });
    });
  }

  dispose(): void {
    this.worker.terminate();
  }
}
