/** Narrow layout where Zeitraffer / Mehr sit in the top-right chrome. */
export const MOBILE_BREAKPOINT = 860;

/** Right-hand reserve so coach/tip never sit under the transport cluster. */
export const TRANSPORT_RESERVE_PX = 72;

export type OverlayDock = "top-left" | "bottom";

/** Park SourceTip / Onboarding at the foot of the viewport on phones. */
export function overlayDock(viewportWidth: number): OverlayDock {
  const w = Number.isFinite(viewportWidth) ? viewportWidth : 0;
  return w <= MOBILE_BREAKPOINT ? "bottom" : "top-left";
}

export function overlayMaxWidth(viewportWidth: number, gutter = 10): number {
  const w = Number.isFinite(viewportWidth) ? Math.max(0, viewportWidth) : 0;
  const inner = Math.max(0, w - gutter * 2);
  if (overlayDock(w) === "bottom") return inner;
  return Math.max(0, inner - TRANSPORT_RESERVE_PX);
}

type Box = { left: number; top: number; right: number; bottom: number };

/** True when the overlay box does not cover the transport / Zeitraffer hit area. */
export function overlayClearsTransport(overlay: Box, transport: Box): boolean {
  const missX = overlay.right <= transport.left || overlay.left >= transport.right;
  const missY = overlay.bottom <= transport.top || overlay.top >= transport.bottom;
  return missX || missY;
}
