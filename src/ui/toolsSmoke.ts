import { overlayClearsTransport, overlayDock, overlayMaxWidth } from "./chrome";
import { claimSourceGesture, pinGrabBeatsOrbit } from "./sourceGesture";
import {
  BRIEF_TRAY_TOOLS,
  pointerLeaveEndsStroke,
  strokeWaitsForHistory,
  strokeWaypoints,
  TOOLBAR_TOOLS,
  toolBrushKind,
  toolInterpolates,
  toolSpec,
} from "./tools";

function fail(msg: string): never {
  throw new Error(msg);
}

const ids = new Set(TOOLBAR_TOOLS.map((t) => t.id));
for (const { id, brief } of BRIEF_TRAY_TOOLS) {
  if (!ids.has(id)) fail(`tray tool missing from toolbar: ${brief} (${id})`);
  const spec = toolSpec(id);
  if (!spec.label.trim()) fail(`${id} needs a German label`);
  if (!spec.title.trim()) fail(`${id} needs a German inspector title`);
  if (!/[äöüÄÖÜß]|Hügel|Graben|Glätten|Damm|Stampfen|Rinne|Einebnen|Radierer/.test(`${spec.label}${spec.title}`)) {
    fail(`${id} label/title should be clearly German`);
  }
  if (!spec.brushSize) fail(`${id} must expose Pinselgröße`);
  if (spec.brushSizeLabel !== "Pinselgröße") fail(`${id} brush slider must say Pinselgröße, got ${spec.brushSizeLabel}`);
  if (!spec.body.includes("Pinselgröße")) fail(`${id} inspector body must name Pinselgröße`);
}

const concrete = toolSpec("concrete");
if (!concrete.brushSize || concrete.brushSizeLabel !== "Pinselgröße") fail("Beton needs Pinselgröße");
if (toolBrushKind("concrete") !== "concrete") fail("Beton paints hardmask");
if (toolBrushKind("erase") !== "soft") fail("Radierer clears hardmask via soft");
if (!toolInterpolates("pile") || !toolInterpolates("dig") || !toolInterpolates("smooth") || !toolInterpolates("dam")) {
  fail("core sand tools must interpolate strokes");
}
if (!toolInterpolates("tamp") || !toolInterpolates("groove") || !toolInterpolates("flatten")) {
  fail("stamp/channel/level must interpolate");
}
if (!toolInterpolates("concrete") || !toolInterpolates("erase")) fail("Beton/Radierer must interpolate");
if (strokeWaitsForHistory()) fail("Beton stroke must not await history (touch moves arrive during snapshot)");
if (pointerLeaveEndsStroke(true)) fail("captured Beton stroke must survive pointerleave");
if (!pointerLeaveEndsStroke(false)) fail("uncaptured leave still ends the stroke");

const first = strokeWaypoints(null, { u: 0.2, v: 0.3 }, 0.06);
if (first.length !== 1 || first[0]!.u !== 0.2) fail("first stamp is a single point");
const ribbon = strokeWaypoints({ u: 0.2, v: 0.3 }, { u: 0.5, v: 0.3 }, 0.06);
if (ribbon.length < 8) fail(`fast drag must fill gaps, got ${ribbon.length} stamps`);
if (Math.abs(ribbon[ribbon.length - 1]!.u - 0.5) > 1e-9) fail("ribbon ends on the new point");

const pin = claimSourceGesture({
  tool: "pile",
  cameraMode: true,
  hitSourceId: "s-1",
  draggingSource: null,
});
if (!pinGrabBeatsOrbit(pin)) fail("tray-tool polish must not steal source pin drag");

const drag = claimSourceGesture({
  tool: "source",
  cameraMode: true,
  hitSourceId: null,
  draggingSource: "s-1",
});
if (!drag.tool || drag.orbit) fail("in-flight pin drag still owns the pointer");

if (overlayDock(390) !== "bottom") fail("phone overlays dock to the foot");
if (overlayDock(1200) !== "top-left") fail("desktop overlays stay top-left");
if (overlayMaxWidth(390) < 300) fail("phone coach can use the viewport width");
const coach = { left: 10, top: 220, right: 380, bottom: 360 };
const transport = { left: 160, top: 0, right: 390, bottom: 56 };
if (!overlayClearsTransport(coach, transport)) fail("bottom coach must miss Zeitraffer");
const tipRight = { left: 200, top: 8, right: 380, bottom: 40 };
if (overlayClearsTransport(tipRight, transport)) fail("top-right tip would cover Zeitraffer");

console.log(
  JSON.stringify({
    tray: BRIEF_TRAY_TOOLS.map((t) => `${t.brief}:${toolSpec(t.id).label}`),
    brushLabel: "Pinselgröße",
    ribbon: ribbon.length,
    pinDrag: true,
  }),
);
console.log("tools ui smoke ok");
