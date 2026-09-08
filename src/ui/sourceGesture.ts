import type { ToolId } from "../state/types";

/** Canonical Source-tool one-liner (onboarding + inspector + chip). */
export const SOURCE_TOOL_TIP = "Tippen wählt die Quelle, Ziehen verschiebt sie.";

export type SourceGestureClaim = {
  /** One-finger orbit / LMB rotate is allowed for this pointer. */
  orbit: boolean;
  /** Source tool (or an in-flight pin drag) owns the pointer. */
  tool: boolean;
  sourceId: string | null;
};

/**
 * Pin hit or an active drag always beats camera-mode orbit so one-finger
 * rotate cannot steal a source move — including while Kamera is toggled on.
 */
export function claimSourceGesture(input: {
  tool: ToolId | string;
  cameraMode: boolean;
  hitSourceId: string | null;
  draggingSource: string | null;
}): SourceGestureClaim {
  const sourceId = input.draggingSource ?? input.hitSourceId;
  const onPin = !!sourceId;
  const sourceTool = input.tool === "source";
  if (input.draggingSource || onPin) {
    return { orbit: false, tool: true, sourceId };
  }
  if (input.cameraMode) {
    return { orbit: true, tool: false, sourceId: null };
  }
  return { orbit: false, tool: true, sourceId: sourceTool ? sourceId : null };
}

/** OrbitControls must not see this pointer — call before it handles pointerdown. */
export function pinGrabBeatsOrbit(claim: SourceGestureClaim): boolean {
  return claim.tool && !!claim.sourceId && !claim.orbit;
}

export function allowOneFingerOrbit(cameraMode: boolean, sourceActive: boolean): boolean {
  return cameraMode && !sourceActive;
}

/** OrbitControls.enabled — off for the whole pin claim, not just one-finger rotate. */
export function orbitControlsEnabled(sourceActive: boolean): boolean {
  return !sourceActive;
}

/** Skip controls.update() so leftover damping cannot coast the camera during a pin drag. */
export function shouldApplyOrbitUpdate(sourceActive: boolean): boolean {
  return !sourceActive;
}

/**
 * pointerleave must not end a captured pin/stroke. Touch often leaves the
 * canvas mid-drag; treating that as pointerup unlocks orbit and drops the pin.
 */
export function pointerLeaveEndsGesture(hasCapture: boolean): boolean {
  return !hasCapture;
}

export function sourceTipVisible(tool: ToolId | string, onboardStep: number): boolean {
  return tool === "source" && onboardStep === 0;
}

export function sourceTipText(): string {
  return SOURCE_TOOL_TIP;
}
