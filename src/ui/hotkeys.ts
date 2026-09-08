import type { ToolId } from "../state/types";
import { LETTER_HOTKEYS, TOOL_HOTKEYS } from "./tools";

export const BRUSH_RADIUS_MIN = 0.02;
export const BRUSH_RADIUS_MAX = 0.16;
export const BRUSH_RADIUS_STEP = 0.01;

export type HotkeyAction =
  | { type: "play" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "tool"; tool: ToolId }
  | { type: "brush"; delta: number };

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as { tagName?: string; isContentEditable?: boolean };
  const tag = (el.tagName ?? "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return !!el.isContentEditable;
}

export function nudgeBrushRadius(current: number, delta: number): number {
  const next = current + delta;
  return Math.min(BRUSH_RADIUS_MAX, Math.max(BRUSH_RADIUS_MIN, Math.round(next * 1000) / 1000));
}

export function interpretHotkey(e: {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  target: EventTarget | null;
}): HotkeyAction | null {
  if (isTypingTarget(e.target)) return null;
  const k = e.key.toLowerCase();
  const code = e.code ?? "";

  if (k === " " || k === "spacebar") return { type: "play" };

  if ((e.metaKey || e.ctrlKey) && k === "z") {
    return e.shiftKey ? { type: "redo" } : { type: "undo" };
  }
  if ((e.metaKey || e.ctrlKey) && k === "y") return { type: "redo" };

  if (k === "[" || code === "BracketLeft") return { type: "brush", delta: -BRUSH_RADIUS_STEP };
  if (k === "]" || code === "BracketRight") return { type: "brush", delta: BRUSH_RADIUS_STEP };

  const n = Number(e.key);
  if (n >= 1 && n <= TOOL_HOTKEYS.length) return { type: "tool", tool: TOOL_HOTKEYS[n - 1] };

  const letter = LETTER_HOTKEYS[k];
  if (letter) return { type: "tool", tool: letter };

  return null;
}
