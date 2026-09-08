import { DEFAULT_PARAMS } from "../state/types";
import { ErosionSim } from "./erosionCore";
import {
  MAX_PIPE_SPEED,
  MAX_WATER_DEPTH,
  MAX_WATER_DEPTH_ULTRA,
  POND_DEPTH,
  STILL_SPEED,
  advectMacCormack,
  applyPipeFlux,
  canPickSediment,
  clampWaterDepth,
  clampWaterField,
  equalizePondSurface,
  equilibriumTransfer,
  hydroHead,
  interfaceBed,
  maxWaterDepthFor,
  relaxPhysicsSpikesHydro,
  sedimentCapacity,
  updatePipeFlux,
  weirFluxScale,
} from "./hydraulic";
import { HARD_THRESHOLD } from "./mapsContract";
import { hardSupportCount, talusLimit, thermalRateScale, thermalSlip } from "./thermalErosion";

function fail(msg: string): never {
  console.error(msg);
  throw new Error(msg);
}

const size = 32;
const n = size * size;

{
  if (clampWaterDepth(-1) !== 0) fail("negative depth clamps to 0");
  if (clampWaterDepth(0.05) !== 0.05) fail("shallow water stays");
  if (clampWaterDepth(MAX_WATER_DEPTH + 0.4) !== MAX_WATER_DEPTH) fail("deep column hits the cap");
  if (maxWaterDepthFor(128) !== MAX_WATER_DEPTH) fail("Low keeps the coarse cap");
  if (maxWaterDepthFor(768) !== MAX_WATER_DEPTH_ULTRA) fail("Ultra uses the tight cap");
  if (!(maxWaterDepthFor(768) < maxWaterDepthFor(128))) fail("Ultra cap must be tighter than Low");
  const field = new Float32Array([0, 0.04, MAX_WATER_DEPTH + 1, Number.NaN]);
  clampWaterField(field);
  if (
    field[0] !== 0 ||
    Math.abs(field[1] - 0.04) > 1e-6 ||
    Math.abs(field[2] - MAX_WATER_DEPTH) > 1e-6 ||
    field[3] !== 0
  ) {
    fail(`clampWaterField ${Array.from(field)}`);
  }
  if (thermalRateScale(768) !== 1 || thermalRateScale(256) !== 1) fail("fine grids keep full thermal");
  if (!(thermalRateScale(128) < 0.62 && thermalRateScale(128) >= 0.48)) {
    fail(`Low thermal should stay gentle: ${thermalRateScale(128)}`);
  }
  if (!(thermalRateScale(128) < thermalRateScale(256))) fail("Low thermal must be gentler than Medium");
}

{
  if (sedimentCapacity(0, 0.2, 0.05, 0.58) !== 0) fail("still speed must have C=0");
  if (sedimentCapacity(STILL_SPEED, 0.2, 0.05, 0.58) !== 0) fail("threshold speed must have C=0");
  if (sedimentCapacity(0.4, 0.012, 0.022, 0.58) <= 0) fail("gentle floor tilt still carries");
  if (sedimentCapacity(0.4, 0, 0.022, 0.58) !== 0) fail("zero slope must not pick");
  if (sedimentCapacity(0.08, 0.08, 0.008, 0.58) !== 0) fail("rain film must not pick");
  const moving = sedimentCapacity(0.35, 0.08, 0.02, 0.58);
  const pond = sedimentCapacity(0.35, 0.08, 0.2, 0.58);
  if (!(moving > 0)) fail("flow×slope should pick");
  if (!(pond < moving)) fail("deep water should not pick more than a thread");
  if (pond !== 0) fail("filling pool capacity must be 0");
  const pick = equilibriumTransfer(0.04, 0.01, 0.6, 0.3);
  const drop = equilibriumTransfer(0.01, 0.04, 0.6, 0.3);
  if (!(pick > 0) || !(drop < 0)) fail("equilibrium should chase capacity");
  const thread = {
    ponded: false,
    flow: 0.06,
    speed: 0.12,
    shear: 0.12 * 0.01,
    bedFrac: 0.6,
    slope: 0.01,
    water: 0.018,
    threadNeighbors: 2,
  };
  if (!canPickSediment(thread)) fail("established thread should pick");
  if (canPickSediment({ ...thread, ponded: true })) fail("ponded must not pick");
  if (canPickSediment({ ...thread, water: 0.03, slope: 0.003 })) fail("filling pool must not pick");
  if (canPickSediment({ ...thread, threadNeighbors: 0 })) fail("isolated rain must not pick");
  if (canPickSediment({ ...thread, flow: 0.01 })) fail("weak flow must not pick");
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
  const ch = new Float32Array(n);
  const hardCh = new Float32Array(n);
  const water = new Float32Array(n);
  const wet = new Float32Array(n);
  const coh = new Float32Array(n);
  const delta = new Float32Array(n);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (x < 10 || x > 21) {
        ch[i] = 0.84;
        hardCh[i] = 1;
      } else {
        ch[i] = 0.4;
      }
    }
  }
  if (hardSupportCount(hardCh, ch, size, 10, 8) < 1) fail("channel floor needs wall support");
  const bed0 = ch[8 * size + 16];
  const wall0 = ch[8 * size + 4];
  thermalSlip(ch, water, wet, coh, hardCh, delta, size, 0.55, 0.28);
  if (Math.abs(ch[8 * size + 4] - wall0) > 1e-6) fail("thermal moved channel wall");
  if (ch[8 * size + 16] - bed0 > 0.03) fail("thermal filled hardmask channel");
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

{
  // Ultra-class pile-up: a dammed bowl must not blow past the depth cap or spawn NaNs.
  const sizeU = 96;
  const bowl = new Float32Array(sizeU * sizeU);
  for (let y = 0; y < sizeU; y++) {
    for (let x = 0; x < sizeU; x++) {
      const u = x / (sizeU - 1) - 0.5;
      const v = y / (sizeU - 1) - 0.5;
      bowl[y * sizeU + x] = 0.52 - Math.max(0, 0.28 - Math.hypot(u, v)) * 0.7;
    }
  }
  const flood = new ErosionSim(sizeU, { ...DEFAULT_PARAMS, infiltration: 0, evaporation: 0 }, bowl);
  for (let s = 0; s < 40; s++) {
    flood.pour(0.5, 0.5, 2.4);
    flood.step(1);
  }
  let maxW = 0;
  let bad = 0;
  for (let i = 0; i < flood.water.length; i++) {
    const w = flood.water[i];
    if (w > maxW) maxW = w;
    if (!Number.isFinite(w)) bad++;
  }
  console.log(JSON.stringify({ ultraCap: { maxW: +maxW.toFixed(4), bad } }));
  if (maxW > maxWaterDepthFor(sizeU) + 1e-6) fail(`water blew past the cap: ${maxW}`);
  if (bad) fail(`non-finite water after flood: ${bad}`);
  if (maxW < 0.05) fail(`cap test never filled the bowl: ${maxW}`);
  const ultraField = new Float32Array([2.4, 0.9, 0.1]);
  clampWaterField(ultraField, maxWaterDepthFor(768));
  if (Math.abs(ultraField[0] - MAX_WATER_DEPTH_ULTRA) > 1e-6) fail("Ultra clamp");
  if (Math.abs(ultraField[1] - MAX_WATER_DEPTH_ULTRA) > 1e-6) fail("Ultra clamp mid");
  if (Math.abs(ultraField[2] - 0.1) > 1e-6) fail("Ultra clamp left shallow water");
}

if (!(MAX_PIPE_SPEED > 1) || !Number.isFinite(MAX_PIPE_SPEED)) fail("pipe speed cap");

{
  if (interfaceBed(0.4, 0.7) !== 0.7) fail("interfaceBed takes the higher bed");
  if (hydroHead(0.6, 0.7) !== 0) fail("no head under a higher crest");
  if (Math.abs(hydroHead(0.9, 0.7) - 0.2) > 1e-6) fail("head above crest");
  if (weirFluxScale(0.1, 0) !== 1) fail("no weir on a flat bed");
  if (!(weirFluxScale(0.16, 0.2) > 1)) fail("weir should boost overflow");
  if (!(POND_DEPTH > 0.01 && POND_DEPTH < 0.05)) fail("pond threshold");
}

{
  // High wall: water must pool until the free surface exceeds the crest, then weir over.
  const sizeB = 32;
  const nB = sizeB * sizeB;
  const terrain = new Float32Array(nB);
  const water = new Float32Array(nB);
  const flow = new Float32Array(nB);
  const fL = new Float32Array(nB);
  const fR = new Float32Array(nB);
  const fT = new Float32Array(nB);
  const fB = new Float32Array(nB);
  const velX = new Float32Array(nB);
  const velY = new Float32Array(nB);
  const wallX = 16;
  const crest = 0.72;
  const bed = 0.48;
  for (let y = 0; y < sizeB; y++) {
    for (let x = 0; x < sizeB; x++) {
      terrain[y * sizeB + x] = x === wallX ? crest : bed;
    }
  }
  for (let y = 2; y < sizeB - 2; y++) {
    for (let x = 2; x < wallX; x++) water[y * sizeB + x] = 0.12;
  }
  for (let s = 0; s < 8; s++) {
    updatePipeFlux(fL, fR, fT, fB, terrain, water, flow, sizeB, 1.1, 0.2);
    applyPipeFlux(fL, fR, fT, fB, water, velX, velY, sizeB, 0.2);
  }
  let downEarly = 0;
  for (let y = 2; y < sizeB - 2; y++) {
    for (let x = wallX + 1; x < sizeB - 2; x++) downEarly += water[y * sizeB + x];
  }
  if (downEarly > 0.08) fail(`leaked through the wall before overtop: ${downEarly}`);

  for (let y = 2; y < sizeB - 2; y++) {
    for (let x = 2; x < wallX; x++) water[y * sizeB + x] = 0.32;
  }
  for (let s = 0; s < 16; s++) {
    updatePipeFlux(fL, fR, fT, fB, terrain, water, flow, sizeB, 1.1, 0.2);
    applyPipeFlux(fL, fR, fT, fB, water, velX, velY, sizeB, 0.2);
  }
  let downLate = 0;
  let onCrest = 0;
  for (let y = 2; y < sizeB - 2; y++) {
    onCrest += water[y * sizeB + wallX];
    for (let x = wallX + 1; x < sizeB - 2; x++) downLate += water[y * sizeB + x];
  }
  console.log(JSON.stringify({ weir: { downEarly: +downEarly.toFixed(4), downLate: +downLate.toFixed(3), onCrest: +onCrest.toFixed(3) } }));
  if (downLate < 0.12) fail(`did not weir over the crest: ${downLate}`);
  if (onCrest < 0.02) fail(`overflow skipped the crest: ${onCrest}`);
}

{
  const sizeB = 24;
  const nB = sizeB * sizeB;
  const terrain = new Float32Array(nB);
  const water = new Float32Array(nB);
  const scratch = new Float32Array(nB);
  terrain.fill(0.4);
  for (let y = 0; y < sizeB; y++) terrain[y * sizeB + 12] = 0.95;
  water[8 * sizeB + 11] = 0.4;
  relaxPhysicsSpikesHydro(water, terrain, scratch, sizeB, 4);
  if (water[8 * sizeB + 12] > 0.02) fail(`despike teleported over the wall: ${water[8 * sizeB + 12]}`);
  if (water[8 * sizeB + 13] > 0.01) fail(`despike crossed the wall: ${water[8 * sizeB + 13]}`);
}

{
  const sizeB = 24;
  const nB = sizeB * sizeB;
  const terrain = new Float32Array(nB);
  const water = new Float32Array(nB);
  const delta = new Float32Array(nB);
  terrain.fill(0.5);
  water[10 * sizeB + 8] = 0.2;
  water[10 * sizeB + 9] = 0.04;
  equalizePondSurface(terrain, water, delta, sizeB, 3);
  const a = water[10 * sizeB + 8];
  const b = water[10 * sizeB + 9];
  console.log(JSON.stringify({ pondEq: { a: +a.toFixed(3), b: +b.toFixed(3) } }));
  if (a - b > 0.12) fail(`pond did not level: ${a} vs ${b}`);
}

console.log("hydraulicSmoke ok");
