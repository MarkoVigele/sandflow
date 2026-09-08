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

export const LAPSE_SPEED = 8;
export const LAPSE_MARK = 4;

export function lapseSpeed(current: number): number {
  return current >= LAPSE_SPEED ? 1 : LAPSE_SPEED;
}

/** Highlight / trail engage at 4×; the Zeitraffer chip jumps to 8×. */
export function isLapse(speed: number): boolean {
  return speed >= LAPSE_MARK;
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

/** Drop fractional ticks on pause or a Zeitraffer jump so the next play starts clean. */
export function stepAccumAfterTransport(playing: boolean, speedChanged: boolean, accum: number): number {
  if (!playing || speedChanged) return 0;
  return Number.isFinite(accum) ? accum : 0;
}
