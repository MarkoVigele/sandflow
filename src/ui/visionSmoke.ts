import { QUALITY_GRID } from "../state/types";
import {
  particleDrawCount,
  pixelRatioFor,
  qualityChangesSim,
  qualityProfile,
} from "../state/quality";
import { encodeScene, packMaps, parseScene, toJson, unpackMaps } from "../state/persist";
import { DEFAULT_PARAMS } from "../state/types";
import { sampleCrossSection } from "./crossSection";
import { claimSourceGesture, SOURCE_TOOL_TIP, sourceTipVisible } from "./sourceGesture";
import { applyPlay, lapseSpeed, speedFromIndex, speedIndex, stepsThisFrame, togglePlaying } from "./transport";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const low = qualityProfile("low");
const med = qualityProfile("medium");
const high = qualityProfile("high");
assert(low.grid === QUALITY_GRID.low && low.grid === 128, "low grid 128");
assert(med.grid === 256 && high.grid === 512, "med/high grids");
assert(low.pixelRatioCap < med.pixelRatioCap && med.pixelRatioCap <= high.pixelRatioCap, "pixel cap rises");
assert(low.particleRatio === 0, "low draws no particles");
assert(med.particleRatio > 0 && med.particleRatio < high.particleRatio, "particle ratio Low < Med < High");
assert(particleDrawCount(100, "low") === 0, "low particle draw 0");
assert(particleDrawCount(100, "medium") === 35, `med particles, got ${particleDrawCount(100, "medium")}`);
assert(particleDrawCount(100, "high") === 75, "high particles");
assert(pixelRatioFor("low", 3) === 1, "low caps dpr at 1");
assert(pixelRatioFor("high", 3) === 1.5, "high caps dpr at 1.5");
assert(pixelRatioFor("ultra", 3) === 2, "ultra caps dpr at 2");
assert(qualityChangesSim("low", "high") && !qualityChangesSim("high", "ultra"), "grid change only when size moves");

assert(SOURCE_TOOL_TIP === "tippen = wählen, ziehen = verschieben", "canonical source tip");
assert(sourceTipVisible("source", 0) && !sourceTipVisible("source", 2) && !sourceTipVisible("pile", 0), "tip visibility");

const pin = claimSourceGesture({
  tool: "source",
  cameraMode: true,
  hitSourceId: "s-1",
  draggingSource: null,
});
assert(pin.tool && !pin.orbit && pin.sourceId === "s-1", "source pin beats camera orbit");

const drag = claimSourceGesture({
  tool: "source",
  cameraMode: true,
  hitSourceId: null,
  draggingSource: "s-1",
});
assert(drag.tool && !drag.orbit, "in-flight source drag keeps orbit off");

const cam = claimSourceGesture({
  tool: "source",
  cameraMode: true,
  hitSourceId: null,
  draggingSource: null,
});
assert(cam.orbit && !cam.tool, "empty camera-mode tap still orbits");

const tool = claimSourceGesture({
  tool: "pile",
  cameraMode: false,
  hitSourceId: "s-1",
  draggingSource: null,
});
assert(tool.tool && !tool.orbit, "brush tool keeps one-finger orbit off");

assert(togglePlaying(true) === false && togglePlaying(false) === true, "play toggle");
assert(speedFromIndex(speedIndex(2)) === 2, "speed index roundtrip");
assert(lapseSpeed(1) === 8 && lapseSpeed(8) === 1, "lapse toggle");
const playOnboard = applyPlay(true, 3);
assert(playOnboard.playing && playOnboard.onboardStep === 0 && playOnboard.persistOnboard, "play finishes onboard");
assert(stepsThisFrame(0.25, 0.8).steps === 1, "sub-1 speed accumulates");
assert(stepsThisFrame(2, 0).steps === 2, "2× steps two");
assert(stepsThisFrame(0, 0).steps === 0, "paused speed 0");

const size = 8;
const terrain = new Float32Array(size * size).map((_, i) => (i % size) / size);
const water = new Float32Array(size * size);
water[size * 4 + 4] = 0.2;
const packed = new Float32Array(size * size * 4);
for (let i = 0; i < size * size; i++) {
  packed[i * 4] = terrain[i];
  packed[i * 4 + 1] = water[i];
}
const slice = sampleCrossSection(packed, size, 0.5, 16);
assert(slice.terrain.length === 16, "slice samples");
assert(slice.terrain[0] < slice.terrain[15], "slice follows rising bed");
assert(slice.water.some((w) => w > 0), "slice sees water");

const file = encodeScene({
  name: "t",
  quality: "low",
  params: DEFAULT_PARAMS,
  presetId: "flat",
  size,
  ...packMaps(terrain, water, new Float32Array(size * size)),
  sources: [{ id: "s-1", x: 0.2, y: 0.3, rate: 1.5 }],
  texturePrompt: "sand",
});
const round = parseScene(toJson(file));
assert(round.quality === "low" && round.size === 8, "scene json quality");
assert(unpackMaps(round).terrain[1] === terrain[1], "scene maps roundtrip");
assert(round.sources[0]?.x === 0.2, "scene sources");

console.log("vision smoke ok");
