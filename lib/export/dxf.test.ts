import { describe, it, expect } from "vitest";
import { flattenCubic, TOL_CM } from "./dxf";
import type { ExPt } from "./model";

// avalia a cúbica verdadeira em t
function cubicAt(p0: ExPt, c1: ExPt, c2: ExPt, p3: ExPt, t: number): ExPt {
  const u = 1 - t;
  const b0 = u * u * u, b1 = 3 * u * u * t, b2 = 3 * u * t * t, b3 = t * t * t;
  return {
    x: b0 * p0.x + b1 * c1.x + b2 * c2.x + b3 * p3.x,
    y: b0 * p0.y + b1 * c1.y + b2 * c2.y + b3 * p3.y,
  };
}

// distância do ponto q ao segmento a→b
function distToSegment(q: ExPt, a: ExPt, b: ExPt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return Math.hypot(q.x - a.x, q.y - a.y);
  let t = ((q.x - a.x) * dx + (q.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy));
}

// maior distância da curva verdadeira (amostrada densa) à polilinha [p0, ...pts]
function maxCurveError(p0: ExPt, c1: ExPt, c2: ExPt, p3: ExPt, pts: ExPt[]): number {
  const poly = [p0, ...pts];
  let worst = 0;
  for (let k = 0; k <= 400; k++) {
    const c = cubicAt(p0, c1, c2, p3, k / 400);
    let best = Infinity;
    for (let s = 0; s + 1 < poly.length; s++) best = Math.min(best, distToSegment(c, poly[s], poly[s + 1]));
    worst = Math.max(worst, best);
  }
  return worst;
}

describe("flattenCubic", () => {
  it("cúbica praticamente reta vira um único ponto (p3)", () => {
    const p0 = { x: 0, y: 0 }, c1 = { x: 3, y: 0 }, c2 = { x: 7, y: 0 }, p3 = { x: 10, y: 0 };
    const out = flattenCubic(p0, c1, c2, p3, TOL_CM);
    expect(out).toEqual([{ x: 10, y: 0 }]);
  });

  it("cúbica curva: a polilinha aproxima a curva dentro da tolerância e termina em p3", () => {
    const p0 = { x: 0, y: 0 }, c1 = { x: 0, y: 10 }, c2 = { x: 10, y: 10 }, p3 = { x: 10, y: 0 };
    const out = flattenCubic(p0, c1, c2, p3, TOL_CM);
    expect(out.length).toBeGreaterThan(1);
    // a curva verdadeira nunca se afasta da polilinha mais que a tolerância
    expect(maxCurveError(p0, c1, c2, p3, out)).toBeLessThanOrEqual(TOL_CM);
    expect(out[out.length - 1]).toEqual({ x: 10, y: 0 });
  });
});
