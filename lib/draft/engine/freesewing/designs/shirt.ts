// The upstream package name ("simon") is Joost De Cock's own codename for
// this design (@freesewing/collection tags it a button-up shirt) -- an
// implementation detail confined to this one import line, the same
// discipline every other design wrapper in this directory follows. Simon
// was picked over its sibling Simone (an FBA/bust-dart variant of the same
// block) because this repo doesn't branch a design by gender (every other
// archetype registered so far -- tshirt/blouse/skirt/trousers/hoodie/coat
// -- uses ONE design for both `spec.gender` values), and Simon's own
// requiredMeasurements are already zero-new-key (all 13 map onto existing
// CORE_MEASUREMENT_KEYS -- verified against Simon.patternConfig.measurements
// directly, not assumed).
import { Simon as ShirtDesign } from "@freesewing/simon";
import type { Measurements } from "@/lib/measurements";
import type { GarmentSpec } from "@/lib/types";
import type { Translate } from "@/lib/i18n/translate";
import type { DraftedPiece } from "../../../core";
import { curveArcLengthCm } from "../../../core";
import type { SeamPairDecl } from "../../../seams";
import type { EngineDraft } from "../../types";
import {
  draftCuff,
  draftShirtCollar,
  BUTTON_STAND_WIDTH_CM,
} from "../../../subpieces";
import { WRIST_EASE_CM } from "../../../sleeve";
import type { FreesewingPath } from "../geometry";
import {
  flattenFreesewingSeam,
  locatePointIndex,
  mirrorFoldedPanel,
} from "../geometry";
import { edgeRef } from "../seamHelpers";

const MM_PER_CM = 10;

// Same unit-conflict tshirt.ts/blouse.ts/hoodie.ts/jett.ts already document:
// FreeSewing wants a degree, moldai's own shoulderSlope is a cm drop.
function shoulderSlopeDegrees(m: Measurements): number {
  const slope = m.shoulderSlope ?? 4.0;
  return (Math.atan(slope / m.shoulder) * 180) / Math.PI;
}

function toShirtMeasurementsMm(m: Measurements): Record<string, number> {
  return {
    chest: m.bust * MM_PER_CM,
    highBust: (m.highBust ?? m.bust) * MM_PER_CM,
    hips: m.hip * MM_PER_CM,
    waistToHips: m.hipHeight * MM_PER_CM,
    hpsToWaistBack: m.backLength * MM_PER_CM,
    hpsToBust: m.bustPointHeight * MM_PER_CM,
    waist: m.waist * MM_PER_CM,
    biceps: m.bicep * MM_PER_CM,
    neck: m.neckGirth * MM_PER_CM,
    shoulderToShoulder: m.shoulder * 2 * MM_PER_CM,
    shoulderSlope: shoulderSlopeDegrees(m),
    waistToArmpit: m.waistToArmpit * MM_PER_CM,
    shoulderToWrist: m.shoulderToWrist * MM_PER_CM,
    wrist: m.wrist * MM_PER_CM,
  };
}

// Simon's own sleeveStyle option is a REAL short/long branch (unlike
// hoodie.ts's narrow raglan range) -- short skips the cuff/placket
// construction entirely (a folded hem instead, verified against
// @freesewing/simon's own sleeve.mjs) and uses sleeveLengthShort (a
// fraction of shoulderToWrist) rather than long's own sleeveLengthBonus
// (a fraction ADDED to shoulderToWrist). Both fed from the ratio of our
// own finished-length style target to the body's own full arm length, the
// same "our two length fields drive the proportion, never a second
// invented number" approach tshirt.ts's/jett.ts's own sleeve length
// mapping already uses.
function sleeveOptions(
  spec: GarmentSpec,
  m: Measurements,
): Record<string, unknown> {
  if (spec.style.sleeve === "short") {
    const fraction = m.shortSleeveLength / m.shoulderToWrist;
    return {
      sleeveStyle: "short",
      sleeveLengthShort: Math.min(1, Math.max(0.2, fraction)),
    };
  }
  const fraction = m.longSleeveLength / m.shoulderToWrist - 1;
  return {
    sleeveStyle: "long",
    sleeveLengthBonus: Math.min(0.1, Math.max(-0.4, fraction)),
    // straightBarrelCuff is the one cuffStyle that reduces to a plain
    // rectangle (the other 5 named variants are all shaped/curved cuffs --
    // verified live) -- matching the plain-rectangle shape draftCuff below
    // actually draws, rather than silently mismatching FreeSewing's own
    // (unused) cuff geometry against our own generic band. Hidden by
    // Simon's own menu function when sleeveStyle is "short" (no cuff to
    // style then), so this key is simply ignored in that branch.
    cuffStyle: "straightBarrelCuff",
  };
}

// Back panel: cut ON FOLD at center back (verified: @freesewing/brian's own
// back.mjs sets `cutlist.addCut({cut: 1, onFold: true})`, which simon.back
// inherits unchanged), cut off at the yoke seam (`cbYoke`/`armholeYokeSplit`)
// rather than running all the way to the neck -- the upper back belongs to
// the yoke piece below, verified by reading back.mjs's own "Cut off at
// yoke" section directly, not inferred from point names alone.
function buildBack(
  t: Translate,
  backPart: {
    paths: Record<string, FreesewingPath>;
    points: Record<string, { x: number; y: number }>;
  },
): { piece: DraftedPiece; seamEdges: Record<string, [number, number]> } {
  const half = flattenFreesewingSeam(backPart.paths.seam);
  const hem = locatePointIndex(half.outlineCm, backPart.points.hem);
  const armhole = locatePointIndex(half.outlineCm, backPart.points.armhole);
  const armholeYokeSplit = locatePointIndex(
    half.outlineCm,
    backPart.points.armholeYokeSplit,
  );
  const n = half.outlineCm.length;
  const halfEdges: Record<string, [number, number]> = {
    hem: [0, hem],
    side: [hem, armhole],
    armhole: [armhole, armholeYokeSplit],
    yokeAttach: [armholeYokeSplit, n - 1], // n-1 is cbYoke, the half's own fold-axis endpoint
  };
  const mirrored = mirrorFoldedPanel(half);
  const piece: DraftedPiece = {
    id: "body-back",
    name: t("pieceNames.back"),
    qty: 1, // cut on fold
    outlineCm: mirrored.outlineCm,
    curvedSpans: mirrored.curvedSpans,
    foldEdge: mirrored.foldEdge,
    seamEdges: halfEdges,
    detailRows: [],
  };
  return { piece, seamEdges: halfEdges };
}

// Yoke: FreeSewing itself mirrors this piece internally (yoke.mjs's own
// `macro('mirror', ...)` before setting `paths.seam`), so -- unlike back --
// `paths.seam` here is already the WHOLE symmetric piece, needing no
// mirrorFoldedPanel on this side. Its own three curved runs (verified
// against a live draft, and structurally fixed regardless of measurements:
// splitYoke/boxPleat/roundBack are all options THIS wrapper holds at their
// off default, and yokeHeight's own >0-vs-0 branch is likewise a fixed
// default, not measurement-driven) are, in order: the armhole curve up to
// the shoulder tip (right side), the WHOLE back-neckline curve (both
// sides, since FreeSewing's own internal mirror already merged them across
// centre back), then the mirrored armhole curve (left side) -- the same
// "assert the count, then destructure by position" idiom tshirt.ts's own
// buildBodyPanel already established for a structurally (not
// measurement-) deterministic run count.
function buildYoke(
  t: Translate,
  yokePart: { paths: Record<string, FreesewingPath> },
): { piece: DraftedPiece; seamEdges: Record<string, [number, number]> } {
  const flat = flattenFreesewingSeam(yokePart.paths.seam);
  if (flat.curvedSpans.length !== 3) {
    throw new Error(
      `freesewing shirt design: expected exactly 3 curved runs (armhole-right, neckline, armhole-left) on yoke, got ${flat.curvedSpans.length}`,
    );
  }
  const [armholeRun, necklineRun] = flat.curvedSpans;
  const seamEdges: Record<string, [number, number]> = {
    yokeAttach: [0, armholeRun[0]],
    armhole: armholeRun,
    shoulder: [armholeRun[1], necklineRun[0]],
    necklineBack: necklineRun,
  };
  const piece: DraftedPiece = {
    id: "yoke",
    name: t("pieceNames.yoke"),
    qty: 2, // cut ×2 per Simon's own cutlist (a real shirt yoke is usually self + lining, cut identically twice)
    outlineCm: flat.outlineCm,
    curvedSpans: flat.curvedSpans,
    seamEdges,
    detailRows: [],
  };
  return { piece, seamEdges };
}

// Front-right (button placket) and front-left (buttonhole placket): two
// genuinely DIFFERENT pieces (verified live: frontRight's own draft calls
// macro('flip') first, frontLeft's does not, and each appends a
// differently-shaped placket edge), not a single mirrored panel -- Simon's
// own default construction for both sides (buttonPlacketStyle/
// buttonholePlacketStyle: "classic", separateButtonPlacket/
// separateButtonholePlacket: false) is the simplest cut-on (not separate)
// placket, per the user's own "fixing 1 variant of each" decision. Both
// share the identical pre-placket boundary shape (hem/side/armhole/
// shoulder/neckline), verified by reading the shared front.mjs base both
// draft from before their own placket-specific append -- so one function
// builds either side, driven only by which part is passed in. The
// placket's own outer (button-closure) edge is a finished edge sewn to
// nothing this wrapper models -- left undeclared, the same "nothing to
// mate, simply omit" rule hoodie.ts's/jett.ts's own placket/hood-opening
// edges already follow.
function buildFront(
  t: Translate,
  id: string,
  name: string,
  frontPart: {
    paths: Record<string, FreesewingPath>;
    points: Record<string, { x: number; y: number }>;
  },
): { piece: DraftedPiece; seamEdges: Record<string, [number, number]> } {
  const flat = flattenFreesewingSeam(frontPart.paths.seam);
  const hem = locatePointIndex(flat.outlineCm, frontPart.points.hem);
  const armhole = locatePointIndex(flat.outlineCm, frontPart.points.armhole);
  const shoulderTip = locatePointIndex(
    flat.outlineCm,
    frontPart.points.s3ArmholeSplit,
  );
  const s3CollarSplit = locatePointIndex(
    flat.outlineCm,
    frontPart.points.s3CollarSplit,
  );
  const cfNeck = locatePointIndex(flat.outlineCm, frontPart.points.cfNeck);
  const seamEdges: Record<string, [number, number]> = {
    hem: [0, hem],
    side: [hem, armhole],
    armhole: [armhole, shoulderTip],
    shoulder: [shoulderTip, s3CollarSplit],
    neckline: [s3CollarSplit, cfNeck],
  };
  const piece: DraftedPiece = {
    id,
    name,
    qty: 1, // a real placket-front shirt: each side is cut once, not on fold
    outlineCm: flat.outlineCm,
    curvedSpans: flat.curvedSpans,
    seamEdges,
    detailRows: [],
  };
  return { piece, seamEdges };
}

// A standard set-in sleeve (NOT raglan), structurally identical whether
// short or long (both branches share the same named boundary points --
// wristLeft/wristRight/bicepsLeft/bicepsRight -- only the INTERIOR
// construction of the wrist edge differs, which this wrapper never names).
function buildSleeve(
  t: Translate,
  sleevePart: {
    paths: Record<string, FreesewingPath>;
    points: Record<string, { x: number; y: number }>;
  },
): {
  piece: DraftedPiece;
  seamEdges: Record<string, [number, number]>;
  wristLenCm: number;
} {
  const flat = flattenFreesewingSeam(sleevePart.paths.seam);
  const wristRight = locatePointIndex(
    flat.outlineCm,
    sleevePart.points.wristRight,
  );
  const bicepsRight = locatePointIndex(
    flat.outlineCm,
    sleevePart.points.bicepsRight,
  );
  const bicepsLeft = locatePointIndex(
    flat.outlineCm,
    sleevePart.points.bicepsLeft,
  );
  const wristLeft = locatePointIndex(
    flat.outlineCm,
    sleevePart.points.wristLeft,
  );
  const n = flat.outlineCm.length;
  const seamEdges: Record<string, [number, number]> = {
    underarmRight: [wristRight, bicepsRight],
    cap: [bicepsRight, bicepsLeft],
    underarmLeft: [bicepsLeft, wristLeft],
    wrist: [wristLeft, n], // wraps back to wristRight at index 0
  };
  const wristLenCm = curveArcLengthCm(
    flat.outlineCm,
    flat.curvedSpans,
    ...seamEdges.wrist,
  );
  const piece: DraftedPiece = {
    id: "sleeve",
    name: t("pieceNames.sleeve"),
    qty: 2,
    outlineCm: flat.outlineCm,
    curvedSpans: flat.curvedSpans,
    seamEdges,
    detailRows: [
      // Sleeve plackets (a separate overlap/underlap strip binding the
      // sleeve's own vertical opening above the cuff) are a genuinely new
      // construction concept this app has never modelled (moldai's own
      // draftPlacket is a continuous-lap strip with no separate over/under
      // pieces) -- deferred, not silently dropped, the same "em breve" on
      // the piece's own card that hoodie.ts's/jett.ts's own deferrals use.
      { label: t("rows.sleevePlacket"), value: t("comingSoonBadge") },
    ],
  };
  return { piece, seamEdges, wristLenCm };
}

export function draftShirt(
  spec: GarmentSpec,
  base: Measurements,
  t: Translate,
): EngineDraft {
  const measurements = toShirtMeasurementsMm(base);
  const pattern = new ShirtDesign({
    measurements,
    options: sleeveOptions(spec, base),
  });
  pattern.draft();
  const parts = pattern.parts[0];

  const { piece: back, seamEdges: backEdges } = buildBack(
    t,
    parts["simon.back"],
  );
  const { piece: yoke, seamEdges: yokeEdges } = buildYoke(
    t,
    parts["simon.yoke"],
  );
  const { piece: frontRight, seamEdges: frontRightEdges } = buildFront(
    t,
    "body-front-right",
    t("pieceNames.frontRight"),
    parts["simon.frontRight"],
  );
  const { piece: frontLeft, seamEdges: frontLeftEdges } = buildFront(
    t,
    "body-front-left",
    t("pieceNames.frontLeft"),
    parts["simon.frontLeft"],
  );
  const {
    piece: sleeve,
    seamEdges: sleeveEdges,
    wristLenCm,
  } = buildSleeve(t, parts["simon.sleeve"]);

  const drafted: DraftedPiece[] = [back, yoke, frontRight, frontLeft, sleeve];
  const seamPairs: SeamPairDecl[] = [
    {
      key: "shirt-yoke-back",
      labelKey: "yokeBackSeam",
      a: [edgeRef(yoke.id, yokeEdges.yokeAttach)],
      b: [edgeRef(back.id, backEdges.yokeAttach)],
      easeCm: 0,
      fixable: false,
    },
    {
      key: "shirt-side-right",
      labelKey: "side",
      a: [edgeRef(frontRight.id, frontRightEdges.side)],
      b: [edgeRef(back.id, backEdges.side)],
      easeCm: 0,
      fixable: false,
    },
    {
      key: "shirt-side-left",
      labelKey: "side",
      a: [edgeRef(frontLeft.id, frontLeftEdges.side)],
      b: [edgeRef(back.id, backEdges.side)],
      easeCm: 0,
      fixable: false,
    },
    {
      key: "shirt-shoulder-right",
      labelKey: "shoulder",
      a: [edgeRef(frontRight.id, frontRightEdges.shoulder)],
      b: [edgeRef(yoke.id, yokeEdges.shoulder)],
      easeCm: 0,
      fixable: false,
    },
    {
      key: "shirt-shoulder-left",
      labelKey: "shoulder",
      a: [edgeRef(frontLeft.id, frontLeftEdges.shoulder)],
      b: [edgeRef(yoke.id, yokeEdges.shoulder)],
      easeCm: 0,
      fixable: false,
    },
    {
      key: "shirt-armhole-cap-right",
      labelKey: "armholeCap",
      a: [
        edgeRef(frontRight.id, frontRightEdges.armhole),
        edgeRef(back.id, backEdges.armhole),
        edgeRef(yoke.id, yokeEdges.armhole),
      ],
      b: [edgeRef(sleeve.id, sleeveEdges.cap)],
      easeCm: 0,
      fixable: false,
    },
    {
      key: "shirt-armhole-cap-left",
      labelKey: "armholeCap",
      a: [
        edgeRef(frontLeft.id, frontLeftEdges.armhole),
        edgeRef(back.id, backEdges.armhole),
        edgeRef(yoke.id, yokeEdges.armhole),
      ],
      b: [edgeRef(sleeve.id, sleeveEdges.cap)],
      easeCm: 0,
      fixable: false,
    },
    {
      key: "shirt-sleeve-underarm",
      labelKey: "sleeveUnderarm",
      a: [edgeRef(sleeve.id, sleeveEdges.underarmRight)],
      b: [edgeRef(sleeve.id, sleeveEdges.underarmLeft)],
      easeCm: 0,
      fixable: false,
    },
  ];

  // Sleeve cuff: only for the "long" style -- Simon's own "short" branch
  // finishes the sleeve hem with a fold, no separate cuff piece at all
  // (verified against sleeve.mjs directly: the short branch's own
  // `cuffBase` is just the hem fold line, never joined to a cuff). Reuses
  // draftCuff (a plain rectangle) rather than modelling FreeSewing's own
  // (unused for this wrapper) cuff.mjs geometry, the same "a cuff is just
  // a band" precedent jett.ts already established.
  if (spec.style.sleeve !== "short") {
    const cuff = draftCuff(wristLenCm + WRIST_EASE_CM.woven, t);
    drafted.push(cuff);
    seamPairs.push({
      key: "shirt-cuff-wrist",
      labelKey: "cuffHem",
      a: [edgeRef(sleeve.id, sleeveEdges.wrist)],
      b: [edgeRef(cuff.id, cuff.seamEdges!.hem)],
      easeCm: WRIST_EASE_CM.woven,
      fixable: false,
    });
  }

  // Collar: reuses moldai's own generic shirt stand+fall drafter
  // (lib/draft/subpieces.ts's draftShirtCollar) rather than modelling
  // FreeSewing's own collar.mjs/collarstand.mjs geometry -- both are
  // already the same "a collar is a fitted band plus a fold-over fall"
  // shape that drafter was built for, sized off the REAL measured neckline
  // this design actually drafted (never a proportion of the bust), the
  // same "a cuff/waistband is just a band" reuse this file's own cuff
  // above and jett.ts's own cuff/waistband already establish.
  const necklineArcCm =
    curveArcLengthCm(
      frontRight.outlineCm,
      frontRight.curvedSpans ?? [],
      ...frontRightEdges.neckline,
    ) +
    curveArcLengthCm(
      frontLeft.outlineCm,
      frontLeft.curvedSpans ?? [],
      ...frontLeftEdges.neckline,
    ) +
    curveArcLengthCm(
      yoke.outlineCm,
      yoke.curvedSpans ?? [],
      ...yokeEdges.necklineBack,
    );
  const { stand, fall } = draftShirtCollar(necklineArcCm, t);
  drafted.push(stand, fall);
  if (stand.seamEdges?.neckline) {
    seamPairs.push({
      key: "shirt-collar-neckline",
      labelKey: "collarNeckline",
      a: [
        edgeRef(frontRight.id, frontRightEdges.neckline),
        edgeRef(frontLeft.id, frontLeftEdges.neckline),
        edgeRef(yoke.id, yokeEdges.necklineBack),
      ],
      b: [edgeRef(stand.id, stand.seamEdges.neckline)],
      easeCm: BUTTON_STAND_WIDTH_CM,
      fixable: false,
    });
  }
  if (stand.seamEdges?.fallSeam && fall.seamEdges?.neckline) {
    seamPairs.push({
      key: "shirt-collar-stand-fall",
      labelKey: "collarStandFall",
      a: [edgeRef(stand.id, stand.seamEdges.fallSeam)],
      b: [edgeRef(fall.id, fall.seamEdges.neckline)],
      easeCm: 0,
      fixable: false,
    });
  }

  return {
    drafted,
    measurements: base,
    seamPairs,
    garmentLengthCm: base.backLength,
  };
}
