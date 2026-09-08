import type { CompareMode } from "../sim/compare";
import { clampWipe, cycleCompareMode } from "../sim/compare";

export const COMPARE_LABEL: Record<CompareMode, string> = {
  off: "Nachher",
  wipe: "Teilen",
  before: "Vorher",
};

export function compareChipLabel(mode: CompareMode, hasSnap: boolean): string {
  if (!hasSnap || mode === "off") return "Vergleich";
  if (mode === "wipe") return "Teilen an";
  return "Vorher an";
}

export function compareHint(hasSnap: boolean, mode: CompareMode): string {
  if (!hasSnap) return "Vorher merken, dann Erosion daneben legen.";
  if (mode === "wipe") return "Links Vorher, rechts Nachher — den Strich ziehen.";
  if (mode === "before") return "Ganze Wanne wie vor der Erosion.";
  return "Teilen oder Vorher, um das Bett zu vergleichen.";
}

export function nextCompareMode(mode: CompareMode, hasSnap: boolean): CompareMode {
  return cycleCompareMode(mode, hasSnap);
}

export function wipeFromClientX(clientX: number, left: number, width: number): number {
  if (!(width > 1)) return 0.5;
  return clampWipe((clientX - left) / width);
}

export { clampWipe };
