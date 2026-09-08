import { DEFAULT_PARAMS } from "../state/types";
import { ErosionSim } from "./erosionCore";
import {
  STILL_SPEED,
  advectMacCormack,
  applyPipeFlux,
  equilibriumTransfer,
  sedimentCapacity,
  updatePipeFlux,
} from "./hydraulic";
import { HARD_THRESHOLD } from "./mapsContract";
import { talusLimit, thermalSlip } from "./thermalErosion";

function fail(msg: string): never {
  console.error(msg);
  throw new Error(msg);
}

const size = 32;
const n = size * size;

{
  if (sedimentCapacity(0, 0.2, 0.05, 0.58) !== 0) fail("still speed must have C=0");
  if (sedimentCapacity(STILL_SPEED, 0.2, 0.05, 0.58) !== 0) fail("threshold speed must have C=0");
  if (sedimentCapacity(0.4, 0.012, 0.05, 0.58) <= 0) fail("gentle floor tilt still carries");
  if (sedimentCapacity(0.4, 0, 0.05, 0.58) !== 0) fail("zero slope must not pick");
  const moving = sedimentCapacity(0.35, 0.08, 0.04, 0.58);
  const pond = sedimentCapacity(0.35, 0.08, 0.2, 0.58);
  if (!(moving > 0)) fail("flow×slope should pick");
  if (!(pond < moving)) fail("deep water should not pick more than a thread");
  const pick = equilibriumTransfer(0.04, 0.01, 0.6, 0.3);
  const drop = equilibriumTransfer(0.01, 0.04, 0.6, 0.3);
  if (!(pick > 0) || !(drop < 0)) fail("equilibrium should chase capacity");
}

{
  const src = new Float32Array(n);
  const fwd = new Float32Array(n);
  const bwd = new Float32Array(n);
  const vx = new Float32Array(n);
  const vy = new Float32Array(n);
  const mid = 8 * size + 8;
  src[mid] = 1;
  for (let i = 0; i < n; i++) vx[i] = 1.2;
  advectMacCormack(src, fwd, bwd, vx, vy, size, 1);
  let mass = 0;
  let massX = 0;
  for (let i = 0; i < n; i++) {
    mass += fwd[i];
    massX += (i % size) * fwd[i];
  }
  const cx = mass > 0 ? massX / mass : 0;
  console.log(JSON.stringify({ maccormackMass: +mass.toFixed(3), cx: +cx.toFixed(2) }));
  if (mass < 0.35) fail(`MacCormack lost the blob: ${mass}`);
  if (cx < 8.4) fail(`MacCormack did not advect +X: cx=${cx}`);
  if (fwd[mid] > src[mid] * 0.98) fail("MacCormack left the blob unmoved");
}

{
  const terrain = new Float32Array(n);
  const water = new Float32Array(n);
  const flow = new Float32Array(n);
  const fL = new Float32Array(n);
  const fR = new Float32Array(n);
  const fT = new Float32Array(n);
  const fB = new Float32Array(n);
  const velX = new Float32Array(n);
  const velY = new Float32Array(n);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      terrain[y * size + x] = 0.6 - (x / (size - 1)) * 0.18;
    }
  }
  water[16 * size + 6] = 0.12;
  for (let s = 0; s < 12; s++) {
    updatePipeFlux(fL, fR, fT, fB, terrain, water, flow, size, 1.2, 0.2);
    applyPipeFlux(fL, fR, fT, fB, water, velX, velY, size, 0.2);
  }
  let mass = 0;
  let massX = 0;
  for (let i = 0; i < n; i++) {
    mass += water[i];
    massX += (i % size) * water[i];
  }
  const cx = mass > 0 ? massX / mass : 0;
  console.log(JSON.stringify({ pipeMass: +mass.toFixed(4), pipeCx: +cx.toFixed(2) }));
  if (mass < 0.04) fail(`pipes lost the water: ${mass}`);
  if (cx < 7.2) fail(`pipes did not drain downhill: cx=${cx}`);
}

{
  const terrain = new Float32Array(n);
  const water = new Float32Array(n);
  const wet = new Float32Array(n);
  const coh = new Float32Array(n);
  const hard = new Float32Array(n);
  const delta = new Float32Array(n);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      terrain[y * size + x] = x < 16 ? 0.72 : 0.4;
    }
  }
  hard[10 * size + 10] = 1;
  const cliff0 = terrain[10 * size + 10];
  thermalSlip(terrain, water, wet, coh, hard, delta, size, 0.55, 0.28);
  const left = terrain[8 * size + 15];
  const right = terrain[8 * size + 16];
  console.log(JSON.stringify({ talus: +talusLimit(0.55, 0.28, 0).toFixed(3), left, right, hardCell: terrain[10 * size + 10] }));
  if (left - right > 0.305) fail("thermal should slump a cliff toward talus");
  if (Math.abs(terrain[10 * size + 10] - cliff0) > 1e-6) fail("thermal moved a hard cell");
}

{
  const size2 = 64;
  const flat = new Float32Array(size2 * size2);
  flat.fill(0.52);
  const cut = new ErosionSim(size2, DEFAULT_PARAMS, flat);
  const cx = (size2 * 0.5) | 0;
  const cy = (size2 * 0.5) | 0;
  for (let y = cy - 2; y <= cy + 2; y++) {
    for (let x = 2; x < size2 - 2; x++) {
      cut.terrain[y * size2 + x] = 0.34;
    }
  }
  const bank0 = cut.terrain[(cy - 3) * size2 + cx];
  cut.step(24);
  const bank1 = cut.terrain[(cy - 3) * size2 + cx];
  console.log(JSON.stringify({ bank0: +bank0.toFixed(4), bank1: +bank1.toFixed(4) }));
  if (bank1 > bank0 - 0.004) fail(`cut banks did not slip thermally: ${bank0} → ${bank1}`);
}

{
  const size2 = 48;
  const slope = new Float32Array(size2 * size2);
  for (let y = 0; y < size2; y++) {
    for (let x = 0; x < size2; x++) slope[y * size2 + x] = 0.58 - (y / (size2 - 1)) * 0.16;
  }
  const sim = new ErosionSim(size2, { ...DEFAULT_PARAMS, infiltration: 0, evaporation: 0 }, slope);
  const mid = ((size2 * 0.2) | 0) * size2 + ((size2 * 0.5) | 0);
  sim.sediment[mid] = 0.2;
  sim.water[mid] = 0.06;
  sim.step(10);
  let mass = 0;
  let massY = 0;
  for (let i = 0; i < sim.sediment.length; i++) {
    const s = sim.sediment[i];
    mass += s;
    massY += ((i / size2) | 0) * s;
  }
  const cy = mass > 0 ? massY / mass : 0;
  console.log(JSON.stringify({ sedMass: +mass.toFixed(4), sedCy: +cy.toFixed(1) }));
  if (cy < size2 * 0.2 - 0.5) fail(`sediment did not advect downstream: cy=${cy}`);
}

{
  const size2 = 32;
  const t = new Float32Array(size2 * size2);
  t.fill(0.5);
  const sim = new ErosionSim(size2, DEFAULT_PARAMS, t);
  for (let i = 0; i < sim.hardmask.length; i++) sim.hardmask[i] = 1;
  const h0 = sim.terrain.slice();
  sim.pour(0.5, 0.3, 0.8);
  sim.step(20);
  let cut = 0;
  for (let i = 0; i < h0.length; i++) cut = Math.max(cut, h0[i] - sim.terrain[i]);
  if (cut > 1e-5) fail(`hardmask eroded under pipes: ${cut}`);
  if (sim.hardmask[0] < HARD_THRESHOLD) fail("hardmask cleared");
}

console.log("hydraulicSmoke ok");
