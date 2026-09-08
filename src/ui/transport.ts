import { SPEEDS, type OnboardStep } from "../state/types";

export function togglePlaying(playing: boolean): boolean {
  return !playing;
}

export function speedIndex(speed: number): number {
  const i = SPEEDS.indexOf(speed);
  return i >= 0 ? i : SPEEDS.indexOf(1);
}

export function speedFromIndex(index: number): number {
  const i = Math.max(0, Math.min(SPEEDS.length - 1, Math.round(Number(index) || 0)));
  return SPEEDS[i] ?? 1;
}

export function lapseSpeed(current: number): number {
  return current >= 8 ? 1 : 8;
}

export function applyPlay(playing: boolean, onboardStep: OnboardStep): {
  playing: boolean;
  onboardStep: OnboardStep;
  persistOnboard: boolean;
} {
  if (playing && onboardStep === 3) {
    return { playing: true, onboardStep: 0, persistOnboard: true };
  }
  return { playing, onboardStep, persistOnboard: false };
}

export function stepsThisFrame(speed: number, accum: number): { steps: number; accum: number } {
  const s = Number.isFinite(speed) && speed > 0 ? speed : 0;
  if (s <= 0) return { steps: 0, accum };
  if (s < 1) {
    const next = accum + s;
    return next >= 1 ? { steps: 1, accum: 0 } : { steps: 0, accum: next };
  }
  return { steps: Math.round(s), accum: 0 };
}
