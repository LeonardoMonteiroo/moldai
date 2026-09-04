import type { Pt } from "../../core";

// #269 -> FreeSewing registration: a pure module, no dependency on
// @freesewing/core's actual classes -- only the shape of the `paths.seam`
// Path object every design exposes (`.ops`, each `{type, to?, cp1?, cp2?}`).
// This is what keeps the adapter's geometry math independently testable
// without a live draft, and keeps @freesewing/core's own types (unpublished
// standalone, and large) out of this leaf-adjacent module's surface.
//
// docs/reference/freesewing-spike/README.md measured the two facts this
// file encodes: (1) 8 samples per `curve` op reproduces the true cubic-
// Bézier arc length to well within SEAM_TOLERANCE_CM (re-verified against a
// live Teagan draft while building this adapter: ~0.02 cm on a ~180 cm
// panel, an order of magnitude tighter than the 1 cm tolerance), so
// `DraftedPiece` needs no type change; (2) a "cut on fold" design part
// (front/back) draws its own fold-closing edge explicitly (or implicitly
// via the path's own `close`), which this module must drop before mirroring
// -- keeping it would double-draw the fold line as a real polygon edge
// instead of the plain two-point annotation `DraftedPiece.foldEdge` is.

export interface FreesewingPathOp {
  type: "move" | "line" | "curve" | "close";
  to?: { x: number; y: number };
  cp1?: { x: number; y: number };
  cp2?: { x: number; y: number };
}

export interface FreesewingPath {
  ops: FreesewingPathOp[];
}

const MM_PER_CM = 10;
// A point closer than this to another is "the same point" -- freesewing's
// own path-building convention draws SVG paths in mm at sub-micron
// precision, so floating-point noise between two ops that were meant to
// land on the same coordinate (e.g. a fold-closing line back to the path's
// own start) is far smaller than this. 0.01 mm = 0.001 cm.
const COINCIDENT_MM = 0.01;
// How close to x=0 (mm) a point must be to count as "on the fold axis" --
// loose enough for floating-point noise, tight enough that a real seam
// point a few mm off centre (there are none in a fold-cut panel by
// definition) would still fail loudly rather than mirror wrong.
const FOLD_AXIS_MM = 0.05;

function toCm(p: { x: number; y: number }): Pt {
  return [p.x / MM_PER_CM, p.y / MM_PER_CM];
}

function bezierPointAt(p0: Pt, c1: Pt, c2: Pt, p3: Pt, u: number): Pt {
  const mt = 1 - u;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * u;
  const c = 3 * mt * u * u;
  const d = u * u * u;
  return [
    a * p0[0] + b * c1[0] + c * c2[0] + d * p3[0],
    a * p0[1] + b * c1[1] + c * c2[1] + d * p3[1],
  ];
}

// The number docs/reference/freesewing-spike measured: reproduces the true
// arc length to well inside SEAM_TOLERANCE_CM. Not a tunable per call site
// -- a second knob here would be a second place curvature fidelity could
// silently drift from what was actually measured.
export const CURVE_SAMPLES_PER_OP = 8;

export interface FlattenedPath {
  outlineCm: Pt[];
  curvedSpans: [number, number][];
}

/**
 * Flattens one @freesewing/core `Path` (always a design's own `paths.seam`
 * -- the net sewing line; `paths.sa`, the seam allowance, is never read,
 * since lib/export/offset.ts computes ours) into the vertex-list +
 * curvedSpans shape lib/draft/core.ts's outlinePath/curveArcLengthCm/place
 * already expect, in cm.
 *
 * Consecutive `curve` ops are merged into ONE curvedSpan (an op-boundary is
 * not a feature boundary -- a single named edge like a neckline or an
 * armhole is routinely drawn as several consecutive cubic Béziers by a
 * freesewing design) so the whole run is re-interpolated with continuous
 * tangents rather than picking up spurious kinks at each internal op
 * junction, which is where the accuracy actually comes from: at a span's
 * own first/last edge, core.ts's catmullRomSegments has no earlier/later
 * neighbour to reference (a fresh drafter-supplied point, not this curve's
 * own next sample) and falls back to a degenerate tangent -- merging keeps
 * that degenerate case to the two ends of the whole feature instead of to
 * every individual op boundary inside it.
 *
 * A path whose last point coincides with its first (a design's own
 * explicit "close this loop" edge, drawn as a real line/curve op rather
 * than left to the path's `close` -- observed on both a front/back
 * cut-on-fold panel's fold-closing edge AND a whole closed piece like a
 * sleeve) has that duplicate point dropped: `place()`/`outlinePath` already
 * treat `outlineCm` as an implicitly closed polygon, so keeping it would
 * add a zero-length edge, not a real one.
 */
export function flattenFreesewingSeam(path: FreesewingPath): FlattenedPath {
  const outlineCm: Pt[] = [];
  const curvedSpans: [number, number][] = [];
  let prev: Pt | null = null;
  let runStart: number | null = null;

  const endRun = () => {
    if (runStart !== null) {
      curvedSpans.push([runStart, outlineCm.length - 1]);
      runStart = null;
    }
  };

  for (const op of path.ops) {
    if (op.type === "move" || op.type === "line") {
      endRun();
      const p = toCm(op.to!);
      outlineCm.push(p);
      prev = p;
    } else if (op.type === "curve") {
      if (!prev) {
        throw new Error(
          "flattenFreesewingSeam: a curve op with no preceding point (path must start with move)",
        );
      }
      if (runStart === null) runStart = outlineCm.length - 1;
      const c1 = toCm(op.cp1!);
      const c2 = toCm(op.cp2!);
      const to = toCm(op.to!);
      for (let s = 1; s <= CURVE_SAMPLES_PER_OP; s++) {
        outlineCm.push(
          bezierPointAt(prev, c1, c2, to, s / CURVE_SAMPLES_PER_OP),
        );
      }
      prev = to;
    } else {
      // "close" carries no point of its own and is handled by the
      // dedup step below, the same way every hand-written drafter's own
      // outlineCm already reads as an implicitly closed polygon.
      endRun();
    }
  }
  endRun();

  if (outlineCm.length >= 2) {
    const first = outlineCm[0];
    const last = outlineCm[outlineCm.length - 1];
    if (
      Math.hypot(
        (last[0] - first[0]) * MM_PER_CM,
        (last[1] - first[1]) * MM_PER_CM,
      ) < COINCIDENT_MM
    ) {
      outlineCm.pop();
      // A dropped point can only have been the END of an emitted span (a
      // curve op whose sampled end duplicated the path's own start) --
      // shrink that span's own end index by one rather than leave it
      // pointing one past the new array's end.
      const lastSpan = curvedSpans[curvedSpans.length - 1];
      if (lastSpan && lastSpan[1] === outlineCm.length) {
        lastSpan[1] -= 1;
        if (lastSpan[0] === lastSpan[1]) curvedSpans.pop();
      }
    }
  }

  return { outlineCm, curvedSpans };
}

// A point closer than this (cm) counts as "the same point" when locating a
// named freesewing point (e.g. `points.armhole`) inside a flattened
// outline -- loose enough for the ~0.02 cm sampling error
// CURVE_SAMPLES_PER_OP=8 measured (this module's own top comment), tight
// enough that two genuinely different vertices a few cm apart never
// collide.
const LOCATE_TOLERANCE_CM = 0.05;

/**
 * Finds the index of the flattened outline point matching a named
 * freesewing point (e.g. `part.points.armhole`, in mm) -- the general,
 * robust alternative to assuming a fixed op/sample count between two
 * named features. Necessary because a design's own op count between two
 * named points is NOT always constant across measurement sets (verified:
 * Diana's own `hips` point coincides with `hem` for some bodies and not
 * others, collapsing or expanding the straight-line op count between
 * them) -- counting ops or samples is fragile where matching the actual
 * on-curve coordinate is not, since every named anchor point a design
 * exposes is, by construction, an exact vertex of the same path
 * (`flattenFreesewingSeam` samples every curve op's endpoint exactly,
 * never only its interior).
 *
 * Throws rather than silently returning a wrong or approximate index --
 * a design wrapper asking for a point that isn't actually a vertex on
 * this seam (a construction-only reference point, or a name that belongs
 * to a different part) is a bug in that wrapper's own understanding of
 * the design, not a soft-fail case.
 */
export function locatePointIndex(
  outlineCm: Pt[],
  target: { x: number; y: number },
  searchFrom = 0,
  searchTo = outlineCm.length,
): number {
  const targetCm = toCm(target);
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = searchFrom; i < searchTo; i++) {
    const [x, y] = outlineCm[i];
    const dist = Math.hypot(x - targetCm[0], y - targetCm[1]);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  if (bestDist > LOCATE_TOLERANCE_CM) {
    throw new Error(
      `locatePointIndex: no outline vertex within ${LOCATE_TOLERANCE_CM} cm of ` +
        `(${targetCm[0]}, ${targetCm[1]}) cm -- closest was ${bestDist.toFixed(4)} cm ` +
        `at index ${bestIdx}`,
    );
  }
  return bestIdx;
}

export interface MirroredPanel {
  outlineCm: Pt[];
  curvedSpans: [number, number][];
  foldEdge: [number, number];
}

/**
 * Mirrors a "cut on fold" half-panel (a design's front/back, ALWAYS drawn
 * starting and ending on the fold axis x=0 -- brian/teagan's own shared
 * drafting convention, verified against a live Teagan draft while building
 * this adapter) into the WHOLE symmetric outline `DraftedPiece.outlineCm`
 * expects. Every one of our own drafters already stores the whole,
 * both-halves outline (lib/draft/body.ts's own front/back panels), with
 * `foldEdge` a pure two-point RENDER annotation (PatternCanvas draws a
 * dashed line directly between those two vertex coordinates, independent of
 * polygon adjacency) rather than a real boundary edge -- so the fold-axis
 * points from the half-panel become two ordinary vertices in the whole
 * outline, not a seam.
 *
 * Requires (throws otherwise, never silently widens the fold-axis
 * tolerance) that `half.outlineCm[0]` and `half.outlineCm[n-1]` both sit on
 * x=0 -- a design whose fold axis isn't a plain vertical line needs a
 * different adapter entirely, not a mirror that silently produces a
 * self-intersecting outline.
 */
export function mirrorFoldedPanel(half: FlattenedPath): MirroredPanel {
  const { outlineCm: half_, curvedSpans } = half;
  const n = half_.length;
  if (n < 3) {
    throw new Error("mirrorFoldedPanel: half-panel needs at least 3 points");
  }
  const onAxis = (p: Pt) => Math.abs(p[0] * MM_PER_CM) < FOLD_AXIS_MM;
  if (!onAxis(half_[0]) || !onAxis(half_[n - 1])) {
    throw new Error(
      "mirrorFoldedPanel: first/last point is not on the x=0 fold axis",
    );
  }

  const interior = half_.slice(1, n - 1); // half_[1..n-2]
  const mirroredInterior = interior
    .slice()
    .reverse()
    .map(([x, y]) => [-x, y] as Pt);
  const outlineCm: Pt[] = [...half_, ...mirroredInterior];
  const L = outlineCm.length; // == 2n - 2

  // p===0/n-1 map to themselves (the shared fold vertices, not duplicated);
  // any interior p maps to its single mirrored copy at L-p (derivation in
  // the module doc comment above the export).
  const mirrorPos = (p: number) => (p === 0 || p === n - 1 ? p : L - p);

  const mirroredSpans: [number, number][] = curvedSpans.map(([a, b]) => {
    const ma = mirrorPos(a);
    const mb = mirrorPos(b);
    // a===0 or b===n-1 map to themselves (real indices); the OTHER
    // direction (b===0 can't happen since b>a>=0, so only a===0 matters
    // here) produces the wrap form the existing seamEdges convention
    // already uses (lib/draft/body.ts: "`to` may equal outlineCm.length to
    // mean wraps back to index 0").
    if (ma === 0 && mb !== 0) return [mb, L];
    return [mb, ma];
  });

  return {
    outlineCm,
    curvedSpans: [...curvedSpans, ...mirroredSpans],
    foldEdge: [0, n - 1],
  };
}
