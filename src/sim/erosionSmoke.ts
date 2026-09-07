import { DEFAULT_PARAMS } from "../state/types";
import { ErosionSim } from "./erosionCore";
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
