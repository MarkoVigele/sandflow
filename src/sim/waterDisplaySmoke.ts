/**
 * Display water field: pour/rain caps, channel-preserving blur, flow damping.
 * Physics volume stays; GPU G/A must not carry 1-cell needles.
 */
import { DEFAULT_PARAMS } from "../state/types";
import { ErosionSim } from "./erosionCore";
import { unpackRgba } from "./mapsContract";
import { getPreset } from "./presets";
import {
  DISPLAY_WATER_CAP,
  LIPSCHITZ_RATIO,
  POUR_CELL_ADD_CAP,
  RAIN_CELL_ADD_CAP,
  SOURCE_CELL_ADD_CAP,
  addCappedDelta,
  addWaterKernelCapped,
  blurWaterField,
  clampWaterLipschitz,
  dampFlowField,
  despikeWater,
  packDisplayMapsRgba,
  peakNeighborRatio,
  prepareDisplayMaps,
  softFlow,
} from "./waterDisplay";

function fail(msg: string): never {
  console.error(msg);
  throw new Error(msg);
}

function almost(a: number, b: number, eps: number, label: string): void {
  if (!(Math.abs(a - b) <= eps)) fail(`${label}: ${a} ≉ ${b}`);
}

{
  if (!(POUR_CELL_ADD_CAP < 0.012 && SOURCE_CELL_ADD_CAP <= POUR_CELL_ADD_CAP)) {
    fail("add caps should stay well below a needle column");
  }
  if (!(RAIN_CELL_ADD_CAP < SOURCE_CELL_ADD_CAP)) fail("rain cap should be tighter than a source");
  almost(softFlow(0), 0, 0, "softFlow(0)");
  if (!(softFlow(0.4) < 0.12)) fail(`softFlow should crush huge velocity: ${softFlow(0.4)}`);
  if (!(softFlow(0.04) > 0.02)) fail("modest flow should survive the knee");
}

{
  const size = 32;
  const field = new Float32Array(size * size);
  addCappedDelta(field, size, 16, 16, 0.8, POUR_CELL_ADD_CAP);
  const center = field[16 * size + 16];
  if (center > POUR_CELL_ADD_CAP + 1e-6) fail(`pour cap missed the center: ${center}`);
  let vol = 0;
  let wet = 0;
  for (let i = 0; i < field.length; i++) {
    vol += field[i];
    if (field[i] > 1e-6) wet++;
  }
  almost(vol, 0.8, 1e-5, "capped add keeps volume");
  if (wet < 8) fail(`leftover did not spread: wet=${wet}`);
  if (peakNeighborRatio(field, size, 0.002) > 2.2) {
    fail(`capped add still a needle: ${peakNeighborRatio(field, size, 0.002)}`);
  }
}

{
  const size = 32;
  const field = new Float32Array(size * size);
  addWaterKernelCapped(field, size, 16, 16, 1.1, 0.58, 2, 0.5, POUR_CELL_ADD_CAP);
  let vol = 0;
  let peak = 0;
  for (let i = 0; i < field.length; i++) {
    vol += field[i];
    if (field[i] > peak) peak = field[i];
  }
  if (peak > POUR_CELL_ADD_CAP + 0.02) fail(`kernel peak too sharp: ${peak}`);
  if (vol < 1.5) fail(`kernel lost the old pour mass: ${vol}`);
}

{
  const size = 24;
  const needle = new Float32Array(size * size);
  needle[12 * size + 12] = 0.55;
  const dest = new Float32Array(size * size);
  despikeWater(needle, dest, size);
  if (dest[12 * size + 12] > 0.04) fail(`despike left a column: ${dest[12 * size + 12]}`);
  if (dest[12 * size + 13] < 0.04) fail("despike should fan excess into neighbors");
  const scratch = new Float32Array(size * size);
  blurWaterField(dest, dest, scratch, size);
  const peak = peakNeighborRatio(dest, size, 0.004);
  if (peak > 1.8) fail(`blurred needle still sharp: ${peak}`);
}

{
  const size = 24;
  const vein = new Float32Array(size * size);
  for (let y = 4; y < 20; y++) vein[y * size + 12] = 0.022;
  const dest = new Float32Array(size * size);
  const scratch = new Float32Array(size * size);
  despikeWater(vein, dest, size);
  blurWaterField(dest, dest, scratch, size);
  let side = 0;
  let core = 0;
  for (let y = 6; y < 18; y++) {
    core += dest[y * size + 12];
    side += dest[y * size + 10] + dest[y * size + 14];
  }
  core /= 12;
  side /= 24;
  if (core < 0.009) fail(`channel blur killed the vein: core=${core}`);
  if (side > 0.008) fail(`channel blur sheeted the vein: side=${side}`);
}

{
  const size = 16;
  const water = new Float32Array(size * size);
  const flow = new Float32Array(size * size);
  water[8 * size + 8] = 0.03;
  flow[8 * size + 8] = 0.42;
  const outF = new Float32Array(size * size);
  const scratch = new Float32Array(size * size);
  dampFlowField(flow, water, outF, scratch, size);
  if (outF[8 * size + 8] > 0.11) fail(`display flow not damped: ${outF[8 * size + 8]}`);
  water[8 * size + 8] = 0.002;
  dampFlowField(flow, water, outF, scratch, size);
  if (outF[8 * size + 8] > 0.05) fail(`thin-film flow should mute: ${outF[8 * size + 8]}`);
}

{
  const size = 20;
  const water = new Float32Array(size * size);
  const flow = new Float32Array(size * size);
  water[10 * size + 10] = 0.6;
  flow[10 * size + 10] = 0.35;
  const dw = new Float32Array(size * size);
  const df = new Float32Array(size * size);
  const scratch = new Float32Array(size * size);
  prepareDisplayMaps(water, flow, size, dw, df, scratch);
  if (peakNeighborRatio(dw, size, 0.003) > 1.35) {
    fail(`display water still spiked: ${peakNeighborRatio(dw, size, 0.003)}`);
  }
  if (dw[10 * size + 10] > 0.04) fail(`isolated column reached the GPU: ${dw[10 * size + 10]}`);
  if (dw[10 * size + 10] > DISPLAY_WATER_CAP) fail("display cap");
  if (df[10 * size + 10] >= flow[10 * size + 10]) fail("display flow should be softer than physics");
  const packed = packDisplayMapsRgba(new Float32Array(size * size), water, new Float32Array(size * size), flow, size);
  const maps = unpackRgba(packed, size);
  almost(maps.water[10 * size + 10], dw[10 * size + 10], 1e-6, "packDisplay G");
  almost(maps.flow[10 * size + 10], df[10 * size + 10], 1e-6, "packDisplay A");
}

{
  // P0 forest: checkerboard columns must flatten before upload.
  const size = 28;
  const forest = new Float32Array(size * size);
  const flow = new Float32Array(size * size);
  for (let y = 6; y < 22; y++) {
    for (let x = 6; x < 22; x++) {
      forest[y * size + x] = (x + y) % 2 === 0 ? 0.85 : 0.04;
      flow[y * size + x] = (x + y) % 2 === 0 ? 0.4 : 0.02;
    }
  }
  const dw = new Float32Array(size * size);
  const df = new Float32Array(size * size);
  const scratch = new Float32Array(size * size);
  prepareDisplayMaps(forest, flow, size, dw, df, scratch);
  const peak = peakNeighborRatio(dw, size, 0.004);
  if (peak > LIPSCHITZ_RATIO + 0.08) fail(`GPU still sees spike cells: ${peak}`);
  let maxJump = 0;
  for (let y = 8; y < 20; y++) {
    for (let x = 8; x < 20; x++) {
      const w = dw[y * size + x];
      const nMax = Math.max(
        dw[y * size + x - 1],
        dw[y * size + x + 1],
        dw[(y - 1) * size + x],
        dw[(y + 1) * size + x],
      );
      maxJump = Math.max(maxJump, w - nMax);
    }
  }
  if (maxJump > 0.012) fail(`display Lipschitz failed: jump=${maxJump}`);
  clampWaterLipschitz(forest, scratch, size);
  if (peakNeighborRatio(forest, size, 0.004) > 1.4) fail("raw lipschitz left needles");
}

{
  const size = 48;
  const built = getPreset("slope").build(size);
  const sim = new ErosionSim(size, DEFAULT_PARAMS, built.terrain);
  sim.sources = built.sources;
  sim.step(70);
  const packed = sim.pack();
  const maps = unpackRgba(packed, size);
  let rawVol = 0;
  let visVol = 0;
  let wetMid = 0;
  const mid = (size * 0.55) | 0;
  for (let i = 0; i < sim.water.length; i++) {
    rawVol += sim.water[i];
    visVol += maps.water[i];
  }
  for (let x = 2; x < size - 2; x++) {
    if (maps.water[mid * size + x] > 0.0018) wetMid++;
  }
  const visPeak = peakNeighborRatio(maps.water, size, 0.004);
  const rawPeak = peakNeighborRatio(sim.water, size, 0.004);
  console.log(JSON.stringify({ rawVol: +rawVol.toFixed(3), visVol: +visVol.toFixed(3), wetMid, visPeak: +visPeak.toFixed(2), rawPeak: +rawPeak.toFixed(2) }));
  if (visVol < rawVol * 0.55 || visVol > rawVol * 1.45) {
    fail(`display volume drifted too far: raw=${rawVol} vis=${visVol}`);
  }
  if (wetMid > size * 0.55) fail(`display water sheeted the slope: wetMid=${wetMid}`);
  if (wetMid < 2) fail("display water lost the vein");
  if (visPeak > 1.45) fail(`display peak still needle-like: ${visPeak} vs raw ${rawPeak}`);
}

{
  const size = 32;
  const flat = new Float32Array(size * size);
  flat.fill(0.5);
  const sim = new ErosionSim(size, DEFAULT_PARAMS, flat);
  sim.sources = [];
  sim.pour(0.5, 0.5, 1.2);
  let peak = 0;
  for (let i = 0; i < sim.water.length; i++) if (sim.water[i] > peak) peak = sim.water[i];
  if (peak > 0.045) fail(`pour left a physics needle: ${peak}`);
  const maps = unpackRgba(sim.pack(), size);
  if (peakNeighborRatio(maps.water, size, 0.003) > 1.35) {
    fail(`packed pour still spiked: ${peakNeighborRatio(maps.water, size, 0.003)}`);
  }
}

console.log("waterDisplaySmoke ok");
