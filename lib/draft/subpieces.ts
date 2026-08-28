import { DetailRow } from "@/lib/types";
import { DraftedPiece, Pt } from "./core";
import { formatCm } from "@/lib/format";
import type { Translate } from "@/lib/i18n/translate";

const cm = (v: number) => `${formatCm(v)} cm`;

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

// necklineArcCm is the FULL measured neckline circumference (front + back,
// both halves already summed by the caller) -- the collar's own neckline
// seam edge is drafted to exactly that length (a straight edge, so the
// match is exact to floating-point precision, comfortably inside the AC's
// 0.3cm tolerance), never a proportion of the bust.
export function draftCollar(necklineArcCm: number, t: Translate): DraftedPiece {
  const halfLen = necklineArcCm / 2;
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
    outlineCm: pts,
    curvedSpans,
    grainlineCm,
    foldEdge: [tc, seamC],
    detailRows,
    // The straight neckline seam edge (seamL -> seamC -> seamR) -- a single
    // contiguous range since no curvedSpan covers it, summing to exactly
    // halfLen*2 === necklineArcCm.
    seamEdges: { neckline: [seamL, seamR] },
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
function straightBand(
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
  };
}

// A simple continuous-lap placket strip -- fixed dimensions (not derived
// from a measured edge; the issue's own AC only requires the CUFF's length
// to be measured). Binds into the sleeve's vertical opening above the cuff;
// it has no distinct edge on the already-drafted sleeve piece to mate
// against, so it declares no seamEdges (lib/draft/core.ts: "a piece with
// nothing to mate simply omits this").
export function draftPlacket(t: Translate): DraftedPiece {
  const pts: Pt[] = [
    [0, 0],
    [PLACKET_WIDTH_CM, 0],
    [PLACKET_WIDTH_CM, PLACKET_LENGTH_CM],
    [0, PLACKET_LENGTH_CM],
  ];
  const grainlineCm: [Pt, Pt] = [
    [PLACKET_WIDTH_CM / 2, PLACKET_LENGTH_CM * 0.1],
    [PLACKET_WIDTH_CM / 2, PLACKET_LENGTH_CM * 0.9],
  ];
  const detailRows: DetailRow[] = [
    { label: t("rows.length"), value: cm(PLACKET_LENGTH_CM) },
    { label: t("rows.grain"), value: t("grainValue") },
  ];
  return {
    id: "placket",
    name: t("pieceNames.placket"),
    qty: 2, // one per sleeve opening
    outlineCm: pts,
    grainlineCm,
    detailRows,
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
const BAND_COLLAR_HEIGHT_CM = 4; // stand height only -- shorter than COLLAR_HEIGHT_CM (6.5), which also carries the fall

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
  };
}
