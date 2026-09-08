import {
  WATER_QUALITY,
  beerTransmittance,
  contactLineFoam,
  flowWaveAmp,
  flowWaveNormalScale,
  schlickFresnel,
  sheetHeight,
  waterQualityIndex,
  waterQualityTier,
} from "./waterQuality";
import type { QualityId } from "../state/types";

function fail(msg: string): never {
  console.error(msg);
  throw new Error(msg);
}

function almost(a: number, b: number, eps = 1e-4, label = ""): void {
  if (Math.abs(a - b) > eps) fail(`${label || "value"} expected ${b}, got ${a}`);
}

const order: QualityId[] = ["low", "medium", "high", "ultra"];

almost(waterQualityIndex("low"), 0, 0, "low index");
almost(waterQualityIndex("ultra"), 3, 0, "ultra index");

for (let i = 1; i < order.length; i++) {
  const prev = WATER_QUALITY[order[i - 1]];
  const next = WATER_QUALITY[order[i]];
  if (next.meshSegs <= prev.meshSegs) fail(`${next.id} segs should exceed ${prev.id}`);
  if (next.waveOctaves < prev.waveOctaves) fail(`${next.id} octaves should not drop`);
  if (next.waveDisplace < prev.waveDisplace) fail(`${next.id} displace should not drop`);
  if (next.foamDetail < prev.foamDetail) fail(`${next.id} foam should not drop`);
  if (next.beerStrength < prev.beerStrength) fail(`${next.id} beer should not drop`);
}

const low = waterQualityTier("low");
const ultra = waterQualityTier("ultra");
if (low.waveDisplace !== 0) fail("Low must skip vertex wave displacement");
if (low.waveOctaves !== 1) fail("Low is a single cheap ripple");
if (ultra.waveOctaves < 4) fail("Ultra needs four wave octaves");
if (ultra.meshSegs < 320) fail("Ultra mesh should resolve vertex waves");
if (low.meshSegs > 96) fail("Low mesh should stay cheaper than Medium");
if (low.meshSegs < 64) fail("Low mesh should still cover the tray");
if (low.beerStrength >= ultra.beerStrength) fail("Ultra absorbs more than Low");

const sigma: [number, number, number] = [1.8, 1.15, 1.05];
const shallow = beerTransmittance(0.004, 0.92, sigma, 0.68);
const deep = beerTransmittance(0.12, 0.55, sigma, 0.95);
if (shallow[0] <= deep[0]) fail("deep water should absorb more red");
if (shallow[1] <= deep[1]) fail("deep water should absorb more green");
if (shallow[2] < 0.88) fail(`shallow should stay clear, T.b=${shallow[2]}`);
if (deep[0] > 0.72) fail(`deep should read darker than a film, T.r=${deep[0]}`);
if (deep[2] < 0.28) fail(`deep must stay transmissive (bed visible), T.b=${deep[2]}`);

const facing = schlickFresnel(0.95, 0.02, 1);
const grazing = schlickFresnel(0.08, 0.02, 1);
if (grazing <= facing) fail("grazing fresnel should exceed facing");
if (facing > 0.06) fail(`facing fresnel too hot: ${facing}`);
if (grazing < 0.55) fail(`grazing fresnel too weak: ${grazing}`);

const calmShore = contactLineFoam(0.008, [0.0, 0.009, 0.0, 0.012], 0.01, 1);
const midShore = contactLineFoam(0.012, [0.0, 0.011, 0.0, 0.013], 0.03, 1);
const turbShore = contactLineFoam(0.01, [0.0, 0.0, 0.028, 0.0], 0.09, 1);
const velShore = contactLineFoam(0.012, [0.0, 0.011, 0.0, 0.013], 0.11, 1);
if (calmShore > 0.04) fail(`calm shore should not foam: ${calmShore}`);
if (midShore > 0.04) fail(`mid-flow shore should not foam: ${midShore}`);
if (turbShore <= calmShore + 0.08) fail(`foam only at turbulence (${turbShore} vs ${calmShore})`);
if (turbShore < 0.12) fail(`turbulent foam too weak: ${turbShore}`);
if (velShore <= calmShore + 0.06) fail(`high velocity should lace the shore (${velShore} vs ${calmShore})`);

const dry = contactLineFoam(0, [0, 0, 0, 0], 0, 1);
if (dry > 0.08) fail(`dry cells should not foam: ${dry}`);

almost(flowWaveAmp(0.08, 0.12, 0), 0, 1e-8, "no displace");
const ampLow = flowWaveAmp(0.08, 0.12, low.waveDisplace);
const ampUltra = flowWaveAmp(0.08, 0.12, ultra.waveDisplace);
const ampStill = flowWaveAmp(0.08, 0.004, ultra.waveDisplace);
if (ampLow !== 0) fail("Low wave amp must be 0");
if (ampUltra <= 0.0004) fail(`Ultra wave amp too small: ${ampUltra}`);
if (ampStill > ampUltra * 0.12) fail(`still water should not wave: ${ampStill}`);
if (flowWaveAmp(0.0004, 0.2, ultra.waveDisplace) > ampUltra * 0.25) {
  fail("thin films should not take full wave displacement");
}

const filmSheet = sheetHeight(0.01, 0);
const poolSheet = sheetHeight(0.1, 0);
if (filmSheet > 0.008) fail(`film sheet should stay thin: ${filmSheet}`);
if (poolSheet < filmSheet * 2.4) fail(`pools should lift more than films (${poolSheet} vs ${filmSheet})`);
if (poolSheet < 0.035) fail(`deep pool sheet too flat: ${poolSheet}`);

const nStill = flowWaveNormalScale(0.004);
const nFlow = flowWaveNormalScale(0.12);
if (nStill > 0.08) fail(`still normals should be quiet: ${nStill}`);
if (nFlow <= nStill + 0.45) fail(`flow should tilt wave normals (${nFlow} vs ${nStill})`);

console.log("waterQualitySmoke ok", {
  low: { segs: low.meshSegs, oct: low.waveOctaves, beer: low.beerStrength },
  ultra: { segs: ultra.meshSegs, oct: ultra.waveOctaves, beer: ultra.beerStrength },
  beer: { shallow, deep },
  fresnel: { facing, grazing },
  foam: { calmShore, midShore, turbShore, velShore },
  sheet: { filmSheet, poolSheet },
  waveN: { nStill, nFlow },
});
