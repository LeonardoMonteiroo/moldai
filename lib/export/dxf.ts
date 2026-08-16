import type { ExPt } from "./model";

export const TOL_CM = 0.02; // 0,2 mm
const MAX_DEPTH = 16;

const mid = (a: ExPt, b: ExPt): ExPt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

// distância perpendicular de p à reta a→b (em cm); corda degenerada → distância a `a`
function distToLine(p: ExPt, a: ExPt, b: ExPt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  const cross = Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx);
  return cross / Math.sqrt(len2);
}

export function flattenCubic(
  p0: ExPt,
  c1: ExPt,
  c2: ExPt,
  p3: ExPt,
  tolCm: number,
): ExPt[] {
  const out: ExPt[] = [];
  const recurse = (a: ExPt, b: ExPt, c: ExPt, d: ExPt, depth: number): void => {
    if (depth >= MAX_DEPTH || (distToLine(b, a, d) <= tolCm && distToLine(c, a, d) <= tolCm)) {
      out.push({ x: d.x, y: d.y });
      return;
    }
    const ab = mid(a, b), bc = mid(b, c), cd = mid(c, d);
    const abc = mid(ab, bc), bcd = mid(bc, cd);
    const m = mid(abc, bcd);
    recurse(a, ab, abc, m, depth + 1);
    recurse(m, bcd, cd, d, depth + 1);
  };
  recurse(p0, c1, c2, p3, 0);
  return out;
}
