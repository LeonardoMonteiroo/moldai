import type { Point } from "@/lib/types";

export interface Viewport {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Size {
  w: number;
  h: number;
}

export const MIN_SCALE = 0.25;
export const MAX_SCALE = 10;
export const ZOOM_STEP = 1.1;

// scale = ratio between the natural size and the viewport's (smaller viewport => more zoom)
export function scaleOf(vp: Viewport, natural: Size): number {
  return natural.w / vp.w;
}

export function clampScale(s: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
}

// zoom around `focus` (SVG coords), keeping the point under the cursor fixed
export function zoomAt(
  vp: Viewport,
  focus: Point,
  factor: number,
  natural: Size,
): Viewport {
  const current = scaleOf(vp, natural);
  const target = clampScale(current * factor);
  const applied = target / current; // effective factor after clamping
  const w = vp.w / applied;
  const h = vp.h / applied;
  const x = focus.x - (focus.x - vp.x) / applied;
  const y = focus.y - (focus.y - vp.y) / applied;
  return { x, y, w, h };
}

export function zoomByCenter(
  vp: Viewport,
  factor: number,
  natural: Size,
): Viewport {
  return zoomAt(
    vp,
    { x: vp.x + vp.w / 2, y: vp.y + vp.h / 2 },
    factor,
    natural,
  );
}

// shifts the viewBox opposite to the drag (content follows the cursor)
export function panBy(vp: Viewport, dxUser: number, dyUser: number): Viewport {
  return { ...vp, x: vp.x - dxUser, y: vp.y - dyUser };
}

// piece's natural viewBox with padding (used by "fit to screen")
export function fit(natural: Size, padPx = 24): Viewport {
  return {
    x: -padPx,
    y: -padPx,
    w: natural.w + padPx * 2,
    h: natural.h + padPx * 2,
  };
}
