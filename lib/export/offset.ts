import {
  catmullRomSegments,
  isCanonicalWinding,
  type Pt,
} from "@/lib/draft/core";
import { flattenCubic, TOL_CM } from "./bezier";

// #123: turns the seam-allowance annotation (`GarmentStyle.seamAllowanceCm`,
// used until now purely as a `detailRow` value nothing exported ever
// offset -- see CLAUDE.md's Export section) into a real cut-line outline.
//
// Offsets a closed outline -- the same coarse-vertex + Catmull-Rom
// curved-span representation lib/draft/core's outlinePath/outlineSegments
// walk -- outward by `distanceCm`. `foldEdge`, if given, gets 0cm across
// it, but ONLY when it names one literal boundary edge (adjacent indices,
// b === a+1) -- which no current drafter ever produces. Every `foldEdge`
// #126 actually sets (lib/draft/body.ts, lib/draft/skirt.ts) is a chord
// between a top-centre and a bottom-centre vertex, roughly half the point
// count apart: the piece is drafted whole (both mirrored halves already
// joined into one closed outline, per #126's own "additive metadata, not a
// geometry change"), so the fold LINE is an internal diagonal the boundary
// walk never actually steps along -- there is no edge to zero out. That
// turns out not to matter: at a true axis-of-symmetry vertex the curve's
// own tangent is forced perpendicular to the fold (by the mirror symmetry
// itself), so its outward normal already points *along* the fold -- a
// uniform offset keeps it exactly on the fold line with no special-casing
// (see model.test.ts's "cut line (#123)" suite, verified against the real
// drafting matrix). The adjacent-edge check stays wired for a future
// drafter that genuinely emits a half-piece with the fold as one real edge.
//
// Implementation: every curved span is flattened first (so a curve offsets
// as a dense polyline, the same way lib/export/dxf.ts already flattens
// curves for DXF/PDF output -- there is no exact cubic offset curve, and a
// piecewise-linear one is well within cutting tolerance), then every fine
// straight segment is translated outward by its own distance (0 on the fold,
// `distanceCm` elsewhere) and each vertex becomes the intersection of its two
// adjacent offset lines. That single rule *is* both named treatments in
// issue #123's decision -- "mitre on convex corners, trim on concave" --
// without special-casing either: a convex corner's offset lines diverge, so
// the intersection lands beyond the original vertex (a miter); a concave
// (reflex) corner's offset lines cross before reaching it, so the
// intersection lands this side of it, discarding the little self-crossing
// loop a naive per-vertex translate would otherwise leave behind (a trim).
// #243: `direction` distinguishes the outer boundary's own offset from an
// internal loop's (a hole). "outward" (the default, every pre-#243 call
// site's unchanged behavior) grows the piece -- a cut line that extends
// AWAY from the outline's own interior. "inward" is for a
// `DraftedPiece.internalLoopsCm` entry: a hole's seam allowance is fabric
// that must fold UNDER, into the opening, so its cut line has to SHRINK the
// loop -- the opposite of the outer boundary's own growth. Since #263 that
// is one negated sign off the winding-derived outward direction (see
// offsetOutlineCm's body), not a second implementation.
//
// Known limitation, inherited from the SAME repair `removeSelfCrossingLoops`
// already accepts for "outward" (see its own comment below): that repair's
// "keep the larger split fragment" heuristic was validated against a shape
// GROWING (a piece's own outer boundary, where the real result is always the
// bigger candidate). Nothing here re-validates it for a loop SHRINKING past
// the point where its own opposite edges' offset lines cross each other
// (`distanceCm` at or beyond roughly half the loop's own narrowest span) --
// a hole drafted much smaller than the pattern's seam allowance. No drafter
// emits a loop-bearing piece yet (#243's own acceptance criteria scopes that
// to future work), so this hasn't been exercised against a real garment's
// buttonhole/eyelet proportions; a future drafter adding one should keep its
// loops comfortably larger than 2x the seam allowance until this is verified
// against a tighter case.
export function offsetOutlineCm(
  ptsCm: Pt[],
  curvedSpans: [number, number][],
  foldEdge: [number, number] | undefined,
  distanceCm: number,
  tolCm: number = TOL_CM,
  direction: "outward" | "inward" = "outward",
): { x: number; y: number }[] {
  const segs = toFineSegments(ptsCm, curvedSpans, foldEdge, distanceCm, tolCm);
  // #263: outward direction used to be self-calibrated by building BOTH
  // candidate offset polygons and keeping the larger-area one, because
  // nothing upstream guaranteed a fixed winding. lib/draft/core.ts's
  // normalizeWinding now normalizes every DraftedPiece the moldai engine
  // hands off to one canonical (signedAreaCm >= 0) winding, and
  // isCanonicalWinding here reads the SAME sign directly off `ptsCm` --
  // cheaper than computing the full offset twice and comparing areas, and
  // still correct for an outline this repo hasn't normalized (a future
  // engine, a hand-built test fixture): sign +1 is outward for a
  // canonically-wound outline (see joinOffsetLines/offsetLineFor below), -1
  // for the other winding. `isCanonicalWinding` reads whichever outline it
  // is handed, so an internal loop (#243) needs no normalization of its own
  // -- negating the sign shrinks it whichever way it happens to wind, which
  // is exactly the candidate #243's smaller-area pick used to select.
  const outwardSign = isCanonicalWinding(ptsCm) ? 1 : -1;
  const sign = direction === "outward" ? outwardSign : -outwardSign;
  return removeSelfCrossingLoops(joinOffsetLines(segs, sign));
}

interface FineSeg {
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  d: number;
}

// #151: the coarse-edge-walk + Catmull-Rom-tangent math this used to
// reimplement now lives once, in lib/draft/core's `catmullRomSegments` (the
// same function outlinePath/outlineSegments are thin adapters over, per
// #145) -- this is a third adapter over it rather than a third copy of the
// formula. `catmullRomSegments` already does the `at`/`spanFor` coarse-edge
// walk and returns one CurveSeg (line, or tangent-locked cubic) per coarse
// edge `i`, in the same order toFineSegments needs; this just flattens each
// cubic (same flattenCubic as before) and tags every fine segment with its
// offset distance -- 0 only when `foldEdge` names exactly edge `i` (adjacent
// indices) -- a chord spanning many edges (every current drafter's shape)
// matches none of them, by design; see the module-level comment above.
function toFineSegments(
  ptsCm: Pt[],
  curvedSpans: [number, number][],
  foldEdge: [number, number] | undefined,
  distanceCm: number,
  tolCm: number,
): FineSeg[] {
  const isFold = (i: number) =>
    !!foldEdge && foldEdge[1] === foldEdge[0] + 1 && i === foldEdge[0];

  const { start, segs: curveSegs } = catmullRomSegments(ptsCm, curvedSpans);
  const segs: FineSeg[] = [];
  let p1 = { x: start[0], y: start[1] };
  for (let i = 0; i < curveSegs.length; i++) {
    const cs = curveSegs[i];
    const d = isFold(i) ? 0 : distanceCm;
    const p2 = { x: cs.to[0], y: cs.to[1] };
    if (cs.kind === "line") {
      segs.push({ p1, p2, d });
      p1 = p2;
      continue;
    }
    const c1 = { x: cs.c1[0], y: cs.c1[1] };
    const c2 = { x: cs.c2[0], y: cs.c2[1] };
    const flat = flattenCubic(p1, c1, c2, p2, tolCm);
    let prev = p1;
    for (const pt of flat) {
      segs.push({ p1: prev, p2: pt, d });
      prev = pt;
    }
    p1 = p2;
  }
  return segs;
}

function lineLine(
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number },
): { x: number; y: number } | null {
  const dax = a2.x - a1.x,
    day = a2.y - a1.y;
  const dbx = b2.x - b1.x,
    dby = b2.y - b1.y;
  const denom = dax * dby - day * dbx;
  if (Math.abs(denom) < 1e-9) return null; // parallel (or collinear) -- no corner to join
  const t = ((b1.x - a1.x) * dby - (b1.y - a1.y) * dbx) / denom;
  return { x: a1.x + dax * t, y: a1.y + day * t };
}

function offsetLineFor(
  s: FineSeg,
  sign: 1 | -1,
): [{ x: number; y: number }, { x: number; y: number }] {
  if (s.d === 0) return [s.p1, s.p2];
  const dx = s.p2.x - s.p1.x,
    dy = s.p2.y - s.p1.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (sign * dy) / len,
    ny = (-sign * dx) / len;
  return [
    { x: s.p1.x + nx * s.d, y: s.p1.y + ny * s.d },
    { x: s.p2.x + nx * s.d, y: s.p2.y + ny * s.d },
  ];
}

function joinOffsetLines(
  segs: FineSeg[],
  sign: 1 | -1,
): { x: number; y: number }[] {
  const n = segs.length;
  const lines = segs.map((s) => offsetLineFor(s, sign));
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const prev = lines[(i - 1 + n) % n];
    const cur = lines[i];
    out.push(lineLine(prev[0], prev[1], cur[0], cur[1]) ?? cur[0]);
  }
  return out;
}

function crossSign(
  o: { x: number; y: number },
  p: { x: number; y: number },
  q: { x: number; y: number },
): number {
  return (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
}

// Proper crossing only (endpoints touching doesn't count) -- the same test
// model.test.ts's own verification independently re-derives.
function properlyIntersects(
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number },
): boolean {
  const d1 = crossSign(b1, b2, a1),
    d2 = crossSign(b1, b2, a2);
  const d3 = crossSign(a1, a2, b1),
    d4 = crossSign(a1, a2, b2);
  return (
    ((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) &&
    ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9))
  );
}

// A very acute reflex corner (a deep, narrow V-neck's apex is the case that
// actually reaches this: STYLE_LIMITS.necklineDepthCm.max) can trim its two
// *adjacent* offset lines correctly and still leave a small self-crossing
// loop further along the boundary, where the offset curve wraps back on
// itself near the same sharp point from the other side -- a real limitation
// of per-vertex miter offsetting, not something joinOffsetLines' adjacent-
// pair intersections can see. This repairs it the way production polygon-
// offset libraries do: find any two (non-adjacent) edges that actually
// cross, cut the loop between them at that crossing point, and keep
// whichever of the two resulting pieces is *larger* -- the small one is the
// spurious loop, the large one is the real boundary. Repeats until no
// crossing remains (each pass strictly removes at least one vertex).
function removeSelfCrossingLoops(
  pts: { x: number; y: number }[],
): { x: number; y: number }[] {
  let points = pts;
  for (let pass = 0; pass < pts.length; pass++) {
    const n = points.length;
    let didRemove = false;
    for (let i = 0; i < n && !didRemove; i++) {
      const a1 = points[i],
        a2 = points[(i + 1) % n];
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue; // adjacent via wraparound
        const b1 = points[j],
          b2 = points[(j + 1) % n];
        if (!properlyIntersects(a1, a2, b1, b2)) continue;
        const hit = lineLine(a1, a2, b1, b2);
        if (!hit) continue;
        const keepMiddle = [hit, ...points.slice(i + 1, j + 1)];
        const keepOutside = [
          ...points.slice(0, i + 1),
          hit,
          ...points.slice(j + 1),
        ];
        points =
          keepMiddle.length >= keepOutside.length ? keepMiddle : keepOutside;
        didRemove = true;
        break;
      }
    }
    if (!didRemove) break;
  }
  return points;
}
