import type { ToolId } from "../state/types";

/** Canonical Source-tool one-liner (onboarding + inspector + chip). */
export const SOURCE_TOOL_TIP = "tippen = wählen, ziehen = verschieben";

export type SourceGestureClaim = {
  /** One-finger orbit / LMB rotate is allowed for this pointer. */
  orbit: boolean;
  /** Source tool (or an in-flight pin drag) owns the pointer. */
  tool: boolean;
  sourceId: string | null;
};

/**
 * Hook for the source-pin drag agent.
 * Pin hit or an active drag always beats camera-mode orbit so one-finger
 * rotate cannot steal a source move.
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
  if (input.draggingSource || (sourceTool && onPin)) {
    return { orbit: false, tool: true, sourceId };
  }
  if (input.cameraMode) {
    return { orbit: true, tool: false, sourceId: null };
  }
  return { orbit: false, tool: true, sourceId: sourceTool ? sourceId : null };
}

export function sourceTipVisible(tool: ToolId | string, onboardStep: number): boolean {
  return tool === "source" && onboardStep === 0;
}

export function sourceTipText(): string {
  return SOURCE_TOOL_TIP;
}
