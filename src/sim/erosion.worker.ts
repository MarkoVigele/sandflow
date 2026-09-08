import { ErosionSim } from "./erosionCore";
import { MAX_PARTICLES } from "./flowFx";
import { resampleMask } from "./mapsContract";
import { resampleHeight } from "./presets";
import type { WorkerIn, WorkerOut } from "./types";
import { DEFAULT_PARAMS } from "../state/types";

let sim: ErosionSim | null = null;
let lastPourEmit = 0;
let hardDirty = true;
let particleBudget = MAX_PARTICLES;

function applyParticleBudget(target: ErosionSim | null = sim): void {
  if (target) target.particleBudget = particleBudget;
}

function post(msg: WorkerOut, transfer: Transferable[] = []): void {
  (self as unknown as Worker).postMessage(msg, transfer);
}

function snapshot(): void {
  if (!sim) return;
  const terrain = sim.terrain.slice();
  const water = sim.water.slice();
  const wetness = sim.wetness.slice();
  const sediment = sim.sediment.slice();
  const cohesion = sim.cohesion.slice();
  const hardmask = sim.hardmask.slice();
  post(
    {
      type: "snapshot",
      size: sim.size,
      terrain,
      water,
      wetness,
      sediment,
      cohesion,
      hardmask,
      sources: sim.sources.map((s) => ({ ...s })),
      erodedSand: sim.erodedSand,
    },
    [terrain.buffer, water.buffer, wetness.buffer, sediment.buffer, cohesion.buffer, hardmask.buffer],
  );
}

function emitFrame(): void {
  if (!sim) return;
  const packed = sim.pack();
  const particles = sim.collectParticles();
  const hard = hardDirty ? sim.hardmask.slice() : undefined;
  hardDirty = false;
  const transfer: Transferable[] = [packed.buffer, particles.buffer];
  if (hard) transfer.push(hard.buffer);
  post(
    {
      type: "frame",
      size: sim.size,
      packed,
      particles,
      waterVolume: sim.waterVolume(),
      erodedSand: sim.erodedSand,
      hard,
    },
    transfer,
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
      if (msg.cohesion) sim.cohesion.set(msg.cohesion);
      if (msg.hardmask) sim.hardmask.set(msg.hardmask);
      sim.sources = msg.sources.map((s) => ({ ...s }));
      sim.erodedSand = 0;
      applyParticleBudget(sim);
      hardDirty = true;
      emitFrame();
      break;
    }
    case "setQuality": {
      const n = Number.isFinite(msg.particles) ? Math.max(0, Math.round(msg.particles)) : 0;
      particleBudget = Math.min(MAX_PARTICLES, n);
      applyParticleBudget();
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
      if (msg.kind === "concrete" || msg.kind === "stone" || msg.kind === "soft") hardDirty = true;
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
    case "flattenAll": {
      if (!sim) return;
      sim.flattenAll();
      emitFrame();
      break;
    }
    case "replaceTerrain": {
      const params = sim?.params ?? DEFAULT_PARAMS;
      const oldCoh = sim?.cohesion;
      const oldHard = sim?.hardmask;
      const oldSize = sim?.size;
      const nextSize = Math.round(Math.sqrt(msg.terrain.length));
      sim = new ErosionSim(nextSize, params, msg.terrain.slice());
      if (msg.water) sim.water.set(msg.water);
      if (msg.wetness) sim.wetness.set(msg.wetness);
      if (msg.cohesion) sim.cohesion.set(msg.cohesion);
      else if (oldCoh && oldSize) sim.cohesion.set(resampleHeight(oldCoh, oldSize, nextSize));
      if (msg.hardmask) sim.hardmask.set(msg.hardmask);
      else if (oldHard && oldSize) sim.hardmask.set(resampleMask(oldHard, oldSize, nextSize));
      sim.sources = msg.sources.map((s) => ({ ...s }));
      applyParticleBudget(sim);
      hardDirty = true;
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
