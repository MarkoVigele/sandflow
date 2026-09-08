import { QUALITY_PROFILE, qualityProfile } from "../state/quality";
import type { QualityId } from "../state/types";
import {
  albedoMicroGrain,
  contactShadow,
  heightMicroRelief,
  bedCausticGain,
  depthTint,
  flowStreakAmp,
  liftDrySandAlbedo,
  waterBodyColor,
  lookAoSteps,
  lookVignette,
  ridgeAO,
  shoreFoamFromVelocity,
  trayShadowOpacity,
  waterSpecCap,
  wetDryMask,
  wetSandAlbedo,
} from "./look";

function fail(msg: string): never {
  console.error(msg);
  throw new Error(msg);
}

function almost(a: number, b: number, eps = 1e-4, label = ""): void {
  if (Math.abs(a - b) > eps) fail(`${label || "value"} expected ${b}, got ${a}`);
}

const order: QualityId[] = ["low", "medium", "high", "ultra"];
for (let i = 1; i < order.length; i++) {
  const prev = qualityProfile(order[i - 1]);
  const next = qualityProfile(order[i]);
  if (next.lookAoSteps < prev.lookAoSteps) fail(`${next.id} AO steps should not drop`);
  if (next.lookFill < prev.lookFill) fail(`${next.id} fill should not drop`);
  if (next.lookGrain < prev.lookGrain) fail(`${next.id} grain should not drop`);
  if (next.lookSpecCap < prev.lookSpecCap) fail(`${next.id} spec cap should not drop`);
  if (next.lookShoreFoam < prev.lookShoreFoam) fail(`${next.id} shore foam should not drop`);
  if (next.lookCaustic < prev.lookCaustic) fail(`${next.id} caustic should not drop`);
  if (next.lookHeightMicro < prev.lookHeightMicro) fail(`${next.id} height micro should not drop`);
  if (next.lookWoodNormal < prev.lookWoodNormal) fail(`${next.id} wood normal should not drop`);
  if (next.lookVignette < prev.lookVignette) fail(`${next.id} vignette should not drop`);
  if (next.lookTrayShadow < prev.lookTrayShadow) fail(`${next.id} tray shadow should not drop`);
}

if (QUALITY_PROFILE.low.lookCaustic !== 0) fail("Low must skip bed caustics");
if (QUALITY_PROFILE.low.lookHeightMicro !== 0) fail("Low must skip height micro-relief");
if (QUALITY_PROFILE.low.lookWoodNormal !== 0) fail("Low must skip tray wood normals");
if (QUALITY_PROFILE.low.lookVignette !== 0) fail("Low must skip the screen vignette");
if (QUALITY_PROFILE.low.lookTrayShadow !== 0) fail("Low must skip the tray contact blob");
if (lookVignette("low") !== 0 || trayShadowOpacity("low") !== 0) fail("Low look helpers stay off");
if (lookVignette("high") <= lookVignette("medium")) fail("High vignette should exceed Medium");
if (trayShadowOpacity("ultra") <= trayShadowOpacity("high")) fail("Ultra tray shadow should exceed High");
if (QUALITY_PROFILE.low.lookAoSteps !== 0) fail("Low must skip the contact-shadow march");
if (QUALITY_PROFILE.low.lookSpecCap >= 0.1) fail("Low spec cap must stay mobile-safe");
if (QUALITY_PROFILE.medium.lookSpecCap >= QUALITY_PROFILE.high.lookSpecCap) {
  fail("High may blow out more than Medium");
}
if (lookAoSteps("low") !== 0) fail("lookAoSteps(low) is 0");
if (lookAoSteps("ultra") < 6) fail("Ultra should march contact shadows");

const dry = wetDryMask(0.002, 0);
const damp = wetDryMask(0.08, 0);
const shore = wetDryMask(0.04, 0.03);
const film = wetDryMask(0.01, 0.02);
if (dry > 0.02) fail(`dry sand should stay dry: ${dry}`);
if (damp <= dry) fail("inland moisture should lift the wet mask");
if (shore <= damp) fail(`shoreline must snap wetter than a damp bank (${shore} vs ${damp})`);
if (film < 0.55) fail(`thin water at the lip should read wet: ${film}`);
if (wetDryMask(0.2, 0) < 0.9) fail("soaked sand stays wet inland");

function luma3(r: number, g: number, b: number): number {
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

const muddyR = 0.62;
const muddyG = 0.52;
const muddyB = 0.38;
const muddyL = luma3(muddyR, muddyG, muddyB);
const lifted = liftDrySandAlbedo(muddyR, muddyG, muddyB);
const liftedL = luma3(lifted[0], lifted[1], lifted[2]);
if (liftedL < muddyL * 1.15 || liftedL > muddyL * 1.26) {
  fail(`dry lift should be 15–25% (${muddyL} → ${liftedL})`);
}
if (lifted[0] / lifted[2] >= muddyR / muddyB + 0.02) {
  fail("dry lift must not go more orange than the muddy source");
}
if (lifted[0] <= lifted[2] || lifted[1] <= lifted[2] * 1.15) {
  fail("lifted dry should stay warm cream (R and G above B)");
}
const bright = liftDrySandAlbedo(0.9, 0.82, 0.64);
if (bright[0] > 0.96 || bright[1] > 0.96 || bright[2] > 0.96) {
  fail(`bright grains must not blow out: ${bright}`);
}
if (bright[0] < 0.82) fail(`bright grains should stay bright: ${bright}`);
const wetCol = wetSandAlbedo(muddyR, muddyG, muddyB, 0.34, 0.27, 0.22);
const wetL = luma3(wetCol[0], wetCol[1], wetCol[2]);
if (wetL >= liftedL * 0.55) fail(`wet blend must stay darker than lifted dry (${wetL} vs ${liftedL})`);
const wetFromLifted = wetSandAlbedo(lifted[0], lifted[1], lifted[2], 0.34, 0.27, 0.22);
if (wetL >= luma3(wetFromLifted[0], wetFromLifted[1], wetFromLifted[2]) - 1e-6) {
  fail("wet blend should use the unlifted dry, not the beach lift");
}

const flatGrain = albedoMicroGrain(0.5, 0.55);
const brightGrain = albedoMicroGrain(0.72, 0.55);
const darkGrain = albedoMicroGrain(0.28, 0.55);
almost(flatGrain, 1, 1e-6, "neutral luma grain");
if (brightGrain <= flatGrain) fail("bright grains should lift albedo");
if (darkGrain >= flatGrain) fail("dark grains should settle albedo");
almost(albedoMicroGrain(0.8, 0), 1, 1e-6, "zero strength is identity");

const noMicro = heightMicroRelief(0.04, -0.03, 0);
almost(noMicro.nx, 0, 1e-8, "zero height micro");
almost(noMicro.nz, 0, 1e-8, "zero height micro z");
const slopeMicro = heightMicroRelief(0.04, 0, 0.3);
if (slopeMicro.nx >= 0) fail(`+X height rise should tilt −X, nx=${slopeMicro.nx}`);
if (Math.abs(slopeMicro.nz) > 1e-8) fail("no Z slope stays flat in Z");
const steep = heightMicroRelief(0.4, 0, 1);
const mild = heightMicroRelief(0.04, 0, 1);
if (Math.abs(steep.nx) <= Math.abs(mild.nx)) fail("clamped dH should still exceed a mild slope");

const flatAo = ridgeAO(0.5, [0.5, 0.5, 0.5, 0.5]);
const valleyAo = ridgeAO(0.4, [0.55, 0.56, 0.54, 0.58], true);
if (flatAo < 0.99) fail(`flat bed should be unoccluded: ${flatAo}`);
if (valleyAo >= flatAo) fail(`ridges should darken valleys (${valleyAo} vs ${flatAo})`);
if (valleyAo < 0.479) fail(`AO should not crush below the floor: ${valleyAo}`);

const noContact = contactShadow(0.4, [0.55, 0.58, 0.6], 0.7, 0.02, 0);
almost(noContact, 1, 1e-6, "zero steps skip contact");
const blocked = contactShadow(0.4, [0.55, 0.62, 0.7, 0.78], 0.35, 0.02, 4);
if (blocked >= 0.98) fail(`contact should shade a ridge (${blocked})`);
if (blocked < 0.55) fail(`contact stays subtle, got ${blocked}`);

const filmTint = depthTint(0.004);
const deepTint = depthTint(0.1);
const poolTint = depthTint(0.16);
if (filmTint[0] < 0.97 || filmTint[2] < 0.97) fail(`shallow tint should stay clear: ${filmTint}`);
if (deepTint[0] >= filmTint[0]) fail("deep water should tint more");
if (deepTint[0] <= deepTint[2]) fail("depth tint is sand-brown (red stays above blue)");
if (deepTint[2] < 0.58) fail(`deep tint must not go ink-black: ${deepTint}`);
if (poolTint[0] >= deepTint[0]) fail("deeper pools should tint further");
if (poolTint[2] < 0.48) fail(`pool tint must keep the bed readable: ${poolTint}`);
if (deepTint[0] > 0.82) fail(`#45 film tint was too weak; deep should read: ${deepTint}`);

const filmBody = waterBodyColor(0.004, 0);
const poolBody = waterBodyColor(0.12, 0);
const stillMid = waterBodyColor(0.06, 0);
const siltBody = waterBodyColor(0.06, 0.2);
if (filmBody[1] <= filmBody[0]) fail(`film body should read cool/water, not sand: ${filmBody}`);
if (poolBody[0] + poolBody[1] + poolBody[2] >= filmBody[0] + filmBody[1] + filmBody[2] - 0.15) {
  fail(`pools should be clearly darker than films (${poolBody} vs ${filmBody})`);
}
if (siltBody[0] <= stillMid[0]) fail("flow should warm the body a little with silt");

almost(flowStreakAmp(0.004), 0, 0.02, "still streak");
if (flowStreakAmp(0.12) <= flowStreakAmp(0.03) + 0.08) fail("high flow should streak");

almost(bedCausticGain(0.002, 1, 1.2), 1, 1e-6, "dry/thin caustic");
almost(bedCausticGain(0.05, 0, 1.2), 1, 1e-6, "zero strength caustic");
const cauHi = bedCausticGain(0.05, 1, Math.PI * 0.5);
const cauLo = bedCausticGain(0.05, 1, Math.PI * 1.5);
if (cauHi <= 1) fail(`caustic peak should lift the bed: ${cauHi}`);
if (cauLo >= 1) fail(`caustic trough should dim the bed: ${cauLo}`);
if (cauHi > 1.2) fail(`caustic must stay subtle: ${cauHi}`);

const still = shoreFoamFromVelocity(0.01, 2.2, 0.01, 1);
const midFlow = shoreFoamFromVelocity(0.01, 2.2, 0.03, 1);
const moving = shoreFoamFromVelocity(0.01, 2.2, 0.11, 1);
const dryCell = shoreFoamFromVelocity(0, 4, 0.2, 1);
if (still > 0.04) fail(`still shore should not foam: ${still}`);
if (midFlow > 0.04) fail(`mid-flow shore should not foam: ${midFlow}`);
if (moving <= still + 0.08) fail(`high velocity should lace the shore (${moving} vs ${still})`);
if (dryCell > 0) fail("dry cells never foam");

const lowCap = waterSpecCap("low", true);
const medMobile = waterSpecCap("medium", true);
const highDesk = waterSpecCap("high", false);
if (lowCap > 0.08) fail(`mobile Low spec ${lowCap}`);
if (medMobile > 0.08) fail(`mobile Medium spec ${medMobile}`);
if (highDesk <= medMobile) fail("desktop High may spec more than mobile Medium");

console.log("lookSmoke ok", {
  wet: { dry, damp, shore, film },
  dryLift: { muddyL, liftedL, wetL, lifted, bright },
  grain: { flatGrain, brightGrain, darkGrain },
  ao: { flatAo, valleyAo, blocked },
  tint: { filmTint, deepTint, poolTint, filmBody, poolBody },
  foam: { still, midFlow, moving },
  spec: { lowCap, medMobile, highDesk },
});
