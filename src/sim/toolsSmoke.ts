import { History } from "../state/history";
import { DEFAULT_PARAMS } from "../state/types";
import { ErosionSim } from "./erosionCore";
import { PRESETS, getPreset } from "./presets";
import type { SimSnapshot } from "./SimClient";

function fail(msg: string): never {
  console.error(msg);
  throw new Error(msg);
}

function variance(arr: Float32Array, edge: number, size: number): number {
  let sum = 0;
  let n = 0;
  for (let y = edge; y < size - edge; y++) {
    for (let x = edge; x < size - edge; x++) {
      sum += arr[y * size + x];
      n++;
    }
  }
  const mean = sum / n;
  let acc = 0;
  for (let y = edge; y < size - edge; y++) {
    for (let x = edge; x < size - edge; x++) {
      const d = arr[y * size + x] - mean;
      acc += d * d;
    }
  }
  return acc / n;
}

const size = 128;
const flat = new Float32Array(size * size);
flat.fill(0.52);

const tamp = new ErosionSim(size, DEFAULT_PARAMS, flat.slice());
tamp.brush("tamp", 0.5, 0.5, 0.08, 1.4);
const mid = ((size * 0.5) | 0) * size + ((size * 0.5) | 0);
if (tamp.cohesion[mid] < 0.12) fail(`Feststampfen hebt Kohäsion nicht: ${tamp.cohesion[mid]}`);
if (tamp.terrain[mid] >= 0.52) fail("Feststampfen sollte Sand leicht verdichten");

const groove = new ErosionSim(size, DEFAULT_PARAMS, flat.slice());
for (let t = 0; t <= 10; t++) groove.brush("groove", 0.5, 0.15 + t * 0.06, 0.05, 1.2);
const gCut = 0.52 - groove.terrain[mid];
if (gCut < 0.04) fail(`Rinne zu flach: ${gCut}`);

const bumpy = flat.slice();
for (let i = 0; i < bumpy.length; i++) bumpy[i] += ((i % 17) - 8) * 0.008;
const level = new ErosionSim(size, DEFAULT_PARAMS, bumpy);
const beforeVar = variance(level.terrain, 8, size);
level.flattenAll();
const afterVar = variance(level.terrain, 8, size);
if (afterVar >= beforeVar * 0.15) fail(`Einebnen senkt Varianz nicht genug: ${beforeVar} → ${afterVar}`);

const brushFlat = new ErosionSim(size, DEFAULT_PARAMS, bumpy.slice());
brushFlat.brush("flatten", 0.5, 0.5, 0.12, 2);
const local = ((size * 0.5) | 0) * size + ((size * 0.5) | 0);
const neighbor = local + 3;
if (Math.abs(brushFlat.terrain[local] - brushFlat.terrain[neighbor]) > 0.04) {
  fail("Einebnen-Pinsel lässt die Auswahl zu rau");
}

const needed = ["canyon", "delta", "referenz", "veins", "meet"];
for (const id of needed) {
  const p = getPreset(id);
  if (p.id !== id) fail(`Preset fehlt: ${id}`);
  if (!p.camera) fail(`Preset ${id} ohne Kamera`);
  const built = p.build(size);
  if (!built.sources.length) fail(`Preset ${id} ohne Quelle`);
  if (built.terrain.length !== size * size) fail(`Preset ${id} falsche Größe`);
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < built.terrain.length; i++) {
    min = Math.min(min, built.terrain[i]);
    max = Math.max(max, built.terrain[i]);
  }
  if (max - min < 0.12) fail(`Preset ${id} zu flach: ${max - min}`);
}

for (const p of PRESETS) {
  if (!p.camera?.position || !p.camera?.target) fail(`Kamera fehlt: ${p.id}`);
}

const snap: SimSnapshot = {
  size,
  terrain: tamp.terrain.slice(),
  water: tamp.water.slice(),
  wetness: tamp.wetness.slice(),
  sediment: tamp.sediment.slice(),
  cohesion: tamp.cohesion.slice(),
  sources: [],
  erodedSand: 0,
};
const hist = new History();
hist.push(snap);
tamp.brush("tamp", 0.5, 0.5, 0.08, 1.4);
const after: SimSnapshot = {
  ...snap,
  terrain: tamp.terrain.slice(),
  cohesion: tamp.cohesion.slice(),
};
const undone = hist.undo(after);
if (!undone || undone.cohesion[mid] >= after.cohesion[mid]) {
  fail("Undo stellt lokale Kohäsion nicht wieder her");
}
const redone = hist.redo(undone);
if (!redone || redone.cohesion[mid] < undone.cohesion[mid]) {
  fail("Redo bringt lokale Kohäsion nicht zurück");
}

console.log(
  JSON.stringify({
    tampCohesion: +tamp.cohesion[mid].toFixed(3),
    grooveCut: +gCut.toFixed(3),
    flattenVar: [+beforeVar.toFixed(5), +afterVar.toFixed(5)],
    presets: PRESETS.map((p) => p.id),
    undoOk: true,
  }),
);
console.log("tools-presets smoke ok");
