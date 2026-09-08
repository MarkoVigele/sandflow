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

/** Never send more than this many SWE ticks in one worker message. */
export const MAX_STEP_BATCH = 8;
/** At most one extra tick while a frame is already in flight. */
export const MAX_STEP_BACKLOG = 1;

/**
 * Coalesce sim-step requests so a slow worker never receives a catch-up flood.
 * If work is already in flight, keep at most one backlog tick and drop the rest.
 */
export function planSimStep(
  requested: number,
  pendingFrames: number,
  backlog = 0,
): { send: number; backlog: number; skipped: number } {
  const n = Number.isFinite(requested) ? Math.max(0, Math.round(requested)) : 0;
  if (n <= 0) return { send: 0, backlog, skipped: 0 };
  if (pendingFrames > 0) {
    if (backlog >= MAX_STEP_BACKLOG) return { send: 0, backlog, skipped: n };
    const keep = Math.min(MAX_STEP_BACKLOG, n);
    return { send: 0, backlog: keep, skipped: n - keep };
  }
  const send = Math.min(n, MAX_STEP_BATCH);
  return { send, backlog: 0, skipped: n - send };
}

export class SimClient {
  private worker: Worker;
  busy = false;
  skippedSteps = 0;
  private pendingFrames = 0;
  private backlog = 0;
  private frameHandlers = new Set<(f: SimFrame) => void>();
  private snapWaiters: Array<(s: SimSnapshot) => void> = [];

  constructor() {
    this.worker = new Worker(new URL("./erosion.worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = (ev: MessageEvent<WorkerOut>) => {
      const msg = ev.data;
      if (msg.type === "frame") {
        this.pendingFrames = Math.max(0, this.pendingFrames - 1);
        this.busy = this.pendingFrames > 0;
        const frame: SimFrame = {
          size: msg.size,
          packed: msg.packed,
          particles: msg.particles,
          waterVolume: msg.waterVolume,
          erodedSand: msg.erodedSand,
          hard: msg.hard,
        };
        for (const h of this.frameHandlers) h(frame);
        this.flushBacklog();
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

  private expectFrame(): void {
    this.pendingFrames++;
    this.busy = true;
  }

  private flushBacklog(): void {
    if (this.pendingFrames > 0 || this.backlog <= 0) return;
    const n = this.backlog;
    this.backlog = 0;
    this.expectFrame();
    this.send({ type: "step", steps: n });
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
    this.backlog = 0;
    this.expectFrame();
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
    const plan = planSimStep(steps, this.pendingFrames, this.backlog);
    this.backlog = plan.backlog;
    this.skippedSteps += plan.skipped;
    if (plan.send <= 0) return;
    this.expectFrame();
    this.send({ type: "step", steps: plan.send });
  }

  setParams(params: Partial<SimParams>): void {
    this.send({ type: "setParams", params });
  }

  setParticleBudget(particles: number): void {
    const n = Number.isFinite(particles) ? Math.max(0, Math.round(particles)) : 0;
    this.send({ type: "setQuality", particles: n });
  }

  brush(kind: BrushKind, x: number, y: number, radius: number, strength: number): void {
    this.expectFrame();
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
    this.expectFrame();
    this.send({ type: "resetWater" });
  }

  flattenAll(): void {
    this.expectFrame();
    this.send({ type: "flattenAll" });
  }

  replaceTerrain(
    terrain: Float32Array,
    sources: WaterSource[],
    water?: Float32Array,
    wetness?: Float32Array,
    hardmask?: Float32Array,
  ): void {
    this.backlog = 0;
    this.expectFrame();
    this.send({ type: "replaceTerrain", terrain, sources, water, wetness, hardmask });
  }

  requestSnapshot(): Promise<SimSnapshot> {
    return new Promise((resolve) => {
      this.snapWaiters.push(resolve);
      this.send({ type: "requestSnapshot" });
    });
  }

  dispose(): void {
    this.backlog = 0;
    this.pendingFrames = 0;
    this.busy = false;
    this.worker.terminate();
  }
}
