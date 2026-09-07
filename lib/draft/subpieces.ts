import { DetailRow } from "@/lib/types";
import {
  curveArcLengthCm,
  DraftedPiece,
  InternalCm,
  NO_PLACEMENT_TRANSFORM,
  Pt,
} from "./core";
import { formatCm } from "@/lib/format";
import type { Translate } from "@/lib/i18n/translate";

const cm = (v: number) => `${formatCm(v)} cm`;

// #254: none of these sub-pieces has a 3D shell of its own in
// lib/proof3d/mesh.ts yet -- an honest, narrower gap than the trousers one
// this issue closes (see core.ts's Proof3DRole doc), not a silent one. One
// shared constant rather than six identical literals drifting apart.
const ACCESSORY_PLACEMENT_CM = {
  role: "accessory" as const,
  ...NO_PLACEMENT_TRANSFORM,
};

// #129/#130/#131 (Wave 2/W4): three small, single-purpose drafters, grouped
// in one file the way the three issues were shipped as one unit -- each
// sized from a MEASURED edge on an already-drafted piece (never a proportion
// of the bust/waist), following the same "measure the geometry that was
// actually emitted" rule #78/#139/#134 already established for the
// armhole/cap pair. garment.ts's draftAll computes each measured length via
// curveArcLengthCm on the piece it's mated to, then calls the matching
// draft*() below and declares a SeamPairDecl pairing the two -- so a
// collar/cuff/waistband that stops matching its own seam is exactly as
// detectable as any other mated pair, not a special case.

// ---------------------------------------------------------------------------
// Collar (#129)
// ---------------------------------------------------------------------------

// Convertible collar geometry: a soft, foldable classic collar, symmetric
// about a center-back fold, with a curved outer edge running the whole way
// from center back down to each end of the neckline seam -- the same
// curve-meets-straight-edge shape body.ts's own neckline already uses (a
// 3-point catmull-rom span landing on the straight seam edge), which is
// what keeps the cut-line offset gentle at the one corner where the curve
// ends, rather than a separately-pointed collar tip's sharper, more
// mitre-prone corner. The one collar shape MoldAI drafts today (issue #129
// decision: "one type, name it precisely, mark the rest em breve").
const COLLAR_HEIGHT_CM = 6.5; // outer edge to neckline seam

// #222: the geometry-building half of draftCollar, extracted so the shirt
// collar's own FALL piece (draftShirtCollar below) can reuse the identical
// soft-curved-outer-edge shape -- sources describe the fall as literally
// "the standard one-piece collar" sewn on top of a separate stand, i.e. this
// exact shape, sized off a different (shorter) seam length. Only the
// returned DraftedPiece's own id/name/detailRows differ by caller.
//
// seamLenCm is the FULL measured length the collar's own straight neckline
// seam is drafted to -- the front+back neckline arc for draftCollar below,
// or the shirt stand's own measured (shortened) upper seam for the fall --
// never a proportion of the bust.
function convertibleFallShape(seamLenCm: number): {
  pts: Pt[];
  curvedSpans: [number, number][];
  grainlineCm: [Pt, Pt];
  foldEdge: [number, number];
  seamEdge: [number, number];
} {
  const halfLen = seamLenCm / 2;
  const cx = halfLen;
  const pts: Pt[] = [];
  const push = (p: Pt) => (pts.push(p), pts.length - 1);

  const tc = push([cx, 0]); // outer edge, center back (top of the fold)
  // The control point sits close to seamL's own x (not halfway across), so
  // the curve's tangent AT the seam edge is close to vertical -- meeting the
  // straight seam edge at close to a right angle, the same gentle
  // curve-into-straight-edge transition body.ts's own neckline/hpsL uses,
  // rather than approaching it nearly tangent (a near-parallel, very sharp
  // corner that #123's cut-line offset mitres into an outsized wedge).
  push([cx - halfLen * 0.92, COLLAR_HEIGHT_CM * 0.18]); // left outer-edge ctrl
  const seamL = push([cx - halfLen, COLLAR_HEIGHT_CM]); // left end of neckline seam
  const seamC = push([cx, COLLAR_HEIGHT_CM]); // neckline seam centre (fold bottom)
  const seamR = push([cx + halfLen, COLLAR_HEIGHT_CM]); // right end of neckline seam
  push([cx + halfLen * 0.92, COLLAR_HEIGHT_CM * 0.18]); // right outer-edge ctrl

  const curvedSpans: [number, number][] = [
    [tc, seamL],
    [seamR, pts.length], // wraps back to tc
  ];
  // Inset from the fold's own two boundary vertices (tc, seamC), the same
  // technique body.ts's own grainline uses against the neckline/hem.
  const grainlineCm: [Pt, Pt] = [
    [cx, 1],
    [cx, COLLAR_HEIGHT_CM - 1],
  ];
  return {
    pts,
    curvedSpans,
    grainlineCm,
    foldEdge: [tc, seamC],
    // The straight neckline seam edge (seamL -> seamC -> seamR) -- a single
    // contiguous range since no curvedSpan covers it, summing to exactly
    // halfLen*2 === seamLenCm.
    seamEdge: [seamL, seamR],
  };
}

// necklineArcCm is the FULL measured neckline circumference (front + back,
// both halves already summed by the caller) -- the collar's own neckline
// seam edge is drafted to exactly that length (a straight edge, so the
// match is exact to floating-point precision, comfortably inside the AC's
// 0.3cm tolerance), never a proportion of the bust.
export function draftCollar(necklineArcCm: number, t: Translate): DraftedPiece {
  const shape = convertibleFallShape(necklineArcCm);
  const detailRows: DetailRow[] = [
    { label: t("rows.collarType"), value: t("collarType.convertible") },
    { label: t("rows.length"), value: cm(necklineArcCm) },
    { label: t("rows.grain"), value: t("grainValue") },
    // #129 AC: collar types that are not built are shown "em breve" rather
    // than absent -- there is no UI selector for this field (it's AI-chat
    // driven), so the note surfaces right on the collar's own piece card in
    // TechSheetTab, where a user meets the drafted collar itself.
    { label: t("rows.collarOtherTypes"), value: t("comingSoonBadge") },
  ];

  return {
    id: "collar",
    name: t("pieceNames.collar"),
    qty: 1, // cut on fold (center back)
    outlineCm: shape.pts,
    curvedSpans: shape.curvedSpans,
    grainlineCm: shape.grainlineCm,
    foldEdge: shape.foldEdge,
    detailRows,
    seamEdges: { neckline: shape.seamEdge },
    placementCm: ACCESSORY_PLACEMENT_CM,
  };
}

// ---------------------------------------------------------------------------
// Cuff + placket (#130)
// ---------------------------------------------------------------------------

const CUFF_HEIGHT_CM = 5;
const PLACKET_LENGTH_CM = 10;
const PLACKET_WIDTH_CM = 3;

// A plain rectangular band, seamed along its top edge -- shared shape
// between the cuff and the waistband below (both "a straight band" per
// their own issue's decision). Center vertices on the long edges (at w/2)
// exist purely so the seam edge is expressed as one contiguous
// [0, 2] range across two collinear segments, the same "vertex at the
// straight edge's own midpoint" idiom body.ts/skirt.ts already use for their
// hem/waist centres -- it changes no rendered shape.
//
// #269: exported so lib/draft/engine/freesewing/designs/hoodie.ts can build
// its own hood-center and neck-binding trim strips from the SAME rectangle
// primitive -- @freesewing/hugo's own hoodCenter/neckBinding parts are both
// plain rectangles too (verified by reading their source), just hidden by
// default behind an "expand" setting this app never needs to toggle, so
// reusing this primitive directly (with the wrapper's own id/name/detail
// rows) is simpler than fighting that setting for no geometric gain.
export function straightBand(
  wCm: number,
  hCm: number,
): { pts: Pt[]; seamEdge: [number, number] } {
  const pts: Pt[] = [
    [0, 0],
    [wCm / 2, 0],
    [wCm, 0],
    [wCm, hCm],
    [wCm / 2, hCm],
    [0, hCm],
  ];
  return { pts, seamEdge: [0, 2] };
}

// sewLenCm is the sleeve's own MEASURED hem edge plus the wrist ease
// (lib/draft/sleeve.ts's WRIST_EASE_CM) -- computed by the caller so this
// module stays free of any knit/woven or gender branching of its own.
//
// #224: deliberately sleeve-first, not cuff-first. The cuff is sized off
// the sleeve's own already-drafted hem rather than the sleeve being fit
// to a wrist-based cuff width, so the cuff stays genuinely fitted to
// whatever hem the sleeve actually drafted (and the cuff-hem SeamPairDecl
// in garment.ts matches by construction). A source cited in #224 argues
// standard shirt-cuff sequencing runs cuff-first, but that citation was
// adversarially verified 2-1, not unanimous -- kept as-is per the issue's
// own accepted resolution rather than inverting a working, seam-graph-
// verified mated pair on a non-unanimous claim.
export function draftCuff(sewLenCm: number, t: Translate): DraftedPiece {
  const { pts, seamEdge } = straightBand(sewLenCm, CUFF_HEIGHT_CM);
  const grainlineCm: [Pt, Pt] = [
    [sewLenCm * 0.1, CUFF_HEIGHT_CM / 2],
    [sewLenCm * 0.9, CUFF_HEIGHT_CM / 2],
  ];
  const detailRows: DetailRow[] = [
    { label: t("rows.cuffType"), value: t("cuffType.straight") },
    { label: t("rows.length"), value: cm(sewLenCm) },
    { label: t("rows.grain"), value: t("grainValue") },
    // #130 AC: unsupported cuff types (a shaped cuff, a tower placket) are
    // surfaced "em breve" on the drafted piece itself, the same convention
    // as the collar's own note above.
    { label: t("rows.cuffOtherTypes"), value: t("comingSoonBadge") },
  ];
  return {
    id: "cuff",
    name: t("pieceNames.cuff"),
    qty: 2, // one per sleeve
    outlineCm: pts,
    grainlineCm,
    detailRows,
    seamEdges: { hem: seamEdge },
    placementCm: ACCESSORY_PLACEMENT_CM,
  };
}

// A simple continuous-lap placket strip -- fixed dimensions (not derived
// from a measured edge; the issue's own AC only requires the CUFF's length
// to be measured). Binds into the sleeve's vertical opening above the cuff;
// it has no distinct edge on the already-drafted sleeve piece to mate
// against, so it declares no seamEdges (lib/draft/core.ts: "a piece with
// nothing to mate simply omits this").
//
// #225: the strip's two long edges (the vertical PLACKET_LENGTH_CM-long
// sides) fold under by two DIFFERENT amounts rather than one symmetric
// allowance -- a verified shirt-sleeve-placket construction detail
// (so-sew-easy.com, "Placket Pattern Tutorial": "fold at 3/8" on one side
// and 1/4" on the opposite side"). The wider fold becomes the visible
// overlap edge once finished; the narrower one becomes the underlap that
// sits beneath it. (A stronger claim -- that overlap/underlap are two
// distinct mirror-paired pieces -- did not survive verification, so #225
// scopes itself to this fold-width asymmetry on the existing single strip,
// qty:2, unchanged.) PLACKET_WIDTH_CM stays the strip's own finished
// (post-fold) width; the flat cut width below adds both raw-edge
// turn-under allowances on top of it.
export const PLACKET_FOLD_OVERLAP_CM = 0.9525; // 3/8"
export const PLACKET_FOLD_UNDERLAP_CM = 0.635; // 1/4"

export function draftPlacket(t: Translate): DraftedPiece {
  const cutWidthCm =
    PLACKET_WIDTH_CM + PLACKET_FOLD_OVERLAP_CM + PLACKET_FOLD_UNDERLAP_CM;
  const pts: Pt[] = [
    [0, 0],
    [cutWidthCm, 0],
    [cutWidthCm, PLACKET_LENGTH_CM],
    [0, PLACKET_LENGTH_CM],
  ];
  const grainlineCm: [Pt, Pt] = [
    [cutWidthCm / 2, PLACKET_LENGTH_CM * 0.1],
    [cutWidthCm / 2, PLACKET_LENGTH_CM * 0.9],
  ];
  // The two fold lines themselves, inset from each long edge by that edge's
  // own fold allowance -- so the gap between a fold line and its edge is
  // asymmetric by construction, not just described in a detail row.
  const internalsCm: InternalCm[] = [
    {
      kind: "foldLine",
      aCm: [PLACKET_FOLD_OVERLAP_CM, 0],
      bCm: [PLACKET_FOLD_OVERLAP_CM, PLACKET_LENGTH_CM],
    },
    {
      kind: "foldLine",
      aCm: [cutWidthCm - PLACKET_FOLD_UNDERLAP_CM, 0],
      bCm: [cutWidthCm - PLACKET_FOLD_UNDERLAP_CM, PLACKET_LENGTH_CM],
    },
  ];
  const detailRows: DetailRow[] = [
    { label: t("rows.length"), value: cm(PLACKET_LENGTH_CM) },
    {
      label: t("rows.placketFoldOverlap"),
      value: cm(PLACKET_FOLD_OVERLAP_CM),
    },
    {
      label: t("rows.placketFoldUnderlap"),
      value: cm(PLACKET_FOLD_UNDERLAP_CM),
    },
    { label: t("rows.grain"), value: t("grainValue") },
  ];
  return {
    id: "placket",
    name: t("pieceNames.placket"),
    qty: 2, // one per sleeve opening
    outlineCm: pts,
    grainlineCm,
    internalsCm,
    detailRows,
    placementCm: ACCESSORY_PLACEMENT_CM,
  };
}

// ---------------------------------------------------------------------------
// Waistband (#131)
// ---------------------------------------------------------------------------

const WAISTBAND_HEIGHT_CM = 4;
// Fixed closure overlap -- standard button/zip stand allowance. Exported so
// garment.ts's SeamPairDecl can declare it as the pair's own `easeCm`,
// reproducing "band length - waist edge === overlap exactly" rather than a
// second copy of the number.
export const WAISTBAND_OVERLAP_CM = 3;

// waistLenCm is the skirt panel's own MEASURED waist edge, already summed
// across every cut panel (qty) by the caller -- the full closed waist
// circumference, not one panel's share of it.
export function draftWaistband(waistLenCm: number, t: Translate): DraftedPiece {
  const sewLenCm = waistLenCm + WAISTBAND_OVERLAP_CM;
  const { pts, seamEdge } = straightBand(sewLenCm, WAISTBAND_HEIGHT_CM);
  const grainlineCm: [Pt, Pt] = [
    [sewLenCm * 0.05, WAISTBAND_HEIGHT_CM / 2],
    [sewLenCm * 0.95, WAISTBAND_HEIGHT_CM / 2],
  ];
  const detailRows: DetailRow[] = [
    { label: t("rows.waistbandType"), value: t("waistbandType.straight") },
    { label: t("rows.length"), value: cm(sewLenCm) },
    { label: t("rows.overlap"), value: cm(WAISTBAND_OVERLAP_CM) },
    { label: t("rows.grain"), value: t("grainValue") },
    // #131 decision: the closure (button/zip) position is a placement mark
    // that needs the internal-geometry channel -- #127 later added exactly
    // that channel (InternalCm's reserved "placementMark" kind), but #131's
    // own decision was settled and is deliberately not reopened here: the
    // band ships without the mark, and says so on its own card.
    { label: t("rows.waistbandClosureMark"), value: t("comingSoonBadge") },
  ];
  return {
    id: "waistband",
    name: t("pieceNames.waistband"),
    qty: 1, // one continuous strip spanning the whole waist
    outlineCm: pts,
    grainlineCm,
    detailRows,
    seamEdges: { waist: seamEdge },
    placementCm: ACCESSORY_PLACEMENT_CM,
  };
}

// ---------------------------------------------------------------------------
// Band (stand/mandarin) collar (#221)
// ---------------------------------------------------------------------------

// Band-collar geometry: a straight-up stand with NO folded-over fall --
// structurally different from the convertible shape above
// (muellerundsohn.com's "Pattern construction for stand-up collar": "does
// not have a fall"). Drafted as the same plain rectangular band
// straightBand() already gives the cuff/waistband above (both "a straight
// band" per their own issue's decision) rather than a second bespoke shape
// -- a flat stand has no outer curve to draft at all, so there is nothing
// convertible's Catmull-Rom fold construction would add here.
// tshirt-fit-calibration: was 4 -- a real graded crew-neck tee's own rib
// collar band measures a flat 5cm wide, constant across every graded size
// (docs/reference/tshirt-benchmark/measurements.json's collarBand.widthCm),
// the one figure in that reference comparable independent of any
// body-measurement assumption (a flat authored constant on both sides).
const BAND_COLLAR_HEIGHT_CM = 5; // stand height only -- shorter than COLLAR_HEIGHT_CM (6.5), which also carries the fall

// #221: the neckline lowering deltas a stand collar needs BEFORE its own
// seam edge is measured (muellerundsohn.com's own figures, 3-0 verified) --
// a stand sits close to the throat with no fall to absorb ease, so the
// neckline itself has to open up a little first. Applied in body.ts's
// bodice(), gated on style.collar === "band" so the convertible/no-collar
// geometry stays byte-identical. Exported so body.ts (the only other
// consumer) never re-derives or duplicates these figures.
export const BAND_COLLAR_SHOULDER_DROP_CM = 0.5; // 0-1cm at the shoulder seam -- same amount on front AND back, so their shoulder-seam lengths stay equal
export const BAND_COLLAR_BACK_NECK_DROP_CM = 0.3; // 0-0.5cm at centre back
export const BAND_COLLAR_FRONT_NECK_DROP_CM = 2; // up to 2cm at centre front

// +3-4cm at the front edge -- the closure overlap allowance a stand
// collar's own front ends need (button/snap stand), the same footing as
// WAISTBAND_OVERLAP_CM/BUTTON_STAND_WIDTH_CM above/below. Declared as the
// mated seam pair's own `easeCm` in garment.ts (not folded silently into
// the drafted length), so seamCheck's "gap minus intended ease" comparison
// reproduces "sewn length - neckline arc === extension" exactly, the same
// pattern the waistband's WAISTBAND_OVERLAP_CM already establishes.
export const BAND_COLLAR_FRONT_EXTENSION_CM = 3.5;

// necklineArcCm is the FULL measured (already-lowered) neckline
// circumference, exactly like draftCollar's own parameter above -- the
// caller (garment.ts) computes it off the front+back panels AFTER body.ts
// has applied the drop deltas, never a proportion of the bust.
export function draftBandCollar(
  necklineArcCm: number,
  t: Translate,
): DraftedPiece {
  const sewLenCm = necklineArcCm + BAND_COLLAR_FRONT_EXTENSION_CM;
  const { pts, seamEdge } = straightBand(sewLenCm, BAND_COLLAR_HEIGHT_CM);
  const grainlineCm: [Pt, Pt] = [
    [sewLenCm * 0.05, BAND_COLLAR_HEIGHT_CM / 2],
    [sewLenCm * 0.95, BAND_COLLAR_HEIGHT_CM / 2],
  ];
  const detailRows: DetailRow[] = [
    { label: t("rows.collarType"), value: t("collarType.band") },
    { label: t("rows.length"), value: cm(sewLenCm) },
    { label: t("rows.overlap"), value: cm(BAND_COLLAR_FRONT_EXTENSION_CM) },
    { label: t("rows.grain"), value: t("grainValue") },
    // Other collar shapes (a Peter Pan, a two-piece stand+fall) are still
    // "em breve" -- the same note draftCollar's own card carries, since
    // this issue instantiates one new shape, not every possible one.
    { label: t("rows.collarOtherTypes"), value: t("comingSoonBadge") },
  ];
  return {
    id: "collar",
    name: t("pieceNames.collar"),
    qty: 1, // one continuous strip spanning the whole neckline, no fold
    outlineCm: pts,
    grainlineCm,
    detailRows,
    seamEdges: { neckline: seamEdge },
    placementCm: ACCESSORY_PLACEMENT_CM,
  };
}

// ---------------------------------------------------------------------------
// Button stand (#223)
// ---------------------------------------------------------------------------

// Finished width of the stand extension -- a documented, reasonable shirt
// button-stand figure. The issue's own research found no verified
// industry-standard multiplier to cite, so this is a deliberate constant,
// the same footing as WAISTBAND_OVERLAP_CM above.
export const BUTTON_STAND_WIDTH_CM = 4;

// centerFrontLenCm is the front bodice half-panel's own MEASURED
// center-front edge (lib/draft/body.ts's frontClosure mode) -- the button
// stand is a separate piece mated to that edge via the seam graph, never a
// distortion of the front panel's own outline, so center front stays the
// fixed button-placement line the issue's source describes. Reuses
// straightBand exactly like draftCuff/draftWaistband above.
export function draftButtonStand(
  centerFrontLenCm: number,
  t: Translate,
): DraftedPiece {
  const { pts, seamEdge } = straightBand(
    centerFrontLenCm,
    BUTTON_STAND_WIDTH_CM,
  );
  const grainlineCm: [Pt, Pt] = [
    [centerFrontLenCm * 0.1, BUTTON_STAND_WIDTH_CM / 2],
    [centerFrontLenCm * 0.9, BUTTON_STAND_WIDTH_CM / 2],
  ];
  const detailRows: DetailRow[] = [
    { label: t("rows.length"), value: cm(centerFrontLenCm) },
    { label: t("rows.grain"), value: t("grainValue") },
    // #223 AC: the button/buttonhole placement mark is missing -- surfaced
    // "em breve" on the piece's own card, the waistbandClosureMark precedent.
    { label: t("rows.buttonStandMark"), value: t("comingSoonBadge") },
  ];
  return {
    id: "button-stand",
    name: t("pieceNames.buttonStand"),
    qty: 2, // one per front half
    outlineCm: pts,
    grainlineCm,
    detailRows,
    seamEdges: { centerFront: seamEdge },
    placementCm: ACCESSORY_PLACEMENT_CM,
  };
}

// ---------------------------------------------------------------------------
// Shirt collar: stand + fall (#222)
// ---------------------------------------------------------------------------

// #222: sources describe the classic shirt collar as a composite of TWO
// collars sewn together -- a Mandarin/band collar as the base (the stand)
// plus the standard one-piece collar shape as the top (the fall), not a
// single piece (dresspatternmaking.com's "Collars": "The Shirt Collar is
// actually made from two other collars; the base is the Mandarin (or Band)
// Collar, and the top part is the standard one-piece collar."). The stand
// reuses BAND_COLLAR_HEIGHT_CM (its own construction IS the band collar's,
// per that source) and the fall reuses convertibleFallShape above (the
// SAME "standard one-piece collar" shape draftCollar already drafts).
//
// The stand's own upper seam (where the fall sews on) is drafted shorter
// than its lower (neckline) seam AND curved -- stitchpaperscissors.com's
// "How to Draft a Shirt Pattern" describes exactly this refinement ("the
// upper seam is curved to reduce gaping" at the neck). No verified
// industry-standard shorten AMOUNT exists (the same "no citable multiplier"
// gap BUTTON_STAND_WIDTH_CM above already documents), so this is a
// deliberate, reasonable constant on the same footing -- a FIXED cm inset
// per side (not a proportion of the stand's own length): #123's cut-line
// offset mitres a sharp polygon corner into an outsized wedge (see
// draftCollar's own ctrl-point comment above), and a proportional inset
// would grow with the neckline arc while the stand's own height doesn't,
// making the corner where the straight neckline seam meets this taper
// progressively SHARPER on a larger stand. A fixed cm inset keeps that
// corner's own angle constant regardless of size.
const STAND_TOP_INSET_CM = 1.2;

// #222 AC: "the width of the half of the neckline plus the final width of
// the button stand" (stitchpaperscissors.com) -- necklineArcCm here is
// already the FULL front+back arc (this repo's own convention, matching
// every other collar/band above), so the per-half formula scales up to
// "the full arc plus one button-stand width", the same "front-edge closure
// extension added once to the full arc" shape draftBandCollar's own
// BAND_COLLAR_FRONT_EXTENSION_CM already establishes -- reusing
// BUTTON_STAND_WIDTH_CM (#223) rather than a second, new constant, since
// it's the SAME finished button-stand width the front-closure work already
// derived, not a fresh guess.
function shirtStandShape(standLenCm: number): {
  pts: Pt[];
  curvedSpans: [number, number][];
  grainlineCm: [Pt, Pt];
  neckSeamEdge: [number, number];
  fallSeamEdge: [number, number];
} {
  const cx = standLenCm / 2;
  const pts: Pt[] = [];
  const push = (p: Pt) => (pts.push(p), pts.length - 1);

  // Walk the perimeter once: the straight neckline seam (bottom) left to
  // right, a short straight taper up the right side, across the
  // shortened+curved fall seam (top) right to left, then a short straight
  // taper back down the left side, closing back to the start. Six vertices
  // total -- the same count draftCollar/draftBandCollar's own shapes use.
  const neckL = push([0, BAND_COLLAR_HEIGHT_CM]); // bottom-left (neckline seam)
  push([cx, BAND_COLLAR_HEIGHT_CM]); // bottom-centre -- walked so the straight
  // neckline seam is one contiguous range (seamL -> seamC -> seamR), the
  // "vertex at the straight edge's own midpoint" idiom straightBand's own
  // callers use, without changing the rendered shape.
  const neckR = push([standLenCm, BAND_COLLAR_HEIGHT_CM]); // bottom-right
  // fallR/fallL sit only STAND_TOP_INSET_CM inward from directly above
  // neckR/neckL -- a small, fixed horizontal step against a much larger
  // vertical rise (BAND_COLLAR_HEIGHT_CM), which keeps the neckR->fallR and
  // fallL->neckL taper edges close to vertical (a gentle corner at neckR/
  // neckL, not a sharp mitre-prone one -- the same "meets close to a right
  // angle" idiom draftCollar's own ctrl points establish for its curve).
  const fallR = push([
    standLenCm - STAND_TOP_INSET_CM,
    BAND_COLLAR_HEIGHT_CM * 0.15,
  ]); // top-right
  push([cx, 0]); // top-centre apex -- the piece's own topmost point, walked
  // only as the curve's own middle sample point (see curvedSpans below).
  const fallL = push([STAND_TOP_INSET_CM, BAND_COLLAR_HEIGHT_CM * 0.15]); // top-left

  // Only the fall seam (top) is curved -- fallR -> fallC -> fallL, a real,
  // shallow Catmull-Rom curve through those three points (see core.ts's
  // catmullRomSegments), never a straight line as #221's plain band uses.
  const curvedSpans: [number, number][] = [[fallR, fallL]];
  // Near the neckline seam, where the piece is still full-width (0 to
  // standLenCm) rather than already tapering in toward the shortened top.
  const grainlineCm: [Pt, Pt] = [
    [standLenCm * 0.1, BAND_COLLAR_HEIGHT_CM * 0.85],
    [standLenCm * 0.9, BAND_COLLAR_HEIGHT_CM * 0.85],
  ];
  return {
    pts,
    curvedSpans,
    grainlineCm,
    neckSeamEdge: [neckL, neckR],
    fallSeamEdge: [fallR, fallL],
  };
}

// The shirt collar's own fall -- literally draftCollar's shape (see
// convertibleFallShape above), sized to the stand's own MEASURED (already
// shortened) upper seam rather than the full neckline arc, and labelled
// as its own distinct piece rather than "convertible" (a fall sewn onto a
// stand is not the standalone convertible collar draftCollar produces).
function draftShirtFall(fallSeamLenCm: number, t: Translate): DraftedPiece {
  const shape = convertibleFallShape(fallSeamLenCm);
  const detailRows: DetailRow[] = [
    { label: t("rows.collarType"), value: t("collarType.shirt") },
    { label: t("rows.length"), value: cm(fallSeamLenCm) },
    { label: t("rows.grain"), value: t("grainValue") },
    { label: t("rows.collarOtherTypes"), value: t("comingSoonBadge") },
  ];
  return {
    id: "collar-fall",
    name: t("pieceNames.collarFall"),
    qty: 1,
    outlineCm: shape.pts,
    curvedSpans: shape.curvedSpans,
    grainlineCm: shape.grainlineCm,
    foldEdge: shape.foldEdge,
    detailRows,
    seamEdges: { neckline: shape.seamEdge },
    placementCm: ACCESSORY_PLACEMENT_CM,
  };
}

// necklineArcCm is the FULL measured (already-lowered, same as "band")
// front+back neckline arc -- the caller (garment.ts) computes it exactly
// like it does for draftBandCollar above. Returns BOTH mated pieces; the
// fall's own seam length is measured off the stand's ACTUALLY-drafted upper
// seam (never a proportion, the same "measure the geometry that was really
// emitted" rule every other sub-piece here follows), so the two pieces
// match by construction.
export function draftShirtCollar(
  necklineArcCm: number,
  t: Translate,
): { stand: DraftedPiece; fall: DraftedPiece } {
  const standLenCm = necklineArcCm + BUTTON_STAND_WIDTH_CM;
  const shape = shirtStandShape(standLenCm);
  const fallSeamLenCm = curveArcLengthCm(
    shape.pts,
    shape.curvedSpans,
    ...shape.fallSeamEdge,
  );
  const detailRows: DetailRow[] = [
    { label: t("rows.collarType"), value: t("collarType.shirt") },
    { label: t("rows.length"), value: cm(standLenCm) },
    { label: t("rows.overlap"), value: cm(BUTTON_STAND_WIDTH_CM) },
    { label: t("rows.grain"), value: t("grainValue") },
    { label: t("rows.collarOtherTypes"), value: t("comingSoonBadge") },
  ];
  const stand: DraftedPiece = {
    id: "collar-stand",
    name: t("pieceNames.collarStand"),
    qty: 1,
    outlineCm: shape.pts,
    curvedSpans: shape.curvedSpans,
    grainlineCm: shape.grainlineCm,
    detailRows,
    seamEdges: {
      neckline: shape.neckSeamEdge,
      fallSeam: shape.fallSeamEdge,
    },
    placementCm: ACCESSORY_PLACEMENT_CM,
  };
  const fall = draftShirtFall(fallSeamLenCm, t);
  return { stand, fall };
}
