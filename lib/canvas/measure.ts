import type { Point } from "@/lib/types";
import { SCALE } from "@/lib/draft/core";

export function distancePx(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function distanceCm(a: Point, b: Point): number {
  return distancePx(a, b) / SCALE;
}

// vértice mais próximo de `p` dentro de `thresholdPx`; null se nenhum
export function nearestSnap(p: Point, vertices: Point[], thresholdPx: number): Point | null {
  let best: Point | null = null;
  let bestD = thresholdPx;
  for (const v of vertices) {
    const d = distancePx(p, v);
    if (d <= bestD) {
      bestD = d;
      best = v;
    }
  }
  return best;
}
