import { DraftedPiece, curveArcLengthCm } from "./core";

// #134: a reference into one piece's own outline -- `from`/`to` are raw
// indices into that piece's own outlineCm, using the exact convention
// curveArcLengthCm (and the drafters' own closing curvedSpans) already use:
// `to` may equal that piece's outlineCm.length to mean "wraps back to index
// 0" rather than 0 itself, so a wrapping edge (sleeve.ts's left underarm,
// hem vertex 6 back to cap-start vertex 0) is still expressed as a plain
// forward range ([6, 7]) instead of needing a second convention.
export interface SeamEdgeRef {
  pieceId: string;
  from: number;
  to: number;
}

// A mated pair garment.ts declares once it has drafted every piece and
// therefore knows the WHOLE garment's topology (which panel sews to which):
// every edge on `a` is meant to sew to every edge on `b` (each side summed,
// so "front armhole + back armhole, together, face one sleeve cap" is one
// declaration with a 2-edge `a`, not two separate declarations). `easeCm` is
// the intended (signed) extra length side `b` is allowed to carry over side
// `a` -- 0 for a seam meant to close exactly, or the sleeve cap's own
// ease-in allowance (lib/draft/sleeve.ts's CAP_EASE_CM) for the armhole/cap
// pair. `fixable` says whether "Corrigir manga" (lib/editor/state.ts's
// refitSleeve) is capable of closing this particular gap -- true only for
// the armhole/cap pair; every other declared pair has no automatic
// resolution today, so the UI/route must not offer a fix button it can't
// make good on (#134 decision: report the two lengths, no fix button).
export interface SeamPairDecl {
  key: string;
  labelKey: string;
  a: SeamEdgeRef[];
  b: SeamEdgeRef[];
  easeCm: number;
  fixable: boolean;
  // #255: an intentional, deliberate length ratio between the two sides of
  // a stitch (GarmentCode's Interface(..., ruffle=1.)) -- side `b` is
  // MEANT to measure `aLen * gatherRatio + easeCm`, not the pre-#255
  // `aLen + easeCm`, so a gathered skirt waist or a puff sleeve (side b
  // genuinely 1.2-1.5x side a) reports "distribute N cm of fullness" rather
  // than a false conflict. Optional, defaulting to 1 (no ratio) in
  // walkSeamPairs below -- every pair declared today leaves this unset, so
  // diffCm's own formula collapses to the exact pre-#255 one, byte-for-byte.
  gatherRatio?: number;
  // #253: true only for a pair whose multi-edge side is drafted to be a
  // SYMMETRIC split -- i.e. every edge on that side is EXPECTED to carry an
  // equal share of the total (armhole-cap: front/back armhole are equal by
  // construction unless a real backWidth divergence is in play). Opt-in,
  // never a blanket default: most multi-edge sides are NOT meant to split
  // evenly (collar-neckline's own front+back neckline arcs -- a V-neck
  // front is a genuinely different length than the shallow-scoop back), and
  // a blanket "expect 1/n" assumption would flag a correct, asymmetric-by-
  // design seam as diverging. See walkSeamPairs' subSegmentDiffCm below.
  expectEqualSplit?: boolean;
}

// #253: one edge's own measured length, plus where it falls along its own
// side's cumulative arc as a fraction of that side's own total -- the same
// per-edge fraction GarmentCode's Interface.projecting_fractions() derives
// before projecting a multi-edge side's own internal boundaries onto
// whichever edge(s) it's mated to. `endFracOfSide` is CUMULATIVE (this
// edge's own share plus every earlier-declared edge's own share, in the
// pair's own `a`/`b` declaration order) -- the side's last edge always ends
// at exactly 1.
export interface SeamEdgeMeasurement {
  pieceId: string;
  from: number;
  to: number;
  lenCm: number;
  endFracOfSide: number;
}

// One measured pair -- every declared pair whose pieces were actually
// drafted gets one of these, whether or not it diverges. This is the full
// seam graph #138 (assembly/sewing-order instructions) walks; seamCheck
// (lib/draft/garment.ts) is what narrows it down to genuine conflicts.
export interface SeamMeasurement {
  key: string;
  labelKey: string;
  aPieceId: string;
  bPieceId: string;
  aLenCm: number;
  bLenCm: number;
  // (measured b - measured a*gatherRatio) minus the pair's own intended
  // easeCm, rounded to 0.1cm -- 0 means the seam closes exactly as
  // designed; a real number away from 0 is a genuine mismatch the fabric's
  // own give won't absorb. Magnitude only, like before #253/#255: which
  // side is longer is conveyed separately (the card's bar gap, the chat
  // description's "larger"/"smaller"), not by this field's sign.
  diffCm: number;
  fixable: boolean;
  // #138: the pair's own declared `easeCm`, carried through unchanged (not
  // re-derived) -- the "ease to distribute" a sewing-order step cites (e.g.
  // the sleeve cap's CAP_EASE_CM, a waistband's WAISTBAND_OVERLAP_CM). 0 for
  // a seam meant to close exactly. Additive: every existing consumer of
  // SeamMeasurement (seamCheck, ConflictEntry) reads a strict subset of its
  // fields and is unaffected.
  easeCm: number;
  // #253: per-edge breakdown for each side -- see SeamEdgeMeasurement above.
  aEdges: SeamEdgeMeasurement[];
  bEdges: SeamEdgeMeasurement[];
  // #253: divergence between where a multi-edge side's OWN interior
  // boundaries actually fall and where a symmetric (equal-share) split
  // would put them, projected onto the mate side's own total length so the
  // result is directly comparable against SEAM_TOLERANCE_CM like diffCm is.
  // Always 0 unless the pair declared `expectEqualSplit` -- see
  // SeamPairDecl's own doc. This is what catches "a sleeve cap whose TOTAL
  // matches but whose front/back split is wrong", which diffCm alone can't
  // see (it only ever compares the two sides' summed totals).
  subSegmentDiffCm: number;
  // #255: the pair's own declared gatherRatio, carried through unchanged --
  // 1 (no ratio) for every pair that doesn't declare one, same shape
  // easeCm's own additive carry-through already established.
  gatherRatio: number;
}

interface SideMeasurement {
  edges: SeamEdgeMeasurement[];
  totalCm: number;
}

function measureSide(
  pieces: DraftedPiece[],
  refs: SeamEdgeRef[],
): SideMeasurement | null {
  const raw: { ref: SeamEdgeRef; lenCm: number }[] = [];
  let total = 0;
  for (const ref of refs) {
    const piece = pieces.find((p) => p.id === ref.pieceId);
    if (!piece) return null;
    const lenCm = curveArcLengthCm(
      piece.outlineCm,
      piece.curvedSpans ?? [],
      ref.from,
      ref.to,
    );
    raw.push({ ref, lenCm });
    total += lenCm;
  }
  let cum = 0;
  const edges: SeamEdgeMeasurement[] = raw.map(({ ref, lenCm }) => {
    cum += lenCm;
    return {
      pieceId: ref.pieceId,
      from: ref.from,
      to: ref.to,
      lenCm: Math.round(lenCm * 10) / 10,
      endFracOfSide: total > 0 ? cum / total : 1,
    };
  });
  return { edges, totalCm: total };
}

// One side's own interior fraction breakpoints (every edge but the last)
// compared against an even 1/n split, scaled by the MATE side's own total
// length -- turns a fraction error into a real cm figure. 0 for a
// single-edge side (nothing to split).
function sideSplitDevCm(side: SideMeasurement, mateTotalCm: number): number {
  const n = side.edges.length;
  if (n < 2) return 0;
  let maxDevCm = 0;
  for (let i = 0; i < n - 1; i++) {
    const expectedFrac = (i + 1) / n;
    const actualFrac = side.edges[i].endFracOfSide;
    maxDevCm = Math.max(
      maxDevCm,
      Math.abs(actualFrac - expectedFrac) * mateTotalCm,
    );
  }
  return maxDevCm;
}

// #253: see SeamPairDecl.expectEqualSplit's own doc. Checks BOTH sides
// independently (not just whichever side happens to have more than one
// edge) -- a many-to-many pair opting in would otherwise have one side's
// own split imbalance silently ignored -- and reports the worse of the two.
// 0 when there's nothing to project (both sides single-edge, or the pair
// didn't opt in).
function subSegmentDiffCm(
  pair: SeamPairDecl,
  aSide: SideMeasurement,
  bSide: SideMeasurement,
): number {
  if (!pair.expectEqualSplit) return 0;
  const maxDevCm = Math.max(
    sideSplitDevCm(aSide, bSide.totalCm),
    sideSplitDevCm(bSide, aSide.totalCm),
  );
  return Math.round(maxDevCm * 10) / 10;
}

// #134: the pure walker -- measures every declared pair's real arc length
// off the already-drafted pieces (never a bespoke per-drafter number, the
// same "measure the geometry that was actually emitted" rule #78 already
// established for the armhole/cap pair alone before this issue generalised
// it). A pair naming a piece this garment never drafted (e.g. a waist-join
// pair when there's no skirt) is silently skipped -- defensive, not
// load-bearing, since garment.ts only ever declares a pair for pieces it
// actually drafted.
export function walkSeamPairs(
  pieces: DraftedPiece[],
  pairs: SeamPairDecl[],
): SeamMeasurement[] {
  const out: SeamMeasurement[] = [];
  for (const pair of pairs) {
    const aSide = measureSide(pieces, pair.a);
    const bSide = measureSide(pieces, pair.b);
    if (!aSide || !bSide) continue;
    const aLen = aSide.totalCm;
    const bLen = bSide.totalCm;
    const gatherRatio = pair.gatherRatio ?? 1;
    out.push({
      key: pair.key,
      labelKey: pair.labelKey,
      aPieceId: pair.a[0].pieceId,
      bPieceId: pair.b[0].pieceId,
      aLenCm: Math.round(aLen * 10) / 10,
      bLenCm: Math.round(bLen * 10) / 10,
      diffCm:
        Math.round(Math.abs(bLen - aLen * gatherRatio - pair.easeCm) * 10) / 10,
      fixable: pair.fixable,
      easeCm: pair.easeCm,
      aEdges: aSide.edges,
      bEdges: bSide.edges,
      subSegmentDiffCm: subSegmentDiffCm(pair, aSide, bSide),
      gatherRatio,
    });
  }
  return out;
}

// The same 1cm threshold the original armhole/cap-only seamCheck always
// used -- below this, a woven fabric's own give takes up the slack; this
// issue generalises WHICH pairs get checked, not the tolerance itself.
export const SEAM_TOLERANCE_CM = 1;

// #253: the ONE pitch-notch distance every mated edge of the armhole/cap
// pair places its own single/double notch at -- front's own armhole curve,
// back's own, and the cap's own two ends. Replaces two INDEPENDENTLY
// clamped fractions (body.ts used to clamp to 0.7 of each panel's OWN
// single-side length; sleeve.ts separately clamped to 0.35 of the cap's own
// full arc -- consistent only when front and back armhole happen to be
// equal, which a real backWidth divergence breaks). Deriving both sides'
// distance from the SAME total (front+back armhole, the pair's own `a`
// side) is what makes the two "generated as pairs from the same
// computation" (#124) again regardless of that divergence. 0.35 of the pair
// TOTAL is mathematically identical to the old 0.7-of-one-side figure in
// the equal-front-and-back case (one side's own length is ~half the total),
// so this reproduces prior geometry exactly whenever front === back.
export const PITCH_NOTCH_RISE_CM = 8;
const PITCH_NOTCH_MAX_FRACTION_OF_TOTAL = 0.35;
export function pitchNotchDistanceCm(totalLenCm: number): number {
  return Math.min(
    PITCH_NOTCH_RISE_CM,
    totalLenCm * PITCH_NOTCH_MAX_FRACTION_OF_TOTAL,
  );
}
