import type { ToolId } from "../state/types";
import { SOURCE_TOOL_TIP } from "./sourceGesture";

export const TOOLBAR_TOOLS: { id: ToolId; label: string; hint: string }[] = [
  { id: "pile", label: "Hügel", hint: "Sand zu einem Hügel aufschütten" },
  { id: "dig", label: "Graben", hint: "Sand wegnehmen und eine Mulde graben" },
  { id: "smooth", label: "Glätten", hint: "Unebene Stellen weichziehen" },
  { id: "dam", label: "Wall", hint: "Einen steilen Wall aufschütten" },
  { id: "tamp", label: "Stampfen", hint: "Sand fest drücken, damit Wasser ihn nicht so leicht mitnimmt" },
  { id: "groove", label: "Rinne", hint: "Eine Rinne ziehen, der das Wasser folgen kann" },
  { id: "flatten", label: "Einebnen", hint: "Die Fläche unter dem Finger glattziehen" },
  { id: "concrete", label: "Beton", hint: "Feste Platte oder Mauer setzen — erodiert nicht" },
  { id: "stone", label: "Kiesel", hint: "Kleine Steine auf den Sand legen" },
  { id: "erase", label: "Radierer", hint: "Steine und Beton wieder entfernen" },
  { id: "pour", label: "Gießen", hint: "Halten: Wasser tropft an dieser Stelle" },
  { id: "source", label: "Quelle", hint: SOURCE_TOOL_TIP },
];

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
