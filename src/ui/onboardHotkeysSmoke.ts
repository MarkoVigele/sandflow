import { interpretHotkey, isTypingTarget, nudgeBrushRadius, BRUSH_RADIUS_MAX, BRUSH_RADIUS_MIN } from "./hotkeys";
import {
  ONBOARD_STEPS,
  isOnboardHint,
  onboardAdvanceClick,
  onboardAfterAction,
} from "./onboard";
import { TOOL_HOTKEYS } from "./tools";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

assert(ONBOARD_STEPS[1].title.includes("Kamera"), "step 1 is orbit/camera");
assert(ONBOARD_STEPS[2].body.includes("Quelle") || ONBOARD_STEPS[2].body.includes("Gießen"), "step 2 is pour/source");
assert(ONBOARD_STEPS[3].title.includes("Beton") && ONBOARD_STEPS[3].body.includes("Graben"), "step 3 is dig/beton");
assert(isOnboardHint("camera", 1) && !isOnboardHint("pile", 1), "step 1 hints orbit, not pile");
assert(isOnboardHint("pour", 2) && isOnboardHint("source", 2), "step 2 hints pour + source");
assert(isOnboardHint("dig", 3) && isOnboardHint("concrete", 3), "step 3 hints dig + beton");
assert(!isOnboardHint("play", 3), "step 3 no longer hints play");

assert(onboardAdvanceClick(1).onboardStep === 2 && onboardAdvanceClick(1).tool === "pour", "weiter 1→2 pour");
assert(onboardAdvanceClick(2).tool === "dig", "weiter 2→3 dig");
assert(onboardAdvanceClick(3).onboardStep === 0 && onboardAdvanceClick(3).playing === true, "los starts play");

assert(onboardAfterAction(1, "orbit")?.onboardStep === 2, "orbit advances step 1");
assert(onboardAfterAction(1, "pour") === null, "pour does not steal step 1");
assert(onboardAfterAction(2, "pour")?.onboardStep === 3, "pour advances step 2");
assert(onboardAfterAction(2, "source")?.onboardStep === 3, "source drag advances step 2");
assert(onboardAfterAction(2, "orbit") === null, "orbit does not steal step 2");
assert(onboardAfterAction(3, "dig")?.onboardStep === 0, "dig completes onboard");
assert(onboardAfterAction(3, "concrete")?.onboardStep === 0, "beton completes onboard");
assert(onboardAfterAction(0, "orbit") === null, "done stays done");

const space = interpretHotkey({ key: " ", ctrlKey: false, metaKey: false, shiftKey: false, target: null });
assert(space?.type === "play", "Space toggles play");

for (let i = 1; i <= 9; i++) {
  const a = interpretHotkey({
    key: String(i),
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    target: null,
  });
  assert(a?.type === "tool" && a.tool === TOOL_HOTKEYS[i - 1], `digit ${i} selects tool`);
}

const shrink = interpretHotkey({ key: "[", ctrlKey: false, metaKey: false, shiftKey: false, target: null });
const grow = interpretHotkey({ key: "]", ctrlKey: false, metaKey: false, shiftKey: false, target: null });
assert(shrink?.type === "brush" && shrink.delta < 0, "[ shrinks brush");
assert(grow?.type === "brush" && grow.delta > 0, "] grows brush");
assert(nudgeBrushRadius(0.06, -0.01) === 0.05, "brush step down");
assert(nudgeBrushRadius(0.02, -0.01) === BRUSH_RADIUS_MIN, "brush floor");
assert(nudgeBrushRadius(0.16, 0.01) === BRUSH_RADIUS_MAX, "brush ceiling");

const undo = interpretHotkey({ key: "z", ctrlKey: true, metaKey: false, shiftKey: false, target: null });
const redo = interpretHotkey({ key: "z", ctrlKey: true, metaKey: false, shiftKey: true, target: null });
assert(undo?.type === "undo", "Ctrl-Z undo");
assert(redo?.type === "redo", "Ctrl-Shift-Z redo");

assert(!isTypingTarget(null), "null is not a typing target");
assert(isTypingTarget({ tagName: "INPUT" } as unknown as EventTarget), "input is a typing target");
assert(
  interpretHotkey({
    key: " ",
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    target: { tagName: "TEXTAREA" } as unknown as EventTarget,
  }) === null,
  "ignore keys while typing",
);

console.log("onboard + hotkeys smoke ok");
