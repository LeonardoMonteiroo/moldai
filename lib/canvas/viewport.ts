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

// escala = razão entre tamanho natural e o do viewport (viewport menor => mais zoom)
export function scaleOf(vp: Viewport, natural: Size): number {
  return natural.w / vp.w;
}

export function clampScale(s: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
}

// zoom ao redor de `focus` (coords SVG), mantendo o ponto sob o cursor fixo
export function zoomAt(vp: Viewport, focus: Point, factor: number, natural: Size): Viewport {
  const current = scaleOf(vp, natural);
  const target = clampScale(current * factor);
  const applied = target / current; // fator efetivo após clamp
  const w = vp.w / applied;
  const h = vp.h / applied;
  const x = focus.x - (focus.x - vp.x) / applied;
  const y = focus.y - (focus.y - vp.y) / applied;
  return { x, y, w, h };
}

export function zoomByCenter(vp: Viewport, factor: number, natural: Size): Viewport {
  return zoomAt(vp, { x: vp.x + vp.w / 2, y: vp.y + vp.h / 2 }, factor, natural);
}

// desloca o viewBox no sentido oposto ao arrasto (conteúdo segue o cursor)
export function panBy(vp: Viewport, dxUser: number, dyUser: number): Viewport {
  return { ...vp, x: vp.x - dxUser, y: vp.y - dyUser };
}

// viewBox natural da peça com padding (usado por "ajustar à tela")
export function fit(natural: Size, padPx = 24): Viewport {
  return { x: -padPx, y: -padPx, w: natural.w + padPx * 2, h: natural.h + padPx * 2 };
}
