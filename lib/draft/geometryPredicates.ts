// #330: shared geometric predicates for test-only consumers -- consolidates
// three near-identical copies (lib/draft/spaceSampling.test.ts,
// lib/draft/garment.test.ts, lib/export/model.test.ts) that had each
// re-derived the same segment-crossing/containment logic. This module is
// the single owner from here on; a test file keeps its own tolerance and
// `expect` message, but never re-derives the predicate itself.
//
// Test-only, same footing as lib/draft/fixtures.ts (the DECORATION_CASES
// matrix): excluded from coverage in vitest.config.ts for the same reason --
// a module exercised by every test that imports it is ~100% covered by
// construction, which would inflate the ratchet rather than measure it.
//
// Rule this module follows throughout: import a predicate that already has
// an owner (signedAreaCm/catmullRomSegments from ./core, outlineSegments
// from @/lib/export/model, flattenOutlineCm/TOL_CM from @/lib/export/dxf)
// rather than redefining it here -- the whole point of #330 is one fewer
// copy, not a new one.
//
// Layering note: no lib/draft/* RUNTIME module imports lib/export/* today;
// this is the first such edge, and it is harmless because this module is
// test-only (never bundled) -- lib/draft/spaceSampling.test.ts already
// imports @/lib/export/offset directly.

import {
  signedAreaCm,
  catmullRomSegments,
  type DraftedPiece,
  type Pt,
} from "./core";
import { outlineSegments } from "@/lib/export/model";
import { flattenOutlineCm, TOL_CM } from "@/lib/export/dxf";

// ---- segment crossing / self-intersection ---------------------------------

// The same four-sign proper-crossing test lib/export/offset.ts's own
// (private) properlyIntersects derives -- endpoints touching doesn't count,
// only a genuine transversal crossing does. 1e-9 is the epsilon every copy
// of this predicate in the repo already agreed on.
export const CROSSING_EPS = 1e-9;

function crossSign(o: Pt, p: Pt, q: Pt): number {
  return (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
}

export function segmentsProperlyIntersect(
  a1: Pt,
  a2: Pt,
  b1: Pt,
  b2: Pt,
): boolean {
  const d1 = crossSign(b1, b2, a1);
  const d2 = crossSign(b1, b2, a2);
  const d3 = crossSign(a1, a2, b1);
  const d4 = crossSign(a1, a2, b2);
  return (
    ((d1 > CROSSING_EPS && d2 < -CROSSING_EPS) ||
      (d1 < -CROSSING_EPS && d2 > CROSSING_EPS)) &&
    ((d3 > CROSSING_EPS && d4 < -CROSSING_EPS) ||
      (d3 < -CROSSING_EPS && d4 > CROSSING_EPS))
  );
}

// Non-adjacent edges only -- adjacent edges legitimately share an endpoint,
// which isn't a self-intersection, including the wraparound pair (last edge,
// first edge) sharing vertex 0.
export function hasSelfIntersection(ptsCm: Pt[]): boolean {
  const n = ptsCm.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (
        segmentsProperlyIntersect(
          ptsCm[i],
          ptsCm[(i + 1) % n],
          ptsCm[j],
          ptsCm[(j + 1) % n],
        )
      )
        return true;
    }
  }
  return false;
}

// ---- outline flattening: two densifiers, two distinct purposes ------------
//
// #330: this module deliberately keeps TWO flatteners rather than picking
// one -- they serve different checks and answer different questions.
//
// flattenedNetOutlineCm is the PRODUCTION path: lib/export/dxf.ts's own
// flattenOutlineCm(outlineSegments(...), TOL_CM) is what actually walks out
// the door for a DXF/PLT export, and lib/export/offset.ts's offsetOutlineCm
// flattens the same way (flattenCubic at TOL_CM) before it offsets for the
// cut line. Measuring the NET outline's self-intersection at the same
// adaptive tolerance as the CUT outline check keeps the two comparable --
// a discrepancy is then attributable to the drafter, never to a difference
// in sampling density between the two checks.
export function flattenedNetOutlineCm(
  ptsCm: Pt[],
  curvedSpans: [number, number][] = [],
  tolCm: number = TOL_CM,
): Pt[] {
  const { start, segs } = outlineSegments(ptsCm, curvedSpans);
  return flattenOutlineCm({ start, segs }, tolCm).map((p): Pt => [p.x, p.y]);
}

// densifiedOutlineCm is the CONTAINMENT helper, unchanged from the two
// (byte-identical) copies it replaces: a fixed 24-step Catmull-Rom
// densification. #2: the coarse vertex polygon UNDERCUTS a curved span (a
// Catmull-Rom cap bulges above the chord between its own two vertices), so a
// notch tip placed ON that curve can read as spuriously "outside" the cheap
// vertex-polygon span -- measured, a sleeve-cap notch tip read 0.26cm
// "outside" a chord it was really inside. Every other decoration point is
// interior by construction and doesn't need this; only notch tips (placed
// exactly on the boundary) do. Kept deliberately separate from
// flattenedNetOutlineCm above -- switching this to the adaptive flattener
// would change garment.test.ts's existing containment tolerance underneath
// it, which is explicitly out of scope here.
export function densifiedOutlineCm(
  ptsCm: Pt[],
  curvedSpans: [number, number][] = [],
  steps = 24,
): Pt[] {
  const { start, segs } = catmullRomSegments(ptsCm, curvedSpans);
  const out: Pt[] = [start];
  let cur = start;
  for (const seg of segs) {
    if (seg.kind === "line") {
      out.push(seg.to);
      cur = seg.to;
      continue;
    }
    for (let i = 1; i <= steps; i++) {
      const u = i / steps;
      const v = 1 - u;
      out.push([
        v * v * v * cur[0] +
          3 * v * v * u * seg.c1[0] +
          3 * v * u * u * seg.c2[0] +
          u * u * u * seg.to[0],
        v * v * v * cur[1] +
          3 * v * v * u * seg.c1[1] +
          3 * v * u * u * seg.c2[1] +
          u * u * u * seg.to[1],
      ]);
    }
    cur = seg.to;
  }
  return out;
}

// ---- containment ------------------------------------------------------------

// A vertical min/max scanline band at abscissa x -- the same weaker-than-
// point-in-polygon check both consolidated files used. Kept for whichever
// caller still wants it; pointInPolygonCm below is the stronger replacement.
export function verticalSpanAt(
  ptsCm: Pt[],
  x: number,
): { top: number; bottom: number } {
  let top = Infinity;
  let bottom = -Infinity;
  for (let i = 0; i < ptsCm.length; i++) {
    const a = ptsCm[i];
    const b = ptsCm[(i + 1) % ptsCm.length];
    if (a[0] === b[0]) continue;
    if (x < Math.min(a[0], b[0]) || x > Math.max(a[0], b[0])) continue;
    const y = a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }
  return { top, bottom };
}

// A decoration point sitting exactly ON the boundary (a dart's open end on
// a seam, a hem vertex at the panel's own bottom edge) is frequently
// computed via a DIFFERENT arithmetic path than the boundary vertex itself,
// so the two values can differ in the 14th-15th significant digit -- float64
// rounding noise nowhere near a real cm-scale defect. 1e-6 cm is far tighter
// than anything a cutting machine resolves and far looser than IEEE 754
// noise. Both consolidated containment suites (garment.test.ts,
// spaceSampling.test.ts) already agreed on this exact value before #330.
export const CONTAINMENT_EPS_CM = 1e-6;

// A real point-in-polygon test (even-odd ray casting), boundary-inclusive
// within epsCm -- strictly stronger than verticalSpanAt's scanline band,
// which only checks the point falls between the topmost/bottommost boundary
// crossing at that x and can miss a concave void (a deep V-neck) or a hole
// between the outer boundary's own crossings. Boundary-inclusive because a
// dart's open end legitimately sits exactly ON the seam it opens onto, not
// strictly inside (garment.test.ts's own containment suite already carves
// this out for the scanline check; the same carve-out applies here).
export function pointInPolygonCm(
  [px, py]: Pt,
  polyCm: Pt[],
  epsCm: number,
): boolean {
  const n = polyCm.length;
  // On-boundary check first: a point within epsCm of any edge counts as
  // contained regardless of the ray-casting parity below.
  for (let i = 0; i < n; i++) {
    const [ax, ay] = polyCm[i];
    const [bx, by] = polyCm[(i + 1) % n];
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) continue;
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    if (Math.hypot(px - cx, py - cy) <= epsCm) return true;
  }
  // Standard even-odd ray cast (horizontal ray toward +x).
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = polyCm[i];
    const [xj, yj] = polyCm[j];
    const crosses = yi > py !== yj > py;
    if (!crosses) continue;
    const xCross = xj + ((xi - xj) * (py - yj)) / (yi - yj);
    if (px < xCross) inside = !inside;
  }
  return inside;
}

// ---- decoration / notch point extraction -----------------------------------

export interface DecorationPoint {
  kind: string;
  ptCm: Pt;
}

// #127/#315: every internal-geometry kind's own point(s) -- dart/pleat/
// style-line vertices, fold-line endpoints, drill-hole and placement-mark
// centres, and (#315) every vertex of every internal loop (a buttonhole).
// The single point-extraction switch both consolidated files duplicated.
export function decorationPointsCm(piece: DraftedPiece): DecorationPoint[] {
  const points: DecorationPoint[] = (piece.grainlineCm ?? []).map((ptCm) => ({
    kind: "grainline",
    ptCm,
  }));
  for (const entry of piece.internalsCm ?? []) {
    switch (entry.kind) {
      case "dart":
      case "pleat":
      case "styleLine":
        for (const ptCm of entry.ptsCm) points.push({ kind: entry.kind, ptCm });
        break;
      case "foldLine":
        points.push(
          { kind: "foldLine", ptCm: entry.aCm },
          { kind: "foldLine", ptCm: entry.bCm },
        );
        break;
      case "drillHole":
      case "placementMark":
        points.push({ kind: entry.kind, ptCm: entry.atCm });
        break;
    }
  }
  for (const loop of piece.internalLoopsCm ?? []) {
    for (const ptCm of loop.outlineCm)
      points.push({ kind: "internalLoop", ptCm });
  }
  return points;
}

// A notch's inward tip -- decoration placed off the boundary just like a
// grainline or drill hole, but its tip sits ON the (densified) boundary by
// construction, which is why containment checks densify first for these.
export function notchTipsCm(piece: DraftedPiece): Pt[] {
  return (piece.notches ?? []).map((n) => n.innerCm);
}

// ---- degeneracy -------------------------------------------------------------

// Wraps { x, y } export-model points (ExPt) into the Pt tuple shape the
// predicates above use -- lib/export/model.test.ts's "cut line" suite works
// in ExPt, not Pt.
export function fromXY(pts: { x: number; y: number }[]): Pt[] {
  return pts.map((p): Pt => [p.x, p.y]);
}

export function shortestEdgeCm(ptsCm: Pt[]): { lenCm: number; index: number } {
  let lenCm = Infinity;
  let index = -1;
  const n = ptsCm.length;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = ptsCm[i];
    const [bx, by] = ptsCm[(i + 1) % n];
    const len = Math.hypot(bx - ax, by - ay);
    if (len < lenCm) {
      lenCm = len;
      index = i;
    }
  }
  return { lenCm, index };
}

// Re-exported so a caller only needs one import for "enclosed area" --
// signedAreaCm itself stays owned by ./core (normalizeWinding reads it
// directly there); this is just the abs-value convenience the two
// consolidated shoelace-area copies both wanted.
export function enclosedAreaCm2(ptsCm: Pt[]): number {
  return Math.abs(signedAreaCm(ptsCm));
}
