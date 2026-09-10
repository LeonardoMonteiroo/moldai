import {
  DetailRow,
  NotchType,
  Piece,
  PieceInternal,
  PieceOutline,
} from "@/lib/types";

export const SCALE = 4; // px per cm
export const PX = (cm: number) => Math.round(cm * SCALE * 10) / 10;

export type Pt = [number, number];

export interface DraftedPiece {
  id: string;
  name: string;
  qty: number;
  outlineCm: Pt[];
  curvedSpans?: [number, number][];
  guideCm?: Pt[];
  grainlineCm?: [Pt, Pt];
  // #127: typed internal-geometry entries -- darts (#122: zero or more, not
  // exactly one; each an open point list, >=3 points, first point repeated
  // at the end for a double-ended/fisheye dart so it reads as closed without
  // a synthetic straight-line base), each dart's own fold line, and its
  // drill hole(s). See InternalCm below and lib/types.ts's PieceInternal,
  // the px-space shape place() builds this into.
  internalsCm?: InternalCm[];
  // #126: the two `outlineCm` indices bounding this piece's cut-on-fold line
  // (its own axis of symmetry) -- both indices must already exist in
  // outlineCm (additive metadata; drafters that need a fold endpoint with no
  // existing vertex there insert one exactly on a straight edge it already
  // walks, so the outline's rendered shape is unchanged).
  foldEdge?: [number, number];
  // #124: derived, never persisted -- see NotchCm below.
  notches?: NotchCm[];
  detailRows: DetailRow[];
  armholeLenCm?: number;
  // #249: the skirt panel's own resolved length (after gradedSkirtLengthCm
  // normalizes an explicit style.skirtLengthCm against the reference row) --
  // set ONLY by lib/draft/skirt.ts's draftSkirt, the same "drafter exposes a
  // number it already computed so the caller reads it instead of
  // re-deriving it" precedent armholeLenCm above already follows (there,
  // body.ts's own armhole edge length; here, skirt.ts's own length variable
  // feeding both its `rows.length` detail row and its outline). garment.ts's
  // draftAll reads this off the returned piece rather than calling
  // gradedSkirtLengthCm a second time with the same three arguments, so the
  // two numbers cannot independently drift apart.
  resolvedLengthCm?: number;
  // #134: named edge-index ranges (into this piece's OWN outlineCm, using
  // the same [from, to] convention curveArcLengthCm/curvedSpans already use
  // -- `to` may equal outlineCm.length to mean "wraps back to index 0", the
  // way the drafters' own closing curvedSpans already do) that this piece
  // declares as candidates for a mated seam. garment.ts's draftAll is the
  // one place that knows the WHOLE garment's topology -- which panel sews to
  // which -- so it is what pairs matching edges across pieces into the
  // SeamPairDecl entries lib/draft/seams.ts's walkSeamPairs measures. A
  // piece with nothing to mate (there is none today) simply omits this.
  seamEdges?: Record<string, [number, number]>;
  // #223: this piece's own true axis of symmetry, when it is NOT the
  // bounding-box midpoint -- an asymmetric half-panel (a front-closure
  // bodice front, lib/draft/body.ts). Absent for every symmetric piece
  // (every piece today except that one); lib/proof3d/mesh.ts reads it
  // instead of computing a bbox-based center when present.
  centerXCm?: number;
  // #254: this piece's own declared 3D placement -- which structural role
  // it plays in a Prova 3D dress-form proof, plus a reserved 6D (translation
  // + rotation) transform. lib/proof3d/mesh.ts groups drafted pieces by
  // `role` instead of matching a hardcoded literal piece id
  // ("body-front"/"sleeve"/"skirt"), so the correspondence between a 2D
  // piece and its 3D shell lives in the layer that actually knows the
  // garment's own topology (body.ts/sleeve.ts/skirt.ts/trousers.ts/
  // subpieces.ts) rather than a consumer pattern-matching on ids -- the same
  // reason GarmentCode gives every panel its own translation/rotation
  // instead of a viewer inferring placement from a panel's name. Absent on a
  // sub-piece with no 3D shell of its own yet (collar/cuff/waistband/
  // placket/button-stand) -- see Proof3DRole's own doc.
  placementCm?: PlacementCm;
  // #243: zero or more internal loops (holes) inside this piece's own outer
  // boundary -- a buttonhole, an eyelet, a lining vent, anything the
  // simplified single-closed-outline `outlineCm` above cannot represent on
  // its own (GarmentCode's own stated limitation). Each loop is its OWN
  // closed `Pt[]` list in the same cm space as `outlineCm`, with its own
  // optional `curvedSpans` (same [from,to] edge-index convention, scoped to
  // the loop's own point list, not outlineCm's). Absent on every piece today
  // (no drafter emits one yet) -- completely inert for curveArcLengthCm, the
  // seam graph, and every other outer-boundary computation, which all read
  // `outlineCm`/`curvedSpans` only and never look at this field.
  // lib/export/offset.ts's `offsetOutlineCm` is what a loop's own cut line
  // must be run through with `direction: "inward"` (a hole's seam allowance
  // encroaches INTO the opening, the opposite of the outer boundary's own
  // outward growth) -- see lib/export/model.ts's buildExportModel.
  internalLoopsCm?: InternalLoopCm[];
}

// #243: one internal loop (hole) in a piece's own cm space -- see
// DraftedPiece.internalLoopsCm above.
export interface InternalLoopCm {
  outlineCm: Pt[];
  curvedSpans?: [number, number][];
}

// #254: which structural role a drafted piece plays in Prova 3D's dress-form
// proof (lib/proof3d/mesh.ts). "accessory" covers every sub-piece drafted in
// lib/draft/subpieces.ts (collar/cuff/waistband/placket/button-stand): each
// one declares a real PlacementCm (so every drafter this issue names really
// does set the field), but mesh.ts builds no 3D shell for any of them yet --
// an honest, narrower gap than the trousers one this issue closes, not a
// silent one, since Proof3DTab's own approximation note already says shells
// are a simplified proxy, not every drafted piece rendered.
export type Proof3DRole =
  | "torso-front"
  | "torso-back"
  | "sleeve"
  | "skirt"
  | "trouser-front"
  | "trouser-back"
  | "accessory";

export interface PlacementCm {
  role: Proof3DRole;
  // Translation of this piece's own local origin, cm, in the mesh's world
  // frame (x lateral, y vertical, z depth -- z reserved, always 0 today).
  // Every drafter emits (0,0,0): mesh.ts still derives the REAL stack
  // position (girth-scanned ring heights, a sleeve/trouser-leg's own
  // left/right offset) from the drafted geometry at build time, per
  // CLAUDE.md's derive-don't-store rule -- this channel exists so a future
  // drafter (a piece with a real, non-proportional starting offset) can
  // declare one instead of mesh.ts guessing it from the piece id.
  translationCm: [number, number, number];
  // Rotation in degrees about (x, y, z) -- reserved, (0,0,0) for every
  // archetype today (no drafter yet needs to angle its own shell, e.g. a
  // flared trouser leg or a raglan sleeve).
  rotationDeg: [number, number, number];
}

// #254: every drafter that declares a real 3D role emits the identical,
// no-op transform today -- one shared constant instead of six copies of the
// same two zero-triples drifting apart.
export const NO_PLACEMENT_TRANSFORM: Pick<
  PlacementCm,
  "translationCm" | "rotationDeg"
> = { translationCm: [0, 0, 0], rotationDeg: [0, 0, 0] };

// #124: depth is the only thing that tells the three NotchTypes apart --
// see lib/types.ts's PieceNotch doc for why that's also the AC's own
// "printable size" (3mm/6mm), not a separate number to keep in sync.
export const NOTCH_DEPTH_CM: Record<NotchType, number> = {
  single: 0.3,
  double: 0.6,
  triple: 0.9,
};

// A notch, in the drafter's own cm space -- outerCm on the net outline,
// innerCm nudged inward by NOTCH_DEPTH_CM[type]. core.ts's place() turns
// this into a Piece's PieceNotch (px, translated into the packed layout).
export interface NotchCm {
  type: NotchType;
  outerCm: Pt;
  innerCm: Pt;
}

// A notch tick at `point`, oriented perpendicular to `tangent` and biased
// toward `insideRef` -- a point the caller knows lies inside the piece --
// so the tick always points into the fabric regardless of which winding
// direction that particular outline happens to walk (drafters mix clockwise
// and counter-clockwise; see lib/export/offset.ts's own self-calibration
// for the same underlying problem on a whole outline rather than one point).
export function notchAt(
  point: Pt,
  tangent: Pt,
  insideRef: Pt,
  type: NotchType,
): NotchCm {
  const len = Math.hypot(tangent[0], tangent[1]) || 1;
  let nx = -tangent[1] / len;
  let ny = tangent[0] / len;
  const dx = insideRef[0] - point[0];
  const dy = insideRef[1] - point[1];
  if (nx * dx + ny * dy < 0) {
    nx = -nx;
    ny = -ny;
  }
  const depth = NOTCH_DEPTH_CM[type];
  return {
    type,
    outerCm: point,
    innerCm: [point[0] + nx * depth, point[1] + ny * depth],
  };
}

// A notch exactly at outline vertex `idx`, whose tangent is approximated
// from its immediate neighbours -- exact when `idx` is (as #126's foldEdge
// vertices already are) a midpoint inserted on a straight edge, since the
// neighbours are then collinear with it, and a good approximation at a
// smooth symmetric peak (a sleeve cap apex), where the true curve tangent
// is horizontal by symmetry and so is next-minus-prev.
export function notchAtVertex(
  ptsCm: Pt[],
  idx: number,
  insideRef: Pt,
  type: NotchType,
): NotchCm {
  const n = ptsCm.length;
  const prev = ptsCm[(idx - 1 + n) % n];
  const next = ptsCm[(idx + 1) % n];
  return notchAt(
    ptsCm[idx],
    [next[0] - prev[0], next[1] - prev[1]],
    insideRef,
    type,
  );
}

// Point + local tangent walking `distCm` from vertex `from` toward `to`
// (`from < to`, following outline order), along the same Catmull-Rom/Bézier
// geometry curveArcLengthCm measures -- so a notch placed here on one piece
// and another placed at the same distCm on a mated piece land at truly
// corresponding positions, "generated as pairs from the same computation"
// (#124). distCm is clamped to the segment's own arc length in both
// directions (never lands before `from` or past `to`).
export function pointAndTangentAtCm(
  ptsCm: Pt[],
  curvedSpans: [number, number][],
  from: number,
  to: number,
  distCm: number,
): { point: Pt; tangent: Pt } {
  const n = ptsCm.length;
  const at = (i: number) => ptsCm[(i + n) % n];
  const spanFor = (i: number) =>
    curvedSpans.find(([a, b]) => i >= a && i + 1 <= b);
  const samplesPerEdge = 32;
  let remaining = Math.max(0, distCm);
  for (let i = from; i < to; i++) {
    const p1 = at(i);
    const p2 = at(i + 1);
    const span = spanFor(i);
    const isLastEdge = i === to - 1;
    if (!span) {
      const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      if (remaining <= segLen || isLastEdge) {
        const u = segLen === 0 ? 0 : Math.min(1, remaining / segLen);
        return {
          point: [p1[0] + (p2[0] - p1[0]) * u, p1[1] + (p2[1] - p1[1]) * u],
          tangent: [p2[0] - p1[0], p2[1] - p1[1]],
        };
      }
      remaining -= segLen;
      continue;
    }
    const [a, b] = span;
    const p0 = i === a ? p1 : at(i - 1);
    const p3 = i + 1 === b ? p2 : at(i + 2);
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    let prev = p1;
    for (let s = 1; s <= samplesPerEdge; s++) {
      const pt = bezierPoint(p1, c1, c2, p2, s / samplesPerEdge);
      const segLen = Math.hypot(pt[0] - prev[0], pt[1] - prev[1]);
      if (remaining <= segLen || (isLastEdge && s === samplesPerEdge)) {
        const u = segLen === 0 ? 0 : Math.min(1, remaining / segLen);
        return {
          point: [
            prev[0] + (pt[0] - prev[0]) * u,
            prev[1] + (pt[1] - prev[1]) * u,
          ],
          tangent: [pt[0] - prev[0], pt[1] - prev[1]],
        };
      }
      remaining -= segLen;
      prev = pt;
    }
  }
  // from === to: nothing to walk -- land exactly on `from`.
  const p1 = at(from);
  const p2 = at(from + 1);
  return { point: p1, tangent: [p2[0] - p1[0], p2[1] - p1[1]] };
}

// notchAt + pointAndTangentAtCm combined -- the common case a drafter
// actually calls.
export function notchAtArcLengthCm(
  ptsCm: Pt[],
  curvedSpans: [number, number][],
  from: number,
  to: number,
  distCm: number,
  insideRef: Pt,
  type: NotchType,
): NotchCm {
  const { point, tangent } = pointAndTangentAtCm(
    ptsCm,
    curvedSpans,
    from,
    to,
    distCm,
  );
  return notchAt(point, tangent, insideRef, type);
}

// #127: cm-space internal-geometry entry a drafter attaches to a
// DraftedPiece's `internalsCm`, alongside notches/grainline. Four kinds ship
// geometry today (dart, foldLine, drillHole via dartInternals() below; pleat
// via lib/draft/skirt.ts's own pleatFoldPlacement, #244); styleLine/
// placementMark are still reserved for a future style-line/buttonhole
// drafter to attach to this same channel without a second one -- #127
// decision, settled, not reopened here.
export type InternalCm =
  | { kind: "dart"; ptsCm: Pt[] }
  | { kind: "foldLine"; aCm: Pt; bCm: Pt }
  | { kind: "drillHole"; atCm: Pt; rCm: number }
  // #244: a pleat's own placement/stitch line -- lib/draft/skirt.ts's
  // pleatFoldPlacement is the first real emitter; its own press fold reuses
  // "foldLine" above instead of a second kind.
  | { kind: "pleat"; ptsCm: Pt[] }
  | { kind: "styleLine"; ptsCm: Pt[] } // reserved -- no drafter emits one yet
  | { kind: "placementMark"; atCm: Pt }; // reserved -- no drafter emits one yet

// #127: ASTM/pattern-making convention -- a drill mark sits 1.0-1.5cm short
// of the dart's own apex so the hole hides inside the sewn dart rather than
// piercing the visible point. ~3mm-diameter hole, the industrial-pattern
// norm.
export const DRILL_HOLE_SETBACK_CM = 1.25;
export const DRILL_HOLE_RADIUS_CM = 0.15;

// #251: a stable, NAME-addressed handle onto a vertex pushed while a
// drafter builds its own outline -- the fix for lib/draft/body.ts's own
// motivating case, where the frontClosure branch picked among two
// ALREADY-KNOWN raw indices (`hemR!` vs. `hemCenter`, plus a bare
// `pts.length` "wraps to vertex 0" sentinel) with a hand-written ternary
// instead of asking a piece "where is the edge from X to Y right now".
// `set()` returns the index unchanged so an existing `const x = push(...)`
// call site only needs wrapping (`const x = anchors.set("x", push(...))`),
// not restructuring. `shiftFrom` is what makes a NAME-based handle "stable"
// where a raw number wouldn't be: if a future drafter ever splices an extra
// vertex in mid-build (a pocket/placket/style-line cut), one `shiftFrom`
// call keeps every already-issued anchor correct, rather than a caller
// re-deriving each one by hand. See also `insertVertexAt` below, the sibling
// mechanism for a vertex inserted into an ALREADY-drafted piece (this class
// is for while a piece is still being built).
// #251: the sentinel `edge()` accepts in place of a real anchor name to mean
// "this outline's own current length" (the existing "closes back to vertex
// 0" convention curveArcLengthCm/curvedSpans already use for a wrapping
// edge). A `unique symbol`, not the string `"wrap"`, specifically so a
// drafter is free to name a real anchor "wrap" without it being silently
// swallowed by this sentinel -- `edge()` checks `to === WRAP` by reference,
// which a string literal can never satisfy.
export const WRAP: unique symbol = Symbol("OutlineAnchors.WRAP");

export class OutlineAnchors {
  private readonly byName = new Map<string, number>();

  // Records outline vertex `idx` as addressable by `name`.
  set(name: string, idx: number): number {
    this.byName.set(name, idx);
    return idx;
  }

  // The raw index for a previously-set name -- throws on an unknown name
  // rather than letting a typo silently produce `undefined` deep inside a
  // seamEdges range.
  at(name: string): number {
    const idx = this.byName.get(name);
    if (idx === undefined) {
      throw new Error(`OutlineAnchors: no anchor named "${name}"`);
    }
    return idx;
  }

  // Builds a seamEdges/curvedSpans-style [from, to] range from two anchor
  // names. `to` may be the `WRAP` sentinel (see above) to mean "this
  // outline's own current length", spelled out here instead of a caller
  // having to remember to pass the bare number itself.
  edge(
    from: string,
    to: string | typeof WRAP,
    outlineLength: number,
  ): [number, number] {
    return [this.at(from), to === WRAP ? outlineLength : this.at(to)];
  }

  // Shifts every already-recorded anchor at or after `at` by `by` (default
  // +1) -- the one place a mid-build vertex insertion updates every
  // already-issued name at once.
  shiftFrom(at: number, by = 1): void {
    for (const [name, idx] of this.byName) {
      if (idx >= at) this.byName.set(name, idx + by);
    }
  }
}

// #251: inserts a new vertex into an ALREADY-DRAFTED piece's own outline,
// remapping every OTHER index-bearing field -- `seamEdges`, `foldEdge` and
// `curvedSpans` -- in the one place that knows how, instead of a caller
// hand-auditing the parallel index tables `DraftedPiece.seamEdges`'s own doc
// comment warns are scattered across a piece (this issue's motivating
// example: adding a pocket/placket/style-line cut to an existing panel).
// `notches` needs no entry here: a `NotchCm` carries its own outerCm/innerCm
// cm coordinates (see `notchAt` above), never an outline index, so it stays
// correct no matter where a later vertex lands.
//
// `afterIdx` is the outline index the new vertex lands AFTER (so its own new
// index is `afterIdx + 1`); every index STRICTLY greater than `afterIdx` --
// including the `outlineCm.length` "wraps to vertex 0" sentinel every
// closing edge already uses -- shifts up by one; everything at or before
// `afterIdx` is untouched. A caller that wants the drafted SHAPE unchanged
// (as this issue's own regression test does) inserts a point collinear with
// its two new neighbours, on a straight (non-curved) edge -- inserting into
// a curved span's own control-point run would change the curve it draws,
// which is a real geometry edit this function does not try to prevent.
export function insertVertexAt(
  piece: DraftedPiece,
  afterIdx: number,
  point: Pt,
): DraftedPiece {
  const shift = (idx: number) => (idx > afterIdx ? idx + 1 : idx);
  const shiftPair = ([a, b]: [number, number]): [number, number] => [
    shift(a),
    shift(b),
  ];
  return {
    ...piece,
    outlineCm: [
      ...piece.outlineCm.slice(0, afterIdx + 1),
      point,
      ...piece.outlineCm.slice(afterIdx + 1),
    ],
    seamEdges: piece.seamEdges
      ? Object.fromEntries(
          Object.entries(piece.seamEdges).map(([key, range]) => [
            key,
            shiftPair(range),
          ]),
        )
      : piece.seamEdges,
    foldEdge: piece.foldEdge ? shiftPair(piece.foldEdge) : piece.foldEdge,
    curvedSpans: piece.curvedSpans?.map(shiftPair),
  };
}

const ptEq = (a: Pt, b: Pt) => a[0] === b[0] && a[1] === b[1];

// A drill hole set back from `apexCm`, walking toward `towardCm` along the
// dart's own fold line -- clamped to at most 90% of that leg's own length so
// a very short dart never places the hole past its own centre (or back out
// past the apex it marks).
function drillHoleFromApex(apexCm: Pt, towardCm: Pt): InternalCm {
  const dx = towardCm[0] - apexCm[0];
  const dy = towardCm[1] - apexCm[1];
  const len = Math.hypot(dx, dy) || 1;
  const d = Math.min(DRILL_HOLE_SETBACK_CM, len * 0.9);
  return {
    kind: "drillHole",
    atCm: [apexCm[0] + (dx / len) * d, apexCm[1] + (dy / len) * d],
    rCm: DRILL_HOLE_RADIUS_CM,
  };
}

// #127: a dart's own three internal marks -- its leg outline (`ptsCm`, the
// same shape dartsCm entries always were), the fold line it presses along
// when sewn (`fold`: apex-to-apex for a double-ended/fisheye dart, or
// apex-to-seam-midpoint for a single-ended one -- distinct from the piece's
// own cut-on-fold axis, `foldEdge` below, which is a different concept: the
// piece's axis of symmetry, not a dart's own press line), and a drill hole
// per free apex (`apexesCm`, the subset of `fold`'s own two endpoints that
// are true dart points rather than seam ends -- a single-ended dart marks
// only its one free apex, a fisheye dart marks both).
export function dartInternals(
  ptsCm: Pt[],
  fold: [Pt, Pt],
  apexesCm: Pt[],
): InternalCm[] {
  const out: InternalCm[] = [
    { kind: "dart", ptsCm },
    { kind: "foldLine", aCm: fold[0], bCm: fold[1] },
  ];
  for (const apex of apexesCm) {
    const toward = ptEq(apex, fold[0]) ? fold[1] : fold[0];
    out.push(drillHoleFromApex(apex, toward));
  }
  return out;
}

// Extracts just the dart entries' own point lists from an internals array --
// the shape dartsCm used to be directly. Used by tests and by
// lib/proof3d/mesh.ts's "does this piece have darts" check, so InternalCm's
// discriminant stays defined in one place.
export function dartsOf(internalsCm?: InternalCm[]): Pt[][] {
  return (internalsCm ?? [])
    .filter(
      (e): e is Extract<InternalCm, { kind: "dart" }> => e.kind === "dart",
    )
    .map((e) => e.ptsCm);
}

// #244: the same extraction for a pleat's own placement/stitch line(s) --
// used by lib/draft/assembly.ts to derive a real "fold and press the pleat"
// construction step, the same "InternalCm's discriminant lives in
// core.ts" rule dartsOf above follows.
export function pleatsOf(internalsCm?: InternalCm[]): Pt[][] {
  return (internalsCm ?? [])
    .filter(
      (e): e is Extract<InternalCm, { kind: "pleat" }> => e.kind === "pleat",
    )
    .map((e) => e.ptsCm);
}

export function bbox(pts: Pt[]) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs);
  const minY = Math.min(...ys),
    maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

export function polyPath(ptsCm: Pt[]): PieceOutline {
  const points = ptsCm.map(([x, y]) => `${PX(x)},${PX(y)}`).join(" ");
  return { kind: "polygon", points };
}

// #86: one shared segment list for a closed outline, in the caller's own
// units (px already PX()-rounded for outlinePath below, exact cm for
// lib/export/model.ts's outlineSegments) -- straight (line) on every edge,
// except edges covered by a curvedSpan, where it's Catmull-Rom->Bézier with
// tangents locked at the span's edges (doesn't pull toward the neighboring
// straight points). Requires n >= 3; each caller keeps its own <3 fallback
// (a bare polyline has no "curve" to speak of) rather than this function
// having a third, unused shape for that case.
export type CurveSeg =
  { kind: "line"; to: Pt } | { kind: "cubic"; c1: Pt; c2: Pt; to: Pt };

export function catmullRomSegments(
  pts: Pt[],
  curvedSpans: [number, number][] = [],
): { start: Pt; segs: CurveSeg[] } {
  const n = pts.length;
  const at = (i: number) => pts[((i % n) + n) % n];
  const spanFor = (i: number) =>
    curvedSpans.find(([a, b]) => i >= a && i + 1 <= b);
  const segs: CurveSeg[] = [];
  for (let i = 0; i < n; i++) {
    const p1 = at(i),
      p2 = at(i + 1);
    const span = spanFor(i);
    if (!span) {
      segs.push({ kind: "line", to: p2 });
      continue;
    }
    const [a, b] = span;
    const p0 = i === a ? p1 : at(i - 1);
    const p3 = i + 1 === b ? p2 : at(i + 2);
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    segs.push({ kind: "cubic", c1, c2, to: p2 });
  }
  return { start: at(0), segs };
}

// Draws a closed outline: straight (L) on every edge, except edges
// covered by a curvedSpan, where it emits Catmull-Rom->Bézier with the
// tangents locked at the span's edges (doesn't pull toward the neighboring straight points).
export function outlinePath(
  ptsCm: Pt[],
  curvedSpans: [number, number][] = [],
): PieceOutline {
  const p = ptsCm.map(([x, y]) => [PX(x), PX(y)] as Pt);
  const n = p.length;
  if (n < 3) return polyPath(ptsCm);
  const { start, segs } = catmullRomSegments(p, curvedSpans);
  let d = `M${start[0].toFixed(1)} ${start[1].toFixed(1)} `;
  for (const s of segs) {
    if (s.kind === "line") {
      d += `L${s.to[0].toFixed(1)} ${s.to[1].toFixed(1)} `;
    } else {
      d += `C${s.c1[0].toFixed(1)} ${s.c1[1].toFixed(1)} ${s.c2[0].toFixed(1)} ${s.c2[1].toFixed(1)} ${s.to[0].toFixed(1)} ${s.to[1].toFixed(1)} `;
    }
  }
  d += "Z";
  return { kind: "path", d: d.trim() };
}

// Cubic Bézier point at parameter u in [0,1].
function bezierPoint(p0: Pt, c1: Pt, c2: Pt, p3: Pt, u: number): Pt {
  const mt = 1 - u;
  const a = mt * mt * mt,
    b = 3 * mt * mt * u,
    c = 3 * mt * u * u,
    d = u * u * u;
  return [
    a * p0[0] + b * c1[0] + c * c2[0] + d * p3[0],
    a * p0[1] + b * c1[1] + c * c2[1] + d * p3[1],
  ];
}

// Measures the real length, in cm, of the outline between edge indices
// `from` and `to`, using the same Catmull-Rom-derived tangents as
// outlinePath (straight edges outside a curvedSpan, tangent-locked cubic
// Bézier inside one) — so a caller can assert on the geometry actually
// emitted (an armhole, a sleeve cap) instead of on the numbers that were
// fed in to build it. See #139/#78.
export function curveArcLengthCm(
  ptsCm: Pt[],
  curvedSpans: [number, number][],
  from: number,
  to: number,
  samplesPerEdge = 32,
): number {
  const n = ptsCm.length;
  const at = (i: number) => ptsCm[(i + n) % n];
  const spanFor = (i: number) =>
    curvedSpans.find(([a, b]) => i >= a && i + 1 <= b);
  let len = 0;
  for (let i = from; i < to; i++) {
    const p1 = at(i),
      p2 = at(i + 1);
    const span = spanFor(i);
    if (!span) {
      len += Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      continue;
    }
    const [a, b] = span;
    const p0 = i === a ? p1 : at(i - 1);
    const p3 = i + 1 === b ? p2 : at(i + 2);
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    let prev = p1;
    for (let s = 1; s <= samplesPerEdge; s++) {
      const pt = bezierPoint(p1, c1, c2, p2, s / samplesPerEdge);
      len += Math.hypot(pt[0] - prev[0], pt[1] - prev[1]);
      prev = pt;
    }
  }
  return len;
}

export function translateOutline(
  o: PieceOutline,
  dx: number,
  dy: number,
): PieceOutline {
  if (o.kind === "polygon") {
    const points = o.points
      .split(" ")
      .map((pair) => {
        const [x, y] = pair.split(",").map(Number);
        return `${(x + dx).toFixed(1)},${(y + dy).toFixed(1)}`;
      })
      .join(" ");
    return { kind: "polygon", points };
  }
  // path: we only have absolute M/C/L/Z commands generated here; we translate numbers in pairs after M/C/L.
  const d = o.d.replace(/([MCL])([^MCLZ]*)/g, (_, cmd, nums) => {
    const parts = nums.trim().split(/\s+/).map(Number);
    const shifted = parts.map((v: number, i: number) =>
      (i % 2 === 0 ? v + dx : v + dy).toFixed(1),
    );
    return `${cmd}${shifted.join(" ")} `;
  });
  return { kind: "path", d: d.trim() };
}

function outlineKey(o: PieceOutline): string {
  return o.kind === "polygon" ? o.points : o.d;
}

// #308: a placed Piece's own outline is already shifted by autoLayout's
// shelf packing, which repositions every piece in the set whenever the
// TOTAL set's sizes change -- so two versions' pieces can't be compared by
// their outline strings directly, even when a given piece's own geometry is
// identical. Re-origins the outline to its own bbox (via `vertices`, the
// same anchor points `outline` was built from) before taking the key, so
// only a real shape difference changes the result.
function normalizedOutlineKey(piece: Piece): string {
  const verts = piece.vertices ?? [];
  if (verts.length === 0) return outlineKey(piece.outline);
  const minX = Math.min(...verts.map((v) => v.x));
  const minY = Math.min(...verts.map((v) => v.y));
  return outlineKey(translateOutline(piece.outline, -minX, -minY));
}

export type PieceChangeStatus = "unchanged" | "changed" | "added" | "removed";

// #308: matches two drafted-and-placed piece sets by their own stable id
// (front/back/sleeve/collar/... assigned by the drafters) and classifies
// each: "added"/"removed" when the id exists on only one side, "changed"
// when both sides have it but the re-origined outline differs, "unchanged"
// otherwise. Purely derived from the two already-drafted piece sets -- no
// new field, no new API call.
export function diffDraftedPieces(
  fromPieces: Piece[],
  toPieces: Piece[],
): Map<string, PieceChangeStatus> {
  const fromById = new Map(fromPieces.map((p) => [p.id, p]));
  const toById = new Map(toPieces.map((p) => [p.id, p]));
  const status = new Map<string, PieceChangeStatus>();
  for (const id of fromById.keys()) {
    if (!toById.has(id)) status.set(id, "removed");
  }
  for (const [id, toPiece] of toById) {
    const fromPiece = fromById.get(id);
    if (!fromPiece) {
      status.set(id, "added");
      continue;
    }
    status.set(
      id,
      normalizedOutlineKey(fromPiece) === normalizedOutlineKey(toPiece)
        ? "unchanged"
        : "changed",
    );
  }
  return status;
}

// Builds the final Piece by applying outline/guide/grainline/dart with an (dx,dy) offset in px.
function place(dp: DraftedPiece, dxPx: number, dyPx: number): Piece {
  const spans = dp.curvedSpans ?? [];
  const outline = spans.length
    ? outlinePath(dp.outlineCm, spans)
    : polyPath(dp.outlineCm);
  const piece: Piece = {
    id: dp.id,
    name: dp.name,
    qty: dp.qty,
    outline: translateOutline(outline, dxPx, dyPx),
    detailRows: dp.detailRows,
    label: { x: dxPx + 6, y: dyPx + PX(bbox(dp.outlineCm).h) - 6 },
  };
  piece.vertices = dp.outlineCm.map(([x, y]) => ({
    x: PX(x) + dxPx,
    y: PX(y) + dyPx,
  }));
  if (dp.foldEdge) piece.foldEdge = dp.foldEdge;
  if (dp.notches?.length) {
    piece.notches = dp.notches.map((n) => ({
      type: n.type,
      x1: PX(n.outerCm[0]) + dxPx,
      y1: PX(n.outerCm[1]) + dyPx,
      x2: PX(n.innerCm[0]) + dxPx,
      y2: PX(n.innerCm[1]) + dyPx,
    }));
  }
  if (dp.guideCm)
    piece.guideOutline = translateOutline(polyPath(dp.guideCm), dxPx, dyPx);
  if (dp.grainlineCm) {
    const [[x1, y1], [x2, y2]] = dp.grainlineCm;
    piece.grainline = {
      x1: PX(x1) + dxPx,
      y1: PX(y1) + dyPx,
      x2: PX(x2) + dxPx,
      y2: PX(y2) + dyPx,
    };
  }
  // #127: translates each cm-space InternalCm entry into its px/canvas-local
  // PieceInternal shape. Dart/pleat/styleLine are path-based (#87: open, not
  // closed -- a dart is two legs meeting at a point, and a trailing Z would
  // draw a segment straight back along the base that isn't part of the
  // dart; a double-ended/fisheye dart repeats its first point at the end of
  // its own list instead, so it reads as closed without that synthetic base
  // line). No new draft ever sets the legacy `piece.darts` field --
  // lib/types.ts's resolvePieceInternals() is what maps an old blob's
  // `darts` back into this same shape at render time.
  const internals: PieceInternal[] = [];
  for (const entry of dp.internalsCm ?? []) {
    switch (entry.kind) {
      case "dart":
      case "pleat":
      case "styleLine": {
        const minPts = entry.kind === "dart" ? 3 : 2;
        if (entry.ptsCm.length < minPts) break;
        internals.push({
          kind: entry.kind,
          d: entry.ptsCm
            .map(
              ([x, y], i) =>
                `${i === 0 ? "M" : "L"}${PX(x) + dxPx} ${PX(y) + dyPx}`,
            )
            .join(" "),
        });
        break;
      }
      case "foldLine":
        internals.push({
          kind: "foldLine",
          x1: PX(entry.aCm[0]) + dxPx,
          y1: PX(entry.aCm[1]) + dyPx,
          x2: PX(entry.bCm[0]) + dxPx,
          y2: PX(entry.bCm[1]) + dyPx,
        });
        break;
      case "drillHole":
        internals.push({
          kind: "drillHole",
          x: PX(entry.atCm[0]) + dxPx,
          y: PX(entry.atCm[1]) + dyPx,
          r: PX(entry.rCm),
        });
        break;
      case "placementMark":
        internals.push({
          kind: "placementMark",
          x: PX(entry.atCm[0]) + dxPx,
          y: PX(entry.atCm[1]) + dyPx,
        });
        break;
    }
  }
  if (internals.length) piece.internals = internals;
  // #243: each internal loop's own outline, translated the same way the
  // piece's own outer outline is above -- straight (polygon) when it has no
  // curvedSpans of its own, Catmull-Rom/Bézier otherwise.
  if (dp.internalLoopsCm?.length) {
    piece.internalLoops = dp.internalLoopsCm.map((loop) => {
      const loopSpans = loop.curvedSpans ?? [];
      const loopOutline = loopSpans.length
        ? outlinePath(loop.outlineCm, loopSpans)
        : polyPath(loop.outlineCm);
      return translateOutline(loopOutline, dxPx, dyPx);
    });
  }
  return piece;
}

export function autoLayout(
  drafted: DraftedPiece[],
  gapCm = 8,
): { pieces: Piece[]; viewBox: { w: number; h: number } } {
  const pad = PX(6);
  const gap = PX(gapCm);

  // bbox + px dimensions of each piece, preserving `drafted`'s original order.
  const items = drafted.map((dp) => {
    const b = bbox(dp.outlineCm);
    return { dp, b, w: PX(b.w), h: PX(b.h), ox: pad, oy: pad };
  });

  // Shelf packing (same technique as the export in lib/export/model.ts):
  // instead of a single horizontal row — which spread the pieces out and left
  // them small inside a wide, short viewBox — it wraps the pieces into rows
  // with a near-square target width. The bounding box ends up more compact, so
  // the canvas scales the pieces bigger. Sorts by height desc for tight
  // shelves; the output array's order follows `drafted`'s original order.
  const widest = items.reduce((m, it) => Math.max(m, it.w), 0);
  const totalArea = items.reduce((s, it) => s + it.w * it.h, 0);
  const targetW = Math.max(widest, Math.sqrt(totalArea * 1.4));

  const order = [...items].sort((a, b) => b.h - a.h);
  let cursorX = pad;
  let cursorY = pad;
  let rowH = 0;
  let sheetRight = pad;
  for (const it of order) {
    if (cursorX > pad && cursorX - pad + it.w > targetW) {
      cursorY += rowH + gap; // new shelf
      cursorX = pad;
      rowH = 0;
    }
    it.ox = cursorX;
    it.oy = cursorY;
    cursorX += it.w + gap;
    rowH = Math.max(rowH, it.h);
    sheetRight = Math.max(sheetRight, cursorX - gap);
  }

  const pieces: Piece[] = items.map((it) =>
    place(it.dp, it.ox - PX(it.b.minX), it.oy - PX(it.b.minY)),
  );

  return {
    pieces,
    viewBox: {
      w: Math.round(sheetRight + pad),
      h: Math.round(cursorY + rowH + pad),
    },
  };
}

// #249: `style.skirtLengthCm ?? m.skirtLength` used to read the explicit
// length as one absolute number for EVERY graded size, while the fallback
// path (`m.skirtLength`, straight off the chart) already grades +2.0cm/size
// (see lib/measurements.ts's #118 note) -- so the moment a request set an
// explicit length, every graded size printed the exact same hem, invisible
// until two sizes are compared side by side (a graded layered PDF export,
// #249's own reported bug).
//
// The fix resolves the chosen length ONCE as a FRACTION of the reference
// row's own skirtLength, then re-expands that same fraction against THIS
// row's own skirtLength -- so an explicit length grades in exactly the same
// ratio the chart's own skirtLength already does, without persisting
// anything new (the fraction is recomputed at draft time, every time).
// `rowSkirtLengthCm`/`referenceSkirtLengthCm` are two DIFFERENT rows' own
// `skirtLength` only when a caller is drafting a size OTHER than the
// pattern's frozen base size (facade.ts's draftGradedOverlays,
// buildExportModel exporting a graded size) -- every other call site passes
// the SAME row for both (draftSkirt's own default below), which collapses
// the fraction back to `explicitCm / rowSkirtLengthCm * rowSkirtLengthCm ===
// explicitCm`, byte-identical to the pre-#249 behavior.
//
// Lives here, not in lib/draft/skirt.ts, because lib/draft/engine/freesewing/
// designs/skirt.ts (a DIFFERENT, independently-scored engine -- see
// docs/architecture/drafting.md's "swappable choice, not the only code
// path") needs the identical formula and must not import moldai's own
// drafter module to get it -- core.ts is the shared, engine-agnostic
// infrastructure both engines already depend on (this function included).
export function gradedSkirtLengthCm(
  explicitCm: number | undefined,
  rowSkirtLengthCm: number,
  referenceSkirtLengthCm: number,
): number {
  if (explicitCm === undefined) return rowSkirtLengthCm;
  if (!Number.isFinite(referenceSkirtLengthCm) || referenceSkirtLengthCm <= 0) {
    return explicitCm;
  }
  return (explicitCm / referenceSkirtLengthCm) * rowSkirtLengthCm;
}
