import { DEFAULT_PARAMS } from "../state/types";
import { ErosionSim } from "./erosionCore";
import {
  KIND_BUBBLE,
  KIND_FOAM,
  KIND_GRAIN,
  PARTICLE_STRIDE,
  VISUAL_WATER_SHEET_CAP,
  bubbleSpawnScore,
  countByKind,
  grainSpawnScore,
  listParticles,
  packParticleAttr,
  unpackParticleKind,
  unpackParticleLife,
  visualWaterSheet,
} from "./flowFx";
import { getPreset } from "./presets";

function fail(msg: string): never {
  console.error(msg);
  throw new Error(msg);
}

function almost(a: number, b: number, eps = 1e-4, label = ""): void {
  if (Math.abs(a - b) > eps) fail(`${label || "value"} expected ${b}, got ${a}`);
}

if (visualWaterSheet(1.15) > VISUAL_WATER_SHEET_CAP + 1e-6) {
  fail(`foam sheet must cap SWE spikes: ${visualWaterSheet(1.15)}`);
}
if (visualWaterSheet(0.01) > 0.008) fail(`film foam too tall: ${visualWaterSheet(0.01)}`);

almost(packParticleAttr(KIND_FOAM, 1), 0.999, 1e-6, "foam attr");
almost(unpackParticleKind(packParticleAttr(KIND_BUBBLE, 0.4)), KIND_BUBBLE, 0, "bubble kind");
almost(unpackParticleLife(packParticleAttr(KIND_BUBBLE, 0.4)), 0.4 * 0.999, 1e-4, "bubble life");
almost(unpackParticleKind(packParticleAttr(KIND_GRAIN, 1)), KIND_GRAIN, 0, "grain kind");
almost(unpackParticleLife(2.5), 0.5, 1e-4, "life from 2.5");

if (bubbleSpawnScore(0, 0, 0.002, 0.08) > 0) fail("still water must not bubble");
if (bubbleSpawnScore(1e-7, 0.002, 0.01, 0.04) > 0) fail("weak shear/drop must not bubble");
if (bubbleSpawnScore(8e-5, 0.004, 0.08, 0.03) < 0.3) fail("high shear should nucleate bubbles");
if (bubbleSpawnScore(1e-6, 0.05, 0.08, 0.03) < 0.3) fail("a drop should nucleate bubbles");

if (grainSpawnScore(0.001, 0.04, 0.002) > 0) fail("slow water is not bedload");
if (grainSpawnScore(0.008, 0.03, 0.02) > 0) fail("turbid water should stay grain-free");
if (grainSpawnScore(0.008, 0.2, 0.004) > 0) fail("deep pond should stay grain-free");
if (grainSpawnScore(0.007, 0.025, 0.002) < 0.4) fail("fast clear flow should show bedload");

const listed = listParticles(new Float32Array([0.2, 0.3, 0.5, packParticleAttr(KIND_BUBBLE, 0.8)]));
if (listed.length !== 1 || listed[0].kind !== KIND_BUBBLE) fail("listParticles stride 4");
const legacy = listParticles(new Float32Array([0.1, 0.2, 0.4]));
if (legacy.length !== 1 || legacy[0].kind !== KIND_FOAM) fail("listParticles stride 3 fallback");

const size = 128;

const stillFlat = new Float32Array(size * size);
stillFlat.fill(0.52);
const still = new ErosionSim(size, DEFAULT_PARAMS, stillFlat);
still.sources = [];
still.water.fill(0.05);
still.step(16);
const stillFx = countByKind(listParticles(still.collectParticles()));
if (still.collectParticles().length % PARTICLE_STRIDE !== 0) fail("particle buffer must be stride 4");
if (still.aerationPeak() > 0.08) fail(`still film should not aerate: ${still.aerationPeak()}`);
if (stillFx.bubble > 0) fail(`still film should not foam bubbles: ${stillFx.bubble}`);
if (stillFx.grain > 0) fail(`still film should not show bedload: ${stillFx.grain}`);

const dropT = new Float32Array(size * size);
for (let y = 0; y < size; y++) {
  const lip = y < size * 0.34 ? 0.74 : 0.4;
  for (let x = 0; x < size; x++) dropT[y * size + x] = lip;
}
const drop = new ErosionSim(size, { ...DEFAULT_PARAMS, infiltration: 0, evaporation: 0 }, dropT);
drop.sources = [{ id: "fx-drop", x: 0.5, y: 0.12, rate: 2.4 }];
drop.step(70);
const dropList = listParticles(drop.collectParticles());
const drop0 = countByKind(dropList);
if (drop0.bubble < 5) fail(`drop/shear should spawn bubble clusters: ${drop0.bubble}`);
let tallFx = 0;
for (const p of dropList) {
  if (p.kind === KIND_GRAIN) continue;
  const x = Math.max(0, Math.min(size - 1, Math.round(p.u * (size - 1))));
  const y = Math.max(0, Math.min(size - 1, Math.round(p.v * (size - 1))));
  const i = y * size + x;
  if (p.h > drop.terrain[i] + VISUAL_WATER_SHEET_CAP + 0.002) tallFx++;
}
if (tallFx > 0) fail(`FX must sit on the visual sheet, not the SWE column: ${tallFx}`);

for (let i = 0; i < 22; i++) drop.collectParticles();
const dropAged = countByKind(listParticles(drop.collectParticles()));
if (dropAged.bubble >= drop0.bubble) {
  fail(`bubbles should be transient (${drop0.bubble} → ${dropAged.bubble})`);
}

drop.resetWater();
const afterReset = countByKind(listParticles(drop.collectParticles()));
if (afterReset.bubble > 0 || afterReset.grain > 0) {
  fail(`resetWater must clear FX: ${JSON.stringify(afterReset)}`);
}

const slopeBuilt = getPreset("slope").build(size);
const slope = new ErosionSim(size, DEFAULT_PARAMS, slopeBuilt.terrain);
slope.sources = slopeBuilt.sources;
slope.step(90);
const slopeList = listParticles(slope.collectParticles());
const slopeFx = countByKind(slopeList);
if (slopeFx.grain < 4) fail(`fast clear slope should show sparse bedload: ${slopeFx.grain}`);

let grainNearBed = 0;
for (const p of slopeList) {
  if (p.kind !== KIND_GRAIN) continue;
  const x = Math.max(0, Math.min(size - 1, Math.round(p.u * (size - 1))));
  const y = Math.max(0, Math.min(size - 1, Math.round(p.v * (size - 1))));
  const i = y * size + x;
  const bed = slope.terrain[i];
  const surf = bed + slope.water[i];
  if (p.h <= bed + Math.max(0.008, (surf - bed) * 0.35)) grainNearBed++;
}
if (grainNearBed < 3) fail(`bedload grains should sit near the bed: ${grainNearBed}`);

const stairs = getPreset("treppenueberlauf").build(size);
const cascade = new ErosionSim(size, DEFAULT_PARAMS, stairs.terrain);
if (stairs.hardmask) cascade.hardmask.set(stairs.hardmask);
cascade.sources = stairs.sources;
cascade.step(80);
const cascadeFx = countByKind(listParticles(cascade.collectParticles()));
if (cascadeFx.bubble < 8) fail(`steps should make bubble clusters: ${cascadeFx.bubble}`);

let hardCut = 0;
const hard0 = cascade.terrain.slice();
cascade.step(20);
for (let i = 0; i < hard0.length; i++) {
  if (cascade.hardmask[i] >= 0.5) hardCut = Math.max(hardCut, hard0[i] - cascade.terrain[i]);
}
if (hardCut > 1e-5) fail(`FX must not erode hardmask: ${hardCut}`);

console.log("flowFxSmoke ok", {
  stillFx,
  drop0,
  dropAged,
  slopeFx,
  grainNearBed,
  cascadeFx,
});
