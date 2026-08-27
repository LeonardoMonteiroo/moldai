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
  // (measured b - measured a) minus the pair's own intended easeCm, rounded
  // to 0.1cm -- 0 means the seam closes exactly as designed; a real number
  // away from 0 is a genuine mismatch the fabric's own give won't absorb.
  diffCm: number;
  fixable: boolean;
}

function sumEdgeLenCm(
  pieces: DraftedPiece[],
  refs: SeamEdgeRef[],
): number | null {
  let total = 0;
  for (const ref of refs) {
    const piece = pieces.find((p) => p.id === ref.pieceId);
    if (!piece) return null;
    total += curveArcLengthCm(
      piece.outlineCm,
      piece.curvedSpans ?? [],
      ref.from,
      ref.to,
    );
  }
  return total;
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
    const aLen = sumEdgeLenCm(pieces, pair.a);
    const bLen = sumEdgeLenCm(pieces, pair.b);
    if (aLen == null || bLen == null) continue;
    out.push({
      key: pair.key,
      labelKey: pair.labelKey,
      aPieceId: pair.a[0].pieceId,
      bPieceId: pair.b[0].pieceId,
      aLenCm: Math.round(aLen * 10) / 10,
      bLenCm: Math.round(bLen * 10) / 10,
      // Magnitude only, like the original armhole/cap-only seamCheck's own
      // diffCm -- which side is longer is conveyed separately (the card's
      // bar gap, the chat description's "larger"/"smaller"), not by this
      // field's sign.
      diffCm: Math.round(Math.abs(bLen - aLen - pair.easeCm) * 10) / 10,
      fixable: pair.fixable,
    });
  }
  return out;
}

// The same 1cm threshold the original armhole/cap-only seamCheck always
// used -- below this, a woven fabric's own give takes up the slack; this
// issue generalises WHICH pairs get checked, not the tolerance itself.
export const SEAM_TOLERANCE_CM = 1;
