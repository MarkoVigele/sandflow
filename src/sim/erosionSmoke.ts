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

function measureVein(sim: ErosionSim, initial: Float32Array) {
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
  return {
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
}

const built = getPreset("slope").build(size);
const sim = new ErosionSim(size, DEFAULT_PARAMS, built.terrain);
sim.sources = built.sources;
const initial = sim.terrain.slice();

sim.step(90);
const report = measureVein(sim, initial);
console.log(JSON.stringify(report));

if (report.eroded < 1.2) fail(`zu wenig Erosion: ${report.eroded}`);
if (report.deposited < 0.08) fail(`keine Ablagerung: ${report.deposited}`);
if (report.maxCut < 0.03) fail(`Rinne zu flach: ${report.maxCut}`);
if (report.centroidY < 28) fail(`Wasser bleibt an der Quelle: centroidY=${report.centroidY}`);
if (report.wetMid < 3) fail("Wasser erreicht die Mitte nicht");
if (report.wetLow < 1) fail("Wasser kommt nicht über die Mitte hinaus");
if (report.wetMid > size * 0.4) fail(`Flächenabfluss statt Ader: wetMid=${report.wetMid}`);
if (report.clusters < 1) fail("keine Ader in der Mitte");

function waterDepthStats(sim: ErosionSim) {
  const depths: number[] = [];
  for (let i = 0; i < sim.water.length; i++) {
    if (sim.water[i] > 0.0015) depths.push(sim.water[i]);
  }
  depths.sort((a, b) => a - b);
  const at = (q: number) => depths.length ? depths[Math.min(depths.length - 1, Math.round(q * (depths.length - 1)))] : 0;
  return {
    wet: depths.length,
    p50: +at(0.5).toFixed(4),
    p90: +at(0.9).toFixed(4),
    max: +(depths[depths.length - 1] ?? 0).toFixed(4),
  };
}

const depths90 = waterDepthStats(sim);
console.log(JSON.stringify({ depths90 }));
if (depths90.p90 < depths90.p50 * 1.25) {
  fail(`zu wenig Tiefenvariation: p50=${depths90.p50} p90=${depths90.p90}`);
}
if (depths90.max < 0.04) fail(`keine tiefe Stelle: max=${depths90.max}`);
if (depths90.p90 < 0.01) fail(`Tiefe zu gleichmäßig flach: p90=${depths90.p90}`);

sim.step(90);
const later = measureVein(sim, initial);
console.log(JSON.stringify({ later }));
if (later.maxCut + 1e-6 < report.maxCut) fail(`Bett wird nicht tiefer: ${report.maxCut} → ${later.maxCut}`);
if (later.wetMid > size * 0.42) fail(`Ader zerläuft später: wetMid=${later.wetMid}`);
if (later.centroidY < report.centroidY - 8) fail(`Wasser wandert zurück zur Quelle: ${later.centroidY}`);

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
    grainy[y * size + x] = 0.52 + (fbm((x / size) * 7.5, (y / size) * 7.5, 4, 11) - 0.5) * 0.016;
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

const bedBuilt = getPreset("bed").build(size);
const bedSim = new ErosionSim(size, DEFAULT_PARAMS, bedBuilt.terrain);
bedSim.sources = bedBuilt.sources;
const bed0 = bedSim.terrain.slice();
bedSim.step(140);
const bedReport = measureVein(bedSim, bed0);
console.log(JSON.stringify({ bed: bedReport }));
if (bedReport.eroded < 0.8) fail(`vorgegrabenes Bett erodiert zu wenig: ${bedReport.eroded}`);
if (bedReport.centroidY < 30) fail(`Bett-Fluss bleibt oben: ${bedReport.centroidY}`);
if (bedReport.wetMid > size * 0.45) fail(`Bett wird zur Fläche: wetMid=${bedReport.wetMid}`);

const deltaBuilt = getPreset("delta").build(size);
const deltaSim = new ErosionSim(size, DEFAULT_PARAMS, deltaBuilt.terrain);
deltaSim.sources = deltaBuilt.sources;
deltaSim.step(160);
const row = (size * 0.72) | 0;
let deltaClusters = 0;
let inRun = false;
for (let x = 2; x < size - 2; x++) {
  const on = deltaSim.water[row * size + x] > 0.0018 || deltaSim.flow[row * size + x] > 0.012;
  if (on && !inRun) {
    deltaClusters++;
    inRun = true;
  }
  if (!on) inRun = false;
}
console.log(JSON.stringify({ deltaClusters, deltaVol: +deltaSim.waterVolume().toFixed(3) }));
if (deltaClusters < 2) fail(`Delta verzweigt nicht: clusters=${deltaClusters}`);

const hardBuilt = getPreset("slope").build(size);
const hardSim = new ErosionSim(size, DEFAULT_PARAMS, hardBuilt.terrain);
hardSim.sources = hardBuilt.sources;
for (let y = 0; y < size; y++) {
  const v = y / (size - 1);
  for (let x = 0; x < size; x++) {
    if (v >= 0.38 && v <= 0.52) hardSim.hardmask[y * size + x] = 1;
  }
}
const hard0 = hardSim.terrain.slice();
hardSim.step(100);
let hardCut = 0;
let sandCut = 0;
let waterOnHard = 0;
for (let i = 0; i < hard0.length; i++) {
  const cut = hard0[i] - hardSim.terrain[i];
  if (hardSim.hardmask[i] >= 0.5) {
    hardCut = Math.max(hardCut, cut);
    if (hardSim.water[i] > 0.001) waterOnHard++;
  } else {
    sandCut = Math.max(sandCut, cut);
  }
}
console.log(JSON.stringify({ hardCut: +hardCut.toFixed(5), sandCut: +sandCut.toFixed(4), waterOnHard }));
if (hardCut > 1e-5) fail(`Hartzellen erodieren: ${hardCut}`);
if (sandCut < 0.012) fail(`Sand neben Beton erodiert nicht: ${sandCut}`);
if (waterOnHard < 6) fail(`Wasser fließt nicht über Beton: ${waterOnHard}`);

const depFlat = new Float32Array(size * size);
depFlat.fill(0.52);
const dep = new ErosionSim(size, DEFAULT_PARAMS, depFlat);
for (let i = 0; i < dep.hardmask.length; i++) dep.hardmask[i] = 1;
dep.sediment.fill(0.08);
const dep0 = dep.terrain.slice();
dep.step(20);
let depRaise = 0;
for (let i = 0; i < dep0.length; i++) depRaise = Math.max(depRaise, dep.terrain[i] - dep0[i]);
if (depRaise > 1e-5) fail(`Ablagerung auf Beton: ${depRaise}`);

const bowl = new Float32Array(size * size);
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const u = x / (size - 1) - 0.5;
    const v = y / (size - 1) - 0.5;
    const r = Math.hypot(u, v);
    bowl[y * size + x] = 0.52 - Math.max(0, 0.22 - r) * 0.55;
  }
}
const pool = new ErosionSim(size, DEFAULT_PARAMS, bowl);
pool.sources = [];
const bowl0 = pool.terrain.slice();
for (let s = 0; s < 36; s++) {
  pool.pour(0.5, 0.5, 0.55);
  pool.step(1);
}
const midI = ((size * 0.5) | 0) * size + ((size * 0.5) | 0);
const poolDepth = pool.water[midI];
const poolCut = maxCutNear(bowl0, pool.terrain, (size * 0.5) | 0, (size * 0.5) | 0, 8);
let rimWet = 0;
for (let x = 2; x < size - 2; x++) {
  if (pool.water[2 * size + x] > 0.004) rimWet++;
}
console.log(JSON.stringify({ poolDepth: +poolDepth.toFixed(4), poolCut: +poolCut.toFixed(4), rimWet }));
if (poolDepth < 0.045) fail(`Becken bleibt zu flach: ${poolDepth}`);
if (poolCut > 0.02) fail(`stehendes Becken brennt ein: ${poolCut}`);
if (rimWet > size * 0.35) fail(`Becken läuft über den Rand: rimWet=${rimWet}`);

const glideFlat = new Float32Array(size * size);
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    glideFlat[y * size + x] = 0.58 - (y / (size - 1)) * 0.16;
  }
}
const glide = new ErosionSim(size, { ...DEFAULT_PARAMS, infiltration: 0, evaporation: 0 }, glideFlat);
glide.sources = [];
glide.pour(0.5, 0.22, 1.4);
glide.step(40);
let mass = 0;
let massY = 0;
let past = 0;
for (let i = 0; i < glide.water.length; i++) {
  const w = glide.water[i];
  if (w < 1e-5) continue;
  mass += w;
  const y = (i / size) | 0;
  massY += y * w;
  if (y > size * 0.48) past += w;
}
const glideCy = mass > 0 ? massY / mass : 0;
console.log(JSON.stringify({ glideCy: +glideCy.toFixed(1), glidePast: +past.toFixed(3), glideVol: +mass.toFixed(3) }));
if (glideCy < size * 0.3) fail(`keine Trägheit / Welle: centroidY=${glideCy}`);
if (past < 0.08) fail(`Wasser propagiert nicht wellenartig: past=${past}`);

const damBuilt = getPreset("slope").build(size);
const damSim = new ErosionSim(size, DEFAULT_PARAMS, damBuilt.terrain);
damSim.sources = damBuilt.sources;
damSim.step(50);
const damY = (size * 0.42) | 0;
const upMass = (sim: ErosionSim) => {
  let s = 0;
  for (let y = 2; y < damY; y++) {
    for (let x = 2; x < size - 2; x++) s += sim.water[y * size + x];
  }
  return s;
};
const up0 = upMass(damSim);
for (let u = 0.32; u <= 0.68; u += 0.03) {
  damSim.brush("dam", u, 0.42, 0.07, 1.9);
}
const damRow = damSim.terrain.slice(damY * size, damY * size + size);
damSim.step(18);
const up1 = upMass(damSim);
damSim.step(70);
let damCut = 0;
for (let x = 2; x < size - 2; x++) {
  damCut = Math.max(damCut, damRow[x] - damSim.terrain[damY * size + x]);
}
console.log(JSON.stringify({ damUp0: +up0.toFixed(3), damUp1: +up1.toFixed(3), damCut: +damCut.toFixed(4) }));
if (up1 < up0 * 0.95) fail(`Damm staut nicht: ${up0} → ${up1}`);
if (damCut < 0.008) fail(`kein Unterspülen nach Überlauf: ${damCut}`);
