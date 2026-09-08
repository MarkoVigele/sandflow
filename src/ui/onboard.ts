import type { OnboardStep, ToolId } from "../state/types";

export type OnboardAction = "orbit" | "pour" | "source" | "dig" | "concrete";

export const ONBOARD_STEPS: Record<
  Exclude<OnboardStep, 0>,
  { kicker: string; title: string; body: string }
> = {
  1: {
    kicker: "Schritt 1 von 3",
    title: "Kamera drehen",
    body: "Rechte Taste oder zwei Finger kreisen um die Wanne. Unter Kamera geht das auch mit einem Finger.",
  },
  2: {
    kicker: "Schritt 2 von 3",
    title: "Wasser geben",
    body: "Gießen halten — oder die Quelle am Pin ziehen. Tippen setzt eine neue.",
  },
  3: {
    kicker: "Schritt 3 von 3",
    title: "Graben und Beton",
    body: "Graben formt Rinnen. Beton bleibt hart: Wasser fließt darüber, der Sand nicht.",
  },
};

export function onboardHintTools(step: OnboardStep): ReadonlySet<string> {
  if (step === 1) return new Set(["camera"]);
  if (step === 2) return new Set(["pour", "source"]);
  if (step === 3) return new Set(["dig", "concrete"]);
  return new Set();
}

export function isOnboardHint(id: string, step: OnboardStep): boolean {
  return onboardHintTools(step).has(id);
}

export function onboardAdvanceClick(step: OnboardStep): {
  onboardStep: OnboardStep;
  tool?: ToolId;
  cameraMode?: boolean;
  playing?: boolean;
} {
  if (step === 1) return { onboardStep: 2, tool: "pour", cameraMode: false };
  if (step === 2) return { onboardStep: 3, tool: "dig", cameraMode: false };
  return { onboardStep: 0, playing: true };
}

export function onboardAfterAction(
  step: OnboardStep,
  action: OnboardAction,
): { onboardStep: OnboardStep; tool?: ToolId; cameraMode?: boolean } | null {
  if (step === 1 && action === "orbit") {
    return { onboardStep: 2, tool: "pour", cameraMode: false };
  }
  if (step === 2 && (action === "pour" || action === "source")) {
    return { onboardStep: 3, tool: "dig", cameraMode: false };
  }
  if (step === 3 && (action === "dig" || action === "concrete")) {
    return { onboardStep: 0 };
  }
  return null;
}
