import { History } from "../state/history";
import { DEFAULT_PARAMS } from "../state/types";
import {
  countHardCells,
  HARD_STONE,
  HARD_THRESHOLD,
  isConcreteCell,
  isStoneCell,
  resampleMask,
  stoneIslandUvRadius,
} from "./mapsContract";
import { ErosionSim } from "./erosionCore";
import { PRESETS, getPreset, sourceSitsOnTerrain } from "./presets";
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

const pile = new ErosionSim(size, DEFAULT_PARAMS, flat.slice());
pile.brush("pile", 0.5, 0.5, 0.08, 1.4);
if (pile.terrain[mid] <= 0.52) fail("Hügel hebt Sand nicht");

const dug = new ErosionSim(size, DEFAULT_PARAMS, flat.slice());
dug.brush("dig", 0.5, 0.5, 0.08, 1.4);
if (dug.terrain[mid] >= 0.52) fail("Graben trägt Sand nicht ab");

const ridge = new ErosionSim(size, DEFAULT_PARAMS, flat.slice());
ridge.brush("dam", 0.5, 0.5, 0.08, 1.4);
if (ridge.terrain[mid] <= pile.terrain[mid]) fail("Damm muss steiler sein als Hügel");

const wavy = flat.slice();
for (let i = 0; i < wavy.length; i++) wavy[i] += ((i % 11) - 5) * 0.01;
const smo = new ErosionSim(size, DEFAULT_PARAMS, wavy);
const smoN = mid + 2;
const smoGap0 = Math.abs(smo.terrain[mid] - smo.terrain[smoN]);
smo.brush("smooth", 0.5, 0.5, 0.14, 2);
const smoGap1 = Math.abs(smo.terrain[mid] - smo.terrain[smoN]);
if (smoGap1 >= smoGap0 * 0.92) fail(`Glätten zieht Nachbarn nicht zusammen: ${smoGap0} → ${smoGap1}`);

const slab = new ErosionSim(size, DEFAULT_PARAMS, flat.slice());
slab.brush("concrete", 0.5, 0.5, 0.08, 0.7);
if (slab.hardmask[mid] < HARD_THRESHOLD) fail(`Beton setzt Hartmaske nicht: ${slab.hardmask[mid]}`);
if (slab.hardmask[mid] < 0.999) fail(`Beton-Kern muss fest 1 sein: ${slab.hardmask[mid]}`);
let softHalo = 0;
for (let i = 0; i < slab.hardmask.length; i++) {
  const h = slab.hardmask[i];
  if (h > 0 && h < HARD_THRESHOLD) softHalo++;
}
if (softHalo > 0) fail(`Beton darf keinen weichen Hof malen: ${softHalo}`);
const slabH = slab.terrain[mid];
if (slabH <= 0.52) fail("Beton-Platte sollte leicht anheben");
slab.brush("soft", 0.5, 0.5, 0.1, 1.6);
if (slab.hardmask[mid] >= HARD_THRESHOLD) fail("Radierer lässt Beton stehen");
if (slab.hardmask[mid] !== 0) fail(`Radierer muss Hartmaske auf 0 setzen: ${slab.hardmask[mid]}`);

const wall = new ErosionSim(size, DEFAULT_PARAMS, flat.slice());
wall.brush("concrete", 0.5, 0.5, 0.07, 1.8);
if (wall.terrain[mid] <= slabH + 0.01) fail("Hohe Stärke sollte eine Wand bauen");
const wallBefore = wall.terrain[mid];
wall.brush("dig", 0.5, 0.5, 0.1, 2);
if (Math.abs(wall.terrain[mid] - wallBefore) > 1e-6) fail("Graben darf Beton nicht abtragen");

const peb = new ErosionSim(size, DEFAULT_PARAMS, flat.slice());
const islandR = stoneIslandUvRadius(0.08, size, 8);
peb.brush("stone", 0.5, 0.5, islandR, 1);
if (peb.hardmask[mid] < HARD_THRESHOLD) fail(`Kiesel setzt keine Hartinsel: ${peb.hardmask[mid]}`);
if (!isStoneCell(peb.hardmask[mid])) fail(`Kiesel muss HARD_STONE sein, nicht Beton: ${peb.hardmask[mid]}`);
if (Math.abs(peb.hardmask[mid] - HARD_STONE) > 1e-6) fail(`Kiesel-Wert ${peb.hardmask[mid]}`);
if (Math.abs(peb.terrain[mid] - 0.52) > 1e-6) fail("Kiesel darf keine Platte anheben");
const pebH = peb.terrain[mid];
peb.brush("dig", 0.5, 0.5, 0.1, 2);
if (Math.abs(peb.terrain[mid] - pebH) > 1e-6) fail("Graben darf die Kieselinsel nicht abtragen");
let stoneHalo = 0;
for (let i = 0; i < peb.hardmask.length; i++) {
  const h = peb.hardmask[i];
  if (h > 0 && h < HARD_THRESHOLD) stoneHalo++;
}
if (stoneHalo > 0) fail(`Kiesel darf keinen weichen Hof malen: ${stoneHalo}`);

const keepConc = new ErosionSim(size, DEFAULT_PARAMS, flat.slice());
keepConc.brush("concrete", 0.5, 0.5, 0.08, 0.7);
keepConc.brush("stone", 0.5, 0.5, islandR, 1);
if (!isConcreteCell(keepConc.hardmask[mid])) fail("Kiesel darf Beton nicht aufweichen");

const rLow = stoneIslandUvRadius(0.04, 128, 8);
const rHigh = stoneIslandUvRadius(0.14, 512, 8);
if (rLow * 128 < 2.2) fail(`Low-Gitter braucht ≥2.4 Zellen, got ${rLow * 128}`);
if (rHigh <= rLow) fail("größere Kiesel brauchen größere Inseln");

const needed = [
  "canyon",
  "delta",
  "referenz",
  "veins",
  "meet",
  "betonkanal",
  "auffangbecken",
  "treppenueberlauf",
  "betonwehr",
  "regen-hang",
  "staudamm",
];
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

if (getPreset("beton-kanal").id !== "betonkanal") fail("beton-kanal alias fehlt");

const hardPresets = ["betonkanal", "auffangbecken", "treppenueberlauf", "betonwehr", "regen-hang", "staudamm"];
for (const id of hardPresets) {
  const built = getPreset(id).build(size);
  const nHard = countHardCells(built.hardmask);
  if (nHard < size * 6) fail(`Preset ${id} zu wenig Beton: ${nHard}`);
  if (nHard > size * size * 0.92) fail(`Preset ${id} fast nur Beton: ${nHard}`);
}

for (const id of ["regen-hang", "staudamm"] as const) {
  const built = getPreset(id).build(size);
  const src = built.sources[0];
  if (!src || !sourceSitsOnTerrain(built.terrain, built.hardmask, size, src)) {
    fail(`${id} source must sit on sand, not rim/hardmask`);
  }
}

const mask = new Float32Array(16 * 16);
for (let y = 0; y < 16; y++) {
  for (let x = 0; x < 16; x++) {
    mask[y * 16 + x] = x < 8 ? 1 : 0;
  }
}
const up = resampleMask(mask, 16, 32);
if (up[0] < HARD_THRESHOLD || up[31] >= HARD_THRESHOLD) fail("resampleMask nearest");
if (countHardCells(up) < 32 * 14) fail("resampleMask lost hard band");

const stoneMask = new Float32Array(16 * 16);
stoneMask[0] = HARD_STONE;
const upStone = resampleMask(stoneMask, 16, 32);
if (Math.abs(upStone[0] - HARD_STONE) > 1e-6) fail(`resample must keep stone value, got ${upStone[0]}`);
if (upStone[31] >= HARD_THRESHOLD) fail("empty stone resample stayed hard");

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
  hardmask: tamp.hardmask.slice(),
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
if (!hist.flags().canUndo || hist.flags().canRedo) fail("history flags after push");
const undone = hist.undo(after);
if (!undone || undone.cohesion[mid] >= after.cohesion[mid]) {
  fail("Undo stellt lokale Kohäsion nicht wieder her");
}
if (!hist.flags().canRedo) fail("history flags after undo");
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
    concrete: +slab.hardmask[mid].toFixed(3),
    stone: +peb.hardmask[mid].toFixed(3),
    undoOk: true,
  }),
);
console.log("tools-presets smoke ok");
