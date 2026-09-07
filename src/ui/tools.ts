import type { ToolId } from "../state/types";

export const TOOLBAR_TOOLS: { id: ToolId; label: string; hint: string }[] = [
  { id: "pile", label: "Aufschütten", hint: "Sand anhäufen" },
  { id: "dig", label: "Graben", hint: "Sand abtragen" },
  { id: "smooth", label: "Glätten", hint: "Unebenheiten ziehen" },
  { id: "dam", label: "Damm", hint: "Steile Wand setzen" },
  { id: "tamp", label: "Feststampfen", hint: "Kohäsion lokal erhöhen" },
  { id: "groove", label: "Rinne", hint: "Rinne vorzeichnen" },
  { id: "flatten", label: "Einebnen", hint: "Auswahl oder ganze Wanne glattziehen" },
  { id: "pour", label: "Gießen", hint: "Halten zum Gießen" },
  { id: "source", label: "Quelle", hint: "Setzen, ziehen, löschen" },
];

export const TOOL_HOTKEYS: ToolId[] = TOOLBAR_TOOLS.map((t) => t.id);
