import type { BrushKind } from "../sim/types";
import type { ToolId } from "../state/types";
import { SOURCE_TOOL_TIP } from "./sourceGesture";

export type ToolSpec = {
  id: ToolId;
  /** Short German toolbar label. */
  label: string;
  hint: string;
  title: string;
  body: string;
  /** Inspector slider for the gold aim ring. */
  brushSize: boolean;
  brushSizeLabel: string;
  strength: boolean;
  flattenAll?: boolean;
  /** Dense stamps while dragging so fast strokes do not skip. */
  interpolates: boolean;
  /** Worker brush id. Erase maps to `soft` (hardmask clear). */
  brushKind?: BrushKind;
};

/** Original-brief tray brushes (English id → German label). */
export const BRIEF_TRAY_TOOLS: { id: ToolId; brief: string }[] = [
  { id: "pile", brief: "pile" },
  { id: "dig", brief: "dig" },
  { id: "smooth", brief: "smooth" },
  { id: "tamp", brief: "stamp" },
  { id: "groove", brief: "channel" },
  { id: "dam", brief: "dam" },
  { id: "flatten", brief: "level" },
  { id: "erase", brief: "eraser" },
];

export const TOOLBAR_TOOLS: ToolSpec[] = [
  {
    id: "pile",
    label: "Hügel",
    hint: "Sand zu einem Hügel aufschütten",
    title: "Hügel aufschütten",
    body: "Ziehen häufelt Sand zu einem Hügel. Der Kreis ist die Pinselgröße.",
    brushSize: true,
    brushSizeLabel: "Pinselgröße",
    strength: true,
    interpolates: true,
    brushKind: "pile",
  },
  {
    id: "dig",
    label: "Graben",
    hint: "Sand wegnehmen und eine Mulde graben",
    title: "Mulde graben",
    body: "Ziehen nimmt Sand weg — gut, um dem Wasser eine Spur zu geben. Der Kreis ist die Pinselgröße.",
    brushSize: true,
    brushSizeLabel: "Pinselgröße",
    strength: true,
    interpolates: true,
    brushKind: "dig",
  },
  {
    id: "smooth",
    label: "Glätten",
    hint: "Unebene Stellen weichziehen",
    title: "Sand glätten",
    body: "Ziehen weicht Kanten und Wellen im Sand auf. Der Kreis ist die Pinselgröße.",
    brushSize: true,
    brushSizeLabel: "Pinselgröße",
    strength: true,
    interpolates: true,
    brushKind: "smooth",
  },
  {
    id: "dam",
    label: "Damm",
    hint: "Einen steilen Damm aufschütten",
    title: "Damm setzen",
    body: "Setzt einen steilen Damm, höher und schärfer als ein Hügel. Der Kreis ist die Pinselgröße.",
    brushSize: true,
    brushSizeLabel: "Pinselgröße",
    strength: true,
    interpolates: true,
    brushKind: "dam",
  },
  {
    id: "tamp",
    label: "Stampfen",
    hint: "Sand fest drücken, damit Wasser ihn nicht so leicht mitnimmt",
    title: "Sand feststampfen",
    body: "Drückt den Sand fest, damit fließendes Wasser ihn nicht so leicht mitnimmt. Der Kreis ist die Pinselgröße.",
    brushSize: true,
    brushSizeLabel: "Pinselgröße",
    strength: true,
    interpolates: true,
    brushKind: "tamp",
  },
  {
    id: "groove",
    label: "Rinne",
    hint: "Eine Rinne ziehen, der das Wasser folgen kann",
    title: "Rinne ziehen",
    body: "Zeichnet eine Furche mit leichten Ufern. Wasser folgt ihr später von allein. Der Kreis ist die Pinselgröße.",
    brushSize: true,
    brushSizeLabel: "Pinselgröße",
    strength: true,
    interpolates: true,
    brushKind: "groove",
  },
  {
    id: "flatten",
    label: "Einebnen",
    hint: "Die Fläche unter dem Finger glattziehen",
    title: "Fläche einebnen",
    body: "Macht die Fläche unter dem Finger glatt. Der Kreis ist die Pinselgröße. Unten: die ganze Wanne. Beton bleibt stehen.",
    brushSize: true,
    brushSizeLabel: "Pinselgröße",
    strength: true,
    flattenAll: true,
    interpolates: true,
    brushKind: "flatten",
  },
  {
    id: "concrete",
    label: "Beton",
    hint: "Feste Platte oder Mauer setzen — erodiert nicht",
    title: "Beton setzen",
    body: "Niedrige Stärke = Platte, hohe Stärke = Mauer. Der Kreis ist die Pinselgröße. Beton ist fest (Hartmaske), Wasser fließt darüber. Der Radierer nimmt ihn weg.",
    brushSize: true,
    brushSizeLabel: "Pinselgröße",
    strength: true,
    interpolates: true,
    brushKind: "concrete",
  },
  {
    id: "stone",
    label: "Kiesel",
    hint: "Kleine Steine auf den Sand legen",
    title: "Kiesel legen",
    body: "Kleine Steine auf den Sand. Mit der Pinselgröße stellst du die Kieselgröße. Unter jedem Stein bleibt eine Hartinsel — Wasser fließt darüber, Erosion nicht. Der Radierer nimmt sie weg.",
    brushSize: true,
    brushSizeLabel: "Pinselgröße",
    strength: false,
    interpolates: false,
  },
  {
    id: "erase",
    label: "Radierer",
    hint: "Steine und Beton wieder entfernen",
    title: "Radierer",
    body: "Nimmt Steine und Beton in der Pinselgröße weg. Sand und Wasser bleiben.",
    brushSize: true,
    brushSizeLabel: "Pinselgröße",
    strength: false,
    interpolates: true,
    brushKind: "soft",
  },
  {
    id: "pour",
    label: "Gießen",
    hint: "Halten: Wasser tropft an dieser Stelle",
    title: "Wasser gießen",
    body: "Der Kreis zeigt, wo es tropft. Taste oder Finger halten.",
    brushSize: false,
    brushSizeLabel: "Pinselgröße",
    strength: false,
    interpolates: false,
  },
  {
    id: "source",
    label: "Quelle",
    hint: SOURCE_TOOL_TIP,
    title: "Quelle",
    body: `${SOURCE_TOOL_TIP} Freier Sand setzt eine neue Quelle. Löschen nimmt sie weg. Die Menge stellst du am Regler ein.`,
    brushSize: false,
    brushSizeLabel: "Pinselgröße",
    strength: false,
    interpolates: false,
  },
];

const BY_ID = Object.fromEntries(TOOLBAR_TOOLS.map((t) => [t.id, t])) as Record<ToolId, ToolSpec>;

export function toolSpec(id: ToolId): ToolSpec {
  return BY_ID[id];
}

export function toolBrushKind(id: ToolId): BrushKind | null {
  return BY_ID[id]?.brushKind ?? null;
}

export function toolInterpolates(id: ToolId): boolean {
  return !!BY_ID[id]?.interpolates;
}

/** Sand-shaping tools that finish onboarding step 1. */
export function isShapeTool(id: ToolId): boolean {
  return id === "pile" || id === "dig" || id === "smooth" || id === "dam" || id === "tamp" || id === "groove" || id === "flatten";
}

export type StrokeUv = { u: number; v: number };

/**
 * Dense waypoints between two UV samples so a fast drag still paints a
 * continuous ribbon. First point of a stroke is `to` alone.
 */
export function strokeWaypoints(from: StrokeUv | null, to: StrokeUv, radius: number): StrokeUv[] {
  if (!from) return [to];
  const du = to.u - from.u;
  const dv = to.v - from.v;
  const dist = Math.hypot(du, dv);
  const steps = Math.max(1, Math.ceil(dist / Math.max(0.008, radius * 0.32)));
  const out: StrokeUv[] = [];
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    out.push({ u: from.u + du * t, v: from.v + dv * t });
  }
  return out;
}

export const TOOL_HOTKEYS: ToolId[] = [
  "pile",
  "dig",
  "smooth",
  "dam",
  "tamp",
  "groove",
  "flatten",
  "pour",
  "source",
];

export const LETTER_HOTKEYS: Partial<Record<string, ToolId>> = {
  b: "concrete",
  k: "stone",
  r: "erase",
};
