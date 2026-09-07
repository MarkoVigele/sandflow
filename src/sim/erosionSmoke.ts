import { fbm } from "../assets/noise";
import { DEFAULT_PARAMS } from "../state/types";
import { ErosionSim } from "./erosionCore";
import { MAP_A_FLOW, MAP_B_WETNESS, MAP_G_WATER, MAP_R_TERRAIN, unpackRgba } from "./mapsContract";
import { getPreset } from "./presets";

function fail(msg: string): never {
  console.error(msg);
  throw new Error(msg);
}

const size = 128;
const built = getPreset("slope").build(size);
const sim = new ErosionSim(size, DEFAULT_PARAMS, built.terrain);
sim.sources = built.sources;
const initial = sim.terrain.slice();

sim.step(90);

let eroded = 0;
let deposited = 0;
let maxCut = 0;
let cutY = 0;
for (let i = 0; i < initial.length; i++) {
  const d = sim.terrain[i] - initial[i];
  if (d < 0) {
    eroded += -d;
    if (-d > maxCut) {
      maxCut = -d;
      cutY = (i / size) | 0;
    }
  } else deposited += d;
}

const mid = (size * 0.55) | 0;
let wetMid = 0;
let wetLow = 0;
let mass = 0;
let massY = 0;
const cols: number[] = [];
for (let x = 2; x < size - 2; x++) {
  if (sim.water[mid * size + x] > 0.002 || initial[mid * size + x] - sim.terrain[mid * size + x] > 0.012) {
    wetMid++;
    cols.push(x);
  }
  if (sim.water[((size * 0.62) | 0) * size + x] > 0.001) wetLow++;
}
for (let i = 0; i < sim.water.length; i++) {
  const w = sim.water[i];
  mass += w;
  massY += ((i / size) | 0) * w;
}

let clusters = 0;
let inRun = false;
for (let x = 0; x < size; x++) {
  const on = sim.water[mid * size + x] > 0.002 || initial[mid * size + x] - sim.terrain[mid * size + x] > 0.012;
  if (on && !inRun) {
    clusters++;
    inRun = true;
  }
  if (!on) inRun = false;
}

const span = cols.length ? cols[cols.length - 1] - cols[0] + 1 : 0;
const report = {
  eroded: +eroded.toFixed(3),
  deposited: +deposited.toFixed(3),
  maxCut: +maxCut.toFixed(3),
  cutY,
  wetMid,
  wetLow,
  clusters,
  span,
  waterVol: +sim.waterVolume().toFixed(3),
  centroidY: mass > 0 ? +(massY / mass).toFixed(1) : 0,
};
console.log(JSON.stringify(report));

if (eroded < 1.2) fail(`zu wenig Erosion: ${eroded}`);
if (deposited < 0.08) fail(`keine Ablagerung: ${deposited}`);
if (maxCut < 0.03) fail(`Rinne zu flach: ${maxCut}`);
if (report.centroidY < 28) fail(`Wasser bleibt an der Quelle: centroidY=${report.centroidY}`);
if (wetMid < 3) fail("Wasser erreicht die Mitte nicht");
if (wetLow < 1) fail("Wasser kommt nicht über die Mitte hinaus");
if (wetMid > size * 0.4) fail(`Flächenabfluss statt Ader: wetMid=${wetMid}`);
if (clusters < 1) fail("keine Ader in der Mitte");

const packed = sim.pack();
const maps = unpackRgba(packed, size);
if (Math.abs(maps.terrain[0] - sim.terrain[0]) > 1e-6) fail("pack R terrain");
if (Math.abs(maps.water[10] - sim.water[10]) > 1e-6) fail("pack G water");
if (packed[2] !== sim.wetness[0] || packed[MAP_B_WETNESS] !== sim.wetness[0]) fail("pack B wetness");
if (packed[MAP_A_FLOW] !== sim.flow[0]) fail("pack A flow");
if (packed[MAP_R_TERRAIN] !== sim.terrain[0] || packed[MAP_G_WATER] !== sim.water[0]) {
  fail("channel contract");
}

function maxCutNear(before: Float32Array, after: Float32Array, cx: number, cy: number, rad: number): number {
  let cut = 0;
  for (let y = cy - rad; y <= cy + rad; y++) {
    for (let x = cx - rad; x <= cx + rad; x++) {
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const i = y * size + x;
      cut = Math.max(cut, before[i] - after[i]);
    }
  }
  return cut;
}

const flat = new Float32Array(size * size);
flat.fill(0.52);
const still = new ErosionSim(size, DEFAULT_PARAMS, flat);
still.sources = [];
still.pour(0.5, 0.5, 1.1);
const still0 = still.terrain.slice();
still.step(90);
const cut90 = maxCutNear(still0, still.terrain, (size * 0.5) | 0, (size * 0.5) | 0, 8);
still.step(90);
const cut180 = maxCutNear(still0, still.terrain, (size * 0.5) | 0, (size * 0.5) | 0, 8);
const stillWet = still.wetness[((size * 0.5) | 0) * size + ((size * 0.5) | 0)];
console.log(JSON.stringify({ stagnantCut90: +cut90.toFixed(4), stagnantCut180: +cut180.toFixed(4), stillWet: +stillWet.toFixed(3) }));

if (cut90 > 0.018) fail(`stehendes Wasser brennt ein: cut90=${cut90}`);
if (cut180 > cut90 + 0.006) fail(`stehendes Loch wächst weiter: ${cut90} → ${cut180}`);
if (stillWet < 0.04) fail(`stehendes Wasser sollte zumindest nässen: wet=${stillWet}`);

const holdFlat = new Float32Array(size * size);
holdFlat.fill(0.52);
const hold = new ErosionSim(size, DEFAULT_PARAMS, holdFlat);
hold.sources = [];
const hold0 = hold.terrain.slice();
for (let s = 0; s < 80; s++) {
  hold.pour(0.5, 0.5, 0.22);
  hold.step(1);
}
const holdCut = maxCutNear(hold0, hold.terrain, (size * 0.5) | 0, (size * 0.5) | 0, 8);
hold.step(80);
const holdCutLater = maxCutNear(hold0, hold.terrain, (size * 0.5) | 0, (size * 0.5) | 0, 8);
console.log(JSON.stringify({ holdPourCut: +holdCut.toFixed(4), holdPourCutLater: +holdCutLater.toFixed(4) }));
if (holdCut > 0.02) fail(`Gießen auf ebener Fläche brennt ein: ${holdCut}`);
if (holdCutLater > holdCut + 0.008) fail(`Gießgrube wächst ohne Fluss weiter: ${holdCut} → ${holdCutLater}`);

const grainy = new Float32Array(size * size);
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    grainy[y * size + x] = 0.52 + (fbm(x / size * 7.5, y / size * 7.5, 4, 11) - 0.5) * 0.016;
  }
}
const grainHold = new ErosionSim(size, DEFAULT_PARAMS, grainy);
grainHold.sources = [];
const grain0 = grainHold.terrain.slice();
for (let s = 0; s < 80; s++) {
  grainHold.pour(0.5, 0.5, 0.22);
  grainHold.step(1);
}
const grainCut = maxCutNear(grain0, grainHold.terrain, (size * 0.5) | 0, (size * 0.5) | 0, 8);
grainHold.step(80);
const grainCutLater = maxCutNear(grain0, grainHold.terrain, (size * 0.5) | 0, (size * 0.5) | 0, 8);
console.log(JSON.stringify({ grainPourCut: +grainCut.toFixed(4), grainPourCutLater: +grainCutLater.toFixed(4) }));
if (grainCut > 0.022) fail(`Gießen auf Körnung brennt ein: ${grainCut}`);
if (grainCutLater > grainCut + 0.01) fail(`Körnungsgrube wächst weiter: ${grainCut} → ${grainCutLater}`);
