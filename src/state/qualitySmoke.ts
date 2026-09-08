import { MAX_PARTICLES } from "../sim/flowFx";
import { MAX_STEP_BACKLOG, MAX_STEP_BATCH, planFlushBacklog, planSimStep } from "../sim/SimClient";
import {
  AUTO_FPS_FLOOR,
  AUTO_FPS_HOLD_MS,
  autoQualityToast,
  isIosWebKit,
  autoQualityResamplesSim,
  nextLowerQuality,
  particleDrawCount,
  pixelRatioFor,
  planQualityMaps,
  qualityAntialias,
  qualityChangesSim,
  qualityProfile,
  rendererPowerPreference,
  tickAutoQuality,
} from "./quality";
import { QUALITY_GRID, QUALITY_LABEL, type QualityId } from "./types";

function fail(msg: string): never {
  console.error(msg);
  throw new Error(msg);
}

function assert(cond: boolean, msg: string): void {
  if (!cond) fail(msg);
}

const order: QualityId[] = ["low", "medium", "high", "ultra"];
for (let i = 1; i < order.length; i++) {
  const prev = qualityProfile(order[i - 1]);
  const next = qualityProfile(order[i]);
  if (next.grid <= prev.grid) fail(`${next.id} grid should exceed ${prev.id}`);
  if (next.particles <= prev.particles) fail(`${next.id} particles should exceed ${prev.id}`);
  if (next.pixelRatioCap < prev.pixelRatioCap) fail(`${next.id} dpr cap should not drop`);
  if (next.lookHeightMicro < prev.lookHeightMicro) fail(`${next.id} height micro should not drop`);
  if (next.lookWoodNormal < prev.lookWoodNormal) fail(`${next.id} wood normal should not drop`);
}

const low = qualityProfile("low");
const med = qualityProfile("medium");
const high = qualityProfile("high");
const ultra = qualityProfile("ultra");

assert(low.grid === QUALITY_GRID.low && low.grid === 128, "low 128");
assert(med.grid === 256, "medium 256");
assert(high.grid === 512, "high 512");
assert(ultra.grid === 768, "ultra 768");
assert(qualityChangesSim("high", "ultra"), "ultra resamples the sim");

assert(low.particles === 0, "low emits no particles");
assert(med.particles === 80, "medium particle cap");
assert(high.particles === 180, "high particle cap");
assert(ultra.particles === MAX_PARTICLES, "ultra uses full FX budget");
assert(particleDrawCount(400, "medium") === 80, "draw cap medium");
assert(particleDrawCount(40, "high") === 40, "draw does not invent particles");
assert(particleDrawCount(10, "low") === 0, "low draw 0");

assert(low.lookHeightMicro === 0, "low skips height micro-relief");
assert(low.lookWoodNormal === 0, "low skips wood normals");
assert(med.lookHeightMicro > 0 && ultra.lookHeightMicro > med.lookHeightMicro, "height micro scales");
assert(med.lookWoodNormal > 0 && ultra.lookWoodNormal > med.lookWoodNormal, "wood normal scales");

assert(!low.shadows && !med.shadows, "shadows off until High");
assert(high.shadows && high.shadowMap === 1024, "high shadow map 1024");
assert(ultra.shadows && ultra.shadowMap === 2048, "ultra shadow map 2048");
assert(high.shadowMap < ultra.shadowMap, "ultra shadows are sharper");

assert(pixelRatioFor("low", 3) === 1, "low dpr");
assert(pixelRatioFor("medium", 3, false) === 1.25, "medium dpr");
assert(pixelRatioFor("medium", 3, true) === 1.15, "medium mobile dpr");
assert(pixelRatioFor("high", 3) === 1.5, "high dpr");
assert(pixelRatioFor("ultra", 3) === 2, "ultra dpr");
assert(pixelRatioFor("ultra", 3, false, true) === 1.25, "iOS caps ultra dpr");
assert(pixelRatioFor("low", 3, true, true) === 1, "iOS low stays 1");

assert(!qualityAntialias("high", false, true), "iOS never antialiases");
assert(!qualityAntialias("high", true, false), "mobile never antialiases");
assert(qualityAntialias("high", false, false), "desktop high antialiases");
assert(!qualityAntialias("low", false, false), "low skips antialias");
assert(rendererPowerPreference(true) === "default", "iOS default GPU");
assert(rendererPowerPreference(false) === "high-performance", "desktop high-perf");

assert(isIosWebKit("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15", "iPhone", 5), "iphone safari");
assert(
  isIosWebKit("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15", "MacIntel", 5),
  "ipad desktop-UA",
);
assert(!isIosWebKit("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Win32", 0), "desktop chrome");

assert(AUTO_FPS_FLOOR === 40, "auto floor 40");
assert(AUTO_FPS_HOLD_MS === 2000, "auto hold 2s");
assert(nextLowerQuality("ultra") === "high", "ultra → high");
assert(nextLowerQuality("high") === "medium", "high → medium");
assert(nextLowerQuality("medium") === "low", "medium → low");
assert(nextLowerQuality("low") === null, "low is the floor");

const cold = tickAutoQuality(39, 0, 500);
assert(!cold.shouldDrop && cold.lowFpsMs === 500, "first low sample");
const warm = tickAutoQuality(30, 1500, 500);
assert(warm.shouldDrop && warm.lowFpsMs === 0, "2s under 40 drops once");
const recover = tickAutoQuality(60, 1500, 500);
assert(!recover.shouldDrop && recover.lowFpsMs === 0, "recovery resets");
const highOk = tickAutoQuality(40, 1500, 500);
assert(!highOk.shouldDrop && highOk.lowFpsMs === 0, "40 FPS is enough");
assert(autoQualityToast("medium") === `Qualität automatisch auf ${QUALITY_LABEL.medium} gesenkt.`, "toast copy");
assert(!autoQualityResamplesSim(), "auto must not rebuild the sim grid");
assert(
  planQualityMaps({ resample: false, hasPacked: true, lastSize: 512, mapWidth: 512, nextGrid: 256 }) === "keep",
  "auto step-down keeps live terrain",
);
assert(
  planQualityMaps({ resample: true, hasPacked: true, lastSize: 512, mapWidth: 512, nextGrid: 256 }) === "resample",
  "manual quality still resamples",
);
assert(
  planQualityMaps({ resample: true, hasPacked: true, lastSize: 256, mapWidth: 512, nextGrid: 256 }) === "keep",
  "never wipe packed maps when size already matches",
);
assert(
  planQualityMaps({ resample: true, hasPacked: false, lastSize: 0, mapWidth: 128, nextGrid: 256 }) === "allocEmpty",
  "boot may allocate empty maps",
);

const idle = planSimStep(2, 0, 0);
assert(idle.send === 2 && idle.backlog === 0 && idle.skipped === 0, "idle step sends");
const flood = planSimStep(32, 0, 0);
assert(flood.send === MAX_STEP_BATCH && flood.skipped === 32 - MAX_STEP_BATCH, "batch cap");
const busy = planSimStep(4, 1, 0);
assert(busy.send === 0 && busy.backlog === MAX_STEP_BACKLOG && busy.skipped === 4 - MAX_STEP_BACKLOG, "busy coalesces one");
const flooded = planSimStep(8, 1, 1);
assert(flooded.send === 0 && flooded.backlog === 1 && flooded.skipped === 8, "no flood while behind");
assert(planSimStep(0, 0, 0).send === 0, "zero steps");
const pausedFlush = planFlushBacklog(false, 0, 1);
assert(pausedFlush.send === 0 && pausedFlush.backlog === 0, "pause drops backlog");
const pausedBusy = planFlushBacklog(false, 1, 1);
assert(pausedBusy.send === 0 && pausedBusy.backlog === 0, "pause drops backlog while a frame is in flight");
const playFlush = planFlushBacklog(true, 0, 1);
assert(playFlush.send === 1 && playFlush.backlog === 0, "play flushes one backlog tick");
const playBusy = planFlushBacklog(true, 1, 1);
assert(playBusy.send === 0 && playBusy.backlog === 1, "play keeps backlog while busy");

console.log("qualitySmoke ok", {
  grids: { low: low.grid, med: med.grid, high: high.grid, ultra: ultra.grid },
  particles: { low: low.particles, med: med.particles, high: high.particles, ultra: ultra.particles },
  shadows: { high: high.shadowMap, ultra: ultra.shadowMap },
  dpr: { low: low.pixelRatioCap, ultra: ultra.pixelRatioCap },
});
