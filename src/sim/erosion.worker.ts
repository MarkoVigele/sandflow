import { ErosionSim } from "./erosionCore";
import type { WorkerIn, WorkerOut } from "./types";
import { DEFAULT_PARAMS } from "../state/types";

let sim: ErosionSim | null = null;
let lastPourEmit = 0;

function post(msg: WorkerOut, transfer: Transferable[] = []): void {
  (self as unknown as Worker).postMessage(msg, transfer);
}

function snapshot(): void {
  if (!sim) return;
  const terrain = sim.terrain.slice();
  const water = sim.water.slice();
  const wetness = sim.wetness.slice();
  const sediment = sim.sediment.slice();
  post(
    {
      type: "snapshot",
      size: sim.size,
      terrain,
      water,
      wetness,
      sediment,
      sources: sim.sources.map((s) => ({ ...s })),
      erodedSand: sim.erodedSand,
    },
    [terrain.buffer, water.buffer, wetness.buffer, sediment.buffer],
  );
}

function emitFrame(): void {
  if (!sim) return;
  const packed = sim.pack();
  const particles = sim.collectParticles();
  post(
    {
      type: "frame",
      size: sim.size,
      packed,
      particles,
      waterVolume: sim.waterVolume(),
      erodedSand: sim.erodedSand,
    },
    [packed.buffer, particles.buffer],
  );
}

self.onmessage = (ev: MessageEvent<WorkerIn>) => {
  const msg = ev.data;
  switch (msg.type) {
    case "init": {
      sim = new ErosionSim(msg.size, msg.params, msg.terrain.slice());
      if (msg.water) sim.water.set(msg.water);
      if (msg.wetness) sim.wetness.set(msg.wetness);
      if (msg.sediment) sim.sediment.set(msg.sediment);
      sim.sources = msg.sources.map((s) => ({ ...s }));
      sim.erodedSand = 0;
      emitFrame();
      break;
    }
    case "step": {
      if (!sim) return;
      sim.step(msg.steps);
      emitFrame();
      break;
    }
    case "setParams": {
      if (!sim) return;
      sim.params = { ...sim.params, ...msg.params };
      break;
    }
    case "brush": {
      if (!sim) return;
      sim.brush(msg.kind, msg.x, msg.y, msg.radius, msg.strength);
      emitFrame();
      break;
    }
    case "pour": {
      if (!sim) return;
      sim.pour(msg.x, msg.y, msg.amount);
      const now = Date.now();
      if (now - lastPourEmit > 50) {
        lastPourEmit = now;
        emitFrame();
      }
      break;
    }
    case "addSource": {
      if (!sim) return;
      sim.sources.push({ ...msg.source });
      break;
    }
    case "moveSource": {
      if (!sim) return;
      const s = sim.sources.find((x) => x.id === msg.id);
      if (s) {
        s.x = msg.x;
        s.y = msg.y;
      }
      break;
    }
    case "removeSource": {
      if (!sim) return;
      sim.sources = sim.sources.filter((s) => s.id !== msg.id);
      break;
    }
    case "setSourceRate": {
      if (!sim) return;
      const s = sim.sources.find((x) => x.id === msg.id);
      if (s) s.rate = msg.rate;
      break;
    }
    case "resetWater": {
      if (!sim) return;
      sim.resetWater();
      emitFrame();
      break;
    }
    case "replaceTerrain": {
      const params = sim?.params ?? DEFAULT_PARAMS;
      sim = new ErosionSim(Math.round(Math.sqrt(msg.terrain.length)), params, msg.terrain.slice());
      if (msg.water) sim.water.set(msg.water);
      if (msg.wetness) sim.wetness.set(msg.wetness);
      sim.sources = msg.sources.map((s) => ({ ...s }));
      emitFrame();
      break;
    }
    case "requestSnapshot": {
      snapshot();
      break;
    }
    default:
      break;
  }
};
