/**
 * Post-pipe polish: gentle pours → rivulet then pool; no burn-in;
 * thermal must not melt hardmask channels; rain + new presets.
 */
import { fbm } from "../assets/noise";
import { DEFAULT_PARAMS } from "../state/types";
import { ErosionSim } from "./erosionCore";
import { MAX_WATER_DEPTH } from "./hydraulic";
import { HARD_THRESHOLD } from "./mapsContract";
import {
  getPreset,
  placeSourceOnTerrain,
  SENSIBLE_SOURCE_RATE_MAX,
  SENSIBLE_SOURCE_RATE_MIN,
  sourceSitsOnTerrain,
} from "./presets";
import { hardSupportCount, thermalRateScale, thermalSlip } from "./thermalErosion";

function fail(msg: string): never {
  console.error(msg);
  throw new Error(msg);
}

function maxAbsHardMove(before: Float32Array, after: Float32Array, hard: Float32Array): number {
  let m = 0;
  for (let i = 0; i < before.length; i++) {
    if (hard[i] < HARD_THRESHOLD) continue;
    m = Math.max(m, Math.abs(after[i] - before[i]));
  }
  return m;
}

function maxCutNear(before: Float32Array, after: Float32Array, cx: number, cy: number, rad: number, size: number): number {
  let cut = 0;
  for (let y = cy - rad; y <= cy + rad; y++) {
    for (let x = cx - rad; x <= cx + rad; x++) {
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      cut = Math.max(cut, before[y * size + x] - after[y * size + x]);
    }
  }
  return cut;
}

function rowWet(sim: ErosionSim, size: number, v: number, thresh = 0.002) {
  const y = Math.max(1, Math.min(size - 2, (v * (size - 1)) | 0));
  let wet = 0;
  let clusters = 0;
  let inRun = false;
  let maxW = 0;
  const cols: number[] = [];
  for (let x = 2; x < size - 2; x++) {
    const w = sim.water[y * size + x];
    if (w > thresh) {
      wet++;
      cols.push(x);
      if (w > maxW) maxW = w;
      if (!inRun) {
        clusters++;
        inRun = true;
      }
    } else inRun = false;
  }
  const span = cols.length ? cols[cols.length - 1] - cols[0] + 1 : 0;
  return { wet, clusters, span, maxW };
}

function bandWet(sim: ErosionSim, size: number, v0: number, v1: number, thresh = 0.002) {
  const y0 = Math.max(1, (v0 * (size - 1)) | 0);
  const y1 = Math.min(size - 2, (v1 * (size - 1)) | 0);
  let wet = 0;
  let maxW = 0;
  const xs = new Set<number>();
  for (let y = y0; y <= y1; y++) {
    for (let x = 2; x < size - 2; x++) {
      const w = sim.water[y * size + x];
      if (w > thresh) {
        wet++;
        xs.add(x);
        if (w > maxW) maxW = w;
      }
    }
  }
  return { wet, cols: xs.size, maxW };
}

function massCentroidY(sim: ErosionSim, size: number) {
  let m = 0;
  let my = 0;
  for (let i = 0; i < sim.water.length; i++) {
    const w = sim.water[i];
    if (w < 1e-5) continue;
    m += w;
    my += ((i / size) | 0) * w;
  }
  return { vol: m, cy: m > 0 ? my / m : 0 };
}

{
  const size = 32;
  const t = new Float32Array(size * size);
  const hard = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (x < 10 || x > 21) {
        t[i] = 0.82;
        hard[i] = 1;
      } else {
        t[i] = 0.4;
      }
    }
  }
  if (hardSupportCount(hard, t, size, 10, 8) < 1) fail("gutter floor should see a hard wall");
  if (hardSupportCount(hard, t, size, 4, 8) !== 0) fail("hard cell is not a gutter");
}

{
  const size = 48;
  const t = new Float32Array(size * size);
  const hard = new Float32Array(size * size);
  const water = new Float32Array(size * size);
  const wet = new Float32Array(size * size);
  const coh = new Float32Array(size * size);
  const delta = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / (size - 1);
      const i = y * size + x;
      if (u < 0.3 || u > 0.7) {
        t[i] = 0.9;
        hard[i] = 1;
      } else if (u < 0.38 || u > 0.62) {
        t[i] = 0.86;
      } else {
        t[i] = 0.38;
      }
    }
  }
  const mid = ((size * 0.5) | 0) * size + ((size * 0.5) | 0);
  const bed0 = t[mid];
  const wall0 = t[((size * 0.5) | 0) * size + 4];
  thermalSlip(t, water, wet, coh, hard, delta, size, 0.55, 0.28);
  if (Math.abs(t[((size * 0.5) | 0) * size + 4] - wall0) > 1e-6) fail("thermal moved a hard wall");
  if (t[mid] - bed0 > 0.035) fail(`thermal filled the hardmask channel: ${t[mid] - bed0}`);
}

{
  const size = 96;
  const t = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = y / (size - 1);
      t[y * size + x] =
        0.42 + (1 - v) * 0.12 + (fbm((x / size) * 7.5, v * 7.5, 4, 11) - 0.5) * 0.016;
    }
  }
  const sim = new ErosionSim(size, DEFAULT_PARAMS, t);
  const t0 = t.slice();
  for (let s = 0; s < 46; s++) {
    sim.pour(0.5, 0.18, 0.16);
    sim.step(1);
  }
  const midRun = bandWet(sim, size, 0.4, 0.58);
  const midRunRow = rowWet(sim, size, 0.5);
  sim.step(28);
  const mid = bandWet(sim, size, 0.4, 0.58);
  const low = rowWet(sim, size, 0.8);
  const mass = massCentroidY(sim, size);
  const cut = maxCutNear(t0, sim.terrain, (size * 0.5) | 0, (size * 0.18) | 0, 6, size);
  let midWetness = 0;
  const midY = (size * 0.48) | 0;
  for (let x = 2; x < size - 2; x++) midWetness = Math.max(midWetness, sim.wetness[midY * size + x]);
  console.log(
    JSON.stringify({
      trayPour: {
        vol: +mass.vol.toFixed(3),
        cy: +mass.cy.toFixed(1),
        midRun,
        midRunRow,
        mid,
        low,
        cut: +cut.toFixed(4),
        midWetness: +midWetness.toFixed(3),
      },
    }),
  );
  if (mass.cy < size * 0.4) fail(`gentle pour did not run downhill: cy=${mass.cy}`);
  if (midRun.wet < 4 || midRun.cols < 2) fail(`no rivulet while pouring: ${JSON.stringify(midRun)}`);
  if (midRun.cols > size * 0.5) fail(`gentle pour sheeted at mid: cols=${midRun.cols}`);
  if (midRunRow.wet > size * 0.4) fail(`mid row is a sheet: wet=${midRunRow.wet}`);
  if (low.wet < 4) fail(`foot of tray stayed dry: wet=${low.wet}`);
  if (low.maxW < 0.006 && low.wet < 8) fail(`no pool at the foot: ${JSON.stringify(low)}`);
  if (cut > 0.034) fail(`gentle pour burned in: cut=${cut}`);
  if (mid.wet < 1 && midWetness < 0.05) fail("rivulet path dried without wetting the sand");
}

{
  const size = 64;
  const flat = new Float32Array(size * size);
  flat.fill(0.52);
  const still = new ErosionSim(size, DEFAULT_PARAMS, flat);
  const t0 = still.terrain.slice();
  still.pour(0.5, 0.5, 0.9);
  still.step(70);
  const cut = maxCutNear(t0, still.terrain, (size * 0.5) | 0, (size * 0.5) | 0, 7, size);
  if (cut > 0.016) fail(`still pour burned a hole: ${cut}`);
}

{
  const size = 80;
  const built = getPreset("betonkanal").build(size);
  if (!built.hardmask) fail("betonkanal has no hardmask");
  const sim = new ErosionSim(size, DEFAULT_PARAMS, built.terrain);
  sim.hardmask.set(built.hardmask);
  sim.sources = built.sources;
  const t0 = sim.terrain.slice();
  const hard0 = sim.hardmask.slice();
  sim.step(110);
  const hardMove = maxAbsHardMove(t0, sim.terrain, hard0);
  let bedCut = 0;
  let relief0 = 0;
  let relief1 = 0;
  const midY = (size * 0.5) | 0;
  let wall0 = 0;
  let bed0 = 9;
  let wall1 = 0;
  let bed1 = 9;
  for (let x = 2; x < size - 2; x++) {
    const i = midY * size + x;
    if (hard0[i] >= HARD_THRESHOLD) {
      wall0 = Math.max(wall0, t0[i]);
      wall1 = Math.max(wall1, sim.terrain[i]);
    } else {
      bed0 = Math.min(bed0, t0[i]);
      bed1 = Math.min(bed1, sim.terrain[i]);
      bedCut = Math.max(bedCut, t0[i] - sim.terrain[i]);
    }
  }
  relief0 = wall0 - bed0;
  relief1 = wall1 - bed1;
  const mid = rowWet(sim, size, 0.5);
  console.log(
    JSON.stringify({
      betonkanal: { hardMove: +hardMove.toFixed(6), relief0: +relief0.toFixed(3), relief1: +relief1.toFixed(3), mid, bedCut: +bedCut.toFixed(4) },
    }),
  );
  if (hardMove > 1e-6) fail(`betonkanal hardmask moved: ${hardMove}`);
  if (relief1 < 0.16) fail(`betonkanal walls lost relief: ${relief0} → ${relief1}`);
  if (mid.wet < 2) fail("betonkanal stayed dry at mid");
  if (mid.span > size * 0.42) fail(`betonkanal spilled out of the flume: span=${mid.span}`);
}

{
  const size = 80;
  const built = getPreset("regen-hang").build(size);
  if (!built.hardmask) fail("regen-hang has no hardmask");
  if (built.sources[0]?.kind !== "rain") fail("regen-hang should use a rain source");
  const rain = built.sources[0];
  if (!sourceSitsOnTerrain(built.terrain, built.hardmask, size, rain)) {
    fail(`regen-hang source is not on sand: ${JSON.stringify(rain)}`);
  }
  if (rain.rate < SENSIBLE_SOURCE_RATE_MIN || rain.rate > SENSIBLE_SOURCE_RATE_MAX) {
    fail(`regen-hang rain rate is not sensible: ${rain.rate}`);
  }
  const planted = placeSourceOnTerrain(built.terrain, built.hardmask, size, rain.x, rain.y);
  if (Math.hypot(planted.x - rain.x, planted.y - rain.y) > 0.04) {
    fail(`regen-hang pin would snap away from the bed: ${JSON.stringify({ rain, planted })}`);
  }
  const sim = new ErosionSim(size, DEFAULT_PARAMS, built.terrain);
  sim.hardmask.set(built.hardmask);
  sim.sources = built.sources;
  const t0 = sim.terrain.slice();
  sim.step(110);
  const hardMove = maxAbsHardMove(t0, sim.terrain, sim.hardmask);
  const mid = rowWet(sim, size, 0.42);
  const basin = bandWet(sim, size, 0.78, 0.92, 0.0015);
  const mass = massCentroidY(sim, size);
  let basinCut = 0;
  let slopeCut = 0;
  for (let y = 2; y < size - 2; y++) {
    const v = y / (size - 1);
    for (let x = 2; x < size - 2; x++) {
      const i = y * size + x;
      if (sim.hardmask[i] >= HARD_THRESHOLD) continue;
      const cut = t0[i] - sim.terrain[i];
      const u = x / (size - 1);
      if (v >= 0.8 && v <= 0.92 && u >= 0.18 && u <= 0.82) {
        basinCut = Math.max(basinCut, cut);
      }
      if (v < 0.7) slopeCut = Math.max(slopeCut, cut);
    }
  }
  console.log(
    JSON.stringify({
      regenHang: {
        hardMove: +hardMove.toFixed(6),
        mid,
        basin,
        cy: +mass.cy.toFixed(1),
        vol: +mass.vol.toFixed(3),
        basinCut: +basinCut.toFixed(4),
        slopeCut: +slopeCut.toFixed(4),
      },
    }),
  );
  if (hardMove > 1e-6) fail(`regen-hang hardmask moved: ${hardMove}`);
  if (mass.vol < 0.4) fail(`regen-hang rain did not wet the slope: vol=${mass.vol}`);
  if (mid.wet > size * 0.55) fail(`regen-hang rained as a sheet: wet=${mid.wet}`);
  if (mid.clusters < 1) fail("regen-hang formed no rivulet");
  if (basin.wet < 6) fail(`regen-hang did not pool at the foot: ${JSON.stringify(basin)}`);
  if (basinCut > 0.02) fail(`regen-hang basin burned in: ${basinCut}`);
  if (slopeCut > 0.03) fail(`regen-hang rain burned the hang: ${slopeCut}`);
  if (basin.maxW > MAX_WATER_DEPTH + 1e-6) fail(`regen-hang water blew the cap: ${basin.maxW}`);
}

{
  const size = 80;
  const built = getPreset("staudamm").build(size);
  if (!built.hardmask) fail("staudamm has no hardmask");
  const inlet = built.sources[0];
  if (!inlet) fail("staudamm has no source");
  if (!sourceSitsOnTerrain(built.terrain, built.hardmask, size, inlet)) {
    fail(`staudamm source is not on sand: ${JSON.stringify(inlet)}`);
  }
  if (inlet.rate < SENSIBLE_SOURCE_RATE_MIN || inlet.rate > SENSIBLE_SOURCE_RATE_MAX) {
    fail(`staudamm rate is not sensible: ${inlet.rate}`);
  }
  const sim = new ErosionSim(size, DEFAULT_PARAMS, built.terrain);
  sim.hardmask.set(built.hardmask);
  sim.sources = built.sources;
  const t0 = sim.terrain.slice();
  sim.step(70);
  let up = 0;
  let down = 0;
  const damY = (size * 0.5) | 0;
  for (let y = 2; y < damY; y++) {
    for (let x = 2; x < size - 2; x++) up += sim.water[y * size + x];
  }
  for (let y = damY + 2; y < size - 2; y++) {
    for (let x = 2; x < size - 2; x++) down += sim.water[y * size + x];
  }
  const hardMove = maxAbsHardMove(t0, sim.terrain, sim.hardmask);
  let lakeCut = 0;
  for (let y = 2; y < damY; y++) {
    for (let x = 2; x < size - 2; x++) {
      const i = y * size + x;
      if (sim.hardmask[i] >= HARD_THRESHOLD) continue;
      lakeCut = Math.max(lakeCut, t0[i] - sim.terrain[i]);
    }
  }
  console.log(
    JSON.stringify({
      staudamm: {
        up: +up.toFixed(3),
        down: +down.toFixed(3),
        hardMove: +hardMove.toFixed(6),
        lakeCut: +lakeCut.toFixed(4),
      },
    }),
  );
  if (hardMove > 1e-6) fail(`staudamm hardmask moved: ${hardMove}`);
  if (up < down * 0.55) fail(`staudamm did not pond upstream: up=${up} down=${down}`);
  if (lakeCut > 0.03) fail(`staudamm reservoir burned in: ${lakeCut}`);
  let maxW = 0;
  for (let i = 0; i < sim.water.length; i++) if (sim.water[i] > maxW) maxW = sim.water[i];
  if (maxW > MAX_WATER_DEPTH + 1e-6) fail(`staudamm water blew the cap: ${maxW}`);
}

{
  const size = 128;
  if (!(thermalRateScale(size) < thermalRateScale(256))) fail("Low thermal scale");
  const t = new Float32Array(size * size);
  const hard = new Float32Array(size * size);
  const water = new Float32Array(size * size);
  const wet = new Float32Array(size * size);
  const coh = new Float32Array(size * size);
  const delta = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      t[y * size + x] = x < size * 0.5 ? 0.78 : 0.4;
    }
  }
  const t0 = t.slice();
  thermalSlip(t, water, wet, coh, hard, delta, size, 0.55, 0.28);
  let moved = 0;
  for (let i = 0; i < t.length; i++) moved += Math.abs(t[i] - t0[i]);
  console.log(JSON.stringify({ lowThermal: { moved: +moved.toFixed(4), k: +thermalRateScale(size).toFixed(3) } }));
  if (moved > 1.8) fail(`Low thermal melted the tray: ${moved}`);
}

if (getPreset("beton-kanal").id !== "betonkanal") fail("beton-kanal alias");

console.log("polishSmoke ok");
