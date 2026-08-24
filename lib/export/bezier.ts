// Cubic-Bézier flattening (adaptive De Casteljau), shared by the DXF/PDF
// serializers (which flatten a piece's *existing* curved outline) and
// lib/export/offset.ts (which must flatten a curved span before it can
// translate it along its normal to build the seam-allowance cut line). A
// leaf module with no dependency on ExportModel/ExSeg (lib/export/model.ts),
// so offset.ts can import it without a cycle back through model.ts.
export type Pt = { x: number; y: number };

export const TOL_CM = 0.02; // 0.2 mm

const MAX_DEPTH = 16;

const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

// perpendicular distance from p to the line a→b (in cm); degenerate chord → distance to `a`
function distToLine(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  const cross = Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx);
  return cross / Math.sqrt(len2);
}

export function flattenCubic(
  p0: Pt,
  c1: Pt,
  c2: Pt,
  p3: Pt,
  tolCm: number,
): Pt[] {
  const out: Pt[] = [];
  const recurse = (a: Pt, b: Pt, c: Pt, d: Pt, depth: number): void => {
    if (
      depth >= MAX_DEPTH ||
      (distToLine(b, a, d) <= tolCm && distToLine(c, a, d) <= tolCm)
    ) {
      out.push({ x: d.x, y: d.y });
      return;
    }
    const ab = mid(a, b),
      bc = mid(b, c),
      cd = mid(c, d);
    const abc = mid(ab, bc),
      bcd = mid(bc, cd);
    const m = mid(abc, bcd);
    recurse(a, ab, abc, m, depth + 1);
    recurse(m, bcd, cd, d, depth + 1);
  };
  recurse(p0, c1, c2, p3, 0);
  return out;
}
